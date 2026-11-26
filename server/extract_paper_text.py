# -*- coding: utf-8 -*-
"""Extract source text and section boundaries; never synthesize research claims."""
import sys, json, re, urllib.request, fitz, os, shutil, glob

def page_text_in_order(page):
    blocks=[b for b in page.get_text('blocks') if b[6]==0 and b[4].strip()]
    # Reading by screen coordinates interleaves two journal columns. Keep each
    # column together, while respecting full-width titles and section bands.
    mid=page.rect.width/2
    left=[b for b in blocks if b[2]<=mid+12 and b[2]-b[0]>100]
    right=[b for b in blocks if b[0]>=mid-12 and b[2]-b[0]>100]
    if len(left)<2 or len(right)<2:
        return '\n'.join(b[4] for b in sorted(blocks,key=lambda b:(b[1],b[0])))
    spans=[b for b in blocks if b[0]<mid-12 and b[2]>mid+12 and b[2]-b[0]>page.rect.width*.6]
    remaining=[b for b in blocks if b not in spans and not (b[2]-b[0]<45 and b[3]-b[1]>100)]
    ordered=[]
    for span in sorted(spans,key=lambda b:b[1]):
        above=[b for b in remaining if (b[1]+b[3])/2<span[1]]
        ordered.extend(sorted(above,key=lambda b:(b[0]>=mid-12,b[1],b[0])))
        remaining=[b for b in remaining if b not in above]
        ordered.append(span)
    ordered.extend(sorted(remaining,key=lambda b:(b[0]>=mid-12,b[1],b[0])))
    return '\n'.join(b[4] for b in ordered)

def metadata(doc, text):
    info=doc.metadata or {}
    first=page_text_in_order(doc[0]) if len(doc) else ''
    title=(info.get('title') or '').strip()
    if len(title)<8 or re.search(r'microsoft|untitled|\.docx?$|latex|template',title,re.I):
        lines=[]
        for block in doc[0].get_text('dict').get('blocks',[]):
            for line in block.get('lines',[]):
                spans=[s for s in line.get('spans',[]) if s.get('text','').strip()]
                if spans:
                    value=' '.join(s['text'].strip() for s in spans)
                    if 4<len(value)<240 and line['bbox'][1]<doc[0].rect.height*.6 and not re.search(r'arxiv:|doi:|www\.|https?://',value,re.I):
                        lines.append((max(s['size'] for s in spans),line['bbox'][1],value))
        largest=max((s for s,_,_ in lines),default=0)
        title=' '.join(v for s,y,v in sorted(lines,key=lambda row:row[1]) if s>=largest*.9)[:500]
    author=info.get('author') or ''
    authors=[a.strip() for a in re.split(r'\s*[,;、]\s*|\s+and\s+',author) if a.strip() and len(a)<100 and not re.fullmatch(r'IEEE|(?:Senior |Student )?Member|Fellow',a.strip(),re.I)]
    if not authors and title:
        lines=[s.strip() for s in first.splitlines() if s.strip()]
        title_key=re.sub(r'\W','',title).lower()
        title_lines=[i for i,s in enumerate(lines[:30]) if len(s)>8 and re.sub(r'\W','',s).lower() in title_key]
        if title_lines:
            for line in lines[max(title_lines)+1:max(title_lines)+6]:
                if re.search(r'abstract|摘要|university|institute|department|laboratory|@|published|copyright|doi:|arxiv',line,re.I):break
                cleaned=re.sub(r'[\d*†‡]+','',line).strip()
                parts=re.split(r'\s*[,;、]\s*|\s+and\s+',cleaned)
                plausible=[s for s in parts if re.fullmatch(r'[A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+){1,4}|[\u4e00-\u9fff]{2,4}',s) and not re.fullmatch(r'(?:Senior |Student )?Member|Fellow',s,re.I)]
                if plausible:authors.extend(plausible)
                elif authors:break
    doi=re.search(r'(?:doi\s*:?\s*|https?://(?:dx\.)?doi\.org/)(10\.\d{4,9}/[^\s<>]+)',first,re.I)
    arxiv=re.search(r'arxiv\s*:\s*(\d{4}\.\d{4,5})(?:v\d+)?',first,re.I)
    # Publication dates must come from the document or registry, never PDF creation time.
    year=re.search(r'(?:published|publication date|发表日期|出版日期)\s*[:：]?\s*((?:19|20)\d{2})(?:[-/.](\d{1,2})[-/.](\d{1,2}))?',first,re.I)
    published=year[1] if year else ('20'+arxiv[1][:2] if arxiv else '')
    if year and year[2] and year[3]: published+='-%02d-%02d'%(int(year[2]),int(year[3]))
    return {'title':title,'authors':authors,'doi':doi[1].rstrip('.,;)') if doi else '', 'arxivId':arxiv[1] if arxiv else '', 'publishedDate':published}

def main():
    try:
        if os.path.isfile(sys.argv[1]):
            with open(sys.argv[1], 'rb') as f: data=f.read(32*1024*1024+1)
        else:
            req = urllib.request.Request(sys.argv[1], headers={'User-Agent': 'PaperPulse/6.0', 'Accept': 'application/pdf'})
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read(32*1024*1024+1)
        if not data.startswith(b'%PDF') or len(data) > 32*1024*1024:
            raise ValueError('响应不是有效PDF或超过32MB')
        if len(sys.argv)>2 and not os.path.isfile(sys.argv[1]):
            os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True)
            with open(sys.argv[2], 'wb') as f: f.write(data)
        doc = fitz.open(stream=data, filetype='pdf')
        if doc.needs_pass: raise ValueError('PDF已加密，请先解密后上传')
        if not len(doc): raise ValueError('PDF没有可读取的页面')
        warnings=[]
        page_text=[];ocr_pages=0
        for page_number in range(min(len(doc),40)):
            page=doc[page_number]
            value=page_text_in_order(page)
            if len(value.strip())<80 and page.get_images() and ocr_pages<8 and shutil.which('tesseract'):
                try:
                    if page.rect.width*page.rect.height*6.25>30000000:
                        warnings.append('扫描页尺寸过大，已跳过OCR，请查看原文。');continue
                    tessdata=os.environ.get('TESSDATA_PREFIX') or next(iter(glob.glob('/usr/share/tesseract-ocr/*/tessdata')),None)
                    tp=page.get_textpage_ocr(language='eng+chi_sim',dpi=180,full=True,tessdata=tessdata)
                    value=page.get_text(textpage=tp,sort=True);ocr_pages+=1
                except Exception: warnings.append('部分扫描页OCR识别失败，请核对原文。')
            page_text.append(value)
        text='\n'.join(page_text)[:180000]
        text=re.sub(r'(?im)^\s*(abstract|摘要)\s*[:：—-]\s*',lambda m:m[1]+'\n',text,count=1)
        if ocr_pages:warnings.append('已对%d页进行OCR，扫描内容及公式需要结合原文核对；最多识别8个扫描页。'%ocr_pages)
        if len(doc)>40:warnings.append('当前提取前40页正文，完整PDF保留在站内。')
        sections = {}
        heading_names=(r'abstract|index terms|keywords|关键词|introduction|background|related work|problem (?:formulation|statement)|'
                       r'method(?:s|ology)?|(?:our|proposed) (?:method|approach|framework)|approach|'
                       r'experiments?(?: and results)?|experimental (?:results|setup|evaluation)|performance evaluation|evaluation|results?(?: and discussion)?|'
                       r'conclusions?(?: and (?:future work|limitations))?|limitations|discussion|'
                       r'references|acknowledgments?|appendix|摘\s*要|引言|研究背景|相关工作|问题描述|'
                       r'研究方法|方法|实验(?:与结果|结果)?|结果(?:与讨论)?|结论(?:与展望)?|参考文献')
        pattern=re.compile(r'(?im)^\s*(?:(?:\d+(?:\.\d+)*|[IVX]+)[.、\s]+)?('+heading_names+r')\s*\n')
        headings = list(pattern.finditer(text))
        for i, m in enumerate(headings):
            section = text[m.end():headings[i+1].start() if i+1<len(headings) else min(len(text),m.end()+12000)]
            key=re.sub(r'\s+','',m.group(1))
            chinese={'摘要':'abstract','引言':'introduction','研究背景':'background','相关工作':'related work','问题描述':'problem statement','研究方法':'method','方法':'method','实验':'experiments','实验与结果':'experiments','实验结果':'experiments','结果':'results','结果与讨论':'results','结论':'conclusion','结论与展望':'conclusion','参考文献':'references'}
            canonical=chinese.get(key,m.group(1).lower())
            if re.search(r'evaluation|experimental',canonical):canonical='experiments'
            if section.strip(): sections.setdefault(canonical,section.strip()[:10000])
        k = re.search(r'(?im)^\s*(?:key\s*words?|index terms|关键词)\s*[:：—-]\s*(.{4,300})', text)
        print(json.dumps({'pages': len(doc), 'text': text[:100000], 'sections': sections, 'keywords': re.split(r'[,;•；，、]', k.group(1)) if k else [],'metadata':metadata(doc,text),'warnings':warnings}, ensure_ascii=False))
        doc.close()
    except Exception as e:
        print(json.dumps({'error': str(e), 'sections': {}, 'text': ''}, ensure_ascii=False))
if __name__ == '__main__': main()
