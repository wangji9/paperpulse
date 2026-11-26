import { useState } from 'react';
import type { AcademicPaper } from '../types/paper';
export function PaperAbstract({paper,compact=false}:{paper:AcademicPaper;compact?:boolean}){
  const [expanded,setExpanded]=useState(!compact);
  const text=paper.abstractZh||(/\p{Script=Han}/u.test(paper.abstractOriginal)?paper.abstractOriginal:'');
  return <section className="my-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-slate-700 dark:bg-slate-800/40">
    <div className="mb-2 flex justify-between gap-3"><h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">论文摘要</h3>{compact&&<button className="text-xs text-indigo-600" onClick={()=>setExpanded(!expanded)}>{expanded?'收起摘要':'展开完整摘要'}</button>}</div>
    <p className={`${expanded?'':'line-clamp-3'} whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-200`}>{text||(paper.abstractOriginal?'中文摘要正在翻译，可展开原文核对。':'来源尚未提供摘要；上传全文PDF后自动提取，不以题名或解读代替摘要。')}</p>
    {paper.abstractOriginal&&<details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">摘要原文与来源</summary><p className="mt-2 whitespace-pre-line leading-6">{paper.abstractOriginal}</p><a className="text-indigo-600" href={paper.doi?`https://doi.org/${paper.doi}`:paper.url} target="_blank" rel="noreferrer">核对文献来源</a></details>}
  </section>;
}
