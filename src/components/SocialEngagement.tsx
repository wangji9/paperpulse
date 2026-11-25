import React, { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceManyBody, forceSimulation, forceX, forceY, SimulationNodeDatum } from 'd3-force';
import { Bookmark, Clock, Eye, Heart, MessageCircle, Sparkles } from 'lucide-react';
import type { AcademicPaper, PaperReaderTrace } from '../types/paper';
import { recordPaperRead } from '../lib/api';

export function formatDurationZh(totalSeconds?: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  if (s === 0) return '0秒';
  if (s < 60) return `${s}秒`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 60) return remSec > 0 ? `${mins}分${remSec}秒` : `${mins}分钟`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}小时${remMin}分`;
}

export function formatRelativeTimeZh(isoStr?: string): string {
  if (!isoStr) return '';
  const ts = new Date(isoStr).getTime();
  if (Number.isNaN(ts)) return isoStr.slice(0, 16).replace('T', ' ');
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}天前`;
  return isoStr.slice(5, 16).replace('T', ' ');
}

// Each visible reading session has a stable ID and cumulative heartbeats, so retries
// and pagehide cannot count the same seconds twice.
function useReadingSession(paperId: string, enabled: boolean, cardRef: React.RefObject<HTMLElement | null> | null, onSynced?: (paper: AcademicPaper) => void): number {
  const [seconds, setSeconds] = useState(0);
  const callback = useRef(onSynced);
  callback.current = onSynced;
  useEffect(() => {
    setSeconds(0);
    if (!enabled) return;
    const visitId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    let visible = !cardRef;
    let elapsed = 0;
    let sent = -1;
    let started = false;
    let disposed = false;
    let lastTick = performance.now();
    const flush = () => {
      if (!started || elapsed === sent) return;
      sent = elapsed;
      void recordPaperRead(paperId, { visitId, elapsedSeconds: elapsed })
        .then(p => { if (!disposed) callback.current?.(p); })
        .catch(() => { sent = -1; });
    };
    const tick = () => {
      const now = performance.now();
      const delta = Math.min(2, (now - lastTick) / 1000);
      lastTick = now;
      if (!visible || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      elapsed += delta;
      const whole = Math.floor(elapsed);
      // Feed impressions become visits after three seconds. Opening the reader is immediate.
      if (!started && (!cardRef || whole >= 3)) started = true;
      if (!cardRef) setSeconds(whole);
      if (started && (sent < 0 || whole - sent >= 10)) flush();
    };
    let observer: IntersectionObserver | undefined;
    if (cardRef?.current) {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRect.height >= Math.min(180, entry.boundingClientRect.height);
        if (!visible) flush();
      }, { threshold: Array.from({length: 21}, (_, i) => i / 20) });
      observer.observe(cardRef.current);
    }
    if (!cardRef) { started = true; flush(); }
    const timer = window.setInterval(tick, 1000);
    const onVisibility = () => { lastTick = performance.now(); if (document.visibilityState !== 'visible') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('blur', flush);
    return () => {
      disposed = true;
      clearInterval(timer);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('blur', flush);
      flush();
    };
  }, [paperId, enabled, cardRef]);
  return seconds;
}

export function useCardReadingTracker(paperId: string, cardRef: React.RefObject<HTMLElement | null>, enabled: boolean, onSynced?: (paper: AcademicPaper) => void): void {
  useReadingSession(paperId, enabled, cardRef, onSynced);
}
export function useModalReadingTracker(paperId: string, enabled: boolean, onSynced?: (paper: AcademicPaper) => void): number {
  return useReadingSession(paperId, enabled, null, onSynced);
}

interface BubbleNode extends SimulationNodeDatum {
  trace: PaperReaderTrace;
  r: number;
}

/**
 * Interactive SVG Social Reader Engagement Bubble Chart
 * Bubble radius scales with user's reading duration, visit count, likes, collections, and comments.
 */
export const ReaderEngagementBubbleChart: React.FC<{
  readers: PaperReaderTrace[];
  darkMode: boolean;
  onSelectUser?: (userId: string) => void;
}> = ({ readers, darkMode, onSelectUser }) => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const activeUser = readers.find(r => r.userId === selectedUserId) || readers[0] || null;

  const W = 680;
  const H = 220;

  const packedNodes = useMemo(() => {
    if (!readers.length) return [];
    const maxScore = Math.max(
      1,
      ...readers.map((r) => r.totalDwellSeconds + r.visitCount * 15 + (r.liked ? 25 : 0) + (r.collected ? 25 : 0) + r.commentCount * 20)
    );

    const nodes: BubbleNode[] = readers.slice(0, 16).map((r, i) => {
      const rawScore = r.totalDwellSeconds + r.visitCount * 15 + (r.liked ? 25 : 0) + (r.collected ? 25 : 0) + r.commentCount * 20;
      const radius = Math.round(28 + Math.sqrt(rawScore / maxScore) * 24);
      const angle = (i / Math.max(1, readers.length)) * Math.PI * 2;
      return {
        trace: r,
        r: radius,
        x: W / 2 + Math.cos(angle) * 70,
        y: H / 2 + Math.sin(angle) * 35,
      };
    });

    const sim = forceSimulation<BubbleNode>(nodes)
      .force('charge', forceManyBody().strength(8))
      .force('center', forceCenter(W / 2, H / 2))
      .force('x', forceX(W / 2).strength(0.12))
      .force('y', forceY(H / 2).strength(0.24))
      .force('collide', forceCollide<BubbleNode>().radius((d) => d.r + 6).iterations(4))
      .stop();

    for (let i = 0; i < 110; i++) sim.tick();
    return nodes;
  }, [readers]);

  if (!readers.length) return null;

  return (
    <div
      className={`mt-2.5 grid grid-cols-1 gap-3 rounded-xl border p-3.5 lg:grid-cols-12 ${
        darkMode ? 'border-slate-700/80 bg-slate-900/90' : 'border-indigo-100 bg-white'
      }`}
    >
      <p className="text-xs text-slate-500 lg:col-span-12">气泡展示活跃度最高的前16位成员；下方可查看全部成员的访问和互动记录。</p>
      {/* Left: Packed Avatar Bubble SVG */}
      <div
        className={`overflow-hidden rounded-xl border lg:col-span-7 ${
          darkMode ? 'border-slate-800 bg-slate-950/80' : 'border-slate-100 bg-gradient-to-br from-indigo-50/40 via-white to-teal-50/40'
        }`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[195px] w-full select-none">
          {packedNodes.map((n) => {
            const cx = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x ?? W / 2));
            const cy = Math.max(n.r + 8, Math.min(H - n.r - 8, n.y ?? H / 2));
            const isSel = activeUser?.userId === n.trace.userId;
            return (
              <g
                key={n.trace.userId}
                transform={`translate(${cx}, ${cy})`}
                onClick={() => setSelectedUserId(n.trace.userId)}
                onMouseEnter={() => setSelectedUserId(n.trace.userId)}
                role="button" tabIndex={0} aria-label={`${n.trace.displayName}的阅读足迹`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedUserId(n.trace.userId); } }}
                className="cursor-pointer"
              >
                {isSel && (
                  <circle
                    r={n.r + 5}
                    fill="none"
                    stroke={n.trace.avatarColor}
                    strokeWidth={2.5}
                    strokeDasharray="4 2"
                    opacity={0.75}
                  />
                )}
                <circle
                  r={n.r}
                  fill={n.trace.avatarColor}
                  fillOpacity={isSel ? 0.94 : 0.82}
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                />
                <text
                  y={-5}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  className="text-xs font-bold"
                >
                  {n.trace.displayName.slice(0, 5)}
                </text>
                <text
                  y={10}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fillOpacity={0.95}
                  className="text-[10px] font-medium"
                >
                  {n.trace.visitCount}次 · {formatDurationZh(n.trace.totalDwellSeconds)}
                </text>
                {(n.trace.liked || n.trace.collected || n.trace.commentCount > 0) && (
                  <text
                    y={23}
                    textAnchor="middle"
                    fill="#FEF08A"
                    className="text-[9.5px] font-semibold"
                  >
                    {[
                      n.trace.liked ? '赞' : '',
                      n.trace.collected ? '藏' : '',
                      n.trace.commentCount > 0 ? `评${n.trace.commentCount}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Right: Selected User Traceable Detail Card */}
      <div className="flex flex-col justify-between lg:col-span-5">
        {activeUser && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-xs"
                style={{ backgroundColor: activeUser.avatarColor }}
              >
                {activeUser.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">{activeUser.displayName}</span>
                  <span className="text-xs text-slate-400">@{activeUser.username}</span>
                </div>
                <div className="text-xs text-slate-500">
                  最近访问：{formatRelativeTimeZh(activeUser.lastVisitedAt)}
                </div>
              </div>
            </div>

            {activeUser.userTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activeUser.userTags.map((ut) => (
                  <span
                    key={ut}
                    className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    {ut}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <div className="text-slate-400">累计访问次数</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {activeUser.visitCount} 次
                </div>
              </div>
              <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <div className="text-slate-400">累计阅读时长</div>
                <div className="mt-0.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {formatDurationZh(activeUser.totalDwellSeconds)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
              {activeUser.liked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                  <Heart className="h-3 w-3 fill-current" /> 已点赞该文献
                </span>
              )}
              {activeUser.collected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 font-medium text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                  <Bookmark className="h-3 w-3 fill-current" /> 已收藏入个人库
                </span>
              )}
              {activeUser.commentCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  <MessageCircle className="h-3 w-3" /> 发表 {activeUser.commentCount} 条评论/思考
                </span>
              )}
            </div>
          </div>
        )}

        {activeUser && onSelectUser && (
          <button
            type="button"
            onClick={() => onSelectUser(activeUser.userId)}
            className="mt-2 w-full rounded-lg border border-indigo-200 bg-indigo-50/70 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
          >
            筛选查看 {activeUser.displayName} 浏览与收藏的文献 →
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Unified Social Footprint Strip shown on PaperFeedCard & DeepAnatomyModal:
 * Displays who visited, visit count, reading duration, traceable likers & collectors, and expandable Bubble Chart!
 */
export const PaperSocialFootprintPanel: React.FC<{
  paper: AcademicPaper;
  darkMode: boolean;
  defaultShowBubbles?: boolean;
  onFilterByUser?: (userId: string) => void;
}> = ({ paper, darkMode, defaultShowBubbles = false, onFilterByUser }) => {
  const [showBubbles, setShowBubbles] = useState(defaultShowBubbles);
  const readers = paper.readers || [];
  const likers = paper.likers || [];
  const collectors = paper.collectors || [];
  const totalVisits = paper.totalVisits || 0;
  const totalDwell = paper.totalDwellSeconds || 0;

  if (readers.length === 0 && likers.length === 0 && collectors.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-3 rounded-xl border px-3.5 py-2.5 text-sm ${
        darkMode ? 'border-slate-800 bg-slate-800/35' : 'border-slate-200/80 bg-slate-50/75'
      }`}
    >
      {/* Top Row: Overlapping Reader Avatars + Visit/Duration Summary + Bubble Chart Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Overlapping User Avatars */}
          <div className="flex -space-x-2">
            {readers.slice(0, 6).map((r) => (
              <button
                key={r.userId}
                type="button"
                title={`${r.displayName} (@${r.username}) · 访问 ${r.visitCount} 次 · 阅读 ${formatDurationZh(r.totalDwellSeconds)}`}
                onClick={() => setShowBubbles(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-2xs transition hover:z-10 hover:scale-110 dark:border-slate-900"
                style={{ backgroundColor: r.avatarColor }}
              >
                {r.displayName.slice(0, 1)}
              </button>
            ))}
          </div>

          {/* Per-User Quick Trace Badges */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-100">
              <Eye className="h-3.5 w-3.5 text-indigo-600" />
              {readers
                .slice(0, 3)
                .map((r) => `${r.displayName}(${r.visitCount}次/${formatDurationZh(r.totalDwellSeconds)})`)
                .join('、')}
              {readers.length > 3 ? ` 等 ${readers.length} 人浏览` : ''}
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5 text-teal-600" />
              总访问 {totalVisits} 次 · 累计阅读 {formatDurationZh(totalDwell)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowBubbles((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
            showBubbles
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : darkMode
                ? 'border-slate-700 bg-slate-900 text-indigo-300 hover:border-indigo-500'
                : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {showBubbles ? '收起读者气泡图' : `读者互动气泡图 (${readers.length})`}
        </button>
      </div>

      {showBubbles && <div className="mt-3 max-h-60 overflow-auto space-y-2">{readers.map(r => <div key={r.userId} className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full px-2 py-1 text-white" style={{backgroundColor: r.avatarColor}}>{r.displayName.slice(0,1)}</span><span>{r.displayName} @{r.username}</span><span>访问 {r.visitCount} 次 · 阅读 {formatDurationZh(r.totalDwellSeconds)} · 评论 {r.commentCount} 条{r.liked ? ' · 已点赞' : ''}{r.collected ? ' · 已收藏' : ''}</span></div>)}</div>}
      {/* Traceable Likes & Collections Row */}
      {(likers.length > 0 || collectors.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/60 pt-2 text-xs dark:border-slate-700/60">
          {likers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                <Heart className="h-3.5 w-3.5 fill-current" /> 点赞用户：
              </span>
              {likers.map((lk) => (
                <button
                  key={lk.userId}
                  type="button"
                  onClick={() => onFilterByUser?.(lk.userId)}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-white px-2 py-0.5 text-slate-700 hover:border-rose-400 dark:border-rose-900/60 dark:bg-slate-900 dark:text-slate-200"
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: lk.avatarColor }}
                  >
                    {lk.displayName.slice(0, 1)}
                  </span>
                  <span>{lk.displayName}</span>
                </button>
              ))}
            </div>
          )}

          {collectors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                <Bookmark className="h-3.5 w-3.5 fill-current" /> 收藏入库：
              </span>
              {collectors.map((col) => (
                <button
                  key={col.userId}
                  type="button"
                  onClick={() => onFilterByUser?.(col.userId)}
                  className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-white px-2 py-0.5 text-slate-700 hover:border-teal-400 dark:border-teal-900/60 dark:bg-slate-900 dark:text-slate-200"
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: col.avatarColor }}
                  >
                    {col.displayName.slice(0, 1)}
                  </span>
                  <span>{col.displayName}</span>
                  {col.userTags.slice(0, 1).map((ut) => (
                    <span key={ut} className="text-[10px] text-indigo-600 dark:text-indigo-400">
                      ·{ut}
                    </span>
                  ))}
                  {col.personalTags.slice(0, 1).map((pt) => (
                    <span key={pt} className="text-[10px] text-teal-600 dark:text-teal-400">
                      #{pt}
                    </span>
                  ))}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expandable Interactive SVG Reader Bubble Chart */}
      {showBubbles && (
        <ReaderEngagementBubbleChart
          readers={readers}
          darkMode={darkMode}
          onSelectUser={onFilterByUser}
        />
      )}
    </div>
  );
};
