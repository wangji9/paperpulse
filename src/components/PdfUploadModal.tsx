import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import type { AcademicPaper, PdfImportJob } from '../types/paper';
import { fetchPaperDetail, fetchPdfImportJobs, uploadPdfPaper } from '../lib/api';

export function PdfUploadModal({darkMode,onClose,onOpenPaper,destination='pool'}:{darkMode:boolean;onClose:()=>void;onOpenPaper:(paper:AcademicPaper)=>void;destination?:'pool'|'lab'}) {
  const [file,setFile]=useState<File|null>(null);
  const [collect,setCollect]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [jobs,setJobs]=useState<PdfImportJob[]>([]);
  const [error,setError]=useState('');
  const [opening,setOpening]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let disposed=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {const items=await fetchPdfImportJobs();if(!disposed)setJobs(items);}catch(e){if(!disposed)setError(e instanceof Error?e.message:'无法获取任务');}
      if(!disposed)timer=setTimeout(()=>{void poll();},2500);
    };
    void poll();
    return ()=>{disposed=true;clearTimeout(timer);};
  },[]);
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!uploading)onClose();};
    window.addEventListener('keydown',listener);return ()=>window.removeEventListener('keydown',listener);
  },[onClose,uploading]);
  const choose=(candidate?:File)=>{
    if(!candidate)return;
    setError('');
    if(!/\.pdf$/i.test(candidate.name)){setError('请选择PDF文件');return;}
    if(!candidate.size || candidate.size>32*1024*1024){setError('PDF大小需要在1字节至32MB之间');return;}
    setFile(candidate);
  };
  const submit=async()=>{
    if(!file||uploading)return;
    setUploading(true);setError('');
    try {
      const job=await uploadPdfPaper(file,collect,destination);
      setJobs(previous=>[job,...previous.filter(j=>j.id!==job.id)]);setFile(null);
      if(input.current)input.current.value='';
    }catch(e){setError(e instanceof Error?e.message:'PDF上传失败');}
    finally {setUploading(false);}
  };
  const open=async(job:PdfImportJob)=>{
    if(!job.paperId)return;
    setOpening(job.id);setError('');
    try {onOpenPaper(await fetchPaperDetail(job.paperId));}
    catch(e){setError(e instanceof Error?e.message:'打开文献失败');}
    finally {setOpening('');}
  };
  return createPortal(<div className={`${darkMode?'dark':''} fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm`} role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="pdf-upload-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800"><div><h2 id="pdf-upload-title" className="text-lg font-semibold">上传PDF文献</h2><p className="mt-1 text-sm text-slate-500">自动提取正文、方法图与实验表格，加入公共文献池。</p></div><button aria-label="关闭PDF上传" disabled={uploading} onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X className="h-5 w-5"/></button></header>
      <div className="space-y-4 overflow-y-auto p-5">
        {destination==='lab'&&<p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">本次上传将同步加入课题组文献库与公共文献池。重复文献会关联已有条目；您可修订或移出自己归档的课题组成果。</p>}
        <p className="rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">用户和管理员均可上传。上传后的文献及原文对所有登录成员可见，并显示上传者；系统自动识别研究方向、期刊、数据集来源和关键词，生成中文解读。</p>
        <label onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!uploading)choose(e.dataTransfer.files[0]);}} className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-slate-50 p-7 text-center dark:border-indigo-800 dark:bg-slate-950/40">
          <Upload className="h-8 w-8 text-indigo-500"/><span className="text-sm font-medium">{file?file.name:'选择或拖入PDF文件'}</span><span className="text-xs text-slate-500">单篇不超过32MB · 支持中英文论文</span>
          <input ref={input} aria-label="选择PDF文献" type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={e=>choose(e.target.files?.[0])} className="mt-2 max-w-full text-sm"/>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={collect} onChange={e=>setCollect(e.target.checked)} disabled={uploading}/>同时收藏到我的知识库</label><button onClick={()=>{void submit();}} disabled={!file||uploading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{uploading?<Loader2 className="h-4 w-4 animate-spin"/>:<Upload className="h-4 w-4"/>}{uploading?'正在上传，请勿关闭…':'上传并自动解析'}</button></div>
        <p className="text-xs leading-5 text-slate-500">上传成功后可关闭窗口，任务会在后台继续处理。扫描件尝试文字识别；未能确认的信息会保留说明，可结合原文核对。重复文献会定位已有条目。</p>
        {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</p>}
        <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800"><h3 className="text-sm font-semibold">最近上传与解析任务</h3>{!jobs.length&&<p className="py-3 text-sm text-slate-400">暂无上传任务</p>}{jobs.map(job=><article key={job.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start gap-2">{job.status==='queued'||job.status==='processing'?<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-500"/>:job.status==='completed'?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/>:<FileText className="mt-0.5 h-4 w-4 shrink-0 text-rose-500"/>}<div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{job.fileName}</p><p aria-live="polite" className="mt-1 text-xs text-slate-500">{job.phase}</p>{job.error&&<p className="mt-1 text-xs text-rose-600">{job.error} 请检查PDF后重新上传。</p>}</div>{job.status==='completed'&&<button onClick={()=>{void open(job);}} disabled={opening===job.id} className="shrink-0 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600">{opening===job.id?'打开中…':'查看文献'}</button>}</div></article>)}</div>
      </div>
    </section>
  </div>,document.body);
}
