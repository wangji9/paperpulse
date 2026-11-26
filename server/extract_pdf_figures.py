import sys
import os
import re
import json
import urllib.request
import fitz  # PyMuPDF

try:
    from PIL import Image, ImageChops
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
    return re.sub(r"\s+", " ", txt).strip()[:360]


def save_trimmed_pixmap(pix: fitz.Pixmap, out_file: str, threshold: int = 246, pad: int = 4) -> tuple[int, int]:
    """
    Save pixmap with near-white outer margins tightly auto-trimmed so figures have
    zero wasted blank whitespace around their borders. Returns (width, height).
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
        # Mask any pixel where min(R,G,B) < threshold as foreground content
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

    # Pure-Python fallback (no Pillow required) scanning RGB samples via memoryview
    samples = memoryview(pix.samples)
    stride = pix.stride
    n = pix.n
    step = 2 if (w * h > 400_000) else 1
    min_x, max_x = w, -1
    min_y, max_y = h, -1

    for y in range(0, h, step):
        row_off = y * stride
        row_has = False
        for x in range(0, w, step):
            idx = row_off + x * n
            if samples[idx] < threshold or samples[idx + 1] < threshold or samples[idx + 2] < threshold:
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

    if max_x > min_x and max_y > min_y:
        x0 = max(0, min_x - pad - step)
        y0 = max(0, min_y - pad - step)
        x1 = min(w, max_x + pad + step + 1)
        y1 = min(h, max_y + pad + step + 1)
        if (x1 - x0) >= 24 and (y1 - y0) >= 24:
            clipped = fitz.Pixmap(pix.colorspace, fitz.IRect(x0, y0, x1, y1), pix.alpha)
            clipped.copy(pix, fitz.IRect(x0, y0, x1, y1))
            clipped.save(out_file)
            return clipped.width, clipped.height

    pix.save(out_file)
    return w, h


def column_bounds(cap_rect: fitz.Rect, page_rect: fitz.Rect):
    pw = page_rect.width
    mid = pw / 2.0
    # Full-width figure/table if caption spans across midline or is wide
    if cap_rect.width > pw * 0.50 or (cap_rect.x0 < mid - 32 and cap_rect.x1 > mid + 32):
        return max(14, page_rect.x0 + 14), min(pw - 14, page_rect.x1 - 14)
    elif cap_rect.x1 <= mid + 25:
        return max(14, page_rect.x0 + 14), mid + 8
    else:
        return mid - 8, min(pw - 14, page_rect.x1 - 14)


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
        blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
        text_blocks.sort(key=lambda b: (b[1], b[0]))

        img_rects = [fitz.Rect(info["bbox"]) for info in page.get_image_info() if info.get("bbox")]
        draw_rects = [
            d["rect"]
            for d in page.get_drawings()
            if d.get("rect")
            and (d["rect"].width > 8 or d["rect"].height > 8)
            and not (d["rect"].width > prect.width * 0.96 and d["rect"].height > prect.height * 0.94)
        ]
        horiz_lines = [
            d["rect"]
            for d in page.get_drawings()
            if d.get("rect") and d["rect"].width > 80 and d["rect"].height < 6
        ]

        # Precompute caption rects on this page so stacked figures never merge into each other
        caption_rects = []
        for tb in text_blocks:
            t_s = tb[4].strip()
            if fig_re.match(t_s) or tbl_re.match(t_s):
                caption_rects.append(fitz.Rect(tb[:4]))

        for b in text_blocks:
            txt = b[4].strip()
            brect = fitz.Rect(b[:4])

            # 1. Match Figure Caption (usually directly below visual content)
            m_fig = fig_re.match(txt)
            if m_fig and len(figures) < max_figures and len(txt) > 7:
                num = m_fig.group(1)
                # Ignore inline running-text mentions like "Fig. 3 shows that..." when block is a huge paragraph
                if len(txt) > 520 and brect.height > 90:
                    continue
                if num in seen_fig_nums:
                    continue

                col_x0, col_x1 = column_bounds(brect, prect)

                # Determine upper ceiling: stop at any previous caption or long body paragraph above in same column
                top_ceiling = max(18.0, brect.y0 - prect.height * 0.86)
                for tb2 in text_blocks:
                    r2 = fitz.Rect(tb2[:4])
                    if r2.y1 <= brect.y0 - 10 and r2.y1 > top_ceiling:
                        if r2.x1 > col_x0 + 20 and r2.x0 < col_x1 - 20:
                            t2 = tb2[4].strip()
                            if fig_re.match(t2) or tbl_re.match(t2) or (len(t2) > 220 and r2.width > (col_x1 - col_x0) * 0.65):
                                top_ceiling = max(top_ceiling, r2.y1 + 4)

                # Gather visual elements above caption in same column span
                cand_rects = []
                for r in img_rects + draw_rects:
                    if r.y1 <= brect.y0 + 10 and r.y0 >= top_ceiling - 6:
                        if r.x1 > col_x0 + 10 and r.x0 < col_x1 - 10:
                            if r.width < prect.width * 0.96 or r.height < prect.height * 0.90:
                                # Ignore tiny page header/footer rules near top edge
                                if r.y1 < 42 and r.height < 14:
                                    continue
                                cand_rects.append(r)

                # Fallback: if caption is above the figure (rare Chinese journals), look directly below caption
                if not cand_rects:
                    bot_floor = min(prect.height - 20.0, brect.y1 + prect.height * 0.65)
                    for tb2 in text_blocks:
                        r2 = fitz.Rect(tb2[:4])
                        if r2.y0 >= brect.y1 + 10 and r2.y0 < bot_floor:
                            if r2.x1 > col_x0 + 20 and r2.x0 < col_x1 - 20:
                                t2 = tb2[4].strip()
                                if fig_re.match(t2) or tbl_re.match(t2) or (len(t2) > 220 and r2.width > (col_x1 - col_x0) * 0.65):
                                    bot_floor = min(bot_floor, r2.y0 - 4)
                    for r in img_rects + draw_rects:
                        if r.y0 >= brect.y1 - 8 and r.y1 <= bot_floor + 6:
                            if r.x1 > col_x0 + 10 and r.x0 < col_x1 - 10:
                                cand_rects.append(r)

                if cand_rects:
                    union_r = fitz.Rect(cand_rects[0])
                    for r in cand_rects[1:]:
                        union_r |= r

                    # Include short diagram text labels located inside/adjacent to union_r (WITHOUT expanding to full column whitespace!)
                    padded_visual = fitz.Rect(union_r.x0 - 14, union_r.y0 - 14, union_r.x1 + 14, union_r.y1 + 10)
                    for tb2 in text_blocks:
                        r2 = fitz.Rect(tb2[:4])
                        if r2 == brect:
                            continue
                        if r2.y1 <= brect.y0 - 2 and r2.y0 >= top_ceiling and r2.intersects(padded_visual):
                            if len(tb2[4].strip()) < 160:
                                union_r |= r2

                    # Tight crop strictly around union_r (no forced expansion to empty col_x0..col_x1!)
                    crop = fitz.Rect(
                        max(12, union_r.x0 - 6),
                        max(16, union_r.y0 - 6),
                        min(prect.width - 12, union_r.x1 + 6),
                        min(brect.y0 - 2 if union_r.y1 <= brect.y0 + 10 else prect.height - 12, union_r.y1 + 6),
                    )
                    if crop.height >= 45 and crop.width >= 75:
                        seen_fig_nums.add(num)
                        tmp_file = os.path.join(out_dir, f"_tmp_fig_{len(figures)+1}_p{pno+1}.png")
                        pix = page.get_pixmap(clip=crop, dpi=170, alpha=False)
                        tw, th = save_trimmed_pixmap(pix, tmp_file, threshold=246, pad=5)
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
                col_x0, col_x1 = column_bounds(brect, prect)
                below_lines = [
                    hl for hl in horiz_lines
                    if hl.y0 >= brect.y1 - 6 and hl.y1 <= min(prect.height - 25, brect.y1 + 420)
                    and hl.x1 > col_x0 + 30 and hl.x0 < col_x1 - 30
                ]
                if len(below_lines) >= 2:
                    bottom_y = max(hl.y1 for hl in below_lines) + 8
                    left_x = max(14, min([hl.x0 for hl in below_lines] + [col_x0]) - 6)
                    right_x = min(prect.width - 14, max([hl.x1 for hl in below_lines] + [col_x1]) + 6)
                    top_y = max(16, brect.y0 - 4)
                    crop = fitz.Rect(left_x, top_y, right_x, bottom_y)
                else:
                    next_para_y = min(prect.height - 24, brect.y1 + 210)
                    for tb2 in text_blocks:
                        if tb2[1] > brect.y1 + 45 and len(tb2[4].strip()) > 260 and tb2[0] < col_x1 - 20 and tb2[2] > col_x0 + 20:
                            next_para_y = max(brect.y1 + 75, tb2[1] - 8)
                            break
                    crop = fitz.Rect(col_x0, max(16, brect.y0 - 4), col_x1, next_para_y)

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
