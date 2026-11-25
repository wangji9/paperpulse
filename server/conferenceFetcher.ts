import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import type { RawExternalPaper } from './liveFetcher.js';

export async function fetchScholarlyHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent':'PaperPulse-AcademicLibrary/6.0', Accept:'text/html' }, signal:AbortSignal.timeout(25000) });
  if(!res.ok)throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  const reader=res.body?.getReader(); if(!reader)throw new Error('Empty response');
  const chunks:Uint8Array[]=[]; let length=0;
  try { while(length<2_500_000) { const part=await reader.read(); if(part.done)break; chunks.push(part.value);length+=part.value.length; } }
  catch(e) { if(length<10000)throw e; }
  finally { await reader.cancel().catch(()=>{}); }
  const text=Buffer.concat(chunks).toString('utf8');
  if(text.length>25_000_000 || !/<html|<meta|<article/i.test(text))throw new Error('论文页面内容无效或过大');
  return text;
}
export function parseConferencePage(html: string, url: string, venue: string, year: number): RawExternalPaper | null {
  const $=load(html); const meta=(name:string)=>$(`meta[name="${name}"],meta[property="${name}"]`).first().attr('content')?.trim() || '';
  const title=meta('citation_title') || $('#papertitle').text().trim() || $('h2').first().text().trim();
  const abstract=($('#abstract').text() || $('div.abstract').first().text() || $('div.abstract-content').text() || $('.acl-abstract').text() || meta('description')).replace(/^\s*Abstract\s*[:.]?/i,'').replace(/\s+/g,' ').trim();
  const sourceYear=meta('citation_publication_date') || meta('citation_date') || meta('citation_year');
  if(!title || !/^\d{4}/.test(sourceYear) || (year && !sourceYear.startsWith(String(year))))return null;
  const pdf=meta('citation_pdf_url') || $('a[href$=".pdf"]').first().attr('href');
  const authors=$('meta[name="citation_author"]').map((_,el)=>$(el).attr('content')||'').get();
  const code=$('a[href*="github.com"]').filter((_,el)=>/software|code|github/i.test($(el).text()) && !/mlresearch\/|acl-org\/acl-anthology|cvfadmin\/openaccess/.test($(el).attr('href')||'')).first().attr('href');
  const supplied=meta('citation_keywords') || meta('keywords');
  return { title, abstract, authors, affiliations:[], journal:meta('citation_conference_title') || venue, journalShort:venue,
    publishedDate:sourceYear.replace(/\//g,'-').match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?/)?.[0] || String(year),
    doi:meta('citation_doi'), url, htmlUrl:url, codeUrl:code && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(code)?code:undefined, pdfUrl:pdf?new URL(pdf,url).href:undefined, citedByCount:0, citations:[], sourceOrigin:'conference_live', keywords:supplied?supplied.split(/[,;]/).map(k=>k.trim()).filter(Boolean):undefined };
}
export function conferencePaperId(raw: RawExternalPaper): string { return 'conf-'+createHash('sha256').update(raw.url).digest('hex').slice(0,20); }

function cacheFile(year: number): string { return path.resolve(process.env.DATA_DIR || 'data','source-cache',`conferences-${year}.json`); }
export function readConferenceCache(year: number): RawExternalPaper[] {
  try { const rows=JSON.parse(fs.readFileSync(cacheFile(year),'utf8')) as RawExternalPaper[];return rows.filter(p=>p.sourceOrigin==='conference_live' && p.publishedDate.startsWith(String(year)) && /^https:\/\/(openaccess\.thecvf\.com|aclanthology\.org|proceedings\.mlr\.press)\//.test(p.url)); } catch{return [];}
}
export async function fetchOpenConferencePapers(year=new Date().getUTCFullYear(), perVenue=8, selected?: string[]): Promise<{ papers:RawExternalPaper[]; warnings:string[] }> {
  const warnings:string[]=[];
  const sources:Array<{venue:string;url:string;selector:string}>=[];
  if(!selected || selected.includes('CVPR'))sources.push({venue:'CVPR',url:`https://openaccess.thecvf.com/CVPR${year}`,selector:'dt.ptitle a'});
  if(!selected || selected.includes('ACL'))sources.push({venue:'ACL',url:`https://aclanthology.org/volumes/${year}.acl-long/`,selector:`a.align-middle[href^="/${year}.acl-long."]`});
  if(!selected || selected.includes('ICML')) {
    try {
      const $=load(await fetchScholarlyHtml('https://proceedings.mlr.press/'));
      const link=$('li').filter((_,el)=>new RegExp(`ICML ${year}|International Conference on Machine Learning.*${year}`).test($(el).text())).find('a').first().attr('href');
      if(link)sources.push({venue:'ICML',url:new URL(link,'https://proceedings.mlr.press/').href,selector:'.paper .links a[href$=".html"]'});
      else warnings.push(`PMLR尚未发现${year}年ICML正式论文集`);
    } catch(e){warnings.push(e instanceof Error?e.message:'PMLR目录读取失败');}
  }
  const groups=await Promise.all(sources.map(async source=>{
    try {
      let indexHtml=await fetchScholarlyHtml(source.url);
      let $=load(indexHtml);
      if(source.venue==='CVPR' && !$(source.selector).length) { const day=$('a[href*="?day="]').filter((_,e)=>!($(e).attr('href')||'').includes('all')).first().attr('href'); if(day) { source.url=new URL(day,source.url).href; indexHtml=await fetchScholarlyHtml(source.url); $=load(indexHtml); } }
      const seen=new Set<string>();
      const links=$(source.selector).map((_,el)=>({url:new URL($(el).attr('href')||'',source.url).href,title:$(el).closest('.paper').find('.title').text().trim() || $(el).text().trim()})).get().filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true;});
      const relevance=(s:string)=>(s.match(/agent|language|reason|vision|multimodal|robot|knowledge|design|collaborat|retrieval|foundation/gi)||[]).length;
      links.sort((a,b)=>relevance(b.title)-relevance(a.title));
      const out:RawExternalPaper[]=[];
      // Bounded concurrency and a larger candidate set let later runs skip already imported papers.
      for(let i=0;i<Math.min(links.length,perVenue*2);i+=3) {
        const batch=await Promise.all(links.slice(i,Math.min(i+3,perVenue*2)).map(async link=>{for(let attempt=0;attempt<2;attempt++){try {const parsed=parseConferencePage(await fetchScholarlyHtml(link.url),link.url,source.venue,year);if(parsed)return parsed;}catch{} if(attempt===0)await new Promise(r=>setTimeout(r,600));}return null;}));
        out.push(...batch.filter((p):p is RawExternalPaper=>Boolean(p)));
      }
      if(!out.length)warnings.push(`${source.venue} ${year}：未发现可验证元数据，保留待重试`);
      return out;
    } catch(e){warnings.push(e instanceof Error?e.message:`${source.venue}获取失败`);return [];}
  }));
  const merged=new Map<string,RawExternalPaper>();
  const fresh=Array.from({length:Math.max(0,...groups.map(g=>g.length))},(_,i)=>groups.flatMap(g=>g[i]?[g[i]]:[])).flat();
  for(const paper of [...readConferenceCache(year),...fresh])merged.set(paper.url,paper);
  const rows=[...merged.values()]; const file=cacheFile(year);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(rows));
  return {papers:rows.filter(p=>!selected||selected.includes(p.journalShort)),warnings};
}
