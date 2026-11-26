import type { AcademicPaper, LabEntry, ResearchTopic } from '../types/paper';
export function analyzeLab(entries:LabEntry[]){
  const count=(values:string[])=>[...values.reduce((m,v)=>m.set(v,(m.get(v)||0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const papers=entries.map(e=>e.paper);
  const topics=count(papers.flatMap(p=>[...new Set(p.topics)])) as [ResearchTopic,number][];
  const years=[...new Set(entries.map(e=>e.publicationYear||Number(e.paper.publishedDate.slice(0,4))).filter(y=>y>=1900))].sort();
  const keywords=count(papers.flatMap(p=>[...new Set((p.keywords||[]).map(s=>s.trim()).filter(Boolean))]));
  const authors=count(papers.flatMap(p=>[...new Set(p.authors.filter(a=>!a.includes('未知')&&!/\.\.\.|…/.test(a)))]));
  const journals=count(papers.map(p=>p.journal));
  const pairs:Array<{a:ResearchTopic;b:ResearchTopic;papers:AcademicPaper[]}>=[];
  topics.forEach(([a],i)=>topics.slice(i+1).forEach(([b])=>pairs.push({a,b,papers:papers.filter(p=>p.topics.includes(a)&&p.topics.includes(b))})));
  return {papers,topics,years,keywords,authors,journals,pairs,yearCounts:years.map(year=>({year,count:entries.filter(e=>(e.publicationYear||Number(e.paper.publishedDate.slice(0,4)))===year).length}))};
}
