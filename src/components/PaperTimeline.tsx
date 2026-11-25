import { useMemo, useState } from 'react';
import type { AcademicPaper } from '../types/paper';

export function PaperTimeline({papers, year, month, onChange}: {papers:AcademicPaper[];year:string;month:string;onChange:(year:string,month:string,basis?:'published'|'synced')=>void}) {
  const [basis,setBasis]=useState<'published'|'synced'>('published');
  const years=[...new Set([String(new Date().getFullYear()),...papers.map(p=>p.publishedDate.slice(0,4))])].filter(y=>/^\d{4}$/.test(y)).sort().reverse();
  const buckets=useMemo(()=>{
    const selectedYear=year==='all'?String(new Date().getFullYear()):year;
    return Array.from({length:12},(_,i)=>{const key=`${selectedYear}-${String(i+1).padStart(2,'0')}`;return{key,count:papers.filter(p=>(basis==='published'?p.publishedDate:p.syncedAt).startsWith(key)).length};});
  },[papers,year,basis]);
  const undated=papers.filter(p=>p.publishedDate.startsWith(year==='all'?String(new Date().getFullYear()):year) && p.publishedDate.length<7).length;
  const max=Math.max(1,...buckets.map(b=>b.count));
  return <section aria-label="文献时间线" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">文献时间线</h2><p className="mt-1 text-xs text-slate-500">按月份查看论文发表和入库分布；点击月份筛选。来源只有年份的论文不虚填月份。</p></div><div className="flex gap-2"><select aria-label="时间线年份" value={year} onChange={e=>onChange(e.target.value,'all')} className="rounded-lg border p-2 text-xs dark:bg-slate-800"><option value="all">全部年份</option>{years.map(y=><option key={y}>{y}</option>)}</select><select aria-label="时间线日期类型" value={basis} onChange={e=>{setBasis(e.target.value as typeof basis);onChange(year,'all',e.target.value as typeof basis);}} className="rounded-lg border p-2 text-xs dark:bg-slate-800"><option value="published">按发表月份</option><option value="synced">按入库月份</option></select><button onClick={()=>onChange('all','all')} className="rounded-lg border px-3 text-xs">查看全部</button></div></div>
    <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">{buckets.map((b,i)=><button key={b.key} aria-pressed={month===b.key} onClick={()=>onChange(year==='all'?String(new Date().getFullYear()):year,month===b.key?'all':b.key)} className={`flex h-24 flex-col justify-end rounded-lg border p-2 text-center text-xs ${month===b.key?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950':'border-slate-100 dark:border-slate-800'}`} title={`${b.key}：${b.count}篇`}><span className="text-indigo-600">{b.count}</span><span className="mx-auto mt-1 block w-5 rounded-t bg-indigo-500" style={{height:Math.max(2,b.count/max*40)}}/><span className="mt-1 text-slate-500">{i+1}月</span></button>)}</div>
    <p className="mt-2 text-xs text-slate-400">{basis==='synced'?'按入库时间筛选，保留原始发表年份信息。':'按原始发表时间筛选；当前优先展示今年文献。'}{month!=='all'?` 当前：${month}`:''}{basis==='published'&&undated>0?` 另有${undated}篇仅提供年份，未计入月份。`:''}</p>
  </section>;
}
