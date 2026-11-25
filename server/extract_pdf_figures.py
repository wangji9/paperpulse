import sys
import os
import re
import json
import urllib.request
import fitz  # PyMuPDF


def download_pdf(url: str, dest: str) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "application/pdf,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=14) as resp:
        data = resp.read(28 * 1024 * 1024)
        if not data.startswith(b"%PDF"):
            return False
        with open(dest, "wb") as f:
            f.write(data)
    return True


def clean_caption(txt: str) -> str:
    return re.sub(r"\s+", " ", txt).strip()[:360]


def column_bounds(cap_rect: fitz.Rect, page_rect: fitz.Rect):
    pw = page_rect.width
    mid = pw / 2.0
    # Full-width figure/table if caption spans across midline or is wide
    if cap_rect.width > pw * 0.52 or (cap_rect.x0 < mid - 35 and cap_rect.x1 > mid + 35):
        return max(18, page_rect.x0 + 18), min(pw - 18, page_rect.x1 - 18)
    elif cap_rect.x1 <= mid + 25:
        return max(18, page_rect.x0 + 18), mid + 6
    else:
        return mid - 6, min(pw - 18, page_rect.x1 - 18)


def extract_from_pdf(pdf_path: str, out_dir: str, url_prefix: str):
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    figures = []
    tables = []

    fig_re = re.compile(r"^(?:Fig\.?|Figure|FIG\.?)\s*(\d+|[IVX]+)\b[:.\s-]*([\s\S]*)", re.IGNORECASE)
    tbl_re = re.compile(r"^(?:Table|TABLE|Tab\.?)\s*(\d+|[IVX]+)\b[:.\s-]*([\s\S]*)", re.IGNORECASE)

    max_pages = min(len(doc), 18)
    for pno in range(max_pages):
        if len(figures) >= 3 and len(tables) >= 2:
            break
        page = doc[pno]
        prect = page.rect
        blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
        text_blocks.sort(key=lambda b: (b[1], b[0]))

        img_rects = [fitz.Rect(info["bbox"]) for info in page.get_image_info() if info.get("bbox")]
        draw_rects = [d["rect"] for d in page.get_drawings() if d.get("rect") and (d["rect"].width > 8 or d["rect"].height > 8)]
        horiz_lines = [
            d["rect"]
            for d in page.get_drawings()
            if d.get("rect") and d["rect"].width > 80 and d["rect"].height < 6
        ]

        for b in text_blocks:
            txt = b[4].strip()
            brect = fitz.Rect(b[:4])

            # 1. Match Figure Caption (usually directly below visual content)
            m_fig = fig_re.match(txt)
            if m_fig and len(figures) < 3 and len(txt) > 12:
                num = m_fig.group(1)
                col_x0, col_x1 = column_bounds(brect, prect)

                # Gather visual elements above caption in same column span
                cand_rects = []
                for r in img_rects + draw_rects:
                    if r.y1 <= brect.y0 + 12 and r.y0 >= max(24, brect.y0 - 420):
                        if r.x1 > col_x0 + 15 and r.x0 < col_x1 - 15:
                            if r.width < prect.width * 0.98 or r.height < prect.height * 0.92:
                                cand_rects.append(r)

                if cand_rects:
                    union_r = cand_rects[0]
                    for r in cand_rects[1:]:
                        union_r |= r
                    # Also include text labels inside the diagram bounding box
                    crop = fitz.Rect(
                        max(16, min(union_r.x0, col_x0) - 6),
                        max(20, union_r.y0 - 8),
                        min(prect.width - 16, max(union_r.x1, col_x1) + 6),
                        min(prect.height - 16, union_r.y1 + 6),
                    )
                    if crop.height >= 55 and crop.width >= 110:
                        fname = f"pdf_fig_{len(figures)+1}_p{pno+1}.png"
                        out_file = os.path.join(out_dir, fname)
                        pix = page.get_pixmap(clip=crop, dpi=145, alpha=False)
                        pix.save(out_file)
                        cap_clean = clean_caption(txt)
                        low = cap_clean.lower()
                        cat = "experiment" if re.search(r"result|comparison|ablation|accuracy|performance|error|curve|benchmark|evaluation", low) and len(figures) >= 1 else "method"
                        figures.append({
                            "id": f"fig-{len(figures)+1}",
                            "label": f"Figure {num}",
                            "url": f"{url_prefix}/{fname}",
                            "captionOriginal": cap_clean,
                            "category": cat,
                        })
                        continue

            # 2. Match Table Caption (usually directly above the table)
            m_tbl = tbl_re.match(txt)
            if m_tbl and len(tables) < 2 and len(txt) > 8:
                num = m_tbl.group(1)
                col_x0, col_x1 = column_bounds(brect, prect)
                below_lines = [
                    hl for hl in horiz_lines
                    if hl.y0 >= brect.y1 - 6 and hl.y1 <= min(prect.height - 25, brect.y1 + 380)
                    and hl.x1 > col_x0 + 30 and hl.x0 < col_x1 - 30
                ]
                if len(below_lines) >= 2:
                    bottom_y = max(hl.y1 for hl in below_lines) + 8
                    left_x = max(16, min([hl.x0 for hl in below_lines] + [col_x0]) - 6)
                    right_x = min(prect.width - 16, max([hl.x1 for hl in below_lines] + [col_x1]) + 6)
                    top_y = max(18, brect.y0 - 4)
                    crop = fitz.Rect(left_x, top_y, right_x, bottom_y)
                else:
                    # Fallback for borderless / shaded Elsevier/Springer PDF tables: include caption + tabular area below
                    next_para_y = min(prect.height - 24, brect.y1 + 210)
                    for tb2 in text_blocks:
                        if tb2[1] > brect.y1 + 45 and len(tb2[4].strip()) > 260 and tb2[0] < col_x1 - 20 and tb2[2] > col_x0 + 20:
                            next_para_y = max(brect.y1 + 75, tb2[1] - 8)
                            break
                    crop = fitz.Rect(col_x0, max(18, brect.y0 - 4), col_x1, next_para_y)

                if crop.height >= 50 and crop.width >= 120:
                    fname = f"pdf_tbl_{len(tables)+1}_p{pno+1}.png"
                    out_file = os.path.join(out_dir, fname)
                    pix = page.get_pixmap(clip=crop, dpi=180, alpha=False)
                    pix.save(out_file)
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
    tmp_pdf = os.path.join(out_dir, "_source.pdf")
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
    finally:
        if os.path.exists(tmp_pdf):
            try:
                os.remove(tmp_pdf)
            except Exception:
                pass


if __name__ == "__main__":
    main()
