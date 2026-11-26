from __future__ import annotations
import sys
import os
import re
import json
import urllib.request
import fitz  # PyMuPDF

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except Exception:
    HAS_PIL = False


def download_pdf(url: str, dest: str) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "application/pdf,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = resp.read(32 * 1024 * 1024 + 1)
        if not data.startswith(b"%PDF") or len(data) > 32 * 1024 * 1024:
            return False
        with open(dest, "wb") as f:
            f.write(data)
    return True


def clean_caption(txt: str) -> str:
    return re.sub(r"\s+", " ", txt).strip()[:420]


def save_trimmed_pixmap(
    pix: fitz.Pixmap,
    out_file: str,
    mask_boxes: list[tuple[int, int, int, int]] | None = None,
    threshold: int = 246,
    pad: int = 4,
) -> tuple[int, int]:
    """
    Optionally white-mask any leaked prose/header rectangles, then tightly auto-trim
    all near-white outer margins so figures have ZERO wasted blank whitespace.
    Returns (width, height).
    """
    w, h = pix.width, pix.height
    if w < 10 or h < 10:
        pix.save(out_file)
        return w, h

    if HAS_PIL:
        mode = "RGB" if pix.n == 3 else "RGBA" if pix.n == 4 else "L"
        img = Image.frombytes(mode, (w, h), pix.samples)
        if mode != "RGB":
            img = img.convert("RGB")
        if mask_boxes:
            draw = ImageDraw.Draw(img)
            for (mx0, my0, mx1, my1) in mask_boxes:
                if mx1 > mx0 and my1 > my0:
                    draw.rectangle([mx0, my0, mx1, my1], fill=(255, 255, 255))
        gray = img.convert("L")
        mask = gray.point(lambda p: 255 if p < threshold else 0)
        bbox = mask.getbbox()
        if bbox:
            x0 = max(0, bbox[0] - pad)
            y0 = max(0, bbox[1] - pad)
            x1 = min(w, bbox[2] + pad)
            y1 = min(h, bbox[3] + pad)
            if (x1 - x0) >= 24 and (y1 - y0) >= 24:
                img = img.crop((x0, y0, x1, y1))
        img.save(out_file, format="PNG", optimize=True)
        return img.width, img.height

    buf = bytearray(pix.samples)
    stride = pix.stride
    n = pix.n
    if mask_boxes:
        for (mx0, my0, mx1, my1) in mask_boxes:
            cy0 = max(0, min(h, my0))
            cy1 = max(0, min(h, my1))
            cx0 = max(0, min(w, mx0))
            cx1 = max(0, min(w, mx1))
            for y in range(cy0, cy1):
                off0 = y * stride + cx0 * n
                off1 = y * stride + cx1 * n
                buf[off0:off1] = b"\xff" * (off1 - off0)

    step = 2 if (w * h > 400_000) else 1
    min_x, max_x = w, -1
    min_y, max_y = h, -1

    for y in range(0, h, step):
        row_off = y * stride
        row_has = False
        for x in range(0, w, step):
            idx = row_off + x * n
            if buf[idx] < threshold or buf[idx + 1] < threshold or buf[idx + 2] < threshold:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                row_has = True
        if row_has:
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y

    out_pix = fitz.Pixmap(pix.colorspace, w, h, bytes(buf), pix.alpha)
    if max_x > min_x and max_y > min_y:
        x0 = max(0, min_x - pad - step)
        y0 = max(0, min_y - pad - step)
        x1 = min(w, max_x + pad + step + 1)
        y1 = min(h, max_y + pad + step + 1)
        if (x1 - x0) >= 24 and (y1 - y0) >= 24:
            clipped = fitz.Pixmap(out_pix.colorspace, fitz.IRect(x0, y0, x1, y1), out_pix.alpha)
            clipped.copy(out_pix, fitz.IRect(x0, y0, x1, y1))
            clipped.save(out_file)
            return clipped.width, clipped.height

    out_pix.save(out_file)
    return w, h


SECTION_HEADING_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\.?\s+[A-Z\u4e00-\u9fff]|\(\d+\)\s+[A-Z\u4e00-\u9fff]|(?:Appendix|References|Acknowledgments|Declaration|CRediT)\b)",
    re.IGNORECASE,
)


def is_inside_any_rect(r: fitz.Rect, boxes: list[fitz.Rect]) -> bool:
    for b in boxes:
        if b.width >= 30 and b.height >= 20:
            inter = r & b
            if not inter.is_empty and ((inter.width * inter.height) / max(r.width * r.height, 1.0)) > 0.45:
                return True
    return False


def is_prose_or_header_block(
    rect: fitz.Rect,
    txt: str,
    page_rect: fitz.Rect,
    fig_re: re.Pattern,
    tbl_re: re.Pattern,
    img_rects: list[fitz.Rect],
    box_draw_rects: list[fitz.Rect],
) -> bool:
    """Identify body-text paragraphs, section headings, captions, and running headers/footers."""
    s = txt.strip()
    if not s:
        return False
    pw = page_rect.width
    ph = page_rect.height

    # Running page headers and footers
    if rect.y1 <= ph * 0.075 or rect.y0 >= ph * 0.938:
        return True

    # Captions
    if fig_re.match(s) or tbl_re.match(s):
        return True

    # Text sitting inside an embedded raster image or vector diagram box is a diagram label, NOT body prose!
    if is_inside_any_rect(rect, img_rects) or is_inside_any_rect(rect, box_draw_rects):
        return False

    lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
    # Numbered section heading in body text (e.g. "5.2.3. Self-optimization", "(2) Virtual phase")
    if len(lines) <= 2 and SECTION_HEADING_RE.match(s) and 8 <= len(s) <= 95 and rect.width >= pw * 0.14:
        return True

    # Genuine body paragraph: multi-line prose spanning a column or page width
    if len(s) >= 145 and len(lines) >= 3 and rect.width >= pw * 0.30:
        return True
    if len(s) >= 220 and rect.width >= pw * 0.30:
        return True
    if len(lines) >= 3 and len(s) >= 100 and rect.width >= pw * 0.34 and re.search(r"[.。,，;；]", s):
        return True

    return False


def resolve_figure_span(
    cap_rect: fitz.Rect,
    page_rect: fitz.Rect,
    is_two_col: bool,
    img_rects: list[fitz.Rect],
    draw_rects: list[fitz.Rect],
) -> tuple[float, float, bool]:
    """
    Determine horizontal search bounds (col_x0, col_x1, is_full_width) for a figure caption.
    Even when a caption is short on a two-column page, detect if a real graphic (image or tall
    vector diagram, NOT a thin horizontal line) directly above it crosses the page midline!
    """
    pw = page_rect.width
    mid = pw / 2.0
    full_x0, full_x1 = max(12.0, page_rect.x0 + 12.0), min(pw - 12.0, page_rect.x1 - 12.0)

    if not is_two_col:
        return full_x0, full_x1, True

    # Wide or centered caption -> full-width figure
    if cap_rect.width > pw * 0.46 or (cap_rect.x0 < mid - 28 and cap_rect.x1 > mid + 28):
        return full_x0, full_x1, True

    # Short caption on two-column page: check whether a real graphic directly above crosses midline!
    for r in img_rects:
        if r.y1 <= cap_rect.y0 + 14 and r.y1 >= max(page_rect.height * 0.08, cap_rect.y0 - 160):
            if r.x0 < mid - 22 and r.x1 > mid + 22 and r.height >= 28:
                return full_x0, full_x1, True
    for r in draw_rects:
        if r.height >= 28 and r.y1 <= cap_rect.y0 + 14 and r.y1 >= max(page_rect.height * 0.08, cap_rect.y0 - 160):
            if r.x0 < mid - 22 and r.x1 > mid + 22:
                return full_x0, full_x1, True

    # Also check if multiple vector sub-elements directly above span BOTH left & right halves of the page
    near_left = any(
        r.height >= 14 and r.x1 < mid - 6 and r.y1 <= cap_rect.y0 + 12 and r.y1 >= cap_rect.y0 - 140
        for r in img_rects + draw_rects
    )
    near_right = any(
        r.height >= 14 and r.x0 > mid + 6 and r.y1 <= cap_rect.y0 + 12 and r.y1 >= cap_rect.y0 - 140
        for r in img_rects + draw_rects
    )
    if near_left and near_right and cap_rect.x0 < mid - 40:
        # Only treat as full-width if there isn't a body text column directly above the OTHER half
        return full_x0, full_x1, True

    if cap_rect.x1 <= mid + 24:
        return full_x0, mid + 6.0, False
    return mid - 6.0, full_x1, False


def cluster_contiguous_above(rects: list[fitz.Rect], anchor_y: float, max_gap: float = 48.0) -> list[fitz.Rect]:
    """
    Starting from visual elements closest to anchor_y (caption top), grow the visual
    cluster upward while vertical gaps stay <= max_gap.
    """
    if not rects:
        return []
    ordered = sorted(rects, key=lambda r: r.y1, reverse=True)
    cluster: list[fitz.Rect] = []
    cur_top = anchor_y

    seed_gap = max_gap * 2.2
    for r in ordered:
        if not cluster:
            if anchor_y - r.y1 <= seed_gap:
                cluster.append(r)
                cur_top = min(cur_top, r.y0)
            else:
                break
        else:
            if cur_top - r.y1 <= max_gap:
                cluster.append(r)
                cur_top = min(cur_top, r.y0)
            elif any(r.y1 >= c.y0 - max_gap and r.y0 <= c.y1 + max_gap for c in cluster):
                cluster.append(r)
                cur_top = min(cur_top, r.y0)
    return cluster if cluster else ordered[:1]


def extract_from_pdf(pdf_path: str, out_dir: str, url_prefix: str):
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    figures = []
    tables = []
    seen_fig_nums = set()
    seen_tbl_nums = set()

    fig_re = re.compile(r"^(?:Fig\.?|Figure|FIG\.?|图)\s*(\d+(?:\.\d+)?|[IVX]+)\s*(?:[:：.\s-]|$)", re.IGNORECASE)
    tbl_re = re.compile(r"^(?:Table|TABLE|Tab\.?|表)\s*(\d+(?:\.\d+)?|[IVX]+)\s*(?:[:：.\s-]|$)", re.IGNORECASE)
    max_figures = min(32, int(sys.argv[4])) if len(sys.argv) > 4 else 24
    max_tables = min(12, int(sys.argv[5])) if len(sys.argv) > 5 else 8

    max_pages = min(len(doc), 50)
    for pno in range(max_pages):
        if len(figures) >= max_figures and len(tables) >= max_tables:
            break
        page = doc[pno]
        prect = page.rect
        header_y = prect.height * 0.075
        footer_y = prect.height * 0.938

        blocks = page.get_text("blocks")
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
        text_blocks.sort(key=lambda b: (b[1], b[0]))

        # Raw images (excluding tiny icons & header/footer logos)
        img_rects = [
            fitz.Rect(info["bbox"])
            for info in page.get_image_info()
            if info.get("bbox")
            and fitz.Rect(info["bbox"]).y1 > header_y
            and fitz.Rect(info["bbox"]).y0 < footer_y
            and (fitz.Rect(info["bbox"]).width >= 16 or fitz.Rect(info["bbox"]).height >= 16)
        ]

        # Vector drawings (excluding full-page frames and running header/footer separator rules!)
        draw_rects: list[fitz.Rect] = []
        box_draw_rects: list[fitz.Rect] = []
        horiz_lines: list[fitz.Rect] = []
        for d in page.get_drawings():
            r = d.get("rect")
            if not r:
                continue
            if r.width > 80 and r.height < 6:
                horiz_lines.append(r)
            if r.y1 <= header_y + 4 or r.y0 >= footer_y - 4:
                continue
            if r.height <= 4 and r.width > prect.width * 0.58 and (r.y1 < prect.height * 0.13 or r.y0 > prect.height * 0.88):
                continue
            if r.width > prect.width * 0.96 and r.height > prect.height * 0.92:
                continue
            if r.width > 8 or r.height > 8:
                draw_rects.append(r)
                if r.width >= 30 and r.height >= 20:
                    box_draw_rects.append(r)

        # Classify body-prose / header / caption blocks (excluding diagram interior labels!)
        prose_blocks: list[tuple[fitz.Rect, str]] = []
        for tb in text_blocks:
            r = fitz.Rect(tb[:4])
            t = tb[4].strip()
            if is_prose_or_header_block(r, t, prect, fig_re, tbl_re, img_rects, box_draw_rects):
                prose_blocks.append((r, t))

        mid_x = prect.width / 2.0
        left_prose = sum(
            1 for (r, t) in prose_blocks
            if r.y0 > header_y and r.y1 < footer_y and r.x1 <= mid_x + 18 and r.width >= prect.width * 0.24
            and not fig_re.match(t) and not tbl_re.match(t)
        )
        right_prose = sum(
            1 for (r, t) in prose_blocks
            if r.y0 > header_y and r.y1 < footer_y and r.x0 >= mid_x - 18 and r.width >= prect.width * 0.24
            and not fig_re.match(t) and not tbl_re.match(t)
        )
        wide_prose = sum(
            1 for (r, t) in prose_blocks
            if r.y0 > header_y and r.y1 < footer_y and r.width >= prect.width * 0.62
            and not fig_re.match(t) and not tbl_re.match(t)
        )
        is_two_col = (left_prose >= 1 and right_prose >= 1) and (wide_prose == 0)

        for b in text_blocks:
            txt = b[4].strip()
            brect = fitz.Rect(b[:4])

            # 1. Match Figure Caption
            m_fig = fig_re.match(txt)
            if m_fig and len(figures) < max_figures and len(txt) > 7:
                num = m_fig.group(1)
                if len(txt) > 560 and brect.height > 100:
                    continue
                if num in seen_fig_nums:
                    continue

                col_x0, col_x1, is_full_w = resolve_figure_span(brect, prect, is_two_col, img_rects, draw_rects)

                # Strict upper ceiling from ANY prose/heading/caption block above in our span
                top_ceiling = max(header_y + 4.0, brect.y0 - prect.height * 0.85)
                for (r2, _t2) in prose_blocks:
                    if r2 == brect:
                        continue
                    if r2.y1 <= brect.y0 - 6 and r2.y1 > top_ceiling:
                        overlap_x = min(r2.x1, col_x1) - max(r2.x0, col_x0)
                        if overlap_x > 28:
                            # If full-width mode was guessed only from near_left+near_right while prose occupies one side,
                            # check whether this prose actually sits beside a single-column figure!
                            if is_full_w and r2.y1 > brect.y0 - 90 and r2.width < prect.width * 0.48:
                                # Re-narrow to caption's own column if opposite column has prose right next to caption!
                                if brect.x1 <= mid_x + 24 and r2.x0 >= mid_x - 16:
                                    col_x1 = mid_x + 6.0
                                    is_full_w = False
                                    continue
                                if brect.x0 >= mid_x - 24 and r2.x1 <= mid_x + 16:
                                    col_x0 = mid_x - 6.0
                                    is_full_w = False
                                    continue
                            top_ceiling = max(top_ceiling, r2.y1 + 3.0)

                # Gather visual elements above caption & below top_ceiling & inside column span
                cand_rects: list[fitz.Rect] = []
                for r in img_rects + draw_rects:
                    if r.y1 <= brect.y0 + 10 and r.y0 >= top_ceiling - 10:
                        # Skip thin horizontal page-wide rules that could drag x0/x1 across columns
                        if r.height <= 4 and r.width > (col_x1 - col_x0) * 0.85 and not is_full_w:
                            continue
                        if not is_full_w:
                            if r.x0 < col_x0 - 20 or r.x1 > col_x1 + 20:
                                continue
                        else:
                            if r.x1 <= col_x0 + 8 or r.x0 >= col_x1 - 8:
                                continue
                        cand_rects.append(r)

                if cand_rects:
                    cand_rects = cluster_contiguous_above(cand_rects, brect.y0, max_gap=48.0)

                    # Filter out stray thin full-page rules if non-thin graphics exist
                    non_thin = [r for r in cand_rects if r.height > 5 or r.width < prect.width * 0.65]
                    if non_thin:
                        cand_rects = non_thin

                    union_r = fitz.Rect(cand_rects[0])
                    for r in cand_rects[1:]:
                        union_r |= r

                    # Include short diagram text labels (NOT prose/headers!) inside/adjacent to union_r
                    prose_set = {tuple(pr) for (pr, _) in prose_blocks}
                    padded_visual = fitz.Rect(union_r.x0 - 12, union_r.y0 - 12, union_r.x1 + 12, union_r.y1 + 8)
                    for tb2 in text_blocks:
                        r2 = fitz.Rect(tb2[:4])
                        if r2 == brect or tuple(r2) in prose_set:
                            continue
                        if r2.y1 > brect.y0 - 2 or r2.y0 < top_ceiling:
                            continue
                        if r2.intersects(padded_visual) and len(tb2[4].strip()) < 130:
                            if not is_full_w and (r2.x0 < col_x0 - 12 or r2.x1 > col_x1 + 12):
                                continue
                            union_r |= r2

                    crop = fitz.Rect(
                        max(10.0, union_r.x0 - 5.0),
                        max(header_y + 2.0, union_r.y0 - 5.0),
                        min(prect.width - 10.0, union_r.x1 + 5.0),
                        min(brect.y0 - 2.0, union_r.y1 + 5.0),
                    )

                    # Trim crop away from any adjacent-column prose blocks & collect residual white masks
                    mask_rects_pdf: list[fitz.Rect] = []
                    for (pr, _) in prose_blocks:
                        if pr == brect or not pr.intersects(crop):
                            continue
                        inter = pr & crop
                        if pr.x1 <= prect.width * 0.52 and crop.x1 > prect.width * 0.55 and inter.width < crop.width * 0.52:
                            crop.x0 = max(crop.x0, pr.x1 + 3.0)
                        elif pr.x0 >= prect.width * 0.48 and crop.x0 < prect.width * 0.45 and inter.width < crop.width * 0.52:
                            crop.x1 = min(crop.x1, pr.x0 - 3.0)
                        elif pr.y1 <= crop.y0 + crop.height * 0.35:
                            crop.y0 = max(crop.y0, pr.y1 + 2.0)
                        else:
                            mask_rects_pdf.append(pr)

                    if crop.height >= 42 and crop.width >= 70:
                        seen_fig_nums.add(num)
                        dpi = 175
                        scale = dpi / 72.0
                        pix = page.get_pixmap(clip=crop, dpi=dpi, alpha=False)
                        mask_px: list[tuple[int, int, int, int]] = []
                        for mr in mask_rects_pdf:
                            inter = mr & crop
                            if inter.is_empty:
                                continue
                            mask_px.append((
                                max(0, int((inter.x0 - crop.x0) * scale) - 2),
                                max(0, int((inter.y0 - crop.y0) * scale) - 2),
                                min(pix.width, int((inter.x1 - crop.x0) * scale) + 2),
                                min(pix.height, int((inter.y1 - crop.y0) * scale) + 2),
                            ))
                        tmp_file = os.path.join(out_dir, f"_tmp_fig_{len(figures)+1}_p{pno+1}.png")
                        tw, th = save_trimmed_pixmap(pix, tmp_file, mask_boxes=mask_px, threshold=246, pad=5)
                        fname = f"pdf_fig_{len(figures)+1}_p{pno+1}_{tw}x{th}.png"
                        out_file = os.path.join(out_dir, fname)
                        os.replace(tmp_file, out_file)
                        cap_clean = clean_caption(txt)
                        low = cap_clean.lower()
                        cat = (
                            "experiment"
                            if re.search(
                                r"result|comparison|ablation|accuracy|performance|error|curve|benchmark|evaluation|结果|对比|消融|准确率|性能|误差|实验",
                                low,
                            )
                            else "method"
                        )
                        figures.append({
                            "id": f"fig-{len(figures)+1}",
                            "label": f"Figure {num}",
                            "url": f"{url_prefix}/{fname}",
                            "captionOriginal": cap_clean,
                            "category": cat,
                            "width": tw,
                            "height": th,
                        })
                        continue

            # 2. Match Table Caption (usually directly above the table)
            m_tbl = tbl_re.match(txt)
            if m_tbl and len(tables) < max_tables and len(txt) > 5:
                num = m_tbl.group(1)
                if num in seen_tbl_nums:
                    continue
                col_x0, col_x1, _ = resolve_figure_span(brect, prect, is_two_col, [], [])
                below_lines = [
                    hl for hl in horiz_lines
                    if hl.y0 >= brect.y1 - 6 and hl.y1 <= min(footer_y, brect.y1 + 420)
                    and hl.x1 > col_x0 + 30 and hl.x0 < col_x1 - 30
                ]
                if len(below_lines) >= 2:
                    bottom_y = max(hl.y1 for hl in below_lines) + 8
                    left_x = max(14.0, min([hl.x0 for hl in below_lines] + [col_x0]) - 6)
                    right_x = min(prect.width - 14.0, max([hl.x1 for hl in below_lines] + [col_x1]) + 6)
                    top_y = max(header_y, brect.y0 - 4)
                    crop = fitz.Rect(left_x, top_y, right_x, bottom_y)
                else:
                    next_para_y = min(footer_y, brect.y1 + 210)
                    for tb2 in text_blocks:
                        if tb2[1] > brect.y1 + 45 and len(tb2[4].strip()) > 240 and tb2[0] < col_x1 - 20 and tb2[2] > col_x0 + 20:
                            next_para_y = max(brect.y1 + 75, tb2[1] - 8)
                            break
                    crop = fitz.Rect(col_x0, max(header_y, brect.y0 - 4), col_x1, next_para_y)

                if crop.height >= 50 and crop.width >= 120:
                    seen_tbl_nums.add(num)
                    fname = f"pdf_tbl_{len(tables)+1}_p{pno+1}.png"
                    out_file = os.path.join(out_dir, fname)
                    pix = page.get_pixmap(clip=crop, dpi=180, alpha=False)
                    save_trimmed_pixmap(pix, out_file, threshold=246, pad=5)
                    tables.append({
                        "id": f"tbl-{len(tables)+1}",
                        "label": f"Table {num}",
                        "imageUrl": f"{url_prefix}/{fname}",
                        "captionOriginal": clean_caption(txt),
                    })

    doc.close()
    return {"figures": figures, "tables": tables}


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"figures": [], "tables": [], "error": "args: <pdf_url_or_path> <out_dir> <url_prefix>"}))
        return
    src = sys.argv[1]
    out_dir = sys.argv[2]
    url_prefix = sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)

    pdf_path = src
    tmp_pdf = os.path.join(out_dir, "source.pdf")
    try:
        if src.startswith("http://") or src.startswith("https://"):
            ok = download_pdf(src, tmp_pdf)
            if not ok:
                print(json.dumps({"figures": [], "tables": [], "error": "not_a_pdf"}))
                return
            pdf_path = tmp_pdf
        res = extract_from_pdf(pdf_path, out_dir, url_prefix)
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"figures": [], "tables": [], "error": str(e)}))


if __name__ == "__main__":
    main()
