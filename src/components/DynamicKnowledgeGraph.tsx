import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { Download, Maximize2, Pause, Play, RefreshCw, Search, ZoomIn, ZoomOut } from 'lucide-react';

export interface KnowledgeGraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  subLabel?: string;
  group: string;
  color: string;
  radius: number;
  shape?: 'circle' | 'hex' | 'diamond' | 'pill';
  badge?: string;
  pinned?: boolean;
  targetX?: number;
  targetY?: number;
  meta?: Record<string, unknown>;
}

export interface KnowledgeGraphLink extends SimulationLinkDatum<KnowledgeGraphNode> {
  id: string;
  source: string | KnowledgeGraphNode;
  target: string | KnowledgeGraphNode;
  weight?: number;
  label?: string;
  color?: string;
  dashed?: boolean;
  animated?: boolean;
}

export interface GraphLegendItem {
  group: string;
  label: string;
  color: string;
  shape?: 'circle' | 'hex' | 'diamond' | 'pill';
}

interface DynamicKnowledgeGraphProps {
  title: string;
  subtitle?: string;
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
  legend: GraphLegendItem[];
  darkMode: boolean;
  height?: number;
  exportFilename?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (node: KnowledgeGraphNode | null) => void;
  onDoubleClickNode?: (node: KnowledgeGraphNode) => void;
  renderInspector?: (node: KnowledgeGraphNode | null) => React.ReactNode;
  topControls?: React.ReactNode;
}

function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

function diamondPoints(r: number): string {
  return `0,${-r} ${r},0 0,${r} ${-r},0`;
}

export const DynamicKnowledgeGraph: React.FC<DynamicKnowledgeGraphProps> = ({
  title,
  subtitle,
  nodes,
  links,
  legend,
  darkMode,
  height = 540,
  exportFilename = 'paperpulse-knowledge-graph',
  selectedNodeId,
  onSelectNode,
  onDoubleClickNode,
  renderInspector,
  topControls,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<KnowledgeGraphNode, KnowledgeGraphLink> | null>(null);
  const [simNodes, setSimNodes] = useState<KnowledgeGraphNode[]>([]);
  const [simLinks, setSimLinks] = useState<KnowledgeGraphLink[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [physicsRunning, setPhysicsRunning] = useState(true);

  // Pan & zoom transform
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragNodeRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const W = 980;
  const H = height;
  const activeSelectedId = selectedNodeId !== undefined ? selectedNodeId : internalSelectedId;

  // Build & run live d3-force simulation whenever input topology changes
  useEffect(() => {
    const clonedNodes: KnowledgeGraphNode[] = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const spread = 150 + (i % 4) * 42;
      return {
        ...n,
        x: n.x ?? n.targetX ?? W / 2 + Math.cos(angle) * spread,
        y: n.y ?? n.targetY ?? H / 2 + Math.sin(angle) * spread * 0.72,
        fx: n.pinned ? (n.targetX ?? W / 2) : n.fx,
        fy: n.pinned ? (n.targetY ?? H / 2) : n.fy,
      };
    });
    const nodeMap = new Map(clonedNodes.map((n) => [n.id, n]));
    const clonedLinks: KnowledgeGraphLink[] = links
      .filter((l) => {
        const sid = typeof l.source === 'string' ? l.source : l.source.id;
        const tid = typeof l.target === 'string' ? l.target : l.target.id;
        return nodeMap.has(sid) && nodeMap.has(tid);
      })
      .map((l) => ({ ...l }));

    const hasTargets = clonedNodes.some((n) => n.targetX !== undefined);
    const sim = forceSimulation<KnowledgeGraphNode>(clonedNodes)
      .force(
        'link',
        forceLink<KnowledgeGraphNode, KnowledgeGraphLink>(clonedLinks)
          .id((d) => d.id)
          .distance((l) => Math.max(76, 138 - Math.min((l.weight || 1) * 10, 52)))
          .strength((l) => Math.min(0.85, 0.25 + (l.weight || 1) * 0.08))
      )
      .force('charge', forceManyBody<KnowledgeGraphNode>().strength(-340))
      .force('center', forceCenter(W / 2, H / 2).strength(0.08))
      .force('collide', forceCollide<KnowledgeGraphNode>((d) => d.radius + 18).iterations(3))
      .force(
        'x',
        forceX<KnowledgeGraphNode>((d) => d.targetX ?? W / 2).strength(hasTargets ? 0.22 : 0.05)
      )
      .force(
        'y',
        forceY<KnowledgeGraphNode>((d) => d.targetY ?? H / 2).strength(hasTargets ? 0.22 : 0.08)
      )
      .alphaDecay(0.028);

    // Pre-warm slightly so initial layout opens gracefully while still gently settling alive
    for (let i = 0; i < 45; i++) sim.tick();
    setSimNodes([...clonedNodes]);
    setSimLinks([...clonedLinks]);

    let frame = 0;
    sim.on('tick', () => {
      frame++;
      if (frame % 2 === 0 || sim.alpha() < 0.04) {
        setSimNodes([...clonedNodes]);
        setSimLinks([...clonedLinks]);
      }
    });

    simRef.current = sim;
    setPhysicsRunning(true);

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [nodes, links, H]);

  // Adjacency lookup for 1-hop ego highlighting
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of simLinks) {
      const sid = typeof l.source === 'string' ? l.source : l.source.id;
      const tid = typeof l.target === 'string' ? l.target : l.target.id;
      if (!map.has(sid)) map.set(sid, new Set());
      if (!map.has(tid)) map.set(tid, new Set());
      map.get(sid)!.add(tid);
      map.get(tid)!.add(sid);
    }
    return map;
  }, [simLinks]);

  const searchMatches = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      simNodes
        .filter((n) => `${n.label} ${n.subLabel || ''}`.toLowerCase().includes(q))
        .map((n) => n.id)
    );
  }, [simNodes, searchText]);

  const focusId = hoveredId || activeSelectedId;
  const focusNeighbors = useMemo(() => (focusId ? adjacency.get(focusId) || new Set<string>() : null), [focusId, adjacency]);

  const selectedNode = useMemo(
    () => simNodes.find((n) => n.id === activeSelectedId) || null,
    [simNodes, activeSelectedId]
  );

  const clientToSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: W / 2, y: H / 2 };
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      const sy = ((clientY - rect.top) / rect.height) * H;
      return {
        x: (sx - pan.x - W / 2) / zoom + W / 2,
        y: (sy - pan.y - H / 2) / zoom + H / 2,
      };
    },
    [pan, zoom, H]
  );

  const handleNodePointerDown = (e: React.PointerEvent, node: KnowledgeGraphNode) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragNodeRef.current = { id: node.id, moved: false };
    node.fx = node.x;
    node.fy = node.y;
    simRef.current?.alphaTarget(0.28).restart();
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragNodeRef.current) {
      const dragId = dragNodeRef.current.id;
      const target = simNodes.find((n) => n.id === dragId);
      if (target) {
        const pt = clientToSvgPoint(e.clientX, e.clientY);
        target.fx = pt.x;
        target.fy = pt.y;
        dragNodeRef.current.moved = true;
      }
      return;
    }
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan({ x: panDragRef.current.origX + dx, y: panDragRef.current.origY + dy });
    }
  };

  const handleSvgPointerUp = () => {
    if (dragNodeRef.current) {
      const dragId = dragNodeRef.current.id;
      const target = simNodes.find((n) => n.id === dragId);
      if (target && !target.pinned) {
        target.fx = null;
        target.fy = null;
      }
      simRef.current?.alphaTarget(0);
      dragNodeRef.current = null;
    }
    panDragRef.current = null;
  };

  const handleSvgWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    setZoom((z) => Math.max(0.45, Math.min(2.6, Number((z * (e.deltaY > 0 ? 0.92 : 1.09)).toFixed(2)))));
  };

  const handleReheat = () => {
    simNodes.forEach((n) => {
      if (!n.pinned) {
        n.fx = null;
        n.fy = null;
      }
    });
    simRef.current?.alpha(0.75).restart();
    setPhysicsRunning(true);
  };

  const handleTogglePhysics = () => {
    if (!simRef.current) return;
    if (physicsRunning) {
      simRef.current.stop();
      setPhysicsRunning(false);
    } else {
      simRef.current.alpha(0.35).restart();
      setPhysicsRunning(true);
    }
  };

  const handleExportSvg = () => {
    const el = svgRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const bgMain = darkMode ? '#090f1d' : '#fbfcfe';
  const gridDot = darkMode ? '#1e293b' : '#dce4f0';
  const textInk = darkMode ? '#e2e8f0' : '#0f172a';

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-sm'
      }`}
    >
      {/* Top Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${
          darkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {topControls}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="定位节点…"
              className={`w-36 rounded-lg border py-1 pl-7 pr-2 text-xs outline-none focus:border-[#0072BD] ${
                darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-800'
              }`}
            />
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" title="放大" onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.18).toFixed(2))))} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="缩小" onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.18).toFixed(2))))} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="重置视角" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" title={physicsRunning ? '暂停力导向模拟' : '恢复力导向模拟'} onClick={handleTogglePhysics} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              {physicsRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button type="button" title="重新释放力导向布局" onClick={handleReheat} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="导出高清 SVG 图谱" onClick={handleExportSvg} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          {legend.map((item) => (
            <span key={item.group} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className={`inline-block h-2.5 w-2.5 ${
                  item.shape === 'diamond' ? 'rotate-45 rounded-[1px]' : item.shape === 'pill' ? 'w-4 rounded-full' : 'rounded-full'
                }`}
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          节点 {simNodes.length} · 关系边 {simLinks.length} · 支持拖拽节点 / 拖动画布 / 悬停聚焦邻域
        </span>
      </div>

      {/* Canvas + Optional Side Inspector */}
      <div className={renderInspector ? 'grid grid-cols-1 lg:grid-cols-12' : ''}>
        <div className={renderInspector ? 'relative lg:col-span-8' : 'relative'}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full cursor-grab select-none active:cursor-grabbing"
            style={{ height: `${height}px` }}
            onWheel={handleSvgWheel}
            onPointerDown={(e) => {
              panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
            }}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerUp}
            role="img"
            aria-label={title}
          >
            <defs>
              <pattern id={`kg-dots-${exportFilename}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="1.05" fill={gridDot} />
              </pattern>
              <filter id={`kg-glow-${exportFilename}`} x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x={0} y={0} width={W} height={H} fill={bgMain} />
            <rect x={0} y={0} width={W} height={H} fill={`url(#kg-dots-${exportFilename})`} />

            <g transform={`translate(${W / 2 + pan.x}, ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2}, ${-H / 2})`}>
              {/* Curved Force-Directed Edges */}
              {simLinks.map((l) => {
                const s = l.source as KnowledgeGraphNode;
                const t = l.target as KnowledgeGraphNode;
                if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) return null;
                const isFocusEdge =
                  !focusId || s.id === focusId || t.id === focusId;
                const mx = (s.x + t.x) / 2;
                const my = (s.y + t.y) / 2;
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const curveOffset = Math.min(28, Math.hypot(dx, dy) * 0.08);
                const cx = mx - (dy / (Math.hypot(dx, dy) || 1)) * curveOffset;
                const cy = my + (dx / (Math.hypot(dx, dy) || 1)) * curveOffset;
                const baseStroke = l.color || (darkMode ? '#475569' : '#94a3b8');
                const strokeW = Math.min(4.8, 1 + (l.weight || 1) * 0.55);

                return (
                  <g key={l.id} opacity={isFocusEdge ? (focusId ? 0.92 : 0.45) : 0.08}>
                    <path
                      d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
                      fill="none"
                      stroke={isFocusEdge && focusId ? (l.color || '#0072BD') : baseStroke}
                      strokeWidth={isFocusEdge && focusId ? strokeW + 0.7 : strokeW}
                      strokeDasharray={l.dashed ? '5 4' : undefined}
                    >
                      {l.animated && (
                        <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.4s" repeatCount="indefinite" />
                      )}
                    </path>
                    {l.label && isFocusEdge && focusId && (
                      <text
                        x={cx}
                        y={cy - 3}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        fill={darkMode ? '#cbd5e1' : '#334155'}
                      >
                        {l.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Interactive Draggable Nodes */}
              {simNodes.map((n) => {
                if (n.x === undefined || n.y === undefined) return null;
                const isSelected = activeSelectedId === n.id;
                const isHovered = hoveredId === n.id;
                const isSearchHit = searchMatches ? searchMatches.has(n.id) : true;
                const isFocusRelated =
                  !focusId || n.id === focusId || Boolean(focusNeighbors?.has(n.id));
                const opacity = !isSearchHit ? 0.14 : isFocusRelated ? 1 : 0.16;

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    opacity={opacity}
                    className="cursor-pointer"
                    onPointerDown={(e) => handleNodePointerDown(e, n)}
                    onMouseEnter={() => setHoveredId(n.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dragNodeRef.current?.moved) return;
                      setInternalSelectedId(n.id);
                      onSelectNode?.(n);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onDoubleClickNode?.(n);
                    }}
                  >
                    {/* Glowing Aura on Focus / Selection */}
                    {(isSelected || isHovered || n.pinned) && (
                      <circle
                        r={n.radius + 7}
                        fill={n.color}
                        fillOpacity={isSelected ? 0.24 : 0.16}
                        stroke={n.color}
                        strokeWidth={isSelected ? 2 : 1.2}
                        strokeDasharray={isSelected ? undefined : '4 3'}
                        filter={`url(#kg-glow-${exportFilename})`}
                      />
                    )}

                    {/* Node Geometry */}
                    {n.shape === 'hex' ? (
                      <polygon
                        points={hexPoints(n.radius)}
                        fill={n.color}
                        stroke={darkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={2}
                      />
                    ) : n.shape === 'diamond' ? (
                      <polygon
                        points={diamondPoints(n.radius + 2)}
                        fill={n.color}
                        stroke={darkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={2}
                      />
                    ) : n.shape === 'pill' ? (
                      <rect
                        x={-Math.max(36, n.label.length * 5.2)}
                        y={-13}
                        width={Math.max(72, n.label.length * 10.4)}
                        height={26}
                        rx={13}
                        fill={n.color}
                        stroke={darkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={1.8}
                      />
                    ) : (
                      <circle
                        r={n.radius}
                        fill={n.color}
                        stroke={darkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={2}
                      />
                    )}

                    {/* Inner Badge / Count */}
                    {n.badge && n.shape !== 'pill' && (
                      <text
                        y={4}
                        textAnchor="middle"
                        fontSize={Math.max(9.5, Math.min(12, n.radius * 0.56))}
                        fontWeight="700"
                        fontFamily="ui-monospace, monospace"
                        fill="#ffffff"
                        pointerEvents="none"
                      >
                        {n.badge}
                      </text>
                    )}

                    {/* Crisp Label */}
                    {n.shape === 'pill' ? (
                      <text
                        y={4}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill="#ffffff"
                        pointerEvents="none"
                      >
                        {n.label}
                      </text>
                    ) : (
                      <text
                        y={n.radius + 14}
                        textAnchor="middle"
                        fontSize={isHovered || isSelected || n.radius >= 20 ? '11' : '10'}
                        fontWeight={isHovered || isSelected || n.radius >= 20 ? '700' : '500'}
                        fill={textInk}
                        paintOrder="stroke"
                        stroke={bgMain}
                        strokeWidth={3.5}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      >
                        {n.label}
                      </text>
                    )}

                    {n.subLabel && (isHovered || isSelected) && n.shape !== 'pill' && (
                      <text
                        y={n.radius + 27}
                        textAnchor="middle"
                        fontSize="9.5"
                        fill={darkMode ? '#94a3b8' : '#64748b'}
                        paintOrder="stroke"
                        stroke={bgMain}
                        strokeWidth={3}
                        pointerEvents="none"
                      >
                        {n.subLabel}
                      </text>
                    )}

                    <title>{`${n.label}${n.subLabel ? ` (${n.subLabel})` : ''}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {renderInspector && (
          <aside
            className={`border-t p-4 lg:col-span-4 lg:border-t-0 lg:border-l ${
              darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/60'
            }`}
            style={{ maxHeight: `${height}px`, overflowY: 'auto' }}
          >
            {renderInspector(selectedNode)}
          </aside>
        )}
      </div>
    </div>
  );
};
