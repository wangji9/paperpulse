import fs from 'node:fs';
import { initDatabase, listPapers, commitPaperTranslation } from './db.js';
import { localizePaper } from './localizePaper.js';
import { extractUploadedPdf } from './uploadedPdf.js';
import { PAPER_ASSETS_DIR } from './paperMediaExtractor.js';
import { cleanSourceText } from './translationQuality.js';
import path from 'node:path';
initDatabase();
const evidence=JSON.parse(fs.readFileSync('server/abstractEvidence.json','utf8')) as Array<{title:string;doi?:string;abstract:string;url:string}>;
const key=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
for(const paper of listPapers().filter(p=>!p.abstractOriginal.trim())){
  let source=evidence.find(e=>key(e.title)===key(paper.title)&&(!e.doi||key(e.doi)===key(paper.doi)));
  const cached=path.join(PAPER_ASSETS_DIR,paper.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),'source.pdf');
  if(!source&&fs.existsSync(cached)){
    try{const parsed=await extractUploadedPdf(cached);if(parsed.sections.abstract)source={title:paper.title,abstract:parsed.sections.abstract,url:paper.localPdfUrl||paper.url};}catch{}
  }
  if(!source){console.log(JSON.stringify({id:paper.id,status:'来源尚未提供摘要，保留题录'}));continue;}
  const localized=await localizePaper({...paper,abstractOriginal:cleanSourceText(source.abstract),abstractZh:undefined,parsing:{...paper.parsing,status:paper.parsing?.status==='full_text'?'full_text':'abstract',sourceUrl:source.url,updatedAt:new Date().toISOString(),sections:[...new Set([...(paper.parsing?.sections||[]),'abstract'])],warnings:(paper.parsing?.warnings||[]).filter(s=>!s.includes('来源未提供摘要'))}});
  commitPaperTranslation(paper,localized);console.log(JSON.stringify({id:paper.id,status:'已恢复摘要',chinese:!!localized.abstractZh}));
}
