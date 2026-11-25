import { useEffect, useState } from 'react';
import type { LibraryInventory } from '../types/paper';
import { compactLibrary, deleteLibraryPapers, fetchLibraryInventory, updateAutoSyncConfig } from '../lib/api';

const size = (bytes: number) => bytes >= 1048576 ? `${(bytes/1048576).toFixed(1)} MB` : `${(bytes/1024).toFixed(1)} KB`;
export function LibraryManager({ onOpen, onEdit, onAdd, onChanged }: { onOpen: (id: string) => void; onEdit: (id: string) => void; onAdd: () => void; onChanged: () => Promise<void> }) {
  const [inventory, setInventory] = useState<LibraryInventory | null>(null);
  const [search, setSearch] = useState('');
  const [journal, setJournal] = useState('all');
  const [sort, setSort] = useState('size');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [limit, setLimit] = useState(1000);
  const [page, setPage] = useState(0);
  const refresh = async () => { const result = await fetchLibraryInventory(); setInventory(result); setLimit(result.maxStoredPapers); setSelected([]); };
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, []);
  const rows = (inventory?.papers || []).filter(p => (journal === 'all' || p.journal === journal) && `${p.title} ${p.journal} ${p.id}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => sort === 'size' ? b.bytes-a.bytes : sort === 'visits' ? a.visits-b.visits : b.syncedAt.localeCompare(a.syncedAt));
  const visible = rows.slice(page*20, page*20+20);
  const remove = async (ids: string[]) => {
    if (!ids.length || !window.confirm(`将从公共池永久删除所选 ${ids.length} 篇文献及其阅读记录、评论、成员收藏和本地图表。确认删除？`)) return;
    setBusy(true); setMessage('');
    try { setInventory(await deleteLibraryPapers(ids)); setSelected([]); await onChanged(); setMessage(`已删除 ${ids.length} 篇文献并清理本地附件。可压缩数据库以回收空闲页。`); }
    catch(e) { setMessage(e instanceof Error ? e.message : '删除失败'); } finally { setBusy(false); }
  };
  const card='rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';
  return <section className="space-y-4" aria-label="管理员文献管理">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">文献池管理</h2><p className="mt-1 text-sm text-slate-500">管理员专用：检索、录入、编辑和删除文献，检查存储占用。</p></div><button onClick={onAdd} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white">新增文献</button></div>
    {message && <p role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{message}</p>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['文献总数', `${inventory?.totalPapers || 0} 篇`], ['数据库及日志', size(inventory?.databaseBytes || 0)], ['本地图表与PDF', size(inventory?.assetBytes || 0)]].map(([k,v])=><div className={card} key={k}><p className="text-xs text-slate-500">{k}</p><p className="mt-2 text-2xl font-semibold">{v}</p></div>)}</div>
    <div className={card}><div className="flex flex-wrap items-end gap-3"><label className="text-sm">自动入库总量上限<input aria-label="自动入库总量上限" type="number" min="1" max="100000" value={limit} onChange={e=>setLimit(Number(e.target.value))} className="ml-3 w-28 rounded-lg border p-2 dark:bg-slate-800" /></label><button disabled={busy || !Number.isInteger(limit) || limit<1 || limit>100000} onClick={async()=>{setBusy(true);try { await updateAutoSyncConfig({maxStoredPapers:limit});setMessage('自动入库上限已保存；达到上限后暂停新增，不会自动删除已有文献。');} catch(e){setMessage(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">保存上限</button><button disabled={busy} onClick={async()=>{setBusy(true);try{setInventory(await compactLibrary());setMessage('已压缩数据库并清理SQLite日志。');}catch(e){setMessage(e instanceof Error?e.message:'压缩失败');}finally{setBusy(false);}}} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">压缩数据库</button><button disabled={busy} onClick={()=>void refresh().catch(e=>setMessage(e.message))} className="rounded-lg border px-3 py-2 text-sm">刷新占用</button></div><p className="mt-3 text-xs text-slate-500">容量统计包含数据库、日志和附件；各文献估算大小包括JSON内容及本地资源。自动同步达到上限后停止新增；管理员删除的文献会标记为不再自动收录；手动管理仍可使用。</p></div>
    <div className={card}><div className="flex flex-wrap gap-2"><input aria-label="检索管理文献" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="检索标题、来源或ID" className="w-72 rounded-lg border p-2 text-sm dark:bg-slate-800" /><select aria-label="管理文献期刊" value={journal} onChange={e=>{setJournal(e.target.value);setPage(0);}} className="rounded-lg border p-2 text-sm dark:bg-slate-800"><option value="all">全部期刊</option>{[...new Set(inventory?.papers.map(p=>p.journal))].sort().map(j=><option key={j}>{j}</option>)}</select><select aria-label="文献排序" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}} className="rounded-lg border p-2 text-sm dark:bg-slate-800"><option value="size">占用空间从大到小</option><option value="visits">访问次数从少到多</option><option value="recent">最近入库优先</option></select><button disabled={busy || !selected.length} onClick={()=>void remove(selected)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-40">删除所选 ({selected.length})</button></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="p-2"><input aria-label="选择当前页" type="checkbox" checked={visible.length>0&&visible.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...visible.map(p=>p.id)])].slice(0,100):selected.filter(id=>!visible.some(p=>p.id===id)))} /></th><th>文献与来源</th><th>入库时间</th><th>估算占用</th><th>访问 / 收藏</th><th>操作</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className="border-b border-slate-100 dark:border-slate-800"><td className="p-2"><input aria-label={`选择文献 ${p.title}`} type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id].slice(0,100):selected.filter(id=>id!==p.id))} /></td><td className="max-w-lg py-3 pr-5"><button onClick={()=>onOpen(p.id)} className="line-clamp-2 text-left font-medium text-indigo-600">{p.title}</button><p className="mt-1 text-xs text-slate-500">{p.journal} · {p.publishedDate}</p></td><td className="whitespace-nowrap pr-3 text-xs">{p.syncedAt?.slice(0,10)}</td><td className="whitespace-nowrap pr-3">{size(p.bytes)}</td><td className="pr-3">{p.visits} / {p.collectors}</td><td className="whitespace-nowrap"><button onClick={()=>onEdit(p.id)} className="mr-3 text-indigo-600">编辑</button><button disabled={busy} onClick={()=>void remove([p.id])} className="text-rose-600">删除</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="py-8 text-center text-sm text-slate-500">没有符合条件的文献</p>}
      <div className="mt-4 flex items-center justify-between text-sm"><span>共 {rows.length} 篇 · 第 {page+1} 页</span><div className="flex gap-3"><button disabled={page===0} onClick={()=>setPage(p=>p-1)} className="disabled:opacity-30">上一页</button><button disabled={(page+1)*20>=rows.length} onClick={()=>setPage(p=>p+1)} className="disabled:opacity-30">下一页</button></div></div>
    </div>
  </section>;
}
