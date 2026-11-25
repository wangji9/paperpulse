"""Extract source text and section boundaries; never synthesize research claims."""
import sys, json, re, urllib.request, fitz, os

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
        text = '\n'.join(p.get_text(sort=True) for p in list(doc)[:40])[:180000]
        sections = {}
        pattern = re.compile(r'(?im)^\s*(?:(?:\d+(?:\.\d+)*)[.\s]+)?(abstract|introduction|background|related work|problem (?:formulation|statement)|method(?:s|ology)?|(?:our|proposed) (?:method|approach)|approach|experiments?(?: and results)?|results?(?: and discussion)?|conclusions?(?: and (?:future work|limitations))?|limitations|discussion|references|acknowledgments?|appendix)\s*\n')
        headings = list(pattern.finditer(text))
        for i, m in enumerate(headings):
            section = text[m.end():headings[i+1].start() if i+1<len(headings) else min(len(text),m.end()+12000)]
            if section.strip(): sections.setdefault(m.group(1).lower(), section.strip()[:10000])
        k = re.search(r'(?im)^\s*(?:key\s*words?|index terms)\s*[:—-]\s*(.{10,300})', text)
        print(json.dumps({'pages': len(doc), 'text': text[:100000], 'sections': sections, 'keywords': re.split(r'[,;•]', k.group(1)) if k else []}, ensure_ascii=False))
        doc.close()
    except Exception as e:
        print(json.dumps({'error': str(e), 'sections': {}, 'text': ''}, ensure_ascii=False))
if __name__ == '__main__': main()
