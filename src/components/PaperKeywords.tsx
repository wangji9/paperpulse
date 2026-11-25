import { chineseText } from '../lib/chinese';
import type { AcademicPaper } from '../types/paper';

const LABELS = { metadata:'仅元数据 · 待解析摘要', abstract:'摘要已解析', full_text:'PDF正文已解析', unavailable:'暂无法获取原文' };
export function PaperKeywords({paper}: {paper:AcademicPaper}) {
  return <div className="my-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-indigo-600">论文关键词</span><span className="text-slate-400">{paper.keywordSource==='author'?'原文关键词及补充提取':paper.keywordSource==='manual'?'管理员维护':'根据标题与摘要自动提取'}</span>{paper.parsing && <span className="rounded-md bg-white px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{LABELS[paper.parsing.status]}{paper.parsing.pages?` · ${paper.parsing.pages}页`:''}</span>}{(paper.localPdfUrl || paper.pdfUrl) && <a href={paper.localPdfUrl || paper.pdfUrl} target="_blank" rel="noreferrer" className="font-medium text-indigo-600">{paper.localPdfUrl?'站内原文PDF ↗':'开放PDF ↗'}</a>}{paper.codeUrl && <a href={paper.codeUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-600">代码仓库 ↗</a>}</div>
    <div className="flex flex-wrap gap-1.5">{(paper.keywords||[]).map(k=><span key={k} className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-xs text-indigo-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300">{chineseText(k)}</span>)}{!paper.keywords?.length&&<span className="text-xs text-slate-400">关键词待提取</span>}</div>
    {Boolean(paper.parsing?.warnings.length)&&<details className="text-xs text-slate-500"><summary className="cursor-pointer">原文获取说明</summary>{paper.parsing!.warnings.map((w,i)=><p key={i} className="mt-1 break-words">{w}</p>)}</details>}
  </div>;
}
