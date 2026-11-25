import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Pause, Play } from 'lucide-react';
import type { AcademicPaper } from '../types/paper';

export function PaperUpdates({ papers, onOpen }: { papers: AcademicPaper[]; onOpen: (paper: AcademicPaper) => void }) {
  const latest = [...papers].sort((a,b)=>b.syncedAt.localeCompare(a.syncedAt)).slice(0,12);
  const [index,setIndex] = useState(0);
  const [paused,setPaused] = useState(false);
  const [hovered,setHovered] = useState(false);
  useEffect(()=>{if(paused||hovered||latest.length<2)return; const timer=window.setInterval(()=>{if(document.visibilityState==='visible')setIndex(i=>(i+1)%latest.length);},5000);return()=>clearInterval(timer);},[paused,hovered,latest.length]);
  const p=latest[index%Math.max(1,latest.length)];
  if(!p)return null;
  const thumbnail=p.anatomy.paperFigures?.[0]?.url || p.anatomy.figureUrl;
  return <section aria-label="文献更新动态" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setHovered(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHovered(false);}} className="rounded-2xl border border-indigo-100 bg-white p-4 dark:border-indigo-900 dark:bg-slate-900">
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-indigo-600">文献更新动态 <span className="ml-2 font-normal text-slate-400">最近入库 · {index%latest.length+1}/{latest.length}</span></h2><div className="flex gap-1"><button aria-label="上一条文献动态" onClick={()=>setIndex(i=>(i-1+latest.length)%latest.length)} className="rounded-lg border p-1.5"><ChevronLeft className="h-4 w-4" /></button><button aria-label={paused?'播放文献动态':'暂停文献动态'} onClick={()=>setPaused(v=>!v)} className="rounded-lg border p-1.5">{paused?<Play className="h-4 w-4" />:<Pause className="h-4 w-4" />}</button><button aria-label="下一条文献动态" onClick={()=>setIndex(i=>(i+1)%latest.length)} className="rounded-lg border p-1.5"><ChevronRight className="h-4 w-4" /></button></div></div>
    <button key={p.id} onClick={()=>onOpen(p)} className="flex w-full min-w-0 items-center gap-4 text-left motion-safe:animate-[paper-update_0.4s_ease-out]">
      <span className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 dark:bg-slate-800">{thumbnail?<img src={thumbnail} alt="文献原图缩略图" className="h-full w-full object-contain" onError={e=>{e.currentTarget.style.visibility='hidden';}} />:<FileText className="h-8 w-8 text-indigo-300" />}</span>
      <span className="min-w-0 flex-1"><span className="text-xs font-medium text-indigo-600">{p.journalShort} · 发表 {p.publishedDate} · 入库 {p.syncedAt.slice(0,10)}</span><span className="mt-1 block truncate text-sm font-semibold" title={p.titleZh||p.title}>{p.titleZh||p.title}</span><span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{p.digestSummary || p.anatomy.problem || '点击查看文献详情'}</span></span>
    </button>
  </section>;
}
