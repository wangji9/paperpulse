import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { applySourceText } from './sourceText.js';
import { extractKeywords } from './keywords.js';
import { ALL_JOURNAL_SOURCES, buildStructuredAnatomy, detectDataset, detectDomain, detectTopics, resolveJournalShort } from './liveFetcher.js';
import type { RawExternalPaper } from './liveFetcher.js';
import type { AcademicPaper } from '../src/types/paper.js';

const run=promisify(execFile);
interface PdfEvidence {
  text:string; sections:Record<string,string>; pages:number; keywords?:string[]; warnings?:string[]; error?:string;
  metadata:{title:string;authors:string[];doi:string;arxivId:string;publishedDate:string};
}
function sameTitle(a:string,b:string):boolean {
  const key=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  if(key(a)===key(b))return true;
  const words=(s:string)=>new Set(s.toLowerCase().match(/[a-z]{3,}/g)||[]);
  const x=words(a),y=words(b);
  return x.size>=4 && [...x].filter(w=>y.has(w)).length/Math.max(x.size,y.size)>=.85;
}
export async function extractUploadedPdf(file:string):Promise<PdfEvidence> {
  try {
    const {stdout}=await run('python',[path.resolve('server/extract_paper_text.py'),file],{timeout:150000,maxBuffer:3*1024*1024});
    const parsed=JSON.parse(stdout) as PdfEvidence;
    if(parsed.error)throw new Error(/PDF已加密/.test(parsed.error)?'PDF已加密，请先解密后上传':'PDF结构损坏或无法读取，请重新导出后上传');
    return parsed;
  }catch(error) {
    if(error instanceof Error && /^PDF/.test(error.message))throw error;
    console.error('[PDF正文读取]',error);
    throw new Error('PDF读取失败或处理超时，请检查文件后重新上传');
  }
}

export async function buildUploadedPaper(e:PdfEvidence,id:string,upload:NonNullable<AcademicPaper['upload']>):Promise<AcademicPaper> {
  const m=e.metadata;
  const warnings=[...(e.warnings||[])];
  let title=m.title || upload.fileName.replace(/\.pdf$/i,'');
  if(!m.title){upload={...upload,titleFromFileName:true};warnings.push('未能识别论文标题，暂用文件名展示，管理员可核对补充。');}
  let authors=m.authors;
  let journal=ALL_JOURNAL_SOURCES.find(j=>e.text.slice(0,6000).toLowerCase().includes(j.full.toLowerCase()))?.full||'';
  let date=m.publishedDate,doi=m.doi;
  let affiliations:string[]=[];
  if(process.env.DISABLE_UPLOAD_METADATA_LOOKUP!=='1') {
    try {
      const url=doi?`https://api.crossref.org/works/${encodeURIComponent(doi)}`:`https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`;
      const response=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{'User-Agent':'PaperPulse-PDF/1.0'}});
      if(response.ok) {
        const data=await response.json();const item=doi?data.message:data.message?.items?.[0];
        if(item?.title?.[0] && sameTitle(title,item.title[0])) {
          title=item.title[0];doi=item.DOI||doi;journal=item['container-title']?.[0]||journal;
          const registeredAuthors=(item.author||[]).map((a:{given?:string;family?:string;name?:string})=>a.name||[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean);
          if(registeredAuthors.length)authors=registeredAuthors;
          affiliations=[...new Set<string>((item.author||[]).flatMap((a:{affiliation?:Array<{name:string}>})=>(a.affiliation||[]).map(x=>x.name)))];
          const parts=item.published?.['date-parts']?.[0];
          if(parts?.length)date=parts.map((v:number,i:number)=>i?String(v).padStart(2,'0'):String(v)).join('-');
        }else if(item)warnings.push('在线元数据标题与PDF不一致，未采用该检索结果。');
      }else warnings.push('在线元数据源暂不可用，保留PDF中提取的信息。');
    }catch {warnings.push('期刊元数据查询超时，保留PDF中提取的信息。');}
  }
  if(!journal && m.arxivId)journal='arXiv';
  if(!journal)warnings.push('未能可靠确认发表期刊，管理员可在文献编辑中补充。');
  if(!date)warnings.push('未能确认发表日期，时间线可按入库时间查看。');
  if(!authors.length)warnings.push('PDF元数据未提供可确认的作者信息。');
  const originalAbstract=(e.sections.abstract||'').replace(/-\n(?=[a-z])/g,'').replace(/\s+/g,' ').trim().slice(0,7000);
  const bodySections=Object.entries(e.sections).filter(([k])=>!/reference|acknowledg|appendix/.test(k)).map(([,v])=>v);
  const context=[title,originalAbstract,...(bodySections.length?bodySections:[e.text.slice(0,20000)])].join(' ').slice(0,35000);
  const raw:RawExternalPaper={title,abstract:originalAbstract,authors,affiliations,journal:journal||'期刊待核实',journalShort:journal?resolveJournalShort(journal).short:'待核实',publishedDate:date,doi:doi||(m.arxivId?`10.48550/arXiv.${m.arxivId}`:''),url:doi?`https://doi.org/${doi}`:m.arxivId?`https://arxiv.org/abs/${m.arxivId}`:'#',citedByCount:0,citations:[],sourceOrigin:'user_created'};
  const structured=buildStructuredAnatomy(raw);
  const dataset=detectDataset(context);
  dataset.names=dataset.names.filter(n=>!/(研究团队构建|真实工业\/实验|领域公开评测)/.test(n));
  // A mention of an experiment or a benchmark alone does not prove data provenance.
  const publicEvidence=dataset.names.length>0 || /public(?:ly)? (?:available|dataset)|open[- ]source dataset|公开数据集|公开基准/.test(context.toLowerCase());
  const selfEvidence=/we (?:collect(?:ed)?|construct(?:ed)?)[^.!?]{0,100}\b(?:data|dataset|corpus|samples|images|videos)\b|self[- ]built dataset|自行采集|自建数据|我们(?:采集|构建)[^。！？]{0,30}(?:数据|语料|样本)/i.test(context);
  dataset.type=publicEvidence?(selfEvidence?'hybrid':'public'):selfEvidence?'self_built':'unspecified';
  dataset.summary=dataset.type==='unspecified'?'原文未提供足够信息确认数据集来源。':dataset.type==='hybrid'?'原文同时提及公开数据集与作者采集或构建的数据。':dataset.type==='self_built'?'原文描述了作者自行采集或构建数据。':'原文提及可识别的公开数据集或明确说明数据公开可用。';
  const paper:AcademicPaper={id,title,titleZh:title,authors:authors.length?authors:['未知作者'],affiliations,journal:raw.journal,journalShort:raw.journalShort,journalRank:'',domain:detectDomain(context,raw.journal),topics:detectTopics(context,false),publishedDate:date,syncedAt:upload.uploadedAt,doi:raw.doi,url:raw.url,localPdfUrl:`/paper-assets/${id}/source.pdf`,sourceOrigin:'user_created',upload,abstractOriginal:originalAbstract,digestSummary:originalAbstract.slice(0,1200),tags:structured.tags,keywords:extractKeywords(title,originalAbstract||context,e.keywords),keywordSource:e.keywords?.length?'author':'extracted',citedByCount:0,citations:[],readingStatus:'unread',isBookmarked:false,anatomy:structured.anatomy,comments:[]};
  const result=applySourceText(paper,e.text,e.sections);
  result.anatomy.dataset={sourceType:dataset.type,names:dataset.names,summary:dataset.summary,scale:'',modalities:[],constructionSteps:[]};
  result.anatomy.limitationsOfPriorWork='';result.anatomy.futureAndLimitations={paperLimitations:[],futureDirections:[]};
  result.tags=result.topics.length?(result.keywords||[]).slice(0,4):[];
  if(!result.digestSummary)result.digestSummary=result.anatomy.background.slice(0,1000);
  const readable=e.text.trim().length>=100;
  if(!readable)warnings.push('PDF文字不足，可能是扫描件或不支持的文字编码；已保留PDF，当前未生成正文解读。');
  if(!result.anatomy.proposedMethod)warnings.push('未可靠定位方法段落，可结合站内PDF核对。');
  result.parsing={status:readable?'full_text':'metadata',updatedAt:new Date().toISOString(),sourceUrl:result.localPdfUrl,pages:e.pages,sections:Object.keys(e.sections),warnings};
  return result;
}
