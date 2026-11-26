import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { initDatabase, listAllUsers, listPapers, upsertPaper, isPaperSuppressed } from './db.js';
import { addLabPaper, listLabEntries } from './labLibrary.js';
import { buildStructuredAnatomy, detectTopics, detectDomain, resolveJournalShort, type RawExternalPaper } from './liveFetcher.js';
import { applySourceText } from './sourceText.js';
import { extractKeywords } from './keywords.js';
import { localizePaper } from './localizePaper.js';
import type { AcademicPaper } from '../src/types/paper.js';

initDatabase();
const user=listAllUsers().find(u=>u.role==='admin');if(!user)throw new Error('请先创建管理员');
const entries=JSON.parse(fs.readFileSync('server/labBibliography.json','utf8')) as Array<Record<string,any>>;
const sources=JSON.parse(fs.readFileSync('server/labPublisherEvidence.json','utf8')) as Array<{title:string;doi?:string;abstract:string;url:string;keywords?:string[];pdfUrl?:string;authors?:string[]}>;
const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const report=[];
for(const e of entries){
  const m=e.crossref||{},extra=e.enrichment||{};
  const evidence=sources.find(s=>key(s.title)===key(e.title));
  const doi=m.DOI||evidence?.doi||'';
  const existing=listPapers().find(p=>(doi&&key(p.doi)===key(doi))||key(p.title)===key(e.title));
  if(isPaperSuppressed(e.title,doi)){report.push({number:e.number,status:'管理员此前已移除，未自动恢复'});continue;}
  let paper=existing;
  if(!paper){
    const title=m.title?.[0]||e.title;
    const abstract=evidence?.abstract||extra.abstract||load(m.abstract||'').text();
    const authors=evidence?.authors||m.author?.map((a:any)=>[a.given,a.family].filter(Boolean).join(' '))||e.authorsText.replace(/\*/g,'').split(/[\u3400-\u9fff]/.test(e.authorsText)?/[,，、]/:/,\s*&?\s*(?=[A-Z][a-z]+,)/).map((s:string)=>s.replace(/^&\s*/,'').replace(/\.$/,'').trim()).filter(Boolean);
    const journal=m['container-title']?.[0]||e.venueText.split(/,|，|\. /)[0].trim();
    const date=(m['published-online']||m['published-print']||m.published)?.['date-parts']?.[0];
    const publishedDate=date?date.map((n:number,i:number)=>i?String(n).padStart(2,'0'):String(n)).join('-'):String(e.year);
    const raw:RawExternalPaper={title,abstract,authors,affiliations:[...new Set<string>((m.author||[]).flatMap((a:any)=>(a.affiliation||[]).map((x:any)=>String(x.name))))],journal,journalShort:resolveJournalShort(journal).short,publishedDate,doi,url:doi?'https://doi.org/'+doi:evidence?.url||'https://meccol.dhu.edu.cn/tpyjy/list.htm',citedByCount:m['is-referenced-by-count']||0,citations:[],sourceOrigin:'user_created',pdfUrl:evidence?.pdfUrl||extra.pdfUrl};
    const structure=buildStructuredAnatomy(raw,null);
    paper={id:'lab-'+createHash('sha256').update(key(doi||title)).digest('hex').slice(0,24),...raw,titleZh:title,syncedAt:new Date().toISOString(),topics:detectTopics(title+' '+abstract,false),domain:detectDomain(title+' '+abstract,journal),journalRank:'',abstractOriginal:abstract,digestSummary:structure.digestSummary,tags:structure.tags,keywords:extractKeywords(title,abstract,evidence?.keywords),keywordSource:evidence?.keywords?.length?'author':'extracted',anatomy:structure.anatomy,readingStatus:'unread',isBookmarked:false,comments:[],parsing:{status:abstract?'abstract':'metadata',sourceUrl:evidence?.url||raw.url,updatedAt:new Date().toISOString(),sections:abstract?['abstract']:[],warnings:abstract?[]:['来源未提供可获取的摘要；可上传原文PDF补充。']}};
    paper=await localizePaper(applySourceText(paper,abstract));upsertPaper(paper);
  }else if(!paper.abstractOriginal && evidence?.abstract){
    paper=await localizePaper({...paper,abstractOriginal:evidence.abstract});upsertPaper(paper);
  }
  addLabPaper(paper.id,user,{source:'用户确认成果清单；东华大学李心雨课题组公开成果页 https://meccol.dhu.edu.cn/tpyjy/list.htm；'+(evidence?.url||'Crossref DOI 元数据'),citation:e.citation,publicationYear:e.year});
  report.push({number:e.number,paperId:paper.id,doi:paper.doi,status:existing?'已关联已有文献':'已新增',abstract:!!paper.abstractOriginal,abstractZh:!!paper.abstractZh});
  console.log(JSON.stringify(report.at(-1)));
}
fs.writeFileSync(path.resolve(process.env.DATA_DIR||'data','lab-import-report.json'),JSON.stringify({importedAt:new Date().toISOString(),entries:report},null,2));
console.log('课题组成果总数',listLabEntries(user).length);
