# coding: utf-8
import difflib,html,json,pathlib,re,time,urllib.request,urllib.parse
p=pathlib.Path('server/labBibliography.json');entries=json.loads(p.read_text(encoding='utf8'))
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'PaperPulse-Bibliography/1.0'})
    return json.load(urllib.request.urlopen(req,timeout=25))
def key(s):return re.sub(r'[^\w]','',html.unescape(s).lower())
for e in entries:
    if e['verification']!='verified' and e['number'] not in [18,19,20,25]:
        for retry in range(3):
            try:
                data=fetch('https://api.crossref.org/works?rows=1&query.bibliographic='+urllib.parse.quote(e['title']))['message']['items'][0]
                score=difflib.SequenceMatcher(None,key(e['title']),key(data.get('title',[''])[0])).ratio()
                if score>.90:e.update(crossref=data,verification='verified',matchScore=round(score,3));e.pop('error',None)
                break
            except Exception as ex:
                if retry==2:print('Crossref',e['number'],str(ex),flush=True)
                time.sleep(3)
    doi=e.get('crossref',{}).get('DOI')
    if doi:
        try:
            w=fetch('https://api.openalex.org/works/https://doi.org/'+urllib.parse.quote(doi,safe=''))
            inv=w.get('abstract_inverted_index') or {}; words={i:word for word,indices in inv.items() for i in indices}
            abstract=' '.join(words[i] for i in sorted(words))
            e['enrichment']={'abstract':abstract,'pdfUrl':(w.get('best_oa_location') or {}).get('pdf_url'),'openAlexId':w['id']}
        except Exception as ex: print('OpenAlex',e['number'],str(ex),flush=True)
    p.write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf8')
    print(e['number'],e['verification'],doi or '',len(e.get('enrichment',{}).get('abstract','')),flush=True)
    time.sleep(1.5)
