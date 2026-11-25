import React, { useMemo, useState } from 'react';
import { ArrowRight, ExternalLink, GitCommitHorizontal, Loader2, PlusCircle } from 'lucide-react';
import type { AcademicPaper, CitationRefNode } from '../types/paper';
import { DOMAIN_META } from '../lib/constants';

interface EgoCitationGraphProps {
  paper: AcademicPaper;
  libraryPapers: AcademicPaper[];
  darkMode?: boolean;
  onImportReference: (identifier: string) => Promise<void>;
  onOpenPaper: (paper: AcademicPaper) => void;
}

/**
 * Interactive 3-tier Citation Lineage SVG & Inspector for a single paper:
 * Upstream References -> Focal Paper -> Downstream Citing Papers
 */
export const EgoCitationGraph: React.FC<EgoCitationGraphProps> = ({
  paper,
  libraryPapers,
  darkMode,
  onImportReference,
  onOpenPaper,
}) => {
  const [selectedNode, setSelectedNode] = useState<CitationRefNode | null>(
    paper.citations[0] || null
  );
  const [importingId, setImportingId] = useState<string | null>(null);

  const refs = paper.citations.filter((c) => c.relation === 'references');
  const citedBy = paper.citations.filter((c) => c.relation === 'cited_by' || c.relation === 'related');

  const width = 880;
  const height = Math.max(290, Math.max(refs.length, citedBy.length, 1) * 76 + 60);
  const centerX = width / 2;
  const centerY = height / 2;

  const findInLibrary = (node: CitationRefNode) =>
    libraryPapers.find(
      (lp) =>
        (node.doi && lp.doi && lp.doi.toLowerCase() === node.doi.toLowerCase()) ||
        (lp.openAlexId && lp.openAlexId === node.id) ||
        lp.title.toLowerCase() === node.title.toLowerCase()
    );

  const handleImport = async (node: CitationRefNode) => {
    const idToUse = node.doi || node.id || node.title;
    setImportingId(node.id);
    try {
      await onImportReference(idToUse);
    } finally {
      setImportingId(null);
    }
  };

  if (paper.citations.length === 0) {
    return (
      <div
        className={`rounded-xl border p-5 text-center text-xs ${
          darkMode ? 'border-slate-700 bg-slate-900/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}
      >
        该文献暂未匹配到 OpenAlex 引文拓扑记录（可能为刚发表预印本或手动新建文献）。可稍后通过 DOI 重新抓取同步引文关系。
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
          <GitCommitHorizontal className="h-4 w-4 text-indigo-600" />
          <span>论文引用关系拓扑图 (上游参考文献 → 本文 → 下游施引研究)</span>
        </div>
        <span className="font-mono-code text-[11px] text-slate-500">
          上游引用 {refs.length} 篇 · 下游被引 {citedBy.length} 篇（总被引 {paper.citedByCount}）
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/70 lg:col-span-8 dark:border-slate-800 dark:bg-slate-950/60">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[660px] w-full">
            <defs>
              <marker id="arrow-ref" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#0891B2" />
              </marker>
              <marker id="arrow-cite" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#4F46E5" />
              </marker>
            </defs>

            {/* Column headers */}
            <text x={120} y={24} textAnchor="middle" className="fill-cyan-700 text-[11px] font-bold dark:fill-cyan-400">
              上游参考文献 (References)
            </text>
            <text x={centerX} y={24} textAnchor="middle" className="fill-slate-800 text-[11px] font-bold dark:fill-slate-200">
              当前精读论文
            </text>
            <text x={width - 120} y={24} textAnchor="middle" className="fill-indigo-700 text-[11px] font-bold dark:fill-indigo-400">
              下游施引研究 (Cited By)
            </text>

            {/* Reference nodes (Left) */}
            {refs.map((r, i) => {
              const y = ((i + 1) / (refs.length + 1)) * (height - 40) + 30;
              const isSel = selectedNode?.id === r.id;
              return (
                <g key={r.id} className="cursor-pointer" onClick={() => setSelectedNode(r)}>
                  <path
                    d={`M 230 ${y} C 295 ${y}, 315 ${centerY}, ${centerX - 102} ${centerY}`}
                    fill="none"
                    stroke="#0891B2"
                    strokeWidth={isSel ? 2.4 : 1.4}
                    strokeOpacity={isSel ? 1 : 0.55}
                    markerEnd="url(#arrow-ref)"
                  />
                  <rect
                    x={16}
                    y={y - 26}
                    width={214}
                    height={52}
                    rx={10}
                    fill={isSel ? '#ECFEFF' : '#FFFFFF'}
                    stroke={isSel ? '#0891B2' : '#CBD5E1'}
                    strokeWidth={isSel ? 2 : 1.2}
                  />
                  <text x={26} y={y - 7} className="fill-slate-800 text-[10.5px] font-semibold">
                    {r.title.length > 30 ? `${r.title.slice(0, 30)}...` : r.title}
                  </text>
                  <text x={26} y={y + 12} className="font-mono-code fill-slate-500 text-[9.5px]">
                    {r.year} · {r.venue.slice(0, 18)} · 被引 {r.citedByCount ?? 0}
                  </text>
                </g>
              );
            })}

            {/* CitedBy nodes (Right) */}
            {citedBy.map((c, i) => {
              const y = ((i + 1) / (citedBy.length + 1)) * (height - 40) + 30;
              const isSel = selectedNode?.id === c.id;
              return (
                <g key={c.id} className="cursor-pointer" onClick={() => setSelectedNode(c)}>
                  <path
                    d={`M ${centerX + 100} ${centerY} C ${centerX + 150} ${centerY}, ${width - 285} ${y}, ${width - 234} ${y}`}
                    fill="none"
                    stroke="#4F46E5"
                    strokeWidth={isSel ? 2.4 : 1.4}
                    strokeOpacity={isSel ? 1 : 0.55}
                    markerEnd="url(#arrow-cite)"
                  />
                  <rect
                    x={width - 230}
                    y={y - 26}
                    width={214}
                    height={52}
                    rx={10}
                    fill={isSel ? '#EEF2FF' : '#FFFFFF'}
                    stroke={isSel ? '#4F46E5' : '#CBD5E1'}
                    strokeWidth={isSel ? 2 : 1.2}
                  />
                  <text x={width - 220} y={y - 7} className="fill-slate-800 text-[10.5px] font-semibold">
                    {c.title.length > 30 ? `${c.title.slice(0, 30)}...` : c.title}
                  </text>
                  <text x={width - 220} y={y + 12} className="font-mono-code fill-slate-500 text-[9.5px]">
                    {c.year} · {c.venue.slice(0, 18)} · 被引 {c.citedByCount ?? 0}
                  </text>
                </g>
              );
            })}

            {/* Center Focal Node */}
            <rect
              x={centerX - 100}
              y={centerY - 38}
              width={200}
              height={76}
              rx={12}
              fill="#312E81"
              stroke="#6366F1"
              strokeWidth={2.5}
            />
            <text x={centerX} y={centerY - 12} textAnchor="middle" fill="#E0E7FF" className="font-mono-code text-[10px] font-bold">
              {paper.journalShort} · {paper.publishedDate.slice(0, 4)}
            </text>
            <text x={centerX} y={centerY + 7} textAnchor="middle" fill="#FFFFFF" className="text-[11px] font-bold">
              {paper.title.length > 24 ? `${paper.title.slice(0, 24)}...` : paper.title}
            </text>
            <text x={centerX} y={centerY + 24} textAnchor="middle" fill="#A5B4FC" className="font-mono-code text-[9.5px]">
              总被引：{paper.citedByCount}
            </text>
          </svg>
        </div>

        {/* Selected Node Details & 1-click Import */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-800/40">
          {selectedNode ? (
            <div>
              <span
                className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  selectedNode.relation === 'references'
                    ? 'bg-cyan-100 text-cyan-800'
                    : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {selectedNode.relation === 'references' ? '上游参考文献 (被本文引用)' : '下游施引文献 (引用了本文)'}
              </span>
              <h4 className="mt-2 text-xs font-bold leading-snug text-slate-900 dark:text-white">{selectedNode.title}</h4>
              <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                <div>期刊/会议：{selectedNode.venue}</div>
                <div>年份：{selectedNode.year || '未知'}</div>
                <div>OpenAlex 被引次数：{selectedNode.citedByCount ?? 0}</div>
                {selectedNode.doi && <div className="font-mono-code break-all">DOI: {selectedNode.doi}</div>}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {(() => {
                  const matched = findInLibrary(selectedNode);
                  if (matched) {
                    return (
                      <button
                        type="button"
                        onClick={() => onOpenPaper(matched)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        已在文献库中 · 直接精读 <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      disabled={importingId === selectedNode.id}
                      onClick={() => handleImport(selectedNode)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {importingId === selectedNode.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="h-3.5 w-3.5" />
                      )}
                      抓取并加入我的文献库
                    </button>
                  );
                })()}
                {selectedNode.url && (
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    查看原文链接
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">点击左侧图谱中的任意节点查看引文详情或一键入库。</div>
          )}
        </div>
      </div>
    </div>
  );
};

interface GlobalCitationGraphProps {
  papers: AcademicPaper[];
  darkMode: boolean;
  onSelectPaper: (paper: AcademicPaper) => void;
  onImportReference: (identifier: string) => Promise<void>;
}

/**
 * Full Library Citation Graph View:
 * Connects papers in the library via direct citations AND shared landmark references.
 */
export const GlobalCitationGraph: React.FC<GlobalCitationGraphProps> = ({
  papers,
  darkMode,
  onSelectPaper,
  onImportReference,
}) => {
  const [activePaperId, setActivePaperId] = useState<string>(papers[0]?.id || '');
  const [selectedExternal, setSelectedExternal] = useState<CitationRefNode | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const W = 920;
    const H = 500;
    const cx = W / 2;
    const cy = H / 2;

    // Sort library papers chronologically left-to-right to show research evolution & citation flow
    const sorted = [...papers].sort((a, b) => a.publishedDate.localeCompare(b.publishedDate));
    const libNodes = sorted.map((p, idx) => {
      const colCount = Math.max(sorted.length - 1, 1);
      const x = 110 + (idx / colCount) * (W - 220);
      const yOffset = idx % 2 === 0 ? -75 : 75;
      const y = cy + yOffset + (idx % 3 === 0 ? -35 : 25);
      return {
        kind: 'library' as const,
        id: p.id,
        paper: p,
        x,
        y,
        r: Math.min(28, 16 + Math.floor(Math.log10((p.citedByCount || 1) + 1) * 5)),
      };
    });

    // Build real edges between library papers (direct citation or shared citation)
    const linkList: Array<{ fromX: number; fromY: number; toX: number; toY: number; type: 'direct' | 'shared'; label: string; fromId: string; toId: string }> = [];

    for (let i = 0; i < libNodes.length; i++) {
      for (let j = 0; j < libNodes.length; j++) {
        if (i === j) continue;
        const a = libNodes[i].paper;
        const b = libNodes[j].paper;
        // Does B cite A?
        const bCitesA = b.citations.some(
          (c) =>
            c.relation === 'references' &&
            ((a.openAlexId && c.id === a.openAlexId) ||
              (a.doi && c.doi && c.doi.toLowerCase() === a.doi.toLowerCase()) ||
              c.title.toLowerCase() === a.title.toLowerCase())
        );
        const aCitedByB = a.citations.some(
          (c) =>
            c.relation === 'cited_by' &&
            ((b.openAlexId && c.id === b.openAlexId) ||
              (b.doi && c.doi && c.doi.toLowerCase() === b.doi.toLowerCase()) ||
              c.title.toLowerCase() === b.title.toLowerCase())
        );
        if (bCitesA || aCitedByB) {
          linkList.push({
            fromX: libNodes[i].x,
            fromY: libNodes[i].y,
            toX: libNodes[j].x,
            toY: libNodes[j].y,
            type: 'direct',
            label: '直接引用',
            fromId: a.id,
            toId: b.id,
          });
        }
      }
    }

    // Add top external citation neighbors for the currently focused paper around it
    const activeNode = libNodes.find((n) => n.id === activePaperId) || libNodes[0];
    const extNodes: Array<{ kind: 'external'; id: string; ref: CitationRefNode; x: number; y: number }> = [];
    if (activeNode) {
      const topCites = activeNode.paper.citations.slice(0, 5);
      topCites.forEach((c, idx) => {
        // Skip if already in library
        const alreadyLib = libNodes.some(
          (ln) =>
            (c.doi && ln.paper.doi && c.doi.toLowerCase() === ln.paper.doi.toLowerCase()) ||
            (ln.paper.openAlexId && ln.paper.openAlexId === c.id)
        );
        if (alreadyLib) return;

        const angle = ((idx / Math.max(topCites.length, 1)) * Math.PI * 1.4) - Math.PI * 0.7;
        const dir = c.relation === 'references' ? -1 : 1;
        const ex = Math.max(60, Math.min(W - 60, activeNode.x + dir * 135 + Math.cos(angle) * 45));
        const ey = Math.max(45, Math.min(H - 45, activeNode.y + Math.sin(angle) * 125));
        extNodes.push({ kind: 'external', id: c.id, ref: c, x: ex, y: ey });
        linkList.push({
          fromX: c.relation === 'references' ? ex : activeNode.x,
          fromY: c.relation === 'references' ? ey : activeNode.y,
          toX: c.relation === 'references' ? activeNode.x : ex,
          toY: c.relation === 'references' ? activeNode.y : ey,
          type: 'shared',
          label: c.relation === 'references' ? '参考' : '施引',
          fromId: c.relation === 'references' ? c.id : activeNode.id,
          toId: c.relation === 'references' ? activeNode.id : c.id,
        });
      });
    }

    return { nodes: { libNodes, extNodes }, edges: linkList, cx, cy };
  }, [papers, activePaperId]);

  const activePaper = papers.find((p) => p.id === activePaperId) || papers[0];

  return (
    <div
      className={`rounded-2xl border p-5 ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-academic text-base font-bold text-slate-900 dark:text-white">
            个人文献库 · 引用关系与学术演进图谱
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            按发表时间轴自左向右排布，实线箭头表示库内文献间的直接引用关系，虚线节点展示选中论文的真实上下游引文（点击可导入）。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
            制造顶刊
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-600" />
            计算机顶刊/顶会
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
            交叉研究
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-400 bg-white" />
            库外关联引文
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70 lg:col-span-8 dark:border-slate-800 dark:bg-slate-950/70">
          <svg viewBox="0 0 920 500" className="h-[460px] w-full">
            <defs>
              <marker id="global-direct" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#4F46E5" />
              </marker>
              <marker id="global-ext" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" fill="#94A3B8" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((e, i) => (
              <line
                key={i}
                x1={e.fromX}
                y1={e.fromY}
                x2={e.toX}
                y2={e.toY}
                stroke={e.type === 'direct' ? '#4F46E5' : '#94A3B8'}
                strokeWidth={e.type === 'direct' ? 2.2 : 1.2}
                strokeDasharray={e.type === 'shared' ? '4 4' : undefined}
                strokeOpacity={e.type === 'direct' ? 0.85 : 0.65}
                markerEnd={e.type === 'direct' ? 'url(#global-direct)' : 'url(#global-ext)'}
              />
            ))}

            {/* External reference/citing nodes */}
            {nodes.extNodes.map((en) => {
              const isSel = selectedExternal?.id === en.id;
              return (
                <g
                  key={en.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedExternal(en.ref)}
                >
                  <circle
                    cx={en.x}
                    cy={en.y}
                    r={isSel ? 15 : 12}
                    fill="#FFFFFF"
                    stroke={en.ref.relation === 'references' ? '#0891B2' : '#6366F1'}
                    strokeWidth={1.8}
                    strokeDasharray="3 2"
                  />
                  <text x={en.x} y={en.y + 3} textAnchor="middle" className="font-mono-code fill-slate-700 text-[8px] font-semibold">
                    {en.ref.year || 'Ref'}
                  </text>
                  <text x={en.x} y={en.y + 24} textAnchor="middle" className="fill-slate-500 text-[9px]">
                    {en.ref.title.slice(0, 16)}...
                  </text>
                </g>
              );
            })}

            {/* In-Library Paper Nodes */}
            {nodes.libNodes.map((ln) => {
              const isAct = activePaper?.id === ln.id;
              const fillColor = DOMAIN_META[ln.paper.domain].color;
              return (
                <g
                  key={ln.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setActivePaperId(ln.id);
                    setSelectedExternal(null);
                  }}
                >
                  {isAct && (
                    <circle cx={ln.x} cy={ln.y} r={ln.r + 7} fill="none" stroke="#4F46E5" strokeWidth={2} strokeOpacity={0.5} />
                  )}
                  <circle
                    cx={ln.x}
                    cy={ln.y}
                    r={ln.r}
                    fill={fillColor}
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                  />
                  <text x={ln.x} y={ln.y + 3.5} textAnchor="middle" fill="#FFFFFF" className="font-mono-code text-[8.5px] font-bold">
                    {ln.paper.journalShort.slice(0, 6)}
                  </text>
                  <text x={ln.x} y={ln.y + ln.r + 14} textAnchor="middle" className="fill-slate-800 text-[10px] font-semibold dark:fill-slate-200">
                    {ln.paper.title.slice(0, 18)}...
                  </text>
                  <text x={ln.x} y={ln.y + ln.r + 25} textAnchor="middle" className="font-mono-code fill-slate-400 text-[8.5px]">
                    {ln.paper.publishedDate.slice(0, 7)} · 引{ln.paper.citedByCount}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right Detail Panel */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-800/40">
          {selectedExternal ? (
            <div>
              <span className="rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                {selectedExternal.relation === 'references' ? '库外上游参考文献' : '库外下游施引文献'}
              </span>
              <h4 className="mt-2 text-sm font-bold leading-snug">{selectedExternal.title}</h4>
              <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div>发表源：{selectedExternal.venue}</div>
                <div>年份：{selectedExternal.year}</div>
                <div>OpenAlex 被引：{selectedExternal.citedByCount ?? 0}</div>
                {selectedExternal.doi && <div className="font-mono-code break-all">DOI: {selectedExternal.doi}</div>}
              </div>
              <button
                type="button"
                disabled={importingId === selectedExternal.id}
                onClick={async () => {
                  setImportingId(selectedExternal.id);
                  try {
                    await onImportReference(selectedExternal.doi || selectedExternal.id || selectedExternal.title);
                  } finally {
                    setImportingId(null);
                  }
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {importingId === selectedExternal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                拉取并收入我的文献库
              </button>
            </div>
          ) : activePaper ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded bg-indigo-600 px-2 py-0.5 font-mono-code text-[10px] font-bold text-white">
                  {activePaper.journalShort} · {activePaper.publishedDate}
                </span>
                <span className="font-mono-code text-xs text-slate-500">被引 {activePaper.citedByCount}</span>
              </div>
              <h4 className="font-serif-academic mt-2.5 text-sm font-bold leading-snug">{activePaper.titleZh}</h4>
              <p className="mt-1 font-mono-code text-[11px] text-slate-500">{activePaper.title}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{activePaper.digestSummary}</p>

              <div className="mt-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  已关联引文：{activePaper.citations.length} 篇
                </div>
                <div className="mt-1 space-y-1 text-[11px] text-slate-500">
                  {activePaper.citations.slice(0, 4).map((c) => (
                    <div key={c.id} className="truncate">
                      • [{c.relation === 'references' ? '引用' : '被引'}] {c.title}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectPaper(activePaper)}
                className="mt-4 w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                打开十维精读与完整引文图 →
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-400">暂无文献</div>
          )}
        </div>
      </div>
    </div>
  );
};
