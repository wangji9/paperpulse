import { load } from 'cheerio';
import type { AcademicPaper } from '../src/types/paper.js';
import { getLegacyTranslationSource, isChineseText, technicalName, technicalTableValue, translateChineseBatch } from './translation.js';
import { cleanSourceText, hasDegenerateRepetition, TRANSLATION_VERSION, translationProblems } from './translationQuality.js';

export async function localizePaper(paper:AcademicPaper):Promise<AcademicPaper> {
  const p=structuredClone(paper);
  const old=p.localization?.fields||{};
  const fields:NonNullable<AcademicPaper['localization']>['fields']={};
  const warnings:string[]=[];
  const items:Array<{key:string;source:string;set:(value:string)=>void}>=[];
  const add=(key:string,value:string|undefined,set:(value:string)=>void,original?:string)=>{
    if(!value && !original)return;
    const previous=old[key];
    let source=cleanSourceText(original || (previous && previous.translated===value?previous.source:getLegacyTranslationSource(value||'')||value||''));
    if(!source)return;
    if(key==='anatomy.tableAnalysis'&&/^围绕\s*本文方法\s*的实验设计/.test(source)) {
      source=cleanSourceText(p.anatomy.paperTables?.[0]?.captionOriginal||'');
      if(!source){set('');return;}
    }
    if(/^anatomy\.(?:experimentalValidation|conclusion|tableAnalysis)$/.test(key)&&/^(?:[\w.-]+\/\s*\.?|https?:\/\/\S+)$/.test(source)) {
      set('');fields[key]={source,translated:''};
      if(p.parsing)p.parsing.warnings=[...new Set([...p.parsing.warnings,'已移除旧解析中仅含链接碎片的正文段落，具体内容请核对原文。'])];
      return;
    }
    if(key.startsWith('tables.')&&key.includes('.html.')&&technicalTableValue(source)) {
      set(source);fields[key]={source,translated:source};return;
    }
    items.push({key,source,set});
  };
  const alias=p.title.match(/^([A-Za-z][A-Za-z0-9_.+-]{2,25})\s*:/)?.[1];
  if(alias && !/^(review|survey|towards|evaluation)$/i.test(alias)) {
    const oldName=p.anatomy.modelName;
    p.anatomy.modelName=alias;
    p.tags=(p.tags||[]).map(tag=>tag===oldName?alias:tag);
  }
  add('titleZh',p.titleZh,value=>{p.titleZh=value;},!isChineseText(p.titleZh)||getLegacyTranslationSource(p.titleZh)?p.title:undefined);
  add('digestSummary',p.digestSummary,value=>{p.digestSummary=value;});
  add('abstractZh',p.abstractZh,value=>{p.abstractZh=value;},p.abstractOriginal);
  const anatomyFields=['background','problem','currentStatus','limitationsOfPriorWork','proposedMethod','experimentalValidation','conclusion','figureCaption','tableAnalysis'] as const;
  anatomyFields.forEach(key=>add('anatomy.'+key,p.anatomy[key],value=>{p.anatomy[key]=value;}));
  if(p.anatomy.modelName && !technicalName(p.anatomy.modelName))add('anatomy.modelName',p.anatomy.modelName,value=>{p.anatomy.modelName=value;});
  const previousKeywords=Object.keys(old).filter(k=>/^keywords\.\d+$/.test(k)).sort((a,b)=>Number(a.split('.')[1])-Number(b.split('.')[1])).map(k=>old[k].translated);
  if(p.keywordSource==='manual' && JSON.stringify(p.keywords)!==JSON.stringify(previousKeywords))p.keywordsOriginal=p.keywords;
  p.keywordsOriginal=p.keywordsOriginal||p.keywords;
  const keywordSource=(p.keywordsOriginal||[]).filter(s=>!['does','let'].includes(s.toLowerCase()));
  p.keywords=[...keywordSource];
  keywordSource.forEach((value,i)=>add(`keywords.${i}`,value,result=>{p.keywords![i]=result;},value));
  (p.tags||[]).forEach((value,i)=>add(`tags.${i}`,value,result=>{p.tags[i]=result;}));
  const finishHtml:Array<()=>void>=[];
  for(const figure of p.anatomy.paperFigures||[]) {
    add(`figures.${figure.id}.caption`,figure.captionZh,value=>{figure.captionZh=value;},figure.captionOriginal);
    if(/^(?:Figure|Fig\.?|Table)\s*\w*\s*原文图注/.test(figure.analysisZh||''))figure.analysisZh='';
    else add(`figures.${figure.id}.analysis`,figure.analysisZh,value=>{figure.analysisZh=value;});
  }
  for(const table of p.anatomy.paperTables||[]) {
    add(`tables.${table.id}.caption`,table.captionZh,value=>{table.captionZh=value;},table.captionOriginal);
    if(/^(?:Figure|Fig\.?|Table)\s*\w*\s*原文图注/.test(table.analysisZh||''))table.analysisZh='';
    else add(`tables.${table.id}.analysis`,table.analysisZh,value=>{table.analysisZh=value;});
    if(table.html) {
      const $=load(table.html,{},false);
      $('td,th,caption').contents().toArray().forEach((node,i)=>{
        if(node.type==='text' && /[A-Za-z\u3400-\u9fff]/.test(node.data))add(`tables.${table.id}.html.${i}`,node.data,value=>{node.data=value;});
      });
      finishHtml.push(()=>{table.html=$.html();});
    }
  }
  const ds=p.anatomy.dataset;
  if(ds) {
    add('dataset.summary',ds.summary,value=>{ds.summary=value;});
    add('dataset.scale',ds.scale,value=>{ds.scale=value;});
    (ds.names||[]).forEach((value,i)=>add(`dataset.names.${i}`,value,result=>{ds.names[i]=result;}));
    (ds.modalities||[]).forEach((m,i)=>add(`dataset.modalities.${i}`,m.label,value=>{m.label=value;}));
    (ds.constructionSteps||[]).forEach((step,i)=>{
      add(`dataset.steps.${i}.title`,step.title,value=>{step.title=value;});
      add(`dataset.steps.${i}.description`,step.description,value=>{step.description=value;});
    });
  }
  (p.anatomy.architectureModules||[]).forEach((m,i)=>{
    for(const key of ['title','subtitle','detail'] as const)add(`modules.${i}.${key}`,m[key],value=>{m[key]=value;});
  });
  const future=p.anatomy.futureAndLimitations;
  if(future)for(const key of ['paperLimitations','futureDirections'] as const)(future[key]||[]).forEach((value,i)=>add(`future.${key}.${i}`,value,result=>{future[key][i]=result;}));
  const comparison=p.anatomy.comparisonMetrics;
  if(comparison) {
    add('comparison.note',comparison.note,value=>{comparison.note=value;});
    add('comparison.primaryMetric',comparison.primaryMetric,value=>{comparison.primaryMetric=value;});
    (comparison.metricNames||[]).forEach((value,i)=>add(`comparison.metrics.${i}`,value,result=>{comparison.metricNames[i]=result;}));
  }
  const ablation=p.anatomy.ablationStudy;
  if(ablation) {
    add('ablation.summary',ablation.summary,value=>{ablation.summary=value;});
    add('ablation.metricName',ablation.metricName,value=>{ablation.metricName=value;});
    (ablation.items||[]).forEach((m,i)=>{for(const key of ['variant','removedModule','impactNote'] as const)add(`ablation.${i}.${key}`,m[key],value=>{m[key]=value;});});
  }
  const translated=await translateChineseBatch(items.map(item=>item.source));
  items.forEach((item,i)=>{
    const value=translated[i];
    const bad=!value || translationProblems(item.source,value).length>0;
    const failed=bad || (/[A-Za-z]{2,}/.test(item.source) && !technicalName(item.source) && !isChineseText(value));
    const display=item.key==='abstractZh'&&failed?'':bad?hasDegenerateRepetition(item.source)?'':item.source:value;
    item.set(display||'');fields[item.key]={source:item.source,translated:display||''};
    if(failed)warnings.push(`${item.key}：译文未完成或未通过质量检查，已保留可用原文。`);
  });
  finishHtml.forEach(f=>f());
  p.localization={version:TRANSLATION_VERSION,status:warnings.length?'partial':'complete',updatedAt:new Date().toISOString(),fields,warnings};
  return p;
}
