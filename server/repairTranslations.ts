import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, listPapers, getPaperById, commitPaperTranslation } from './db.js';
import { localizePaper } from './localizePaper.js';
import { needsChinese } from './localizationQueue.js';
import { getLegacyTranslationSource, isChineseText } from './translation.js';
import { cleanSourceText, hasDegenerateRepetition, sourceExcerpt } from './translationQuality.js';
import { extractUploadedPdf } from './uploadedPdf.js';
import { applySourceText } from './sourceText.js';
import { PAPER_ASSETS_DIR } from './paperMediaExtractor.js';

initDatabase();
const wanted=process.argv.find(s=>s.startsWith('--paper='))?.slice(8);
const all=listPapers();
const broken=(p:typeof all[number])=>hasDegenerateRepetition([p.titleZh,p.digestSummary,...Object.values(p.anatomy).filter(v=>typeof v==='string')].join(' '));
const papers=all.filter(p=>!wanted||p.id===wanted).sort((a,b)=>Number(broken(b))-Number(broken(a)) || Number(Boolean(b.upload))-Number(Boolean(a.upload)));
const dirtySource=(p:typeof all[number])=>Object.entries(p.localization?.fields||{}).some(([key,entry])=>(key.startsWith('anatomy.')||key==='digestSummary') && /Correspondence to|Copyright\s+20\d{2}|PMLR\s+\d+|E-mail address|(?:Advanced Engineering Informatics|Robotics and Computer.{0,4}Integrated Manufacturing)\s+\d+\s*\(20\d{2}\)|\b(?:Fig\.?|Figure|Table)\s+(?:\d+|[IVX]+)[.:]/i.test(entry.source));
let completed=0,partial=0,failed=0;
for(let i=0;i<papers.length;i+=2) {
  await Promise.all(papers.slice(i,i+2).map(async original=>{
    if(!needsChinese(original) && !process.argv.includes('--force') && !(process.argv.includes('--clean-sources')&&dirtySource(original))){completed++;return;}
    try {
      const p=structuredClone(original);
      const file=path.join(PAPER_ASSETS_DIR,p.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),'source.pdf');
      if(fs.existsSync(file) && p.sourceOrigin!=='curated_real') {
        const evidence=await extractUploadedPdf(file);
        const fresh=applySourceText(p,evidence.text,evidence.sections);
        for(const key of ['background','problem','currentStatus','proposedMethod','experimentalValidation','conclusion'] as const) {
          const previous=p.anatomy[key];
          if(fresh.anatomy[key] && (!previous || getLegacyTranslationSource(previous) || hasDegenerateRepetition(previous) || !isChineseText(previous)))p.anatomy[key]=fresh.anatomy[key];
        }
        if(!p.abstractOriginal && evidence.sections.abstract)p.abstractOriginal=cleanSourceText(evidence.sections.abstract);
        if(p.abstractOriginal && (!p.digestSummary || getLegacyTranslationSource(p.digestSummary) || hasDegenerateRepetition(p.digestSummary)))p.digestSummary=sourceExcerpt(p.abstractOriginal,1100);
        if(p.parsing)p.parsing={...p.parsing,sections:Object.keys(evidence.sections),updatedAt:new Date().toISOString()};
      }
      const localized=await localizePaper(p);
      commitPaperTranslation(original,localized);
      const saved=getPaperById(original.id)!;
      if(needsChinese(saved))partial++;else completed++;
      console.log(JSON.stringify({id:original.id,status:needsChinese(saved)?'partial':'complete',progress:completed+partial+failed,total:papers.length,warnings:saved.localization?.warnings}));
    }catch(error){failed++;console.error('译文修复失败',original.id,error);}
  }));
}
const pending=listPapers().filter(p=>(!wanted||p.id===wanted)&&needsChinese(p)).map(p=>p.id);
console.log(JSON.stringify({completed,partial,failed,pending}));
if(pending.length||failed)process.exitCode=1;
