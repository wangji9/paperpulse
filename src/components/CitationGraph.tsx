import React, { useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, Loader2, PlusCircle } from 'lucide-react';
import type { AcademicPaper, CitationRefNode } from '../types/paper';
import { DOMAIN_META, resolveDoiUrl, resolvePaperOriginalUrl } from '../lib/constants';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const matches = (node: CitationRefNode, p: AcademicPaper) =>
  (node.doi && p.doi && node.doi.toLowerCase() === p.doi.toLowerCase()) ||
  (p.openAlexId && p.openAlexId === node.id) ||
  p.title.toLowerCase() === node.title.toLowerCase();

interface EgoProps {
  paper: AcademicPaper;
  libraryPapers: AcademicPaper[];
  darkMode?: boolean;
  onImportReference: (identifier: string) => Promise<void>;
  onOpenPaper: (paper: AcademicPaper) => void;
}

export const EgoCitationGraph: React.FC<EgoProps> = ({ paper, libraryPapers, darkMode, onImportReference, onOpenPaper }) => {
  const [selected, setSelected] = useState<CitationRefNode | null>(paper.citations[0] || null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const refs = paper.citations.filter((c) => c.relation === 'references');
  const citedBy = paper.citations.filter((c) => c.relation !== 'references');
  const W = 900;
  const H = Math.max(300, Math.max(refs.length, citedBy.length, 1) * 84 + 70);
  const cx = W / 2;
  const cy = H / 2 + 12;

  const importNode = async (n: CitationRefNode) => {
    setImportingId(n.id);
    try {
      await onImportReference(n.doi || n.id || n.title);
    } finally {
      setImportingId(null);
    }
  };

  const matched = selected ? libraryPapers.find((p) => matches(selected, p)) : undefined;

  const column = (list: CitationRefNode[], side: 'left' | 'right') =>
    list.map((n, i) => {
      const y = ((i + 1) / (list.length + 1)) * (H - 50) + 36;
      const isSel = selected?.id === n.id;
      const x = side === 'left' ? 16 : W - 236;
      const stroke = side === 'left' ? '#0F766E' : '#4F46E5';
      const path =
        side === 'left'
          ? `M 236 ${y} C 300 ${y}, 320 ${cy}, ${cx - 104} ${cy}`
          : `M ${cx + 104} ${cy} C ${cx + 150} ${cy}, ${W - 300} ${y}, ${W - 240} ${y}`;
      return (
        <g key={n.id} className="cursor-pointer" onClick={() => setSelected(n)}>
          <path d={path} fill="none" stroke={stroke} strokeWidth={isSel ? 2.5 : 1.5} strokeOpacity={isSel ? 1 : 0.5} />
          <rect x={x} y={y - 30} width={220} height={60} rx={10} fill={isSel ? (darkMode ? '#1E293B' : '#EEF2FF') : darkMode ? '#0F172A' : '#FFFFFF'} stroke={isSel ? stroke : '#CBD5E1'} strokeWidth={isSel ? 2 : 1.2} />
          <text x={x + 10} y={y - 8} className="fill-slate-800 text-xs font-medium dark:fill-slate-100">
            {cut(n.title, 22)}
          </text>
          <text x={x + 10} y={y + 14} className="fill-slate-500 text-xs">
            {n.year} · 被引 {n.citedByCount ?? 0}
          </text>
        </g>
      );
    });

  if (paper.citations.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className={`overflow-x-auto rounded-xl border lg:col-span-8 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px]">
          <text x={126} y={24} textAnchor="middle" className="fill-teal-700 text-sm font-semibold dark:fill-teal-400">
            上游参考文献
          </text>
          <text x={cx} y={24} textAnchor="middle" className="fill-slate-700 text-sm font-semibold dark:fill-slate-200">
            当前论文
          </text>
          <text x={W - 126} y={24} textAnchor="middle" className="fill-indigo-700 text-sm font-semibold dark:fill-indigo-400">
            下游施引论文
          </text>
          {column(refs, 'left')}
          {column(citedBy, 'right')}
          <rect x={cx - 104} y={cy - 42} width={208} height={84} rx={12} fill="#312E81" />
          <text x={cx} y={cy - 14} textAnchor="middle" fill="#C7D2FE" className="text-xs">
            {paper.journalShort} · {paper.publishedDate.slice(0, 4)}
          </text>
          <text x={cx} y={cy + 6} textAnchor="middle" fill="#FFFFFF" className="text-xs font-medium">
            {cut(paper.title, 22)}
          </text>
          <text x={cx} y={cy + 28} textAnchor="middle" fill="#C7D2FE" className="text-xs">
            被引 {paper.citedByCount}
          </text>
        </svg>
      </div>

      <div className={`rounded-xl p-4 lg:col-span-4 ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
        {selected && (
          <div>
            <span className={`rounded-md px-2 py-0.5 text-sm ${selected.relation === 'references' ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'}`}>
              {selected.relation === 'references' ? '参考文献' : '施引论文'}
            </span>
            <h4 className="mt-2 text-base font-semibold leading-snug text-slate-900 dark:text-white">{selected.title}</h4>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <div>{selected.venue}</div>
              <div>
                {selected.year} · 被引 {selected.citedByCount ?? 0}
              </div>
              {selected.doi && (
                <div>
                  <a
                    href={resolveDoiUrl(selected.doi, selected.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    DOI: {selected.doi}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {matched ? (
                <button type="button" onClick={() => onOpenPaper(matched)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                  已在库中，打开精读 <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={importingId === selected.id}
                  onClick={() => importNode(selected)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {importingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  加入我的文献库
                </button>
              )}
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300">
                  <ExternalLink className="h-4 w-4" />
                  原文链接
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface GlobalProps {
  papers: AcademicPaper[];
  darkMode: boolean;
  onSelectPaper: (paper: AcademicPaper) => void;
  onImportReference: (identifier: string) => Promise<void>;
}

export const GlobalCitationGraph: React.FC<GlobalProps> = ({ papers, darkMode, onSelectPaper, onImportReference }) => {
  const [activeId, setActiveId] = useState<string>(papers[0]?.id || '');
  const [ext, setExt] = useState<CitationRefNode | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const W = 960;
  const cols = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(papers.length * 1.6))));
  const rowsCount = Math.max(2, Math.ceil(papers.length / cols));
  const H = Math.max(520, rowsCount * 112 + 70);

  const layout = useMemo(() => {
    const sorted = [...papers].sort((a, b) => a.publishedDate.localeCompare(b.publishedDate));
    const nodes = sorted.map((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 80 + (col / Math.max(cols - 1, 1)) * (W - 160);
      const y = 65 + (row / Math.max(rowsCount - 1, 1)) * (H - 150);
      return { p, x: x + (row % 2 ? 22 : 0), y };
    });
    const edges: Array<{ a: number; b: number }> = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const A = nodes[i].p;
        const B = nodes[j].p;
        const bCitesA = B.citations.some((c) => c.relation === 'references' && matches(c, A));
        const aCitedByB = A.citations.some((c) => c.relation === 'cited_by' && matches(c, B));
        if (bCitesA || aCitedByB) edges.push({ a: i, b: j });
      }
    return { nodes, edges };
  }, [papers, cols, rowsCount, H]);

  const active = papers.find((p) => p.id === activeId) || papers[0];
  const activeNode = layout.nodes.find((n) => n.p.id === active?.id);
  const extNodes = useMemo(() => {
    if (!activeNode) return [];
    return activeNode.p.citations
      .filter((c) => !papers.some((p) => matches(c, p)))
      .slice(0, 5)
      .map((c, i, arr) => {
        const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2 - Math.PI / 2;
        return {
          c,
          x: Math.max(40, Math.min(W - 40, activeNode.x + Math.cos(angle) * 95)),
          y: Math.max(30, Math.min(H - 110, activeNode.y + Math.sin(angle) * 80)),
        };
      });
  }, [activeNode, papers]);

  return (
    <div className={`rounded-2xl border p-6 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">文献引用关系图谱</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          {(['manufacturing', 'computer_science', 'interdisciplinary'] as const).map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: DOMAIN_META[d].color }} />
              {DOMAIN_META[d].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className={`overflow-hidden rounded-xl border lg:col-span-8 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[480px] w-full">
            <defs>
              <marker id="g-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#4F46E5" />
              </marker>
            </defs>
            {layout.edges.map((e, i) => {
              const A = layout.nodes[e.a];
              const B = layout.nodes[e.b];
              return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#4F46E5" strokeWidth={2} strokeOpacity={0.6} markerEnd="url(#g-arrow)" />;
            })}
            {activeNode &&
              extNodes.map((en) => (
                <line key={`l-${en.c.id}`} x1={activeNode.x} y1={activeNode.y} x2={en.x} y2={en.y} stroke="#94A3B8" strokeWidth={1.3} strokeDasharray="4 4" />
              ))}
            {extNodes.map((en) => (
              <g key={en.c.id} className="cursor-pointer" onClick={() => setExt(en.c)}>
                <circle cx={en.x} cy={en.y} r={ext?.id === en.c.id ? 15 : 12} fill="#FFFFFF" stroke="#64748B" strokeWidth={1.8} strokeDasharray="3 2" />
                <text x={en.x} y={en.y + 30} textAnchor="middle" className="fill-slate-500 text-xs">
                  {en.c.year}
                </text>
              </g>
            ))}
            {layout.nodes.map(({ p, x, y }) => {
              const isAct = active?.id === p.id;
              const r = 15 + Math.min(10, Math.floor(Math.log10((p.citedByCount || 1) + 1) * 3.5));
              return (
                <g
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setActiveId(p.id);
                    setExt(null);
                  }}
                >
                  {isAct && <circle cx={x} cy={y} r={r + 7} fill="none" stroke="#4F46E5" strokeWidth={2} strokeOpacity={0.5} />}
                  <circle cx={x} cy={y} r={r} fill={DOMAIN_META[p.domain].color} stroke="#FFFFFF" strokeWidth={2.5} />
                  <text x={x} y={y + r + 15} textAnchor="middle" className="fill-slate-800 text-xs font-medium dark:fill-slate-200">
                    {p.journalShort.slice(0, 8)} {p.publishedDate.slice(0, 4)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className={`rounded-xl p-4 lg:col-span-4 ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          {ext ? (
            <div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700">{ext.relation === 'references' ? '参考文献' : '施引论文'}</span>
              <h4 className="mt-2 text-base font-semibold leading-snug">{ext.title}</h4>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {ext.venue} · {ext.year} · 被引 {ext.citedByCount ?? 0}
              </p>
              <button
                type="button"
                disabled={importingId === ext.id}
                onClick={async () => {
                  setImportingId(ext.id);
                  try {
                    await onImportReference(ext.doi || ext.id || ext.title);
                  } finally {
                    setImportingId(null);
                  }
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {importingId === ext.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                加入我的文献库
              </button>
            </div>
          ) : active ? (
            <div>
              <div className="text-sm text-slate-500">
                {active.journalShort} · {active.publishedDate} · 被引 {active.citedByCount}
              </div>
              <h4 className="mt-2 text-base font-semibold leading-snug text-slate-900 dark:text-white">{active.title}</h4>
              {active.titleZh !== active.title && /[\u4e00-\u9fa5]/.test(active.titleZh) && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{active.titleZh}</p>
              )}
              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{active.digestSummary}</p>
              {active.doi && resolveDoiUrl(active.doi, active.url) && (
                <div className="mt-2.5 text-sm">
                  <a
                    href={resolveDoiUrl(active.doi, active.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    DOI: {active.doi}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => onSelectPaper(active)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                  精读全文解析
                </button>
                {resolvePaperOriginalUrl(active) && (
                  <a
                    href={resolvePaperOriginalUrl(active)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                    查看原文
                  </a>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
