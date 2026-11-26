import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cleanSourceText, hasDegenerateRepetition, TRANSLATION_VERSION, translationProblems } from './translationQuality.js';

let cache:DatabaseSync|undefined;
function database():DatabaseSync {
  if(!cache) {
    const dir=path.resolve(process.env.DATA_DIR||'data');fs.mkdirSync(dir,{recursive:true});
    cache=new DatabaseSync(path.join(dir,'translation-cache.db'));
    cache.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS translations (hash TEXT PRIMARY KEY, source TEXT NOT NULL, translated TEXT NOT NULL, updated_at TEXT NOT NULL)');
  }
  return cache;
}
export function isChineseText(text?:string):boolean {
  if(!text || hasDegenerateRepetition(text))return false;
  const chinese=(text.match(/[\u3400-\u9fff]/g)||[]).length;
  const english=(text.match(/[A-Za-z]/g)||[]).length;
  const words=text.match(/\b[A-Za-z][A-Za-z0-9-]+/g)||[];
  const proper=words.filter(s=>technicalName(s)||/^[A-Z][A-Za-z0-9-]*$/.test(s)).length;
  return (chinese>0 && (!english || (words.length>0 && proper/words.length>=.75))) || (chinese>=2 && (chinese/(chinese+english)>.3 || (text.match(/[A-Za-z]{3,}/g)||[]).length<4));
}
export function technicalName(text:string):boolean {
  if(/^(?:AI|LLM|KG|MLLM|human)[-\s](?:enabled|powered|empowered|based|driven|assisted|machine|AI|robot)$/i.test(text))return false;
  const words=text.trim().split(/\s+/);
  if(words.length>1&&words.every(technicalName))return true;
  if(['Gemini','Gemini Robotics','Vicuna','Alpaca','Llama','Qwen','Transformer','Metaworld'].includes(text))return true;
  if(/^[A-Z][A-Z0-9.&-]{1,18}\s+(?:19|20)\d{2}$/.test(text) || /^[A-Z][A-Za-z0-9]+-[A-Z0-9]{1,5}$/.test(text))return true;
  if(/^(?:https?:\/\/\S+|(?:[\w-]+\.)+[\w-]+\/\s*\.?|io\/\s*\.?)$/i.test(text))return true;
  const parts=text.split(/\s*(?:\/|·|\+)\s*/);
  if(parts.length>1&&parts.every(s=>s&&technicalName(s)))return true;
  return /^[A-Z0-9_+.-]{2,35}$/.test(text) || (/\d|[A-Z]{2}/.test(text) && /^[A-Za-z0-9]+[-_][A-Za-z0-9._-]+$/.test(text)) || (/^[A-Za-z0-9][A-Za-z0-9]{1,39}$/.test(text) && (text.match(/[A-Z]/g)||[]).length>=2);
}
export function technicalTableValue(text:string):boolean {
  const value=text.trim().replace(/\s*\[$/,'').trim();
  const base=value.replace(/\([^)]*\)/g,'').trim();
  return technicalName(value) || technicalName(base) || (base.length>0&&base.split(/\s+/).every(technicalName)) || /^[A-Z]+@\d+$/.test(value)
    || /^(?:\d+(?:\.\d+)?\s*)?(?:GB|MB|KB|Wh|kWh|ms|Hz|kHz|GHz|kg|mm|cm|dB)\*?$/i.test(value.replace(/[()]/g,''))
    || /^[\d.]+%[A-Z]+$/.test(value) || /^[A-Za-z]+ and [A-Za-z]+ \(\d{4}\)$/.test(value);
}
export function normalizeChineseTerms(source:string,value:string):string {
  let result=value.replace(/▁/g,' ').trim();
  if(/human[-\s]in[-\s]the[-\s]loop/i.test(source))result=result.replace(/人环路|人类环路/g,'人在回路');
  if(/meta[-\s\u2010-\u2015]?knowledge/i.test(source))result=result.replace(/元及知识/g,'元知识');
  return result;
}

let active=0;const waiting:Array<()=>void>=[];
async function limited<T>(work:()=>Promise<T>):Promise<T> {
  if(active>=2)await new Promise<void>(resolve=>waiting.push(resolve));active++;
  try{return await work();}finally{active--;waiting.shift()?.();}
}
export async function translateChineseBatch(values:string[],allowSplitRetry=true):Promise<Array<string|null>> {
  if(values.some(s=>s.length>2800)) {
    const groups=values.map(value=>{
      const parts:string[]=[];let rest=value;
      while(rest.length>2400){const head=rest.slice(0,2400);let cut=Math.max(head.lastIndexOf('. '),head.lastIndexOf('。'))+1;if(cut<1000)cut=head.lastIndexOf(' ');if(cut<1000)cut=2400;parts.push(rest.slice(0,cut));rest=rest.slice(cut);}
      if(rest)parts.push(rest);return parts.length?parts:[''];
    });
    const translated=await translateChineseBatch(groups.flat());let offset=0;
    return groups.map(parts=>{const result=translated.slice(offset,offset+parts.length);offset+=parts.length;return result.every(s=>s!==null)?result.join('\n'):null;});
  }
  const source=values.map(cleanSourceText);
  const result:Array<string|null>=source.map(s=>!s||isChineseText(s)||technicalName(s)||!/[A-Za-z]{2,}/.test(s)?s:null);
  const pending=new Map<string,{source:string;hash:string;indices:number[]}>();
  const version=process.env.TRANSLATION_ENGINE_VERSION||TRANSLATION_VERSION;
  for(let i=0;i<source.length;i++) {
    if(result[i]!==null)continue;
    const hash=createHash('sha256').update(version+':'+source[i]).digest('hex');
    const hit=database().prepare('SELECT translated FROM translations WHERE hash=?').get(hash) as {translated:string}|undefined;
    if(hit && !translationProblems(source[i],hit.translated).length && (isChineseText(hit.translated)||technicalName(hit.translated))){result[i]=normalizeChineseTerms(source[i],hit.translated);continue;}
    const item=pending.get(hash)||{source:source[i],hash,indices:[]};item.indices.push(i);pending.set(hash,item);
  }
  const groups:Array<Array<{source:string;hash:string;indices:number[]}>>=[];
  for(const item of pending.values()) {
    const group=groups.at(-1);
    if(!group || group.length>=4 || group.reduce((n,x)=>n+x.source.length,0)+item.source.length>2800)groups.push([item]);
    else group.push(item);
  }
  const endpoint=process.env.LOCAL_TRANSLATION_URL;
  if(!endpoint)return result;
  await Promise.all(groups.map(group=>limited(async()=>{
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(240000),body:JSON.stringify({q:group.length===1?group[0].source:group.map(x=>x.source)})});
      if(!response.ok)return;
      const body=await response.json() as {translatedText?:string|string[]};
      const translations=typeof body.translatedText==='string'?[body.translatedText]:body.translatedText;
      if(translations?.length!==group.length)return;
      for(let i=0;i<group.length;i++) {
        const item=group[i];const translated=translations[i]?normalizeChineseTerms(item.source,translations[i]):undefined;
        if(!translated || translationProblems(item.source,translated).length || (!isChineseText(translated)&&!technicalName(translated)))continue;
        database().prepare('INSERT OR REPLACE INTO translations VALUES (?,?,?,?)').run(item.hash,item.source,translated,new Date().toISOString());
        item.indices.forEach(index=>{result[index]=translated;});
      }
    }catch(error) {console.warn('[中文翻译] 请求未完成，保留原文等待重试',error instanceof Error?error.name:'请求错误');}
  })));
  // If a long segment still fails, translate smaller source-preserving pieces.
  // A bounded second pass avoids permanently retrying the same failing paragraph.
  if(allowSplitRetry)for(const item of pending.values()){
    if(item.source.length<=500 || item.indices.every(i=>result[i]!==null))continue;
    const parts:string[]=[];let rest=item.source;
    while(rest.length>500){const head=rest.slice(0,500);let cut=Math.max(head.lastIndexOf('. '),head.lastIndexOf('; '))+1;if(cut<180)cut=head.lastIndexOf(' ');if(cut<180)cut=500;parts.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}
    if(rest)parts.push(rest);
    const pieces=await translateChineseBatch(parts,false);
    if(pieces.some(s=>s===null))continue;
    const translated=pieces.join('\n');
    if(translationProblems(item.source,translated).length)continue;
    database().prepare('INSERT OR REPLACE INTO translations VALUES (?,?,?,?)').run(item.hash,item.source,translated,new Date().toISOString());
    item.indices.forEach(i=>{result[i]=translated;});
  }
  return result;
}
export async function translateChinese(value:string):Promise<string|null> {return (await translateChineseBatch([value]))[0];}
export async function translateChineseList(values:string[]):Promise<string[]> {
  const result=await translateChineseBatch(values);return values.map((s,i)=>result[i]??s);
}

let legacy:Map<string,string>|undefined;
const legacyKey=(s:string)=>s.normalize('NFKC').replace(/▁|\s/g,'');
export function getLegacyTranslationSource(value:string):string|undefined {
  if(!value || value.length<12)return undefined;
  if(!legacy) {
    legacy=new Map();
    for(const row of database().prepare('SELECT source,translated FROM translations').all() as Array<{source:string;translated:string}>) {
      if(isChineseText(row.source))continue;
      legacy.set(legacyKey(row.translated),row.source);
      const corrected=row.translated.replace(/政策/g,'策略').replace(/图书馆/g,'基元库').replace(/动议/g,'运动').replace(/发牢骚者/g,'夹爪').replace(/靴子陷阱|靴子/g,'自助法').replace(/青蒿素综合疗法/g,'ACT').replace(/基因模型/g,'生成模型').replace(/潜伏密码本/g,'潜在码本');
      legacy.set(legacyKey(corrected),row.source);
    }
  }
  return legacy.get(legacyKey(value));
}
