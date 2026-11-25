import { load } from 'cheerio';
import type { AcademicPaper } from '../src/types/paper.js';
import { isChineseText, technicalName, translateChinese, translateChineseList, normalizeChineseTerms } from './translation.js';

// Source fields remain available for audit; displayed explanations are Chinese.
export async function localizePaper(paper:AcademicPaper):Promise<AcademicPaper> {
  const p=structuredClone(paper);
  const translate=async(s:string)=>!s || isChineseText(s) || technicalName(s)?s:(await translateChinese(s.replace(/arXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?(?:\s*\[[^\]]+\])?/gi,'').replace(/\b\d+\s+Preprint\.?/gi,''))) || s;
  const fields=['background','problem','currentStatus','limitationsOfPriorWork','proposedMethod','experimentalValidation','conclusion','figureCaption','tableAnalysis','modelName'] as const;
  await Promise.all([
    translate(p.titleZh&&isChineseText(p.titleZh)?p.titleZh:p.title).then(v=>{p.titleZh=v;}),
    translate(p.digestSummary).then(v=>{p.digestSummary=v;}),
    ...fields.map(async k=>{if(p.anatomy[k])p.anatomy[k]=await translate(p.anatomy[k]!);}),
  ]);
  p.keywordsOriginal=p.keywordsOriginal || p.keywords;
  p.keywords=await translateChineseList((p.keywords||[]).filter(k=>!['does','let'].includes(k.toLowerCase())));
  p.tags=await translateChineseList(p.tags||[]);
  await Promise.all((p.anatomy.paperFigures||[]).map(async f=>{
    f.captionZh=await translate(f.captionOriginal);
    f.analysisZh=await translate(f.analysisZh);
  }));
  await Promise.all((p.anatomy.paperTables||[]).map(async t=>{
    t.captionZh=await translate(t.captionOriginal);
    t.analysisZh=await translate(t.analysisZh);
    if(t.html) {
      const $=load(t.html,{},false);
      const textNodes=$('td,th,caption').contents().filter((_,n)=>n.type==='text').toArray();
      const nodes=textNodes.filter(n=>n.type==='text' && /[A-Za-z]{3,}/.test(n.data));
      const translated=await translateChineseList(nodes.map(n=>n.type==='text'?n.data:''));
      nodes.forEach((node,i)=>{if(node.type==='text')node.data=translated[i];});
      t.html=$.html();
    }
  }));
  const ds=p.anatomy.dataset;
  if(ds) {
    ds.summary=await translate(ds.summary); ds.names=await Promise.all((ds.names||[]).map(translate));
    ds.constructionSteps=await Promise.all((ds.constructionSteps||[]).map(async step=>({...step,title:await translate(step.title),description:await translate(step.description)})));
  }
  if(p.anatomy.futureAndLimitations) {
    p.anatomy.futureAndLimitations.paperLimitations=await Promise.all(p.anatomy.futureAndLimitations.paperLimitations?.map(translate)||[]);
    p.anatomy.futureAndLimitations.futureDirections=await Promise.all(p.anatomy.futureAndLimitations.futureDirections?.map(translate)||[]);
  }
  await Promise.all((p.anatomy.architectureModules||[]).map(async m=>{
    m.title=await translate(m.title);m.subtitle=await translate(m.subtitle);m.detail=await translate(m.detail);
  }));
  if(ds) {ds.scale=await translate(ds.scale);await Promise.all((ds.modalities||[]).map(async m=>{m.label=await translate(m.label);}));}
  const comparison=p.anatomy.comparisonMetrics;
  if(comparison) {comparison.note=await translate(comparison.note||'');comparison.metricNames=await translateChineseList(comparison.metricNames||[]);comparison.primaryMetric=await translate(comparison.primaryMetric);}
  const ablation=p.anatomy.ablationStudy;
  if(ablation) {ablation.summary=await translate(ablation.summary);ablation.metricName=await translate(ablation.metricName);await Promise.all((ablation.items||[]).map(async m=>{m.variant=await translate(m.variant);m.removedModule=await translate(m.removedModule);m.impactNote=await translate(m.impactNote);}));}
  const sourceContext=p.title+' '+p.abstractOriginal;
  const clean=(value:unknown):unknown=>typeof value==='string'?normalizeChineseTerms(sourceContext,value):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])):value;
  p.anatomy=clean(p.anatomy) as typeof p.anatomy;
  p.titleZh=clean(p.titleZh) as string;p.digestSummary=clean(p.digestSummary) as string;
  p.keywords=clean(p.keywords) as string[];p.tags=clean(p.tags) as string[];
  return p;
}
