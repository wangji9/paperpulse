import { commitPaperTranslation, listPapers } from './db.js';
import { localizePaper } from './localizePaper.js';
import { isChineseText, technicalName } from './translation.js';
import type { AcademicPaper } from '../src/types/paper.js';
import { hasDegenerateRepetition, TRANSLATION_VERSION } from './translationQuality.js';

export function needsChinese(p:AcademicPaper):boolean {
  if(p.abstractOriginal?.trim() && !p.abstractZh?.trim())return true;
  const a=p.anatomy;
  const values=[p.titleZh||p.title,p.abstractZh,p.digestSummary,a.background,a.problem,a.currentStatus,a.limitationsOfPriorWork,a.proposedMethod,a.experimentalValidation,a.conclusion,...(p.keywords||[]),...(a.paperFigures||[]).map(f=>f.captionZh||f.captionOriginal),...(a.paperTables||[]).map(t=>t.captionZh||t.captionOriginal)];
  return p.localization?.version!==TRANSLATION_VERSION || p.localization.status==='partial' || values.some(s=>s && (hasDegenerateRepetition(s) || (/[A-Za-z]{3,}/.test(s) && !isChineseText(s) && !technicalName(s))));
}

export async function localizeStoredPaper(p:AcademicPaper):Promise<void> {
  const localized=await localizePaper(p);
  commitPaperTranslation(p,localized);
}

export function startLocalizationQueue():void {
  if(!process.env.LOCAL_TRANSLATION_URL || process.env.DISABLE_AUTO_LOCALIZATION==='1')return;
  let busy=false;
  const tick=async()=>{
    if(busy)return;busy=true;
    try {
      for(const p of listPapers().filter(needsChinese).slice(0,2)) {
        try {await localizeStoredPaper(p);}catch(error) {console.error('[中文补译]',p.id,error);}
      }
    }finally {busy=false;}
  };
  setTimeout(()=>{void tick();},10000).unref();
  setInterval(()=>{void tick();},60000).unref();
}
