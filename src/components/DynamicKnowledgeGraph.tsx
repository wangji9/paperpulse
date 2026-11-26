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
  Layers,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PinOff,
  Play,
  RefreshCw,
  Search,
  X,
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
  /** Normalized horizontal target 0..1 */
  normX?: number;
  /** Normalized vertical target 0..1 */
  normY?: number;
  /** Optional soft anchor strength override (0..1) */
  anchorStrengthX?: number;
  anchorStrengthY?: number;
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
  height = 680,
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
  // Default inspector closed so canvas occupies 100% edge-to-edge width immediately; opens as floating drawer on click
  const [showInspector, setShowInspector] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 1440, h: height });

  const [simNodes, setSimNodes] = useState<KnowledgeGraphNode[]>([]);
  const [simLinks, setSimLinks] = useState<KnowledgeGraphLink[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [physicsRunning, setPhysicsRunning] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hopDepth, setHopDepth] = useState<1 | 2>(1);

  // Pan & zoom transform (keep live ref for non-passive native wheel listener)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, W: 1440, H: height });

  const dragNodeRef = useRef<{ id: string; moved: boolean } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const W = Math.max(680, canvasSize.w);
  const H = Math.max(500, canvasSize.h);
  viewRef.current = { zoom, pan, W, H };

  const activeSelectedId = selectedNodeId !== undefined ? selectedNodeId : internalSelectedId;

  // Measure actual container dimensions continuously (eliminates side margins at every viewport & fullscreen state)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        const nextW = Math.round(rect.width);
        const nextH = Math.round(rect.height);
        setCanvasSize((prev) => (Math.abs(prev.w - nextW) > 6 || Math.abs(prev.h - nextH) > 6 ? { w: nextW, h: nextH } : prev));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // ESC exits fullscreen; +/- zoom shortcuts when fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4.5, Number((z * 1.18).toFixed(2))));
      else if (e.key === '-') setZoom((z) => Math.max(0.3, Number((z / 1.18).toFixed(2))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Reset per-graph UI state when topology changes
  useEffect(() => {
    setHiddenGroups(new Set());
    setPinnedIds(new Set());
    setInternalSelectedId(null);
    setShowInspector(false);
  }, [nodes]);

  const fitViewToNodes = useCallback((nodeList: KnowledgeGraphNode[], vw: number, vh: number) => {
    const valid = nodeList.filter((n) => typeof n.x === 'number' && typeof n.y === 'number');
    if (!valid.length) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of valid) {
      const padX = n.shape === 'pill' ? Math.max(58, n.label.length * 6.8) : n.radius + 48;
      const padY = n.radius + 36;
      if (n.x! - padX < minX) minX = n.x! - padX;
      if (n.x! + padX > maxX) maxX = n.x! + padX;
      if (n.y! - padY < minY) minY = n.y! - padY;
      if (n.y! + padY > maxY) maxY = n.y! + padY;
    }
    const bw = Math.max(160, maxX - minX);
    const bh = Math.max(160, maxY - minY);
    const nextZoom = Math.max(0.55, Math.min(1.65, Math.min((vw * 0.96) / bw, (vh * 0.92) / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: Math.round((vw / 2 - cx) * nextZoom),
      y: Math.round((vh / 2 - cy) * nextZoom),
    });
  }, []);

  // Native non-passive pointer-centered mouse-wheel zoom (never scrolls the page while hovering the graph!)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const { zoom: curZoom, pan: curPan, W: curW, H: curH } = viewRef.current;
      const sx = ((e.clientX - rect.left) / rect.width) * curW;
      const sy = ((e.clientY - rect.top) / rect.height) * curH;
      const factor = e.deltaY < 0 ? 1.14 : 0.88;
      const nextZoom = Math.max(0.3, Math.min(4.5, Number((curZoom * factor).toFixed(3))));
      if (nextZoom === curZoom) return;
      // Keep world point under cursor stationary
      const worldX = (sx - curPan.x - curW / 2) / curZoom + curW / 2;
      const worldY = (sy - curPan.y - curH / 2) / curZoom + curH / 2;
      const nextPanX = sx - curW / 2 - (worldX - curW / 2) * nextZoom;
      const nextPanY = sy - curH / 2 - (worldY - curH / 2) * nextZoom;
      setZoom(Number(nextZoom.toFixed(2)));
      setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [isFullscreen]);

  // Panoramic aspect-ratio-aware d3-force simulation filling the ENTIRE width cleanly
  useEffect(() => {
    const vw = W;
    const vh = H;
    const aspect = vw / Math.max(vh, 1);

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
      // Wide landscape golden-angle distribution so nodes naturally span left-to-right
      const golden = i * 2.399963229728653;
      const frac = Math.sqrt((i + 0.5) / Math.max(nodes.length, 1));
      const rx = vw * 0.43 * frac;
      const ry = vh * 0.36 * frac;
      const tx = resolveTargetX(n);
      const ty = resolveTargetY(n);
      return {
        ...n,
        targetX: tx,
        targetY: ty,
        x: tx ?? vw / 2 + Math.cos(golden) * rx,
        y: ty ?? vh / 2 + Math.sin(golden) * ry,
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

    // Count node degrees for better panoramic balance
    const degMap = new Map<string, number>();
    for (const l of clonedLinks) {
      const sid = typeof l.source === 'string' ? l.source : l.source.id;
      const tid = typeof l.target === 'string' ? l.target : l.target.id;
      degMap.set(sid, (degMap.get(sid) || 0) + 1);
      degMap.set(tid, (degMap.get(tid) || 0) + 1);
    }

    const hasExplicitTargets = clonedNodes.some((n) => n.targetX !== undefined);
    // Assign soft horizontal spread slots when no explicit targets exist so the network forms a wide panorama instead of a narrow circle
    const softSpreadX = new Map<string, number>();
    if (!hasExplicitTargets) {
      const ordered = [...clonedNodes].sort((a, b) => (degMap.get(b.id) || 0) - (degMap.get(a.id) || 0));
      ordered.forEach((n, rank) => {
        // Place highest-degree hubs across middle band [0.30..0.70], outer nodes spanning [0.08..0.92]
        const side = rank % 2 === 0 ? 1 : -1;
        const dist = rank === 0 ? 0 : 0.08 + ((rank / Math.max(ordered.length, 1)) * 0.36);
        softSpreadX.set(n.id, vw * Math.max(0.08, Math.min(0.92, 0.5 + side * dist)));
      });
    }

    // Soft rectangular containment force keeps every node inside the landscape frame (prevents runaway orphan dots!)
    const padX = Math.max(58, vw * 0.048);
    const padY = Math.max(46, vh * 0.07);
    const boundsForce = () => {
      for (const n of clonedNodes) {
        if (n.fx != null && n.fy != null) continue;
        const rPadX = n.shape === 'pill' ? Math.max(66, n.label.length * 6.5) : n.radius + padX * 0.55;
        const rPadY = n.radius + padY * 0.65;
        if ((n.x ?? 0) < rPadX) n.vx = (n.vx || 0) + (rPadX - (n.x ?? 0)) * 0.14;
        else if ((n.x ?? 0) > vw - rPadX) n.vx = (n.vx || 0) - ((n.x ?? 0) - (vw - rPadX)) * 0.14;
        if ((n.y ?? 0) < rPadY) n.vy = (n.vy || 0) + (rPadY - (n.y ?? 0)) * 0.18;
        else if ((n.y ?? 0) > vh - rPadY) n.vy = (n.vy || 0) - ((n.y ?? 0) - (vh - rPadY)) * 0.18;
      }
    };

    const chargeStrength = hasExplicitTargets ? -420 : -Math.round(520 * Math.min(1.45, Math.max(0.95, aspect * 0.62)));
    const sim = forceSimulation<KnowledgeGraphNode>(clonedNodes)
      .force(
        'link',
        forceLink<KnowledgeGraphNode, KnowledgeGraphLink>(clonedLinks)
          .id((d) => d.id)
          .distance((l) => Math.max(108, Math.min(240, (vw * 0.14) - Math.min((l.weight || 1) * 10, 55))))
          .strength((l) => Math.min(0.7, 0.2 + (l.weight || 1) * 0.05))
      )
      .force('charge', forceManyBody<KnowledgeGraphNode>().strength(chargeStrength).distanceMax(vw * 0.58))
      .force('center', forceCenter(vw / 2, vh / 2).strength(0.035))
      .force(
        'collide',
        forceCollide<KnowledgeGraphNode>((d) => (d.shape === 'pill' ? Math.max(52, d.label.length * 4.2) : d.radius + 30)).iterations(4)
      )
      .force(
        'x',
        forceX<KnowledgeGraphNode>((d) => d.targetX ?? softSpreadX.get(d.id) ?? vw / 2).strength((d) =>
          d.anchorStrengthX !== undefined ? d.anchorStrengthX : d.targetX !== undefined ? 0.34 : 0.055
        )
      )
      .force(
        'y',
        forceY<KnowledgeGraphNode>((d) => d.targetY ?? vh / 2).strength((d) =>
          d.anchorStrengthY !== undefined ? d.anchorStrengthY : d.targetY !== undefined ? 0.3 : 0.13
        )
      )
      .force('bounds', boundsForce)
      .alphaDecay(0.025);

    // Pre-warm to crisp, wide panoramic equilibrium immediately
    for (let i = 0; i < 110; i++) sim.tick();
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

  // Adjacency lookup for 1-hop & 2-hop ego highlighting
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
  const focusNeighbors = useMemo(() => {
    if (!focusId) return null;
    const oneHop = adjacency.get(focusId) || new Set<string>();
    if (hopDepth === 1) return oneHop;
    const expanded = new Set<string>(oneHop);
    for (const mid of oneHop) {
      const next = adjacency.get(mid);
      if (next) next.forEach((id) => expanded.add(id));
    }
    return expanded;
  }, [focusId, adjacency, hopDepth]);

  const selectedNode = useMemo(
    () => simNodes.find((n) => n.id === activeSelectedId) || null,
    [simNodes, activeSelectedId]
  );

  const hoveredNode = useMemo(
    () => simNodes.find((n) => n.id === hoveredId) || null,
    [simNodes, hoveredId]
  );

  const focusOnNode = useCallback(
    (node: KnowledgeGraphNode, targetZoom = 1.45) => {
      if (node.x === undefined || node.y === undefined) return;
      const z = Math.max(zoom, targetZoom);
      setZoom(Number(z.toFixed(2)));
      setPan({
        x: Math.round((W / 2 - node.x) * z),
        y: Math.round((H / 2 - node.y) * z),
      });
      setInternalSelectedId(node.id);
      if (renderInspector) setShowInspector(true);
      onSelectNode?.(node);
    },
    [W, H, zoom, renderInspector, onSelectNode]
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
    simRef.current?.alphaTarget(0.24).restart();
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
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panDragRef.current.moved = true;
      setPan({ x: panDragRef.current.origX + dx, y: panDragRef.current.origY + dy });
    }
  };

  const handleSvgPointerUp = () => {
    if (dragNodeRef.current) {
      const { id: dragId, moved } = dragNodeRef.current;
      const target = simNodes.find((n) => n.id === dragId);
      if (target) {
        if (moved) {
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

  const handleCanvasDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    const nextZoom = Math.min(4.5, Number((zoom * 1.35).toFixed(2)));
    const worldX = (sx - pan.x - W / 2) / zoom + W / 2;
    const worldY = (sy - pan.y - H / 2) / zoom + H / 2;
    setZoom(nextZoom);
    setPan({
      x: Math.round(sx - W / 2 - (worldX - W / 2) * nextZoom),
      y: Math.round(sy - H / 2 - (worldY - H / 2) * nextZoom),
    });
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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchMatches && searchMatches.size > 0) {
      const firstId = Array.from(searchMatches)[0];
      const match = visibleNodes.find((n) => n.id === firstId);
      if (match) focusOnNode(match, 1.5);
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
  const gridDot = darkMode ? '#1e293b' : '#dbe3ef';
  const textInk = darkMode ? '#e2e8f0' : '#0f172a';
  const targetHeight = isFullscreen ? 'calc(100dvh - 118px)' : `${height}px`;

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
              onKeyDown={handleSearchKeyDown}
              placeholder="定位节点 (回车聚焦)…"
              className={`w-44 rounded-lg border py-1.5 pl-8 pr-2.5 outline-none focus:border-[#0072BD] ${
                darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-800'
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              title="放大 (滚轮向上)"
              onClick={() => setZoom((z) => Math.min(4.5, Number((z * 1.22).toFixed(2))))}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="min-w-[50px] text-center font-mono text-sm font-semibold text-slate-600 dark:text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              title="缩小 (滚轮向下)"
              onClick={() => setZoom((z) => Math.max(0.3, Number((z / 1.22).toFixed(2))))}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="一键铺满并居中画面"
              onClick={() => fitViewToNodes(visibleNodes, W, H)}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Focus className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={hopDepth === 1 ? '当前：1跳直接关联（点击切换至2跳扩展关联）' : '当前：2跳扩展关联（点击切换至1跳直接关联）'}
              onClick={() => setHopDepth((d) => (d === 1 ? 2 : 1))}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                hopDepth === 2
                  ? 'bg-[#7E2F8E] text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              {hopDepth}跳
            </button>
            <button
              type="button"
              title={physicsRunning ? '暂停力导向物理模拟' : '恢复力导向物理模拟'}
              onClick={handleTogglePhysics}
              className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {physicsRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            {pinnedIds.size > 0 && (
              <button
                type="button"
                title={`释放 ${pinnedIds.size} 个固定节点`}
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
                title={showInspector ? '关闭节点详情浮窗' : '展开节点详情浮窗'}
                onClick={() => setShowInspector((v) => !v)}
                className={`rounded-lg p-1.5 ${
                  showInspector
                    ? 'bg-sky-100 text-[#0072BD] dark:bg-sky-900/50 dark:text-sky-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
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
              className="inline-flex items-center gap-1 rounded-lg bg-[#0072BD] px-3 py-1.5 font-semibold text-white hover:bg-[#005a96]"
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 transition ${
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
          节点 {visibleNodes.length} · 连线 {visibleLinks.length} · 滚轮跟随光标缩放 / 拖拽节点固定 / 双击画布放大
        </span>
      </div>

      {/* 100% Full-Width Edge-to-Edge Graph Canvas + Floating Glass Inspector Drawer */}
      <div
        ref={containerRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden"
        style={{ height: targetHeight }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full cursor-grab select-none active:cursor-grabbing"
          onPointerDown={(e) => {
            panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y, moved: false };
          }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={handleSvgPointerUp}
          onDoubleClick={handleCanvasDoubleClick}
          onClick={() => {
            if (!dragNodeRef.current?.moved && !panDragRef.current?.moved) {
              setInternalSelectedId(null);
              setShowInspector(false);
              onSelectNode?.(null);
            }
          }}
          role="img"
          aria-label={title}
        >
          <defs>
            <pattern id={`kg-dots-${exportFilename}-${isFullscreen ? 'fs' : 'in'}`} width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="1.15" fill={gridDot} />
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
              const isFocusEdge =
                !focusId ||
                s.id === focusId ||
                t.id === focusId ||
                (hopDepth === 2 && Boolean(focusNeighbors?.has(s.id) && focusNeighbors?.has(t.id)));
              const mx = (s.x + t.x) / 2;
              const my = (s.y + t.y) / 2;
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const len = Math.hypot(dx, dy) || 1;
              const curveOffset = Math.min(34, len * 0.085);
              const cx = mx - (dy / len) * curveOffset;
              const cy = my + (dx / len) * curveOffset;
              const baseStroke = l.color || (darkMode ? '#475569' : '#94a3b8');
              const strokeW = Math.min(5, 1.2 + (l.weight || 1) * 0.55);

              return (
                <g key={l.id} opacity={isFocusEdge ? (focusId ? 0.94 : 0.44) : 0.07}>
                  <path
                    d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
                    fill="none"
                    stroke={isFocusEdge && focusId ? (l.color || '#0072BD') : baseStroke}
                    strokeWidth={isFocusEdge && focusId ? strokeW + 0.9 : strokeW}
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
                      fontSize="11.5"
                      fontWeight="700"
                      fill={darkMode ? '#e2e8f0' : '#1e293b'}
                      paintOrder="stroke"
                      stroke={bgMain}
                      strokeWidth={3.5}
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
                    if (renderInspector) setShowInspector(true);
                    onSelectNode?.(n);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onDoubleClickNode?.(n);
                  }}
                >
                  {(isSelected || isHovered || isPinned) && (
                    <circle
                      r={n.radius + 9}
                      fill={n.color}
                      fillOpacity={isSelected ? 0.28 : 0.16}
                      stroke={isPinned && !isSelected ? '#D95319' : n.color}
                      strokeWidth={isSelected ? 2.6 : 1.6}
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
                      x={-Math.max(54, n.label.length * 6.5)}
                      y={-16}
                      width={Math.max(108, n.label.length * 13)}
                      height={32}
                      rx={16}
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
                      fontSize={Math.max(11, Math.min(14, n.radius * 0.58))}
                      fontWeight="700"
                      fill="#ffffff"
                      pointerEvents="none"
                    >
                      {n.badge}
                    </text>
                  )}

                  {n.shape === 'pill' ? (
                    <text y={4.5} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#ffffff" pointerEvents="none">
                      {n.label}
                    </text>
                  ) : (
                    <text
                      y={n.radius + 17}
                      textAnchor="middle"
                      fontSize={isHovered || isSelected || n.radius >= 20 ? '13.5' : '12'}
                      fontWeight={isHovered || isSelected || n.radius >= 20 ? '700' : '600'}
                      fill={textInk}
                      paintOrder="stroke"
                      stroke={bgMain}
                      strokeWidth={4.5}
                      strokeLinejoin="round"
                      pointerEvents="none"
                    >
                      {n.label}
                    </text>
                  )}

                  {n.subLabel && (isHovered || isSelected) && n.shape !== 'pill' && (
                    <text
                      y={n.radius + 34}
                      textAnchor="middle"
                      fontSize="11.5"
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

        {/* Bottom-Left Live Floating Hover HUD Card */}
        {hoveredNode && (
          <div
            className={`pointer-events-none absolute bottom-4 left-4 z-10 max-w-md rounded-xl border px-3.5 py-2.5 shadow-lg backdrop-blur-md ${
              darkMode ? 'border-slate-700 bg-slate-900/92 text-slate-100' : 'border-slate-200 bg-white/95 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
              <span className="truncate">{hoveredNode.label}</span>
            </div>
            {hoveredNode.subLabel && <div className="mt-0.5 text-slate-500 dark:text-slate-400">{hoveredNode.subLabel}</div>}
            <div className="mt-1 text-slate-400">
              直连节点：{adjacency.get(hoveredNode.id)?.size || 0} · 点击查看详情 / 双击直达 / 拖拽可固定
            </div>
          </div>
        )}

        {/* Bottom-Right Floating Quick-Zoom & Expand Dock */}
        <div
          className={`absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-2xl border p-1.5 shadow-lg backdrop-blur-md ${
            darkMode ? 'border-slate-700 bg-slate-900/90 text-slate-100' : 'border-slate-200 bg-white/92 text-slate-800'
          }`}
        >
          <button
            type="button"
            title="缩小"
            onClick={() => setZoom((z) => Math.max(0.3, Number((z / 1.22).toFixed(2))))}
            className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="点击自适应居中铺满"
            onClick={() => fitViewToNodes(visibleNodes, W, H)}
            className="min-w-[58px] rounded-xl px-2 py-1 font-mono font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title="放大"
            onClick={() => setZoom((z) => Math.min(4.5, Number((z * 1.22).toFixed(2))))}
            className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            title={isFullscreen ? '退出全屏 (ESC)' : '全屏放大图谱'}
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-xl bg-[#0072BD] px-3 py-1.5 font-semibold text-white hover:bg-[#005a96]"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            <span>{isFullscreen ? '还原' : '全屏'}</span>
          </button>
        </div>

        {/* Floating Glassmorphism Node Inspector Drawer (Zero permanent width loss!) */}
        {renderInspector && showInspector && (
          <aside
            className={`absolute right-4 top-4 bottom-20 z-20 flex w-[360px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md ${
              darkMode
                ? 'border-slate-700 bg-slate-900/95 text-slate-100'
                : 'border-slate-200 bg-white/95 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-100">节点详情</span>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="关闭详情浮窗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderInspector(selectedNode)}</div>
          </aside>
        )}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(bodyContent, document.body) : bodyContent;
};
