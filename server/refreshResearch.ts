import { localizePaper } from './localizePaper.js';
import fs from 'node:fs';
import path from 'node:path';
import { PAPER_ASSETS_DIR } from './paperMediaExtractor.js';
import { fetchOpenConferencePapers, readConferenceCache } from './conferenceFetcher.js';
import { rawToAcademicPaper } from './liveFetcher.js';
import { parsePaperEvidence } from './paperParsing.js';
import { extractOriginalPaperMedia } from './paperMediaExtractor.js';
import { getAutoSyncConfig, getDatabaseStats, initDatabase, isPaperSuppressed, listPapers, paperExistsByTitleOrDoi, recordSyncLog, saveAutoSyncConfig, upsertPaper } from './db.js';

initDatabase();
const year=new Date().getUTCFullYear();
const repairOnly=(process.argv.find(a=>a.startsWith('--repair='))?.slice(9)||'').split(',').filter(Boolean);
const config=getAutoSyncConfig();
saveAutoSyncConfig({...config,targetWindow:'current_year',trackedJournals:[...new Set([...config.trackedJournals,'CVPR','ACL','ICML'])]});
console.log(`Fetching official open proceedings for ${year}…`);
const fetched=repairOnly.length?{papers:[],warnings:[]}:process.argv.includes('--cached')?{papers:readConferenceCache(year),warnings:[]}:await fetchOpenConferencePapers(year,8,['CVPR','ACL','ICML']);
for(const warning of fetched.warnings)console.log('Source warning:',warning);
const added:string[]=[];
for(let i=0;i<fetched.papers.length && added.length<24;i+=3) {
  const batch=await Promise.all(fetched.papers.slice(i,i+3).map(async raw=>{
    if(!raw.pdfUrl || paperExistsByTitleOrDoi(raw.title,raw.doi) || isPaperSuppressed(raw.title,raw.doi))return null;
    if(getDatabaseStats().totalPapers>=(config.maxStoredPapers||1000))return null;
    return rawToAcademicPaper(raw);
  }));
  for(const paper of batch)if(paper && added.length<24 && !paperExistsByTitleOrDoi(paper.title,paper.doi)) {
    if(getDatabaseStats().totalPapers >= (config.maxStoredPapers || 1000))break;
    if(isPaperSuppressed(paper.title,paper.doi))continue;
    upsertPaper(paper);added.push(paper.id); console.log(`Imported ${paper.journalShort} ${paper.publishedDate}: ${paper.title}`);
  }
}
const all=listPapers();
const candidates=repairOnly.length?all.filter(p=>repairOnly.includes(p.id)):[...all.filter(p=>p.id==='oa-W4205161126'),...all.filter(p=>p.publishedDate.startsWith(String(year)) && !added.includes(p.id) && (!p.anatomy.proposedMethod || !p.anatomy.conclusion)).slice(0,5),...all.filter(p=>p.sourceOrigin==='conference_live' && p.publishedDate.startsWith(String(year)) && p.parsing?.status!=='full_text')];
const repairs=[...new Map(candidates.map(p=>[p.id,p])).values()];
let full=0,media=0;
for(let i=0;i<repairs.length;i+=3) {
  await Promise.all(repairs.slice(i,i+3).map(async paper=>{
    try {
      let parsed=await parsePaperEvidence(paper,true);
      const assets=await extractOriginalPaperMedia(parsed);
      if(assets.paperFigures.length)parsed.anatomy.paperFigures=assets.paperFigures;
      if(assets.paperTables.length)parsed.anatomy.paperTables=assets.paperTables;
      if(parsed.parsing?.status!=='full_text' && fs.existsSync(path.join(PAPER_ASSETS_DIR,paper.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),'source.pdf')))parsed=await parsePaperEvidence(parsed,true);
      if(parsed.parsing?.status==='full_text')full++;
      if(assets.paperFigures.length || assets.paperTables.length)media++;
      upsertPaper(await localizePaper(parsed));
      console.log(`Parsed ${paper.journalShort}: ${parsed.parsing?.status}; figures=${assets.paperFigures.length}, tables=${assets.paperTables.length} | ${paper.title}`);
    } catch(e){console.log(`Parse deferred ${paper.id}: ${e instanceof Error?e.message:'unknown error'}`);}
  }));
}
recordSyncLog('official_open_proceedings_upgrade',added.length,`${year}年官方开放论文新增${added.length}篇；本轮PDF正文提取${full}篇，图表补全${media}篇。来源失败和缺失内容保留待重试提示。`);
console.log(JSON.stringify({year,added:added.length,parsedFullText:full,withMedia:media,warnings:fetched.warnings}));
