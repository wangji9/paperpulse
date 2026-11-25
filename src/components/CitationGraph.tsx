import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force';
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Loader2,
  Maximize2,
  Network,
  PlusCircle,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AcademicPaper, CitationRefNode } from '../types/paper';
import { DOMAIN_META, TOPIC_META, resolveDoiUrl, resolvePaperOriginalUrl } from '../lib/constants';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const matchesPaper = (node: CitationRefNode, p: AcademicPaper) =>
  (node.doi && p.doi && node.doi.toLowerCase() === p.doi.toLowerCase()) ||
  (p.openAlexId && p.openAlexId === node.id) ||
  p.title.toLowerCase() === node.title.toLowerCase();

/* ============================================================================
 * 1. Per-Paper Force-Assisted Ego Citation Knowledge Graph (Modal Section 11)
 * ============================================================================ */
interface EgoProps {
  paper: AcademicPaper;
  libraryPapers: AcademicPaper[];
  darkMode?: boolean;
  onImportReference: (identifier: string) => Promise<void>;
  onOpenPaper: (paper: AcademicPaper) => void;
}

interface EgoSimNode extends SimulationNodeDatum {
  id: string;
  kind: 'focal' | 'ref' | 'cited' | 'in_lib';
  label: string;
  sub: string;
  r: number;
  refData?: CitationRefNode;
  targetX: number;
  targetY: number;
}

export const EgoCitationGraph: React.FC<EgoProps> = ({
  paper,
  libraryPapers,
  darkMode,
  onImportReference,
  onOpenPaper,
}) => {
  const [selected, setSelected] = useState<CitationRefNode | null>(paper.citations[0] || null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [simNodes, setSimNodes] = useState<EgoSimNode[]>([]);
  const [zoom, setZoom] = useState(1);

  const W = 880;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2;

  useEffect(() => {
    setSelected(paper.citations[0] || null);
    const refs = paper.citations.filter((c) => c.relation === 'references');
    const citedBy = paper.citations.filter((c) => c.relation !== 'references');

    const initNodes: EgoSimNode[] = [
      {
        id: 'focal',
        kind: 'focal',
        label: cut(paper.titleZh || paper.title, 18),
        sub: `${paper.journalShort} · ${paper.publishedDate.slice(0, 4)}`,
        r: 34,
        x: cx,
        y: cy,
        fx: cx,
        fy: cy,
        targetX: cx,
        targetY: cy,
      },
    ];

    refs.forEach((r, idx) => {
      const inLib = libraryPapers.some((lp) => matchesPaper(r, lp));
      const angle = ((idx + 0.5) / Math.max(refs.length, 1) - 0.5) * Math.PI * 0.72 + Math.PI;
      const tx = cx + Math.cos(angle) * 265;
      const ty = cy + Math.sin(angle) * 155;
      initNodes.push({
        id: r.id,
        kind: inLib ? 'in_lib' : 'ref',
        label: cut(r.title, 20),
        sub: `${r.year || '文献'} · 引${r.citedByCount ?? 0}`,
        r: 22,
        refData: r,
        x: tx,
        y: ty,
        targetX: tx,
        targetY: ty,
      });
    });

    citedBy.forEach((c, idx) => {
      const inLib = libraryPapers.some((lp) => matchesPaper(c, lp));
      const angle = ((idx + 0.5) / Math.max(citedBy.length, 1) - 0.5) * Math.PI * 0.72;
      const tx = cx + Math.cos(angle) * 265;
      const ty = cy + Math.sin(angle) * 155;
      initNodes.push({
        id: c.id,
        kind: inLib ? 'in_lib' : 'cited',
        label: cut(c.title, 20),
        sub: `${c.year || '文献'} · 引${c.citedByCount ?? 0}`,
        r: 22,
        refData: c,
        x: tx,
        y: ty,
        targetX: tx,
        targetY: ty,
      });
    });

    const sim = forceSimulation<EgoSimNode>(initNodes)
      .force('charge', forceManyBody().strength(-220))
      .force('collide', forceCollide<EgoSimNode>().radius((d) => d.r + 22))
      .force('x', forceX<EgoSimNode>((d) => d.targetX).strength(0.55))
      .force('y', forceY<EgoSimNode>((d) => d.targetY).strength(0.55))
      .stop();

    for (let i = 0; i < 90; i++) sim.tick();
    setSimNodes([...initNodes]);
  }, [paper, libraryPapers, cx, cy]);

  const importNode = async (n: CitationRefNode) => {
    setImportingId(n.id);
    try {
      await onImportReference(n.doi || n.id || n.title);
    } finally {
      setImportingId(null);
    }
  };

  const matched = selected ? libraryPapers.find((p) => matchesPaper(selected, p)) : undefined;
  const focalNode = simNodes.find((n) => n.kind === 'focal');

  if (paper.citations.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div
        className={`relative overflow-hidden rounded-2xl border lg:col-span-8 ${
          darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50/80'
        }`}
      >
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
          <span className="flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-400">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> 上游参考文献
          </span>
          <span className="flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-400">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> 下游施引论文
          </span>
          <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> 已在文献池
          </span>
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 p-1 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
          <button type="button" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-[390px] w-full">
          <defs>
            <marker id="ego-arrow-ref" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#0F766E" />
            </marker>
            <marker id="ego-arrow-cite" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#4F46E5" />
            </marker>
          </defs>

          <g transform={`translate(${cx * (1 - zoom)}, ${cy * (1 - zoom)}) scale(${zoom})`}>
            {/* Curved Knowledge Graph Edges */}
            {focalNode &&
              simNodes
                .filter((n) => n.kind !== 'focal')
                .map((n) => {
                  const isRef = n.refData?.relation === 'references';
                  const isSel = selected?.id === n.id;
                  const sx = isRef ? (n.x ?? 0) : (focalNode.x ?? cx);
                  const sy = isRef ? (n.y ?? 0) : (focalNode.y ?? cy);
                  const tx = isRef ? (focalNode.x ?? cx) : (n.x ?? 0);
                  const ty = isRef ? (focalNode.y ?? cy) : (n.y ?? 0);
                  const dx = tx - sx;
                  const dy = ty - sy;
                  const dist = Math.max(1, Math.hypot(dx, dy));
                  const padStart = isRef ? n.r + 4 : focalNode.r + 4;
                  const padEnd = isRef ? focalNode.r + 10 : n.r + 10;
                  const x1 = sx + (dx / dist) * padStart;
                  const y1 = sy + (dy / dist) * padStart;
                  const x2 = tx - (dx / dist) * padEnd;
                  const y2 = ty - (dy / dist) * padEnd;
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2 - 16;

                  return (
                    <g key={`e-${n.id}`}>
                      <path
                        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                        fill="none"
                        stroke={isRef ? '#0F766E' : '#4F46E5'}
                        strokeWidth={isSel ? 2.6 : 1.5}
                        strokeOpacity={isSel ? 0.95 : 0.45}
                        markerEnd={isRef ? 'url(#ego-arrow-ref)' : 'url(#ego-arrow-cite)'}
                      />
                      <text
                        x={mx}
                        y={my - 3}
                        textAnchor="middle"
                        className="fill-slate-400 text-[10px]"
                      >
                        {isRef ? '参考基础' : '后续施引'}
                      </text>
                    </g>
                  );
                })}

            {/* Nodes */}
            {simNodes.map((n) => {
              const nx = n.x ?? cx;
              const ny = n.y ?? cy;
              const isSel = selected?.id === n.id;
              const fill =
                n.kind === 'focal'
                  ? '#312E81'
                  : n.kind === 'in_lib'
                    ? '#059669'
                    : n.kind === 'ref'
                      ? '#0F766E'
                      : '#4F46E5';

              return (
                <g
                  key={n.id}
                  className={n.kind === 'focal' ? '' : 'cursor-pointer'}
                  onClick={() => n.refData && setSelected(n.refData)}
                >
                  {isSel && (
                    <circle
                      cx={nx}
                      cy={ny}
                      r={n.r + 7}
                      fill="none"
                      stroke={fill}
                      strokeWidth={2.5}
                      strokeOpacity={0.45}
                    />
                  )}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={n.r}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                  />
                  <text
                    x={nx}
                    y={ny + 4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    className="text-[10px] font-semibold"
                  >
                    {n.kind === 'focal' ? paper.journalShort.slice(0, 6) : (n.refData?.year || '文献')}
                  </text>
                  <text
                    x={nx}
                    y={ny + n.r + 14}
                    textAnchor="middle"
                    className="fill-slate-800 text-xs font-medium dark:fill-slate-200"
                  >
                    {n.label}
                  </text>
                  <text
                    x={nx}
                    y={ny + n.r + 27}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] dark:fill-slate-400"
                  >
                    {n.sub}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className={`rounded-2xl border p-4 lg:col-span-4 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
        {selected && (
          <div>
            <span
              className={`inline-block rounded-md px-2.5 py-0.5 text-sm font-medium ${
                selected.relation === 'references' ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              {selected.relation === 'references' ? '上游参考文献' : '下游施引论文'}
            </span>
            <h4 className="mt-2.5 text-base font-semibold leading-snug text-slate-900 dark:text-white">{selected.title}</h4>
            <div className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
              <div>来源：{selected.venue}</div>
              <div>
                年份：{selected.year || '—'} · 被引 {selected.citedByCount ?? 0}
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
                <button
                  type="button"
                  onClick={() => onOpenPaper(matched)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  已在文献池，打开精读 <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={importingId === selected.id}
                  onClick={() => void importNode(selected)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {importingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                  抓取并加入文献库
                </button>
              )}
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <ExternalLink className="h-4 w-4" />
                  查看原文链接
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. Interactive d3-force Knowledge Graph & Citation Network Renderer
 * ============================================================================ */
interface GlobalProps {
  papers: AcademicPaper[];
  darkMode: boolean;
  onSelectPaper: (paper: AcademicPaper) => void;
  onImportReference: (identifier: string) => Promise<void>;
}

type GraphMode = 'knowledge_graph' | 'citation_network';

interface KGNode extends SimulationNodeDatum {
  id: string;
  nodeType: 'paper' | 'topic' | 'institution' | 'external_ref';
  label: string;
  subLabel?: string;
  color: string;
  r: number;
  paper?: AcademicPaper;
  extRef?: CitationRefNode;
}

interface KGEdge extends SimulationLinkDatum<KGNode> {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  dashed?: boolean;
}

export const GlobalCitationGraph: React.FC<GlobalProps> = ({
  papers,
  darkMode,
  onSelectPaper,
  onImportReference,
}) => {
  const [graphMode, setGraphMode] = useState<GraphMode>('knowledge_graph');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>(papers[0]?.id || '');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  // Viewport transform (pan & zoom)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [simTick, setSimTick] = useState(0);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<KGNode>> | null>(null);
  const nodesRef = useRef<KGNode[]>([]);
  const edgesRef = useRef<KGEdge[]>([]);

  // Dragging state (node drag vs canvas pan)
  const dragState = useRef<{
    mode: 'none' | 'node' | 'pan';
    node?: KGNode;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({ mode: 'none', startX: 0, startY: 0, origPanX: 0, origPanY: 0 });

  const W = 1080;
  const H = 640;

  const buildGraph = useMemo(() => {
    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];
    const nodeMap = new Map<string, KGNode>();

    // 1. Add all Paper nodes
    for (const p of papers) {
      const r = Math.min(26, 14 + Math.floor(Math.log10((p.citedByCount || 1) + 1) * 4));
      const n: KGNode = {
        id: p.id,
        nodeType: 'paper',
        label: `${p.journalShort} ${p.publishedDate.slice(0, 4)}`,
        subLabel: cut(p.titleZh || p.title, 14),
        color: DOMAIN_META[p.domain].color,
        r,
        paper: p,
      };
      nodes.push(n);
      nodeMap.set(p.id, n);
    }

    // 2. Direct Citation Edges between library papers
    for (let i = 0; i < papers.length; i++) {
      for (let j = 0; j < papers.length; j++) {
        if (i === j) continue;
        const A = papers[i];
        const B = papers[j];
        const bCitesA = B.citations.some((c) => c.relation === 'references' && matchesPaper(c, A));
        const aCitedByB = A.citations.some((c) => c.relation === 'cited_by' && matchesPaper(c, B));
        if (bCitesA || aCitedByB) {
          const eid = `cite-${A.id}-${B.id}`;
          if (!edges.some((e) => e.id === eid)) {
            edges.push({
              id: eid,
              source: A.id,
              target: B.id,
              sourceId: A.id,
              targetId: B.id,
              relation: '施引演进',
            });
          }
        }
      }
    }

    if (graphMode === 'knowledge_graph') {
      // Add Research Topic Hub Entities
      const topicKeys = Object.keys(TOPIC_META) as Array<keyof typeof TOPIC_META>;
      topicKeys.forEach((tk, idx) => {
        const angle = (idx / topicKeys.length) * Math.PI * 2;
        const tid = `topic-${tk}`;
        const tn: KGNode = {
          id: tid,
          nodeType: 'topic',
          label: TOPIC_META[tk].label,
          color: '#4338CA',
          r: 28,
          x: W / 2 + Math.cos(angle) * 180,
          y: H / 2 + Math.sin(angle) * 150,
        };
        nodes.push(tn);
        nodeMap.set(tid, tn);
      });

      // Connect Papers -> Topics & Top Shared Institutions
      const instCounts = new Map<string, string[]>();
      for (const p of papers) {
        for (const t of p.topics) {
          const tid = `topic-${t}`;
          if (nodeMap.has(tid)) {
            edges.push({
              id: `pt-${p.id}-${tid}`,
              source: p.id,
              target: tid,
              sourceId: p.id,
              targetId: tid,
              relation: '研究方向',
            });
          }
        }
        for (const aff of (p.affiliations || []).slice(0, 2)) {
          const shortAff = aff.replace(/^The\s+/i, '').trim();
          if (!shortAff) continue;
          const list = instCounts.get(shortAff) || [];
          list.push(p.id);
          instCounts.set(shortAff, list);
        }
      }

      // Add Institution Hubs that appear >= 2 times (or top 8 institutions)
      const topInsts = Array.from(instCounts.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8);
      for (const [instName, pids] of topInsts) {
        const iid = `inst-${instName}`;
        const inNode: KGNode = {
          id: iid,
          nodeType: 'institution',
          label: cut(instName, 16),
          color: '#D97706',
          r: 20,
        };
        nodes.push(inNode);
        nodeMap.set(iid, inNode);
        for (const pid of pids) {
          edges.push({
            id: `pi-${pid}-${iid}`,
            source: pid,
            target: iid,
            sourceId: pid,
            targetId: iid,
            relation: '作者机构',
            dashed: true,
          });
        }
      }
    } else {
      // Citation Network Mode: include shared external references + selected paper's external references
      const extMap = new Map<string, { ref: CitationRefNode; linkedPapers: Array<{ pid: string; rel: string }> }>();
      for (const p of papers) {
        for (const c of p.citations) {
          if (papers.some((lp) => matchesPaper(c, lp))) continue;
          const key = (c.doi || c.id || c.title).toLowerCase();
          const cur = extMap.get(key) || { ref: c, linkedPapers: [] };
          cur.linkedPapers.push({ pid: p.id, rel: c.relation === 'references' ? '引用' : '被引' });
          extMap.set(key, cur);
        }
      }

      for (const [key, val] of extMap.entries()) {
        // Show shared external works (cited by >=2 library papers) OR linked to currently selected paper
        const isSelectedNeighbor = val.linkedPapers.some((lp) => lp.pid === selectedNodeId);
        if (val.linkedPapers.length >= 2 || (isSelectedNeighbor && nodes.length < 62)) {
          const eid = `ext-${key}`;
          nodes.push({
            id: eid,
            nodeType: 'external_ref',
            label: `${val.ref.year || '引文'}`,
            subLabel: cut(val.ref.title, 15),
            color: '#64748B',
            r: 13,
            extRef: val.ref,
          });
          for (const lp of val.linkedPapers) {
            edges.push({
              id: `exte-${eid}-${lp.pid}`,
              source: lp.rel === '引用' ? eid : lp.pid,
              target: lp.rel === '引用' ? lp.pid : eid,
              sourceId: lp.rel === '引用' ? eid : lp.pid,
              targetId: lp.rel === '引用' ? lp.pid : eid,
              relation: lp.rel,
              dashed: true,
            });
          }
        }
      }
    }

    return { nodes, edges };
  }, [papers, graphMode, selectedNodeId]);

  const restartSimulation = () => {
    simRef.current?.stop();
    const clonedNodes = buildGraph.nodes.map((n) => ({
      ...n,
      x: n.x ?? W / 2 + (Math.random() - 0.5) * 320,
      y: n.y ?? H / 2 + (Math.random() - 0.5) * 260,
    }));
    const clonedEdges = buildGraph.edges.map((e) => ({ ...e }));

    nodesRef.current = clonedNodes;
    edgesRef.current = clonedEdges;

    const sim = forceSimulation<KGNode>(clonedNodes)
      .force(
        'link',
        forceLink<KGNode, KGEdge>(clonedEdges)
          .id((d) => d.id)
          .distance((l) => (l.dashed ? 95 : graphMode === 'knowledge_graph' ? 115 : 130))
          .strength((l) => (l.dashed ? 0.35 : 0.6))
      )
      .force('charge', forceManyBody<KGNode>().strength((d) => (d.nodeType === 'topic' ? -520 : -290)))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide<KGNode>().radius((d) => d.r + 22).iterations(2))
      .force('x', forceX(W / 2).strength(0.05))
      .force('y', forceY(H / 2).strength(0.06))
      .alphaDecay(0.035)
      .on('tick', () => {
        setSimTick((t) => (t + 1) % 100000);
      });

    simRef.current = sim;
  };

  useEffect(() => {
    restartSimulation();
    return () => {
      simRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildGraph]);

  // Pointer drag & pan handlers
  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return {
      x: (sx - transform.x) / transform.k,
      y: (sy - transform.y) / transform.k,
    };
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: KGNode) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = svgPoint(e.clientX, e.clientY);
    node.fx = pt.x;
    node.fy = pt.y;
    dragState.current = {
      mode: 'node',
      node,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: transform.x,
      origPanY: transform.y,
    };
    simRef.current?.alphaTarget(0.25).restart();
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    dragState.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origPanX: transform.x,
      origPanY: transform.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (st.mode === 'node' && st.node) {
      const pt = svgPoint(e.clientX, e.clientY);
      st.node.fx = pt.x;
      st.node.fy = pt.y;
    } else if (st.mode === 'pan') {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - st.startX) / rect.width) * W;
      const dy = ((e.clientY - st.startY) / rect.height) * H;
      setTransform((prev) => ({ ...prev, x: st.origPanX + dx, y: st.origPanY + dy }));
    }
  };

  const handlePointerUp = () => {
    const st = dragState.current;
    if (st.mode === 'node' && st.node) {
      st.node.fx = null;
      st.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    dragState.current.mode = 'none';
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform((prev) => {
      const nextK = Math.min(2.6, Math.max(0.45, prev.k * factor));
      return {
        k: nextK,
        x: W / 2 - ((W / 2 - prev.x) / prev.k) * nextK,
        y: H / 2 - ((H / 2 - prev.y) / prev.k) * nextK,
      };
    });
  };

  // Connected 1-hop neighbor set for focus highlighting
  const focusId = hoveredNodeId || selectedNodeId;
  const neighborIds = useMemo(() => {
    const set = new Set<string>();
    if (!focusId) return set;
    set.add(focusId);
    for (const e of edgesRef.current) {
      if (e.sourceId === focusId) set.add(e.targetId);
      if (e.targetId === focusId) set.add(e.sourceId);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, simTick]);

  // Search highlight
  const matchedSearchIds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return null;
    const s = new Set<string>();
    for (const n of nodesRef.current) {
      const hay = `${n.label} ${n.subLabel || ''} ${n.paper?.title || ''} ${n.paper?.titleZh || ''} ${(n.paper?.affiliations || []).join(' ')}`.toLowerCase();
      if (hay.includes(q)) s.add(n.id);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, simTick]);

  const selectedNode = nodesRef.current.find((n) => n.id === selectedNodeId) || nodesRef.current[0];

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-6 ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      {/* Top Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Network className="h-5 w-5 text-indigo-600" />
            <span>交互式文献知识图谱</span>
          </div>
          <div className={`flex rounded-xl border p-1 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-100'}`}>
            <button
              type="button"
              onClick={() => setGraphMode('knowledge_graph')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                graphMode === 'knowledge_graph'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              文献—方向—机构知识图谱
            </button>
            <button
              type="button"
              onClick={() => setGraphMode('citation_network')}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                graphMode === 'citation_network'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              文献引用演进网络
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="图谱内定位文献 / 机构 / 方向"
              className={`w-full rounded-xl border py-1.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 ${
                darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50'
              }`}
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            <button
              type="button"
              title="放大"
              onClick={() => setTransform((p) => ({ ...p, k: Math.min(2.6, p.k * 1.2) }))}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="缩小"
              onClick={() => setTransform((p) => ({ ...p, k: Math.max(0.45, p.k * 0.82) }))}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="居中复位"
              onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="重新计算力导向布局"
              onClick={restartSimulation}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#0F766E]" /> 智能制造文献
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#4F46E5]" /> 计算机文献
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#64748B]" /> 交叉学科文献
        </span>
        {graphMode === 'knowledge_graph' ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#4338CA]" /> 研究方向枢纽
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rotate-45 bg-[#D97706]" /> 高频作者机构
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-slate-500 bg-white" /> 关联外部引文
          </span>
        )}
        <span className="ml-auto text-slate-400">支持鼠标滚轮缩放、画布平移与拖拽任意节点</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Interactive Force Canvas */}
        <div
          className={`overflow-hidden rounded-2xl border lg:col-span-9 ${
            darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-[#F8FAFC]'
          }`}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            className="h-[460px] w-full cursor-grab select-none active:cursor-grabbing sm:h-[600px]"
            style={{ touchAction: 'none' }}
          >
            <defs>
              <pattern id="kg-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill={darkMode ? '#1E293B' : '#E2E8F0'} />
              </pattern>
              <marker id="kg-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#6366F1" />
              </marker>
            </defs>

            <rect width={W} height={H} fill="url(#kg-grid)" />

            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
              {/* Edges */}
              {edgesRef.current.map((e) => {
                const src = e.source as KGNode;
                const tgt = e.target as KGNode;
                if (src.x === undefined || tgt.x === undefined || src.y === undefined || tgt.y === undefined) {
                  return null;
                }
                const isFocused = focusId ? e.sourceId === focusId || e.targetId === focusId : true;
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const x1 = src.x + (dx / dist) * (src.r + 2);
                const y1 = src.y + (dy / dist) * (src.r + 2);
                const x2 = tgt.x - (dx / dist) * (tgt.r + 7);
                const y2 = tgt.y - (dy / dist) * (tgt.r + 7);
                const cxMid = (x1 + x2) / 2 - (dy / dist) * 14;
                const cyMid = (y1 + y2) / 2 + (dx / dist) * 14;

                return (
                  <g key={e.id}>
                    <path
                      d={`M ${x1} ${y1} Q ${cxMid} ${cyMid} ${x2} ${y2}`}
                      fill="none"
                      stroke={e.relation === '施引演进' ? '#4F46E5' : e.relation === '作者机构' ? '#D97706' : '#94A3B8'}
                      strokeWidth={isFocused && focusId ? 2.2 : 1.1}
                      strokeDasharray={e.dashed ? '4 3' : undefined}
                      strokeOpacity={focusId ? (isFocused ? 0.88 : 0.12) : 0.45}
                      markerEnd={e.relation === '施引演进' || e.relation === '引用' ? 'url(#kg-arrow)' : undefined}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {nodesRef.current.map((n) => {
                const nx = n.x ?? W / 2;
                const ny = n.y ?? H / 2;
                const isSel = selectedNodeId === n.id;
                const isNeighbor = neighborIds.has(n.id);
                const matchesSearch = matchedSearchIds ? matchedSearchIds.has(n.id) : true;
                const dimmed = (focusId && !isNeighbor) || (matchedSearchIds && !matchesSearch);

                return (
                  <g
                    key={n.id}
                    transform={`translate(${nx}, ${ny})`}
                    style={{ opacity: dimmed ? 0.22 : 1, transition: 'opacity 150ms' }}
                    className="cursor-pointer"
                    onPointerDown={(e) => handleNodePointerDown(e, n)}
                    onMouseEnter={() => setHoveredNodeId(n.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(n.id);
                    }}
                  >
                    {(isSel || (matchedSearchIds && matchesSearch)) && (
                      <circle r={n.r + 8} fill="none" stroke="#4F46E5" strokeWidth={2.5} strokeOpacity={0.55} />
                    )}

                    {n.nodeType === 'topic' ? (
                      <rect
                        x={-n.r * 1.75}
                        y={-16}
                        width={n.r * 3.5}
                        height={32}
                        rx={16}
                        fill="#4338CA"
                        stroke="#FFFFFF"
                        strokeWidth={2.5}
                      />
                    ) : n.nodeType === 'institution' ? (
                      <rect
                        x={-16}
                        y={-16}
                        width={32}
                        height={32}
                        rx={6}
                        transform="rotate(45)"
                        fill="#D97706"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    ) : n.nodeType === 'external_ref' ? (
                      <circle
                        r={n.r}
                        fill={darkMode ? '#0F172A' : '#FFFFFF'}
                        stroke="#64748B"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                      />
                    ) : (
                      <circle r={n.r} fill={n.color} stroke="#FFFFFF" strokeWidth={2.5} />
                    )}

                    {/* Inside-node text for topics or paper short year */}
                    {n.nodeType === 'topic' ? (
                      <text y={4} textAnchor="middle" fill="#FFFFFF" className="text-xs font-semibold">
                        {n.label}
                      </text>
                    ) : n.nodeType === 'paper' ? (
                      <text y={3.5} textAnchor="middle" fill="#FFFFFF" className="text-[9.5px] font-semibold">
                        {n.paper?.journalShort.slice(0, 5)}
                      </text>
                    ) : n.nodeType === 'external_ref' ? (
                      <text y={3.5} textAnchor="middle" className="fill-slate-600 text-[9px] dark:fill-slate-300">
                        {n.label}
                      </text>
                    ) : null}

                    {/* Below-node label */}
                    {n.nodeType !== 'topic' && (
                      <text
                        y={n.r + 14}
                        textAnchor="middle"
                        className="fill-slate-800 text-[11px] font-medium dark:fill-slate-200"
                      >
                        {n.nodeType === 'institution' ? n.label : n.subLabel || n.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Right Entity Inspector Panel */}
        <div
          className={`flex flex-col justify-between rounded-2xl border p-5 lg:col-span-3 ${
            darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-slate-50/70'
          }`}
        >
          {selectedNode?.nodeType === 'paper' && selectedNode.paper ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span className="rounded bg-indigo-600 px-2 py-0.5 font-medium text-white">
                  {selectedNode.paper.journalShort}
                </span>
                <span>{selectedNode.paper.publishedDate}</span>
                <span>· 被引 {selectedNode.paper.citedByCount}</span>
              </div>

              <h3 className="mt-3 text-base font-semibold leading-snug text-slate-900 dark:text-white">
                {selectedNode.paper.title}
              </h3>
              {selectedNode.paper.titleZh !== selectedNode.paper.title && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedNode.paper.titleZh}</p>
              )}

              {(selectedNode.paper.affiliations || []).length > 0 && (
                <div className="mt-2.5 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{selectedNode.paper.affiliations.join('；')}</span>
                </div>
              )}

              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {selectedNode.paper.digestSummary}
              </p>

              {selectedNode.paper.doi && resolveDoiUrl(selectedNode.paper.doi, selectedNode.paper.url) && (
                <div className="mt-3 text-sm">
                  <a
                    href={resolveDoiUrl(selectedNode.paper.doi, selectedNode.paper.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    DOI: {selectedNode.paper.doi}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPaper(selectedNode.paper!)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  精读全文解析
                </button>
                {resolvePaperOriginalUrl(selectedNode.paper) && (
                  <a
                    href={resolvePaperOriginalUrl(selectedNode.paper)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                    查看原文
                  </a>
                )}
              </div>
            </div>
          ) : selectedNode?.nodeType === 'external_ref' && selectedNode.extRef ? (
            <div>
              <span className="rounded-md bg-slate-200 px-2 py-0.5 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                外部关联引文
              </span>
              <h3 className="mt-2.5 text-base font-semibold leading-snug">{selectedNode.extRef.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {selectedNode.extRef.venue} · {selectedNode.extRef.year} · 被引 {selectedNode.extRef.citedByCount ?? 0}
              </p>
              {selectedNode.extRef.doi && (
                <a
                  href={resolveDoiUrl(selectedNode.extRef.doi, selectedNode.extRef.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                >
                  DOI: {selectedNode.extRef.doi} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                disabled={importingId === selectedNode.extRef.id}
                onClick={async () => {
                  const ref = selectedNode.extRef!;
                  setImportingId(ref.id);
                  try {
                    await onImportReference(ref.doi || ref.id || ref.title);
                  } finally {
                    setImportingId(null);
                  }
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {importingId === selectedNode.extRef.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                抓取并加入文献池
              </button>
            </div>
          ) : selectedNode ? (
            <div>
              <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {selectedNode.nodeType === 'topic' ? '研究方向枢纽实体' : '作者单位 / 机构实体'}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{selectedNode.label}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                当前图谱中共连接了 {neighborIds.size - 1} 篇相关文献节点。点击左侧任意相连文献圆点可查看文献详情与原文链接。
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
