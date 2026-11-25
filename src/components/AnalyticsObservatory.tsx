import React, { useState } from 'react';
import { BarChart3, Calendar, Database, Network } from 'lucide-react';
import type { AcademicPaper, ResearchTopic } from '../types/paper';
import { DATASET_SOURCE_META, DOMAIN_META, TOPIC_META } from '../lib/constants';

interface AnalyticsObservatoryProps {
  papers: AcademicPaper[];
  darkMode: boolean;
  onSelectPaper: (paper: AcademicPaper) => void;
}

const TOPICS: ResearchTopic[] = ['LLM', 'KnowledgeGraph', 'ComputerVision', 'Multimodal', 'EmbodiedAI'];

export const AnalyticsObservatory: React.FC<AnalyticsObservatoryProps> = ({
  papers,
  darkMode,
  onSelectPaper,
}) => {
  const [hoveredPaperId, setHoveredPaperId] = useState<string | null>(null);

  // Domain x Topic matrix
  const domains: Array<'manufacturing' | 'computer_science' | 'interdisciplinary'> = [
    'manufacturing',
    'computer_science',
    'interdisciplinary',
  ];

  const matrixCount = (d: string, t: ResearchTopic) =>
    papers.filter((p) => p.domain === d && p.topics.includes(t)).length;

  // Dataset breakdown
  const dsCounts = {
    public: papers.filter((p) => p.anatomy.dataset.sourceType === 'public').length,
    self_built: papers.filter((p) => p.anatomy.dataset.sourceType === 'self_built').length,
    hybrid: papers.filter((p) => p.anatomy.dataset.sourceType === 'hybrid').length,
  };

  // Daily distribution
  const dateMap: Record<string, number> = {};
  for (const p of papers) {
    dateMap[p.publishedDate] = (dateMap[p.publishedDate] || 0) + 1;
  }
  const dailyRows = Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b));
  const maxDaily = Math.max(1, ...dailyRows.map(([, c]) => c));

  // Constellation SVG coordinates for Topics (inner ring) and Papers (outer ring)
  const cx = 360;
  const cy = 200;
  const topicNodes = TOPICS.map((t, idx) => {
    const angle = (idx / TOPICS.length) * Math.PI * 2 - Math.PI / 2;
    return {
      topic: t,
      x: cx + Math.cos(angle) * 85,
      y: cy + Math.sin(angle) * 72,
      meta: TOPIC_META[t],
    };
  });

  const paperNodes = papers.slice(0, 12).map((p, idx) => {
    const total = Math.min(papers.length, 12);
    const angle = (idx / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 3;
    return {
      paper: p,
      x: cx + Math.cos(angle) * 235,
      y: cy + Math.sin(angle) * 155,
    };
  });

  const hoveredPaper = papers.find((p) => p.id === hoveredPaperId);

  return (
    <div className="space-y-5">
      {/* Top Row: Matrix Heatmap + Dataset Source Split */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div
          className={`rounded-2xl border p-5 lg:col-span-7 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold">制造期刊 × 计算机五大方向交叉热力矩阵</h3>
            </div>
            <span className="font-mono-code text-xs text-slate-400">共 {papers.length} 篇深度精读</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                  <th className="py-2 text-left font-semibold">期刊 / 领域归属</th>
                  {TOPICS.map((t) => (
                    <th key={t} className="px-2 py-2 text-center font-semibold">
                      {TOPIC_META[t].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {domains.map((d) => (
                  <tr key={d}>
                    <td className="py-3 font-semibold text-slate-700 dark:text-slate-200">{DOMAIN_META[d].label}</td>
                    {TOPICS.map((t) => {
                      const cnt = matrixCount(d, t);
                      return (
                        <td key={t} className="px-2 py-2 text-center">
                          <div
                            className={`mx-auto flex h-9 w-12 items-center justify-center rounded-lg font-mono-code text-xs font-bold transition ${
                              cnt === 0
                                ? 'bg-slate-50 text-slate-300 dark:bg-slate-800/50 dark:text-slate-600'
                                : cnt === 1
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                  : 'bg-indigo-600 text-white shadow-sm'
                            }`}
                          >
                            {cnt}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dataset Source Distribution + Daily Timeline */}
        <div
          className={`flex flex-col justify-between rounded-2xl border p-5 lg:col-span-5 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
          }`}
        >
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold">实验数据集构建类型分布</h3>
            </div>
            <div className="space-y-2.5">
              {(['hybrid', 'self_built', 'public'] as const).map((key) => {
                const count = dsCounts[key];
                const pct = papers.length ? Math.round((count / papers.length) * 100) : 0;
                const meta = DATASET_SOURCE_META[key];
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.label}</span>
                      <span className="font-mono-code text-slate-500">
                        {count} 篇 ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{ width: `${Math.max(4, pct)}%` }}
                        className={`h-full rounded-full ${
                          key === 'hybrid'
                            ? 'bg-indigo-600'
                            : key === 'self_built'
                              ? 'bg-rose-500'
                              : 'bg-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="mb-2.5 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sky-600" />
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">每日动态追踪入库趋势</h3>
            </div>
            <div className="flex h-20 items-end gap-2">
              {dailyRows.map(([date, count]) => (
                <div key={date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono-code text-[10px] font-bold text-indigo-600">{count}</span>
                  <div
                    style={{ height: `${Math.max(18, (count / maxDaily) * 52)}px` }}
                    className="w-full max-w-[36px] rounded-t-md bg-gradient-to-t from-indigo-600 to-cyan-400"
                  />
                  <span className="font-mono-code text-[10px] text-slate-400">{date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Knowledge Constellation SVG Graph */}
      <div
        className={`rounded-2xl border p-5 ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold">前沿文献-核心技术方向知识关联星图 (点击论文节点直达10维精读)</h3>
          </div>
          <span className="text-xs text-slate-500">中心环：五大核心方向 · 外环：实时追踪文献</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 lg:col-span-8 dark:border-slate-800 dark:bg-slate-950/60">
            <svg viewBox="0 0 720 400" className="h-[340px] w-full">
              <defs>
                <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={cx} cy={cy} r={190} fill="url(#centerGlow)" />
              <circle cx={cx} cy={cy} r={85} fill="none" stroke="#CBD5E1" strokeDasharray="4 4" strokeOpacity="0.5" />
              <circle cx={cx} cy={cy} r={205} fill="none" stroke="#CBD5E1" strokeDasharray="3 5" strokeOpacity="0.4" />

              {/* Edges between papers and topics */}
              {paperNodes.map((pn) =>
                pn.paper.topics.map((t) => {
                  const tn = topicNodes.find((n) => n.topic === t);
                  if (!tn) return null;
                  const isHighlighted = hoveredPaperId === pn.paper.id;
                  return (
                    <line
                      key={`${pn.paper.id}-${t}`}
                      x1={tn.x}
                      y1={tn.y}
                      x2={pn.x}
                      y2={pn.y}
                      stroke={tn.meta.color}
                      strokeWidth={isHighlighted ? 2.4 : 1.1}
                      strokeOpacity={hoveredPaperId && !isHighlighted ? 0.15 : isHighlighted ? 0.95 : 0.42}
                    />
                  );
                })
              )}

              {/* Topic Nodes */}
              {topicNodes.map((tn) => (
                <g key={tn.topic}>
                  <circle cx={tn.x} cy={tn.y} r={34} fill={tn.meta.color} fillOpacity="0.16" stroke={tn.meta.color} strokeWidth={2} />
                  <text
                    x={tn.x}
                    y={tn.y + 4}
                    textAnchor="middle"
                    className="fill-slate-800 text-[10.5px] font-bold dark:fill-slate-100"
                  >
                    {tn.meta.label}
                  </text>
                </g>
              ))}

              {/* Paper Nodes */}
              {paperNodes.map((pn) => {
                const isHov = hoveredPaperId === pn.paper.id;
                const badgeText = pn.paper.journalShort.replace(/^IEEE\s+/i, '').slice(0, 7);
                return (
                  <g
                    key={pn.paper.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPaperId(pn.paper.id)}
                    onClick={() => onSelectPaper(pn.paper)}
                  >
                    <circle
                      cx={pn.x}
                      cy={pn.y}
                      r={isHov ? 22 : 18}
                      fill={isHov ? '#4F46E5' : '#0F172A'}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                    />
                    <text
                      x={pn.x}
                      y={pn.y + 3}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      className="font-mono-code text-[7.5px] font-bold"
                    >
                      {badgeText}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Right Inspection Card */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-800/40">
            {hoveredPaper ? (
              <div>
                <span className="rounded bg-indigo-600 px-2 py-0.5 font-mono-code text-[10px] font-bold text-white">
                  {hoveredPaper.journalShort} · {hoveredPaper.publishedDate}
                </span>
                <h4 className="font-serif-academic mt-2 text-sm font-bold leading-snug">{hoveredPaper.titleZh}</h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-indigo-600">核心方法：</span>
                  {hoveredPaper.anatomy.proposedMethod.slice(0, 110)}...
                </p>
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <span className="font-semibold">关键提升：</span>
                  {hoveredPaper.keyHighlightMetric}
                </p>
                <button
                  type="button"
                  onClick={() => onSelectPaper(hoveredPaper)}
                  className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  打开十维精读报告 →
                </button>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-400">
                <Network className="mb-2 h-8 w-8 text-indigo-400/60" />
                <p>将鼠标悬停在星图外环任意期刊论文节点上，预览方法逻辑并点击进入精读。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
