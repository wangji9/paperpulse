import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let cache:DatabaseSync | undefined;
function database(): DatabaseSync {
  if(!cache) { const dir=path.resolve(process.env.DATA_DIR||'data');fs.mkdirSync(dir,{recursive:true});cache=new DatabaseSync(path.join(dir,'translation-cache.db'));cache.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS translations (hash TEXT PRIMARY KEY, source TEXT NOT NULL, translated TEXT NOT NULL, updated_at TEXT NOT NULL)'); }
  return cache;
}
export function isChineseText(text:string | undefined):boolean {
  if(!text)return false;
  const chinese=(text.match(/[\u3400-\u9fff]/g)||[]).length;
  const english=(text.match(/[A-Za-z]/g)||[]).length;
  return (chinese>=1 && english===0) || (chinese>=2 && (chinese/(chinese+english)>.3 || (chinese>=5 && (text.match(/[A-Za-z]{3,}/g)||[]).length<7) || (text.match(/[A-Za-z]{3,}/g)||[]).length<4));
}
export function technicalName(text:string):boolean { return /^[A-Z0-9_+.-]{2,35}$/.test(text) || (/(?:[A-Z]{2,}[-_]|[-_][A-Z]{2,}|[0-9])/.test(text) && /^[A-Za-z0-9]+[-_][A-Za-z0-9._-]+$/.test(text)) || /^[A-Z][a-z]+[A-Z][A-Za-z0-9]+$/.test(text); }
let active=0;
const waiting:Array<()=>void>=[];
async function limited<T>(task:()=>Promise<T>):Promise<T> {
  if(active>=2)await new Promise<void>(r=>waiting.push(r));active++;
  try{return await task();}finally{active--;waiting.shift()?.();}
}
const inFlight=new Map<string,Promise<string|null>>();
export function normalizeChineseTerms(source:string,value:string):string {
  let result=value.replace(/▁/g,' ').trim();
  if(/\b(?:reinforcement|robot|skill|motion|policy)\b/i.test(source)) {
    result=result.replace(/政策/g,'策略').replace(/图书馆/g,'基元库').replace(/动议/g,'运动');
  }
  if(/\bgripper\b/i.test(source))result=result.replace(/发牢骚者/g,'夹爪');
  if(/\bbootstrap\b/i.test(source))result=result.replace(/靴子陷阱|靴子/g,'自助法');
  if(/\bACT\b/.test(source))result=result.replace(/青蒿素综合疗法/g,'ACT');
  if(/\barchitectures?\b/i.test(source) && /\b(?:model|neural|policy)\b/i.test(source))result=result.replace(/建筑/g,'架构');
  if(/\bgenerative\b/i.test(source))result=result.replace(/基因模型/g,'生成模型');
  if(/\blatent codebook\b/i.test(source))result=result.replace(/潜伏密码本/g,'潜在码本');
  return result;
}
export async function translateChinese(text:string):Promise<string|null> {
  const source=text.replace(/\s+/g,' ').trim();
  if(!source)return '';
  const glossary:Record<string,string>={'graph':'图','fault':'故障','pumps':'泵','inter-shaft':'轴间','temporal-aware chain-of-thought':'时间感知思维链','reinforcement learning':'强化学习','motion primitive':'运动基元','motion primitive quantization':'运动基元量化','latent codebook':'潜在码本'};
  if(glossary[source.toLowerCase()])return glossary[source.toLowerCase()];
  if(isChineseText(source) || technicalName(source) || !/[A-Za-z]{2,}/.test(source))return source;
  const hash=createHash('sha256').update('zh-v1:'+source).digest('hex');
  const hit=database().prepare('SELECT translated FROM translations WHERE hash=?').get(hash) as {translated:string}|undefined;
  if(hit)return normalizeChineseTerms(source,hit.translated);
  const pending=inFlight.get(hash);if(pending)return pending;
  const work=limited(async()=>{
    const endpoint=process.env.LOCAL_TRANSLATION_URL;
    if(!endpoint)return null;
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const response=await fetch(endpoint,{
          method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),
          body:JSON.stringify({q:source,source:'en',target:'zh'}),
        });
        if(!response.ok)continue;
        const result=await response.json() as {translatedText?:string};
        const translated=result.translatedText?normalizeChineseTerms(source,result.translatedText):undefined;
        if(!translated || (!isChineseText(translated) && !technicalName(translated)))return null;
        database().prepare('INSERT OR REPLACE INTO translations VALUES (?,?,?,?)').run(hash,source,translated,new Date().toISOString());
        return translated;
      }catch {if(attempt===0)await new Promise(r=>setTimeout(r,500));}
    }
    return null;
  });
  inFlight.set(hash,work);try{return await work;}finally{inFlight.delete(hash);}
}

export async function translateChineseList(values:string[]):Promise<string[]> {
  const result=[...values];
  const indices=values.map((s,i)=>({s,i})).filter(({s})=>s && !isChineseText(s) && !technicalName(s) && /[A-Za-z]{2,}/.test(s));
  if(!indices.length)return result;
  await Promise.all(indices.map(async({s,i})=>{result[i]=(await translateChinese(s))||s;}));
  return result;
}
