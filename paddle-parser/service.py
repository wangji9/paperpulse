from __future__ import annotations
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
os.environ.setdefault("FLAGS_use_mkldnn", "0")

from paddleocr import LayoutDetection

LAYOUT_MODEL_NAME = os.environ.get("PADDLE_LAYOUT_MODEL", "PP-DocLayout_plus-L")
MAX_PAGES = int(os.environ.get("PADDLE_MAX_PAGES", "50"))
LAYOUT_DPI = int(os.environ.get("PADDLE_LAYOUT_DPI", "150"))
CROP_DPI = int(os.environ.get("PADDLE_CROP_DPI", "200"))

_model_lock = threading.Lock()
_layout_model: LayoutDetection | None = None
_ocr_model: Any = None
_load_error: str = ""
_ready: bool = False


def get_layout_model() -> LayoutDetection:
    global _layout_model, _ready, _load_error
    if _layout_model is not None:
        return _layout_model
    with _model_lock:
        if _layout_model is None:
            print(f"[paddle-parser] Loading Baidu {LAYOUT_MODEL_NAME} ...", flush=True)
            t0 = time.time()
            try:
                _layout_model = LayoutDetection(
                    model_name=LAYOUT_MODEL_NAME,
                    device="cpu",
                    enable_mkldnn=False,
                    cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "16")),
                )
                _ready = True
                _load_error = ""
                print(f"[paddle-parser] Loaded {LAYOUT_MODEL_NAME} in {time.time() - t0:.1f}s", flush=True)
            except Exception as exc:
                _load_error = str(exc)
                print(f"[paddle-parser] Failed to load {LAYOUT_MODEL_NAME}: {exc}", flush=True)
                raise
    return _layout_model


def get_ocr_model():
    global _ocr_model
    if _ocr_model is not None:
        return _ocr_model
    with _model_lock:
        if _ocr_model is None:
            from paddleocr import PaddleOCR
            print("[paddle-parser] Lazy-loading Baidu PaddleOCR for scanned PDF fallback...", flush=True)
            _ocr_model = PaddleOCR(
                device="cpu",
                enable_mkldnn=False,
                cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "16")),
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
    return _ocr_model


def clean_ws(s: str) -> str:
    s = re.sub(r"-\n(?=[a-z])", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def trim_and_save_pil(img: Image.Image, out_file: str, threshold: int = 247, pad: int = 4) -> tuple[int, int]:
    rgb = img.convert("RGB")
    gray = rgb.convert("L")
    mask = gray.point(lambda p: 255 if p < threshold else 0)
    bbox = mask.getbbox()
    if bbox:
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(rgb.width, bbox[2] + pad)
        y1 = min(rgb.height, bbox[3] + pad)
        if (x1 - x0) >= 24 and (y1 - y0) >= 24:
            rgb = rgb.crop((x0, y0, x1, y1))
    rgb.save(out_file, format="PNG", optimize=True)
    return rgb.width, rgb.height


def extract_pdf_text_in_box(page: fitz.Page, pdf_box: tuple[float, float, float, float], page_img: Image.Image | None, px_box: tuple[int, int, int, int] | None, use_ocr_fallback: bool = False) -> str:
    rect = fitz.Rect(pdf_box)
    txt = clean_ws(page.get_text("text", clip=rect) or "")
    if txt or not use_ocr_fallback or page_img is None or px_box is None:
        return txt
    try:
        x0, y0, x1, y1 = px_box
        crop = page_img.crop((max(0, x0), max(0, y0), min(page_img.width, x1), min(page_img.height, y1)))
        ocr = get_ocr_model()
        res = ocr.predict(np.array(crop.convert("RGB")))
        parts: list[str] = []
        for item in res:
            data = item.json if hasattr(item, "json") else item
            rec = data.get("res", data) if isinstance(data, dict) else {}
            texts = rec.get("rec_texts") or []
            parts.extend(str(t) for t in texts if t)
        return clean_ws(" ".join(parts))
    except Exception:
        return ""


def parse_layout_boxes(pred_result: Any) -> list[dict[str, Any]]:
    boxes_raw: list[dict[str, Any]] = []
    if hasattr(pred_result, "boxes") and isinstance(pred_result.boxes, list):
        boxes_raw = pred_result.boxes
    elif isinstance(pred_result, dict):
        if isinstance(pred_result.get("boxes"), list):
            boxes_raw = pred_result["boxes"]
        elif isinstance(pred_result.get("res"), dict) and isinstance(pred_result["res"].get("boxes"), list):
            boxes_raw = pred_result["res"]["boxes"]
    elif hasattr(pred_result, "json"):
        j = pred_result.json
        if isinstance(j, dict):
            res = j.get("res", j)
            if isinstance(res, dict) and isinstance(res.get("boxes"), list):
                boxes_raw = res["boxes"]

    out: list[dict[str, Any]] = []
    for b in boxes_raw:
        coord = b.get("coordinate") or b.get("bbox")
        if not coord or len(coord) != 4:
            continue
        label = str(b.get("label") or "").strip().lower()
        score = float(b.get("score") or 0.0)
        x0, y0, x1, y1 = [float(v) for v in coord]
        if x1 <= x0 or y1 <= y0:
            continue
        out.append({"label": label, "score": score, "coord": [x0, y0, x1, y1]})
    return out


def box_iou(a: list[float], b: list[float]) -> float:
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / max(area_a + area_b - inter, 1.0)


def dedupe_boxes(boxes: list[dict[str, Any]], iou_thr: float = 0.6) -> list[dict[str, Any]]:
    ordered = sorted(boxes, key=lambda x: x["score"], reverse=True)
    kept: list[dict[str, Any]] = []
    for b in ordered:
        if any(box_iou(b["coord"], k["coord"]) >= iou_thr for k in kept):
            continue
        kept.append(b)
    return kept


def sort_reading_order(boxes: list[dict[str, Any]], page_w: float) -> list[dict[str, Any]]:
    """Column-aware reading order (top full-width -> left col -> right col -> bottom full-width)."""
    mid = page_w / 2.0
    left_cnt = sum(1 for b in boxes if b["coord"][2] <= mid + page_w * 0.05 and (b["coord"][2] - b["coord"][0]) < page_w * 0.55)
    right_cnt = sum(1 for b in boxes if b["coord"][0] >= mid - page_w * 0.05 and (b["coord"][2] - b["coord"][0]) < page_w * 0.55)
    if left_cnt < 2 or right_cnt < 2:
        return sorted(boxes, key=lambda b: (b["coord"][1], b["coord"][0]))

    # Group into bands separated by full-width elements
    ordered = sorted(boxes, key=lambda b: (b["coord"][1], b["coord"][0]))
    full_w = [b for b in ordered if (b["coord"][2] - b["coord"][0]) >= page_w * 0.58 or (b["coord"][0] < mid - page_w * 0.08 and b["coord"][2] > mid + page_w * 0.08)]
    col_b = [b for b in ordered if b not in full_w]

    result: list[dict[str, Any]] = []
    prev_y = -1.0
    for fw in full_w:
        fw_y = fw["coord"][1]
        band = [b for b in col_b if prev_y < b["coord"][1] < fw_y]
        lefts = sorted([b for b in band if (b["coord"][0] + b["coord"][2]) / 2.0 <= mid], key=lambda b: b["coord"][1])
        rights = sorted([b for b in band if (b["coord"][0] + b["coord"][2]) / 2.0 > mid], key=lambda b: b["coord"][1])
        result.extend(lefts)
        result.extend(rights)
        result.append(fw)
        prev_y = fw_y

    tail = [b for b in col_b if b["coord"][1] > prev_y]
    lefts = sorted([b for b in tail if (b["coord"][0] + b["coord"][2]) / 2.0 <= mid], key=lambda b: b["coord"][1])
    rights = sorted([b for b in tail if (b["coord"][0] + b["coord"][2]) / 2.0 > mid], key=lambda b: b["coord"][1])
    result.extend(lefts)
    result.extend(rights)
    return result


FIG_CAP_RE = re.compile(r"^(?:Fig\.?|Figure|FIG\.?|图)\s*(\d+(?:\.\d+)?|[IVX]+)\s*(?:[:：.\s-]|$)", re.IGNORECASE)
TBL_CAP_RE = re.compile(r"^(?:Table|TABLE|Tab\.?|表)\s*(\d+(?:\.\d+)?|[IVX]+)\s*(?:[:：.\s-]|$)", re.IGNORECASE)
ABSTRACT_STOP_RE = re.compile(
    r"(?:\bKeywords?\s*[:：]|关键词\s*[:：]|中图分类号\s*[:：]|收稿日期\s*[:：]|修回日期\s*[:：]|基金项目\s*[:：]|作者简介\s*[:：]|通信作者\s*[:：]|\bARTICLE\s+INFO\b|\bContents\b\s+1\.|\b1\.\s+Introduction\b|(?:\.{5,}))",
    re.IGNORECASE,
)


def sanitize_abstract(raw: str) -> str:
    txt = clean_ws(raw)
    if not txt:
        return ""
    # Strip leading header noise like "Abstract", "A B S T R A C T", "摘 要", "ARTICLE INFO"
    txt = re.sub(r"^(?:ARTICLE\s+INFO\s*)?(?:A\s*B\s*S\s*T\s*R\s*A\s*C\s*T|Abstract|摘\s*要)\s*[:：.\-—]?\s*", "", txt, flags=re.IGNORECASE)
    # Strip any trailing keywords / TOC / journal receipt / fund / author bio / intro
    m = ABSTRACT_STOP_RE.search(txt)
    if m:
        txt = txt[: m.start()].strip()
    # Guard against TOC dot-leader artifacts if any slipped through
    if txt.count("....") >= 2:
        txt = txt.split("....")[0].strip()
    return txt[:4500].strip()


def extract_keywords_from_text(page_text: str) -> list[str]:
    m = re.search(
        r"(?:Keywords?|Key\s+words?|Index\s+Terms|关键词)\s*[:：]\s*([^\n]{3,380}(?:\n[^\n]{3,200})?)",
        page_text,
        re.IGNORECASE,
    )
    if not m:
        return []
    raw = m.group(1)
    # Stop at next major section / metadata marker
    raw = re.split(
        r"(?:\b1\.\s+Introduction\b|\b1\s+引言\b|\bContents\b|中图分类号|文献标志码|收稿日期|基金项目|作者简介|Abstract|摘\s*要|\.{4,})",
        raw,
        flags=re.IGNORECASE,
    )[0]
    raw = clean_ws(raw)
    parts = re.split(r"[;；,，·•]+", raw)
    cleaned: list[str] = []
    seen = set()
    for p in parts:
        k = p.strip(" .:;；,，")
        if not k or len(k) < 2 or len(k) > 60:
            continue
        low = k.lower()
        if low in seen or re.match(r"^(?:tp|th|f)\d+", low):
            continue
        seen.add(low)
        cleaned.append(k)
    return cleaned[:10]


def pair_caption(target_box: list[float], cap_candidates: list[dict[str, Any]], used_ids: set[int], prefer: str = "below") -> dict[str, Any] | None:
    tx0, ty0, tx1, ty1 = target_box
    tcx = (tx0 + tx1) / 2.0
    tw = max(tx1 - tx0, 1.0)
    best_idx = -1
    best_dist = 1e9

    for idx, cap in enumerate(cap_candidates):
        if idx in used_ids:
            continue
        cx0, cy0, cx1, cy1 = cap["coord"]
        ccx = (cx0 + cx1) / 2.0
        # Horizontal overlap or close center alignment
        h_overlap = min(tx1, cx1) - max(tx0, cx0)
        if h_overlap < -tw * 0.25 and abs(ccx - tcx) > tw * 0.8:
            continue
        if cy0 >= ty1 - 24:
            vdist = max(0.0, cy0 - ty1)
            weight = 1.0 if prefer == "below" else 1.45
        elif cy1 <= ty0 + 24:
            vdist = max(0.0, ty0 - cy1)
            weight = 1.0 if prefer == "above" else 1.45
        else:
            continue
        if vdist > 260:
            continue
        score = vdist * weight + abs(ccx - tcx) * 0.18
        if score < best_dist:
            best_dist = score
            best_idx = idx

    if best_idx >= 0:
        used_ids.add(best_idx)
        return cap_candidates[best_idx]
    return None


def classify_section_heading(title: str) -> str:
    low = title.lower()
    if re.search(r"abstract|摘\s*要", low):
        return "abstract"
    if re.search(r"introduction|background|overview|引言|背景|绪论", low):
        return "introduction"
    if re.search(r"related\s+work|literature|review|研究现状|文献综述|相关工作", low):
        return "related_work"
    if re.search(r"method|approach|framework|architecture|model|proposed|system|design|methodology|方法|架构|模型|框架|设计", low):
        return "method"
    if re.search(r"experiment|evaluation|case\s+study|result|ablation|validation|application|implementation|实验|验证|案例|结果|分析|应用", low):
        return "experiments"
    if re.search(r"discussion|limitation|future|讨论|局限|展望", low):
        return "discussion"
    if re.search(r"conclusion|summary|结论|总结|结语", low):
        return "conclusion"
    if re.search(r"reference|bibliography|acknowledg|appendix|参考文献|致谢|附录", low):
        return "references"
    return "body"


def parse_pdf_with_baidu(pdf_path: str, out_dir: str | None = None, url_prefix: str | None = None) -> dict[str, Any]:
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    model = get_layout_model()
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    pages_to_scan = min(total_pages, MAX_PAGES)

    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    figures: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    seen_fig_keys: set[str] = set()
    seen_tbl_keys: set[str] = set()

    doc_title_parts: list[str] = []
    abstract_parts: list[str] = []
    front_text_for_kw: list[str] = []
    sections: dict[str, list[str]] = {}
    all_clean_text: list[str] = []
    cur_section = "introduction"

    meta = doc.metadata or {}
    raw_full_text_p12 = ""

    for pno in range(pages_to_scan):
        page = doc[pno]
        prect = page.rect
        page_native_text = page.get_text("text") or ""
        is_scanned = len(page_native_text.strip()) < 35
        if pno < 2:
            raw_full_text_p12 += "\n" + page_native_text

        # Render page for Baidu PP-DocLayout_plus-L detection
        lay_pix = page.get_pixmap(dpi=LAYOUT_DPI, alpha=False)
        lay_img = Image.frombytes("RGB", (lay_pix.width, lay_pix.height), lay_pix.samples)
        lay_np = np.array(lay_img)

        with _model_lock:
            preds = list(model.predict(lay_np, batch_size=1))

        raw_boxes = parse_layout_boxes(preds[0]) if preds else []
        # Keep confident boxes (>= 0.35; slightly lower 0.30 for figure_title / table_title / abstract)
        filtered = [
            b for b in raw_boxes
            if b["score"] >= (0.28 if b["label"] in ("abstract", "figure_title", "table_title", "doc_title") else 0.36)
        ]

        scale_to_pdf_x = prect.width / max(lay_pix.width, 1)
        scale_to_pdf_y = prect.height / max(lay_pix.height, 1)

        def to_pdf(c: list[float]) -> tuple[float, float, float, float]:
            return (c[0] * scale_to_pdf_x, c[1] * scale_to_pdf_y, c[2] * scale_to_pdf_x, c[3] * scale_to_pdf_y)

        # Render high-res page lazily ONLY if this page has figures or tables to crop
        fig_boxes = dedupe_boxes([b for b in filtered if b["label"] in ("image", "chart")], iou_thr=0.55)
        tbl_boxes = dedupe_boxes([b for b in filtered if b["label"] == "table"], iou_thr=0.55)
        fig_title_boxes = dedupe_boxes([b for b in filtered if b["label"] == "figure_title"], iou_thr=0.55)
        tbl_title_boxes = dedupe_boxes([b for b in filtered if b["label"] == "table_title"], iou_thr=0.55)

        # Also check any text box starting strictly with "Fig./Figure/图" or "Table/表" as backup caption candidate
        for b in filtered:
            if b["label"] == "text":
                t = extract_pdf_text_in_box(page, to_pdf(b["coord"]), lay_img, tuple(int(v) for v in b["coord"]), is_scanned)
                if t and len(t) <= 420:
                    if FIG_CAP_RE.match(t) and not any(box_iou(b["coord"], ft["coord"]) > 0.4 for ft in fig_title_boxes):
                        fig_title_boxes.append({**b, "_text": t})
                    elif TBL_CAP_RE.match(t) and not any(box_iou(b["coord"], tt["coord"]) > 0.4 for tt in tbl_title_boxes):
                        tbl_title_boxes.append({**b, "_text": t})

        # Extract caption texts
        for ft in fig_title_boxes:
            if "_text" not in ft:
                ft["_text"] = extract_pdf_text_in_box(page, to_pdf(ft["coord"]), lay_img, tuple(int(v) for v in ft["coord"]), is_scanned)
        for tt in tbl_title_boxes:
            if "_text" not in tt:
                tt["_text"] = extract_pdf_text_in_box(page, to_pdf(tt["coord"]), lay_img, tuple(int(v) for v in tt["coord"]), is_scanned)

        crop_img: Image.Image | None = None
        crop_scale = CROP_DPI / float(LAYOUT_DPI)
        if out_dir and url_prefix and (fig_boxes or tbl_boxes):
            cpix = page.get_pixmap(dpi=CROP_DPI, alpha=False)
            crop_img = Image.frombytes("RGB", (cpix.width, cpix.height), cpix.samples)

        # 1. Extract ALL Figures detected by Baidu PP-DocLayout_plus-L
        used_fig_caps: set[int] = set()
        for fb in sorted(fig_boxes, key=lambda b: (b["coord"][1], b["coord"][0])):
            x0, y0, x1, y1 = fb["coord"]
            w_px, h_px = x1 - x0, y1 - y0
            # Filter tiny icons / publisher badges (e.g. Elsevier logo on page 1 top-left)
            if w_px < 65 or h_px < 50:
                continue
            if pno == 0 and y1 < lay_pix.height * 0.16 and w_px < lay_pix.width * 0.22:
                continue

            cap_box = pair_caption(fb["coord"], fig_title_boxes, used_fig_caps, prefer="below")
            cap_text = clean_ws(cap_box.get("_text", "")) if cap_box else ""
            m_num = FIG_CAP_RE.match(cap_text) if cap_text else None
            fig_label = f"Figure {m_num.group(1)}" if m_num else f"Figure {len(figures) + 1}"

            # Avoid duplicate identical figure numbers if same page split a subfigure without caption
            if m_num:
                fig_key = f"num:{m_num.group(1)}"
                if fig_key in seen_fig_keys:
                    fig_label = f"Figure {m_num.group(1)} ({len(figures) + 1})"
                else:
                    seen_fig_keys.add(fig_key)

            if crop_img is not None and out_dir and url_prefix:
                cx0 = max(0, int(x0 * crop_scale) - 3)
                cy0 = max(0, int(y0 * crop_scale) - 3)
                cx1 = min(crop_img.width, int(x1 * crop_scale) + 3)
                cy1 = min(crop_img.height, int(y1 * crop_scale) + 3)
                cropped = crop_img.crop((cx0, cy0, cx1, cy1))
                tmp_file = os.path.join(out_dir, f"_tmp_bfig_{len(figures) + 1}_p{pno + 1}.png")
                tw, th = trim_and_save_pil(cropped, tmp_file, threshold=247, pad=4)
                if tw < 55 or th < 45:
                    try:
                        os.remove(tmp_file)
                    except OSError:
                        pass
                    continue
                fname = f"baidu_fig_{len(figures) + 1}_p{pno + 1}_{tw}x{th}.png"
                os.replace(tmp_file, os.path.join(out_dir, fname))
                low = cap_text.lower()
                cat = (
                    "experiment"
                    if re.search(
                        r"result|comparison|ablation|accuracy|performance|error|curve|benchmark|evaluation|结果|对比|消融|准确率|性能|误差|实验",
                        low,
                    )
                    else "method"
                )
                figures.append({
                    "id": f"fig-{len(figures) + 1}",
                    "label": fig_label,
                    "url": f"{url_prefix}/{fname}",
                    "captionOriginal": cap_text or f"{fig_label} (Page {pno + 1})",
                    "category": cat,
                    "width": tw,
                    "height": th,
                    "page": pno + 1,
                    "score": round(fb["score"], 3),
                })

        # 2. Extract ALL Tables detected by Baidu PP-DocLayout_plus-L
        used_tbl_caps: set[int] = set()
        for tb in sorted(tbl_boxes, key=lambda b: (b["coord"][1], b["coord"][0])):
            x0, y0, x1, y1 = tb["coord"]
            if (x1 - x0) < 70 or (y1 - y0) < 35:
                continue
            cap_box = pair_caption(tb["coord"], tbl_title_boxes, used_tbl_caps, prefer="above")
            cap_text = clean_ws(cap_box.get("_text", "")) if cap_box else ""
            m_num = TBL_CAP_RE.match(cap_text) if cap_text else None
            tbl_label = f"Table {m_num.group(1)}" if m_num else f"Table {len(tables) + 1}"
            if m_num:
                tkey = f"tnum:{m_num.group(1)}"
                if tkey in seen_tbl_keys:
                    tbl_label = f"Table {m_num.group(1)} ({len(tables) + 1})"
                else:
                    seen_tbl_keys.add(tkey)

            if crop_img is not None and out_dir and url_prefix:
                cx0 = max(0, int(x0 * crop_scale) - 3)
                cy0 = max(0, int(y0 * crop_scale) - 3)
                cx1 = min(crop_img.width, int(x1 * crop_scale) + 3)
                cy1 = min(crop_img.height, int(y1 * crop_scale) + 3)
                cropped = crop_img.crop((cx0, cy0, cx1, cy1))
                tmp_file = os.path.join(out_dir, f"_tmp_btbl_{len(tables) + 1}_p{pno + 1}.png")
                tw, th = trim_and_save_pil(cropped, tmp_file, threshold=247, pad=4)
                if tw < 65 or th < 32:
                    try:
                        os.remove(tmp_file)
                    except OSError:
                        pass
                    continue
                fname = f"baidu_tbl_{len(tables) + 1}_p{pno + 1}_{tw}x{th}.png"
                os.replace(tmp_file, os.path.join(out_dir, fname))
                tables.append({
                    "id": f"tbl-{len(tables) + 1}",
                    "label": tbl_label,
                    "imageUrl": f"{url_prefix}/{fname}",
                    "captionOriginal": cap_text or f"{tbl_label} (Page {pno + 1})",
                    "width": tw,
                    "height": th,
                    "page": pno + 1,
                    "score": round(tb["score"], 3),
                })

        # 3. Extract Clean Text, Title, Abstract & Structured Sections (strictly excluding noise classes!)
        # Baidu PP-DocLayout_plus-L cleanly separates: header, footer, header_image, footer_image,
        # footnote, number, aside_text, content (TOC!), reference, reference_content, image, chart, table, figure_title, table_title
        content_boxes = [
            b for b in filtered
            if b["label"] in ("doc_title", "abstract", "paragraph_title", "text")
        ]
        content_boxes = sort_reading_order(content_boxes, lay_pix.width)

        expecting_abstract_text = False
        for b in content_boxes:
            lbl = b["label"]
            txt = extract_pdf_text_in_box(page, to_pdf(b["coord"]), lay_img, tuple(int(v) for v in b["coord"]), is_scanned)
            if not txt:
                continue
            # Skip any text block that was actually a figure/table caption
            if FIG_CAP_RE.match(txt) or TBL_CAP_RE.match(txt):
                continue

            if pno < 2:
                front_text_for_kw.append(txt)

            if lbl == "doc_title" and pno == 0:
                doc_title_parts.append(txt)
                continue

            if lbl == "abstract" and pno < 2:
                cleaned_abs = sanitize_abstract(txt)
                if cleaned_abs:
                    abstract_parts.append(cleaned_abs)
                expecting_abstract_text = False
                continue

            if lbl == "paragraph_title":
                sec = classify_section_heading(txt)
                if sec == "abstract" and pno < 2:
                    expecting_abstract_text = True
                    continue
                expecting_abstract_text = False
                cur_section = sec
                if cur_section != "references":
                    all_clean_text.append(txt)
                continue

            # Regular `text` block
            if expecting_abstract_text and pno < 2:
                cleaned_abs = sanitize_abstract(txt)
                if cleaned_abs and len(cleaned_abs) > 40:
                    abstract_parts.append(cleaned_abs)
                expecting_abstract_text = False
                continue

            if pno < 2 and re.match(r"^(?:A\s*B\s*S\s*T\s*R\s*A\s*C\s*T|Abstract|摘\s*要)\s*[:：.\-—]?", txt, re.IGNORECASE):
                cleaned_abs = sanitize_abstract(txt)
                if cleaned_abs and len(cleaned_abs) > 40:
                    abstract_parts.append(cleaned_abs)
                continue

            # Skip residual TOC lines with dot leaders
            if txt.count("....") >= 2:
                continue

            if cur_section != "references":
                sections.setdefault(cur_section, []).append(txt)
                all_clean_text.append(txt)

    doc.close()

    final_abstract = sanitize_abstract(" ".join(abstract_parts))
    # Fallback ONLY if model didn't tag an explicit abstract box on p1-p2 (never grabs TOC/intro!)
    if not final_abstract:
        m_abs = re.search(
            r"(?:^|\n)\s*(?:A\s*B\s*S\s*T\s*R\s*A\s*C\s*T|Abstract|摘\s*要)\s*[:：.\-—]?\s*([\s\S]{60,3200}?)(?:\n\s*(?:Keywords?|Key\s+words?|关键词|中图分类号|收稿日期|基金项目|Contents|1\.?\s+Introduction|1\s+引言)|\Z)",
            raw_full_text_p12,
            re.IGNORECASE,
        )
        if m_abs:
            final_abstract = sanitize_abstract(m_abs.group(1))

    keywords = extract_keywords_from_text("\n".join(front_text_for_kw) + "\n" + raw_full_text_p12)

    final_sections: dict[str, str] = {}
    if final_abstract:
        final_sections["abstract"] = final_abstract
    for k, v_list in sections.items():
        joined = "\n".join(v_list).strip()
        if joined:
            final_sections[k] = joined[:12000]

    doi_match = re.search(r"\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)\b", raw_full_text_p12)
    arxiv_match = re.search(r"arXiv[:\s]+(\d{4}\.\d{4,5})", raw_full_text_p12, re.IGNORECASE)
    title = clean_ws(" ".join(doc_title_parts)) or clean_ws(meta.get("title") or "")
    authors_raw = clean_ws(meta.get("author") or "")
    authors = [a.strip() for a in re.split(r"[;,，；]+", authors_raw) if a.strip()] if authors_raw else []

    return {
        "engine": f"baidu-{LAYOUT_MODEL_NAME}",
        "pages": total_pages,
        "text": "\n".join(all_clean_text)[:60000],
        "sections": final_sections,
        "keywords": keywords,
        "warnings": [],
        "metadata": {
            "title": title,
            "authors": authors,
            "doi": doi_match.group(1).rstrip(".,;)") if doi_match else "",
            "arxivId": arxiv_match.group(1) if arxiv_match else "",
            "publishedDate": "",
        },
        "figures": figures,
        "tables": tables,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[paddle-parser] {self.address_string()} - {fmt % args}", flush=True)

    def send_json(self, status: int, data: dict[str, Any]) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path == "/health":
            if _ready:
                self.send_json(200, {"ok": True, "engine": f"baidu-{LAYOUT_MODEL_NAME}", "ready": True})
            else:
                self.send_json(503, {"ok": False, "engine": f"baidu-{LAYOUT_MODEL_NAME}", "ready": False, "error": _load_error or "loading"})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/parse":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            pdf_path = str(body.get("pdf_path") or "").strip()
            out_dir = body.get("out_dir")
            url_prefix = body.get("url_prefix")
            if not pdf_path:
                self.send_json(400, {"error": "pdf_path is required"})
                return
            t0 = time.time()
            result = parse_pdf_with_baidu(pdf_path, out_dir, url_prefix)
            result["elapsedMs"] = int((time.time() - t0) * 1000)
            self.send_json(200, result)
        except Exception as exc:
            print(f"[paddle-parser] /parse error: {exc}", flush=True)
            self.send_json(500, {"error": str(exc)})


def main() -> None:
    # Preload Baidu PP-DocLayout_plus-L on startup so /health only turns green when ready
    threading.Thread(target=get_layout_model, daemon=True).start()
    port = int(os.environ.get("PORT", "8090"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[paddle-parser] Listening on 0.0.0.0:{port} (model={LAYOUT_MODEL_NAME})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
