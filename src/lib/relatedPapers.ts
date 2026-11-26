import type { AcademicPaper } from '../types/paper';
import { TOPIC_META } from './constants';
export interface RelatedMatch {paper:AcademicPaper;score:number;reasons:string[];seedIds:string[]}
const stop=new Set('the and for with from this that using based approach method study via towards of in to a an on by as is are we it or at'.split(' '));
function terms(p:AcademicPaper):Map<string,number>{
  const result=new Map<string,number>();
  const add=(s:string,w:number)=>{for(const t of s.normalize('NFKC').toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\u3400-\u9fff]{2,6}/g)||[])if(!stop.has(t))result.set(t,(result.get(t)||0)+w);};
  add(p.title,3);add(p.abstractOriginal||'',1);add((p.keywordsOriginal||p.keywords||[]).join(' '),4);
  return result;
}
const doi=(p:AcademicPaper)=>p.doi.replace(/^https?:\/\/(?:dx\.)?doi.org\//i,'').toLowerCase();
export function relatedPapers(seeds:AcademicPaper[],pool:AcademicPaper[],limit=8):RelatedMatch[]{
  if(!seeds.length)return [];
  const corpus=[...new Map([...seeds,...pool].map(p=>[p.id,p])).values()];
  const vectors=new Map(corpus.map(p=>[p.id,terms(p)]));const df=new Map<string,number>();
  vectors.forEach(v=>v.forEach((_,k)=>df.set(k,(df.get(k)||0)+1)));
  vectors.forEach(v=>v.forEach((n,k)=>v.set(k,(1+Math.log(n))*Math.log(1+corpus.length/(df.get(k)||1)))));
  const cosine=(a:Map<string,number>,b:Map<string,number>)=>{
    let dot=0;for(const [k,v]of a)dot+=v*(b.get(k)||0);
    const norm=(v:Map<string,number>)=>Math.sqrt([...v.values()].reduce((s,n)=>s+n*n,0));return dot/(norm(a)*norm(b)||1);
  };
  const seedIds=new Set(seeds.map(p=>p.id)),seedDois=new Set(seeds.map(doi).filter(Boolean));
  const seen=new Set<string>();
  return pool.flatMap(p=>{
    const unique=doi(p)||p.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    if(seedIds.has(p.id)||seedDois.has(doi(p))||seen.has(unique))return [];seen.add(unique);
    const best=seeds.map(seed=>{
      const topics=seed.topics.filter(t=>p.topics.includes(t));
      const keywords=(seed.keywordsOriginal||seed.keywords||[]).filter(k=>(p.keywordsOriginal||p.keywords||[]).some(x=>x.toLowerCase()===k.toLowerCase()));
      const citation=seed.citations.some(c=>(c.doi&&c.doi.toLowerCase()===doi(p))||c.id===p.id)||p.citations.some(c=>(c.doi&&c.doi.toLowerCase()===doi(seed))||c.id===seed.id);
      const text=cosine(vectors.get(seed.id)!,vectors.get(p.id)!);
      const reasons=[...(text>.08?['题名与摘要术语相近']:[]),...topics.map(t=>'共同方向：'+TOPIC_META[t].label),...keywords.slice(0,3).map(k=>'共同关键词：'+k),...(citation?['已收录的引文关联']:[])];
      return {score:text*.75+Math.min(topics.length,3)*.05+Math.min(keywords.length,3)*.035+(citation?.15:0),reasons,seedId:seed.id};
    }).sort((a,b)=>b.score-a.score);
    if(!best[0]?.reasons.length||best[0].score<.07)return [];
    return [{paper:p,score:best[0].score,reasons:best[0].reasons,seedIds:best.filter(b=>b.score>=.07&&b.reasons.length).slice(0,3).map(b=>b.seedId)}];
  }).sort((a,b)=>b.score-a.score||b.paper.publishedDate.localeCompare(a.paper.publishedDate)).slice(0,limit);
}
