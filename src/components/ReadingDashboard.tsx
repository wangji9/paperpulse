import { useEffect, useState } from 'react';
import type { ReadingAnalytics, UserProfile } from '../types/paper';
import { fetchReadingAnalytics } from '../lib/api';
import { TOPIC_META } from '../lib/constants';
import { formatDurationZh } from './SocialEngagement';

export function ReadingDashboard({ currentUser, users, onOpenPaper }: { currentUser: UserProfile; users: UserProfile[]; onOpenPaper?: (id: string) => void }) {
  const [scope, setScope] = useState(currentUser.id);
  const [data, setData] = useState<ReadingAnalytics | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    fetchReadingAnalytics(scope).then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [scope, currentUser.id, revision]);
  const card = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';
  const bubbles = data?.papers.slice(0, 18) || [];
  const maxSeconds = Math.max(1, ...bubbles.map(p => p.seconds));
  const maxVisits = Math.max(1, ...bubbles.map(p => p.visits));
  return <section className="space-y-4" aria-label="个人阅读可视化">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{currentUser.role === 'admin' ? '阅读统计与分析' : '我的阅读足迹'}</h2><p className="mt-1 text-xs text-slate-500">{currentUser.role === 'admin' ? '可查看本人、指定成员或全体成员的累计阅读数据。' : '仅统计当前账户的阅读、点击、收藏和评论。'}</p></div>
      <div className="flex gap-2">{currentUser.role === 'admin' && <select aria-label="阅读统计范围" value={scope} onChange={e => setScope(e.target.value)} className="rounded-lg border p-2 text-sm dark:bg-slate-900"><option value="all">全体成员</option>{users.map(u => <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>)}</select>}<button onClick={() => setRevision(r => r + 1)} className="rounded-lg border px-3 py-2 text-sm">刷新统计</button></div>
    </div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!data && !error && <p className="text-sm text-slate-500">正在读取阅读记录…</p>}
    {data && <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[['已读文献', data.readPaperCount + ' 篇'], ['文献访问', data.totalVisits + ' 次'], ['有效阅读', formatDurationZh(data.totalSeconds)], ['收藏文献', data.collectionCount + ' 篇'], ['文献点赞', data.likeCount + ' 次'], ['评论与思考', data.commentCount + ' 条']].map(([label,value]) => <div className={card} key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-indigo-600">{value}</p></div>)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={card}><h3 className="font-semibold">阅读文献气泡图</h3><p className="mt-1 text-xs text-slate-500">横轴为访问次数，纵轴和气泡大小为有效时长；悬停查看数据，点击打开文献。</p>
          {bubbles.length ? <svg role="img" aria-label="个人文献阅读次数与时长气泡图" viewBox="0 0 640 280" className="mt-4 w-full">
            {[0, 1, 2, 3].map(i => <g key={i}><line x1="40" x2="610" y1={30 + i * 68} y2={30 + i * 68} stroke="#cbd5e1" strokeDasharray="3 5" opacity=".5" /><text x="4" y={35+i*68} fontSize="10" fill="#64748b">{formatDurationZh(maxSeconds*(3-i)/3)}</text></g>)}
            {bubbles.map((p,i) => { const x=55+(p.visits/maxVisits)*530; const y=235-(p.seconds/maxSeconds)*190; const color=TOPIC_META[p.topics[0]]?.color || '#4f46e5'; return <g key={p.id} role="button" tabIndex={0} aria-label={`${p.title}：${p.visits}次，${formatDurationZh(p.seconds)}`} onClick={() => onOpenPaper?.(p.id)} onKeyDown={e => { if(e.key==='Enter') onOpenPaper?.(p.id); }} className="cursor-pointer"><title>{p.title} · {p.visits}次 · {formatDurationZh(p.seconds)}</title><circle cx={x} cy={y} r={12+Math.sqrt(p.seconds/maxSeconds)*15} fill={color} fillOpacity=".65" stroke="white" /><text x={x} y={y+4} fill="white" textAnchor="middle" fontSize="11">{i+1}</text></g>; })}
            <text x="40" y="270" fontSize="11" fill="#64748b">0次</text><text x="550" y="270" fontSize="11" fill="#64748b">{maxVisits}次访问 →</text>
          </svg> : <p className="py-12 text-center text-sm text-slate-500">开始阅读文献后，这里会显示气泡。</p>}
        </div>
        <div className={card}><h3 className="font-semibold">文献点击次数排行 · Top 10</h3><p className="mt-1 text-xs text-slate-500">按平台有效访问次数排序，阅读时长作为次级排序。</p><ol className="mt-4 space-y-3">{data.papers.slice(0,10).map((p,i)=><li key={p.id}><button onClick={() => onOpenPaper?.(p.id)} className="flex w-full items-center gap-3 text-left text-sm"><span className="w-5 text-indigo-600">{i+1}</span><span className="min-w-0 flex-1 truncate" title={p.title}>{p.title}</span><span className="shrink-0 text-xs text-slate-500">{p.visits}次 · {formatDurationZh(p.seconds)}</span></button><div className="ml-8 mt-1 h-1 rounded bg-slate-100 dark:bg-slate-800"><div className="h-1 rounded bg-indigo-500" style={{width:`${p.visits/maxVisits*100}%`}} /></div></li>)}</ol>{!data.papers.length && <p className="py-12 text-center text-sm text-slate-500">暂无阅读排行</p>}</div>
        <div className={card}><h3 className="font-semibold">关键词阅读热图</h3><p className="mt-1 text-xs text-slate-500">仅提取已阅读文献的标签与方法名；颜色深浅表示累计访问次数。</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{data.keywords.map(k=><div key={k.keyword} title={`${k.paperCount}篇 · ${k.visits}次访问`} className="rounded-lg border border-indigo-100 p-3 text-sm dark:border-indigo-900" style={{backgroundColor:`rgba(99,102,241,${.06+.6*k.visits/Math.max(1,...data.keywords.map(x=>x.visits))})`}}><p className="truncate font-medium">{k.keyword}</p><p className="mt-1 text-xs opacity-70">{k.visits} 次 · {k.paperCount} 篇</p></div>)}</div>{!data.keywords.length && <p className="py-10 text-center text-sm text-slate-500">暂无关键词数据</p>}</div>
        <div className={card}><h3 className="font-semibold">研究方向阅读分布</h3><div className="mt-5 space-y-4">{data.topics.map(t=><div key={t.topic}><div className="mb-1 flex justify-between gap-2 text-sm"><span>{TOPIC_META[t.topic]?.label || t.topic}</span><span className="text-xs text-slate-500">{t.visits}次 · {formatDurationZh(t.seconds)}</span></div><div className="h-3 rounded bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded" style={{backgroundColor:TOPIC_META[t.topic]?.color,width:`${t.visits/Math.max(1,...data.topics.map(x=>x.visits))*100}%`}} /></div></div>)}</div><p className="mt-5 text-xs text-slate-500">一篇文献可属于多个方向；各方向次数可能重叠。统计范围：{data.scopeLabel}。</p></div>
      </div>
    </>}
  </section>;
}
