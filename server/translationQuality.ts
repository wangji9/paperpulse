export const TRANSLATION_VERSION='qwen3-4b-v3';

export function hasDegenerateRepetition(value:string):boolean {
  return [...value.matchAll(/([^\s]{1,18})\1{5,}/gu)].some(m=>/[\p{L}]/u.test(m[1]) && (m[1].length>1 || m[0].length>=8));
}
export function translationProblems(source:string,target:string):string[] {
  const problems:string[]=[];
  if(!target.trim())problems.push('译文为空');
  if(hasDegenerateRepetition(target))problems.push('译文包含异常重复');
  if((target.includes('```')&&!source.includes('```')) || /[}\]]\s*(?:assistant|system)\b/i.test(target))problems.push('译文包含异常对话或格式标记');
  if(source.length>30 && target.length>source.length*2+100)problems.push('译文长度异常');
  const numbers=source.match(/\b\d+(?:\.\d+)?\b/g)||[];
  const comparable=target.normalize('NFKC');
  if(numbers.some(n=>!comparable.includes(n)))problems.push('原文数值未完整保留');
  return problems;
}

export function cleanSourceText(text:string):string {
  return text.normalize('NFKC')
    .replace(/\u00ad\s*\n\s*|(?<=[a-z])-\s*\n\s*(?=[a-z])/g,'')
    .replace(/\u00ad/g,'')
    .replace(/arXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?(?:\s*\[[^\]]+\])?/gi,'')
    .replace(/^\s*(?:Received(?: in revised form)?|Accepted|Available online|[*∗†]?\s*Corresponding author|E-mail address|https?:\/\/doi\.org\/|Contents lists available|journal homepage:|©|\d{4}-\d{4}\/)[^\n]*$/gim,'')
    .replace(/\b\d+\s+Preprint\.?\b/gi,'')
    .replace(/\s+/g,' ').trim();
}

export function sourceExcerpt(text:string,limit:number):string {
  const value=cleanSourceText(text);
  if(value.length<=limit)return value;
  const head=value.slice(0,limit);
  const endings=[...head.matchAll(/[.!?。！？](?=\s|$)/g)].filter(m=>{
    const prefix=head.slice(0,m.index);
    return !/\b[A-Z]$/.test(prefix) && !/(?:\bet al|\bi\.e|\be\.g|\bFig|\bEq|\bSec|\bDr|\bProf)$/i.test(prefix);
  });
  const end=endings.at(-1)?.index;
  if(end!==undefined && end>limit*.5)return head.slice(0,end+1);
  const boundary=head.lastIndexOf(' ');
  return head.slice(0,boundary>limit*.7?boundary:limit).trim();
}
