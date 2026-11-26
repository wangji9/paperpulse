import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  Download,
  Expand,
  Eye,
  EyeOff,
  Focus,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PinOff,
  Play,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

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
  /** Normalized horizontal target 0..1 (or pixel fallback) */
  normX?: number;
  /** Normalized vertical target 0..1 (or pixel fallback) */
  normY?: number;
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
  height = 640,
  exportFilename = 'paperpulse-knowledge-graph',
  selectedNodeId,
  onSelectNode,
  onDoubleClickNode,
  renderInspector,
  topControls,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<KnowledgeGraphNode, KnowledgeGraphLink> | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInspector, setShowInspector] = useState(Boolean(renderInspector));
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 1280, h: height });

  const [simNodes, setSimNodes] = useState<KnowledgeGraphNode[]>([]);
  const [simLinks, setSimLinks] = useState<KnowledgeGraphLink[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [physicsRunning, setPhysicsRunning] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  // Pan & zoom transform
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragNodeRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const W = Math.max(640, canvasSize.w);
  const H = Math.max(460, canvasSize.h);
  const activeSelectedId = selectedNodeId !== undefined ? selectedNodeId : internalSelectedId;

  // Measure actual container size dynamically (eliminates ALL left/right whitespace!)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        setCanvasSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreen, showInspector]);

  // ESC exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Reset hidden groups when topology changes
  useEffect(() => {
    setHiddenGroups(new Set());
    setPinnedIds(new Set());
  }, [nodes]);

  const fitViewToNodes = useCallback(
    (nodeList: KnowledgeGraphNode[], vw: number, vh: number) => {
      const valid = nodeList.filter((n) => typeof n.x === 'number' && typeof n.y === 'number');
      if (!valid.length) return;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const n of valid) {
        const pad = n.radius + 44;
        if (n.x! - pad < minX) minX = n.x! - pad;
        if (n.x! + pad > maxX) maxX = n.x! + pad;
        if (n.y! - pad < minY) minY = n.y! - pad;
        if (n.y! + pad > maxY) maxY = n.y! + pad;
      }
      const bw = Math.max(120, maxX - minX);
      const bh = Math.max(120, maxY - minY);
      const nextZoom = Math.max(0.55, Math.min(1.65, Math.min((vw * 0.92) / bw, (vh * 0.88) / bh)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setZoom(Number(nextZoom.toFixed(2)));
      setPan({
        x: Math.round((vw / 2 - cx) * nextZoom),
        y: Math.round((vh / 2 - cy) * nextZoom),
      });
    },
    []
  );

  // Build & run live d3-force simulation spread edge-to-edge across actual canvas dimensions
  useEffect(() => {
    const vw = W;
    const vh = H;
    const resolveTargetX = (n: KnowledgeGraphNode) => {
      if (n.normX !== undefined) return vw * n.normX;
      if (n.targetX !== undefined) return (n.targetX / 980) * vw;
      return undefined;
    };
    const resolveTargetY = (n: KnowledgeGraphNode) => {
      if (n.normY !== undefined) return vh * n.normY;
      if (n.targetY !== undefined) return (n.targetY / 540) * vh;
      return undefined;
    };

    const clonedNodes: KnowledgeGraphNode[] = nodes.map((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const rx = vw * 0.34;
      const ry = vh * 0.3;
      const tx = resolveTargetX(n);
      const ty = resolveTargetY(n);
      return {
        ...n,
        targetX: tx,
        targetY: ty,
        x: tx ?? vw / 2 + Math.cos(angle) * rx * (0.45 + ((i * 37) % 100) / 140),
        y: ty ?? vh / 2 + Math.sin(angle) * ry * (0.45 + ((i * 53) % 100) / 140),
        fx: n.pinned ? (tx ?? vw / 2) : n.fx,
        fy: n.pinned ? (ty ?? vh / 2) : n.fy,
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
          .distance((l) => Math.max(105, 195 - Math.min((l.weight || 1) * 14, 70)))
          .strength((l) => Math.min(0.75, 0.22 + (l.weight || 1) * 0.06))
      )
      .force('charge', forceManyBody<KnowledgeGraphNode>().strength(-560).distanceMax(vw * 0.65))
      .force('center', forceCenter(vw / 2, vh / 2).strength(0.06))
      .force('collide', forceCollide<KnowledgeGraphNode>((d) => d.radius + 28).iterations(4))
      .force('x', forceX<KnowledgeGraphNode>((d) => d.targetX ?? vw / 2).strength(hasTargets ? 0.28 : 0.032))
      .force('y', forceY<KnowledgeGraphNode>((d) => d.targetY ?? vh / 2).strength(hasTargets ? 0.25 : 0.068))
      .alphaDecay(0.026);

    // Pre-warm for crisp initial distribution and auto-fit to full canvas!
    for (let i = 0; i < 85; i++) sim.tick();
    setSimNodes([...clonedNodes]);
    setSimLinks([...clonedLinks]);
    fitViewToNodes(clonedNodes, vw, vh);

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
  }, [nodes, links, W, H, fitViewToNodes]);

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

  const visibleNodes = useMemo(
    () => simNodes.filter((n) => !hiddenGroups.has(n.group)),
    [simNodes, hiddenGroups]
  );
  const visibleNodeIdSet = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleLinks = useMemo(
    () =>
      simLinks.filter((l) => {
        const sid = typeof l.source === 'string' ? l.source : l.source.id;
        const tid = typeof l.target === 'string' ? l.target : l.target.id;
        return visibleNodeIdSet.has(sid) && visibleNodeIdSet.has(tid);
      }),
    [simLinks, visibleNodeIdSet]
  );

  const focusId = hoveredId || activeSelectedId;
  const focusNeighbors = useMemo(() => (focusId ? adjacency.get(focusId) || new Set<string>() : null), [focusId, adjacency]);

  const selectedNode = useMemo(
    () => simNodes.find((n) => n.id === activeSelectedId) || null,
    [simNodes, activeSelectedId]
  );

  const hoveredNode = useMemo(
    () => simNodes.find((n) => n.id === hoveredId) || null,
    [simNodes, hoveredId]
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
    [pan, zoom, W, H]
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
      const { id: dragId, moved } = dragNodeRef.current;
      const target = simNodes.find((n) => n.id === dragId);
      if (target) {
        if (moved) {
          // Keep dragged node pinned where user placed it!
          setPinnedIds((prev) => new Set(prev).add(dragId));
        } else if (!target.pinned && !pinnedIds.has(dragId)) {
          target.fx = null;
          target.fy = null;
        }
      }
      simRef.current?.alphaTarget(0);
      dragNodeRef.current = null;
    }
    panDragRef.current = null;
  };

  // Direct smooth wheel zoom (no Ctrl needed) centered toward viewport
  const handleSvgWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.11;
    setZoom((z) => Math.max(0.35, Math.min(3.5, Number((z * factor).toFixed(2)))));
  };

  const handleReleaseAllPins = () => {
    simNodes.forEach((n) => {
      if (!n.pinned) {
        n.fx = null;
        n.fy = null;
      }
    });
    setPinnedIds(new Set());
    simRef.current?.alpha(0.65).restart();
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

  const toggleLegendGroup = (group: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
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
  const targetHeight = isFullscreen ? 'calc(100dvh - 122px)' : `${height}px`;

  const bodyContent = (
    <div
      className={`overflow-hidden border ${
        isFullscreen
          ? `fixed inset-0 z-[95] flex flex-col ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`
          : `w-full rounded-2xl ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-sm'}`
      }`}
    >
      {/* Top Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3 ${
          darkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-100 bg-slate-50/80'
        }`}
      >
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {topControls}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="定位节点…"
              className={`w-40 rounded-lg border py-1.5 pl-8 pr-2.5 outline-none focus:border-[#0072BD] ${
                darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-800'
              }`}
            />
          </div>

          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              title="放大 (滚轮向上)"
              onClick={() => setZoom((z) => Math.min(3.5, Number((z * 1.2).toFixed(2))))}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="min-w-[46px] text-center font-mono text-sm font-semibold text-slate-600 dark:text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              title="缩小 (滚轮向下)"
              onClick={() => setZoom((z) => Math.max(0.35, Number((z / 1.2).toFixed(2))))}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="自动居中铺满画面"
              onClick={() => fitViewToNodes(visibleNodes, W, H)}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Focus className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={physicsRunning ? '暂停物理模拟' : '恢复物理模拟'}
              onClick={handleTogglePhysics}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {physicsRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            {pinnedIds.size > 0 && (
              <button
                type="button"
                title="释放所有已拖拽固定的节点"
                onClick={handleReleaseAllPins}
                className="rounded-lg p-1.5 text-[#D95319] hover:bg-orange-50 dark:hover:bg-slate-700"
              >
                <PinOff className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              title="重新分布力导向布局"
              onClick={handleReleaseAllPins}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {renderInspector && (
              <button
                type="button"
                title={showInspector ? '收起详情侧栏（画布全宽）' : '展开节点详情侧栏'}
                onClick={() => setShowInspector((v) => !v)}
                className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {showInspector ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              title="导出矢量 SVG"
              onClick={handleExportSvg}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={isFullscreen ? '退出全屏 (ESC)' : '全屏放大图谱'}
              onClick={() => setIsFullscreen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#0072BD] px-2.5 py-1.5 font-semibold text-white hover:bg-[#005a96]"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
              <span>{isFullscreen ? '退出全屏' : '放大'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Click-to-Filter Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {legend.map((item) => {
            const hidden = hiddenGroups.has(item.group);
            return (
              <button
                key={item.group}
                type="button"
                onClick={() => toggleLegendGroup(item.group)}
                title={hidden ? '点击显示该类别节点' : '点击隐藏该类别节点'}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition ${
                  hidden
                    ? 'border-slate-200 bg-slate-100 text-slate-400 line-through opacity-60 dark:border-slate-700 dark:bg-slate-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 ${
                    item.shape === 'diamond' ? 'rotate-45 rounded-[1px]' : item.shape === 'pill' ? 'w-4 rounded-full' : 'rounded-full'
                  }`}
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 opacity-40" />}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-slate-500">
          节点 {visibleNodes.length} · 连线 {visibleLinks.length} · 滚轮缩放 / 拖拽节点固定 / 点击图例显隐
        </span>
      </div>

      {/* Edge-to-Edge Responsive Graph Canvas + Collapsible Side Inspector */}
      <div className={renderInspector && showInspector ? 'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12' : 'min-h-0 flex-1'}>
        <div
          ref={containerRef}
          className={renderInspector && showInspector ? 'relative min-h-0 lg:col-span-9' : 'relative min-h-0 w-full'}
          style={{ height: targetHeight }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full cursor-grab select-none active:cursor-grabbing"
            onWheel={handleSvgWheel}
            onPointerDown={(e) => {
              panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
            }}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerUp}
            onClick={() => {
              if (!dragNodeRef.current?.moved) {
                setInternalSelectedId(null);
                onSelectNode?.(null);
              }
            }}
            role="img"
            aria-label={title}
          >
            <defs>
              <pattern id={`kg-dots-${exportFilename}-${isFullscreen ? 'fs' : 'in'}`} width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="14" cy="14" r="1.1" fill={gridDot} />
              </pattern>
              <filter id={`kg-glow-${exportFilename}`} x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x={0} y={0} width={W} height={H} fill={bgMain} />
            <rect x={0} y={0} width={W} height={H} fill={`url(#kg-dots-${exportFilename}-${isFullscreen ? 'fs' : 'in'})`} />

            <g transform={`translate(${W / 2 + pan.x}, ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2}, ${-H / 2})`}>
              {/* Curved Force-Directed Edges */}
              {visibleLinks.map((l) => {
                const s = l.source as KnowledgeGraphNode;
                const t = l.target as KnowledgeGraphNode;
                if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) return null;
                const isFocusEdge = !focusId || s.id === focusId || t.id === focusId;
                const mx = (s.x + t.x) / 2;
                const my = (s.y + t.y) / 2;
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const len = Math.hypot(dx, dy) || 1;
                const curveOffset = Math.min(34, len * 0.085);
                const cx = mx - (dy / len) * curveOffset;
                const cy = my + (dx / len) * curveOffset;
                const baseStroke = l.color || (darkMode ? '#475569' : '#94a3b8');
                const strokeW = Math.min(5, 1.15 + (l.weight || 1) * 0.55);

                return (
                  <g key={l.id} opacity={isFocusEdge ? (focusId ? 0.94 : 0.42) : 0.07}>
                    <path
                      d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
                      fill="none"
                      stroke={isFocusEdge && focusId ? (l.color || '#0072BD') : baseStroke}
                      strokeWidth={isFocusEdge && focusId ? strokeW + 0.8 : strokeW}
                      strokeDasharray={l.dashed ? '6 4' : undefined}
                    >
                      {l.animated && (
                        <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.4s" repeatCount="indefinite" />
                      )}
                    </path>
                    {l.label && isFocusEdge && focusId && (
                      <text
                        x={cx}
                        y={cy - 4}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill={darkMode ? '#e2e8f0' : '#1e293b'}
                        paintOrder="stroke"
                        stroke={bgMain}
                        strokeWidth={3}
                      >
                        {l.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Interactive Draggable Nodes */}
              {visibleNodes.map((n) => {
                if (n.x === undefined || n.y === undefined) return null;
                const isSelected = activeSelectedId === n.id;
                const isHovered = hoveredId === n.id;
                const isPinned = Boolean(n.pinned || pinnedIds.has(n.id));
                const isSearchHit = searchMatches ? searchMatches.has(n.id) : true;
                const isFocusRelated = !focusId || n.id === focusId || Boolean(focusNeighbors?.has(n.id));
                const opacity = !isSearchHit ? 0.14 : isFocusRelated ? 1 : 0.14;

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
                      if (renderInspector && !showInspector) setShowInspector(true);
                      onSelectNode?.(n);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onDoubleClickNode?.(n);
                    }}
                  >
                    {(isSelected || isHovered || isPinned) && (
                      <circle
                        r={n.radius + 8}
                        fill={n.color}
                        fillOpacity={isSelected ? 0.25 : 0.15}
                        stroke={n.color}
                        strokeWidth={isSelected ? 2.4 : 1.4}
                        strokeDasharray={isSelected ? undefined : '4 3'}
                        filter={`url(#kg-glow-${exportFilename})`}
                      />
                    )}

                    {n.shape === 'hex' ? (
                      <polygon points={hexPoints(n.radius)} fill={n.color} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={2.2} />
                    ) : n.shape === 'diamond' ? (
                      <polygon points={diamondPoints(n.radius + 3)} fill={n.color} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={2.2} />
                    ) : n.shape === 'pill' ? (
                      <rect
                        x={-Math.max(46, n.label.length * 6.2)}
                        y={-15}
                        width={Math.max(92, n.label.length * 12.4)}
                        height={30}
                        rx={15}
                        fill={n.color}
                        stroke={darkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={2}
                      />
                    ) : (
                      <circle r={n.radius} fill={n.color} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={2.2} />
                    )}

                    {n.badge && n.shape !== 'pill' && (
                      <text
                        y={4.5}
                        textAnchor="middle"
                        fontSize={Math.max(10.5, Math.min(13.5, n.radius * 0.58))}
                        fontWeight="700"
                        fill="#ffffff"
                        pointerEvents="none"
                      >
                        {n.badge}
                      </text>
                    )}

                    {n.shape === 'pill' ? (
                      <text y={4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff" pointerEvents="none">
                        {n.label}
                      </text>
                    ) : (
                      <text
                        y={n.radius + 16}
                        textAnchor="middle"
                        fontSize={isHovered || isSelected || n.radius >= 20 ? '13' : '11.5'}
                        fontWeight={isHovered || isSelected || n.radius >= 20 ? '700' : '600'}
                        fill={textInk}
                        paintOrder="stroke"
                        stroke={bgMain}
                        strokeWidth={4}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      >
                        {n.label}
                      </text>
                    )}

                    {n.subLabel && (isHovered || isSelected) && n.shape !== 'pill' && (
                      <text
                        y={n.radius + 32}
                        textAnchor="middle"
                        fontSize="11"
                        fill={darkMode ? '#94a3b8' : '#475569'}
                        paintOrder="stroke"
                        stroke={bgMain}
                        strokeWidth={3.5}
                        pointerEvents="none"
                      >
                        {n.subLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Live Floating Hover HUD Card */}
          {hoveredNode && (
            <div
              className={`pointer-events-none absolute bottom-3 left-3 max-w-md rounded-xl border px-3.5 py-2.5 shadow-lg backdrop-blur-md ${
                darkMode ? 'border-slate-700 bg-slate-900/90 text-slate-100' : 'border-slate-200 bg-white/95 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
                <span className="truncate">{hoveredNode.label}</span>
              </div>
              {hoveredNode.subLabel && <div className="mt-0.5 text-slate-500 dark:text-slate-400">{hoveredNode.subLabel}</div>}
              <div className="mt-1 text-slate-400">
                关联节点数：{adjacency.get(hoveredNode.id)?.size || 0} · 点击查看详情 / 拖拽可固定位置
              </div>
            </div>
          )}
        </div>

        {renderInspector && showInspector && (
          <aside
            className={`border-t p-4 lg:col-span-3 lg:border-t-0 lg:border-l ${
              darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'
            }`}
            style={{ maxHeight: targetHeight, overflowY: 'auto' }}
          >
            {renderInspector(selectedNode)}
          </aside>
        )}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(bodyContent, document.body) : bodyContent;
};
