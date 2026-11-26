# coding: utf-8
"""Resolve the user-supplied bibliography against Crossref; retain uncertain originals."""
import concurrent.futures, difflib, html, json, pathlib, re, sys, urllib.request, urllib.parse
source=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig')
entries=[]
for line in source.splitlines():
    m=re.match(r'^(\d+)\.\s*(.*?)\s*\((20\d\d)\)\.\s*(.*)$',line.strip())
    if not m: continue
    number,authors,year,rest=m.groups()
    title,venue=rest.split('.\u00a0',1) if '.\u00a0' in rest else rest.split('. ',1)
    entries.append(dict(number=int(number),title=title.strip(),authorsText=authors,year=int(year),citation=line.strip(),venueText=venue))
def key(s): return re.sub(r'[^\w]','',html.unescape(s).lower())
def resolve(e):
    try:
        url='https://api.crossref.org/works?rows=3&query.title='+urllib.parse.quote(e['title'])
        req=urllib.request.Request(url,headers={'User-Agent':'PaperPulse-bibliography-verification/1.0'})
        items=json.load(urllib.request.urlopen(req,timeout=35))['message']['items']
        best=max(items,key=lambda x:difflib.SequenceMatcher(None,key(e['title']),key(x.get('title',[''])[0])).ratio())
        score=difflib.SequenceMatcher(None,key(e['title']),key(best.get('title',[''])[0])).ratio()
        if score>=.90:
            e['crossref']=best;e['verification']='verified';e['matchScore']=round(score,3)
        else: e['verification']='manual_needed';e['matchScore']=round(score,3)
    except Exception as ex:e['verification']='manual_needed';e['error']=str(ex)
    print(e['number'],e['verification'],e.get('crossref',{}).get('DOI',''),flush=True)
    return e
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: entries=list(pool.map(resolve,entries))
pathlib.Path('server/labBibliography.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8')
print('TOTAL',len(entries))
