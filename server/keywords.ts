const STOP = new Set('a an the this that these those of and or for to in on with by from as is are was were be been we our their its it using based via towards toward does let how what why when which where study paper approach method results proposed new model models learning data can not into at through'.split(' '));
export function extractKeywords(title: string, abstract = '', supplied: string[] = []): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => { const value=s.replace(/\s+/g,' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,''); if(value.length>=3 && value.length<=65 && !seen.has(value.toLowerCase())) { seen.add(value.toLowerCase());output.push(value); } };
  supplied.forEach(add);
  const phrases = [...title.matchAll(/\b[A-Z][A-Za-z0-9-]{1,20}(?:-[A-Za-z]+)+\b/g), ...title.matchAll(/\b[A-Z][A-Z0-9]{1,12}\b/g)];
  phrases.forEach(m=>add(m[0]));
  const terms = (title+' '+abstract.slice(0,5000)).match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
  const scores = new Map<string,{text:string;score:number}>();
  for(let i=0;i<terms.length;i++) {
    const word=terms[i]; if(STOP.has(word.toLowerCase()))continue;
    for(const phrase of [word, i+1<terms.length&&!STOP.has(terms[i+1].toLowerCase())?word+' '+terms[i+1]:'']) {
      if(!phrase)continue;const key=phrase.toLowerCase();const prior=scores.get(key)||{text:phrase,score:0};prior.score+=title.toLowerCase().includes(key)?4:1;scores.set(key,prior);
    }
  }
  [...scores.values()].sort((a,b)=>b.score-a.score).forEach(x=>{if(output.length<10)add(x.text);});
  return output.slice(0,10);
}
