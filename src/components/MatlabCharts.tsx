import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { forceCenter, forceCollide, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { Download, Maximize2, Minimize2, RotateCcw, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { AcademicPaper, ResearchTopic } from '../types/paper';
import { TOPIC_META } from '../lib/constants';
import type { LabAnalysisResult, PotentialDirectionInsight } from '../lib/labAnalysis';

/**
 * Authentic MATLAB Default Color Order & Parula Colormap Utilities
 */
export const MATLAB_COLORS = [
  '#0072BD', // MATLAB Classic Blue
  '#D95319', // Vermilion / Brick Red
  '#EDB120', // Golden Amber
  '#7E2F8E', // Royal Purple
  '#77AC30', // Leaf Green
  '#4DBEEE', // Cyan Blue
  '#A2142F', // Deep Crimson
] as const;

const PARULA_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [53, 42, 135]],
  [0.18, [15, 92, 221]],
  [0.36, [20, 133, 212]],
  [0.54, [6, 169, 192]],
  [0.72, [88, 189, 139]],
  [0.88, [184, 196, 48]],
  [1.0, [249, 251, 14]],
];

export function parulaColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (let i = 0; i < PARULA_STOPS.length - 1; i++) {
    const [t0, c0] = PARULA_STOPS[i];
    const [t1, c1] = PARULA_STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / Math.max(t1 - t0, 1e-6);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(249, 251, 14)';
}

function downloadSvgElement(svgEl: SVGSVGElement | null, filename: string, asPng = false) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svgEl.viewBox.baseVal;
  const w = vb?.width || svgEl.clientWidth || 800;
  const h = vb?.height || svgEl.clientHeight || 420;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  if (!asPng) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${filename}.png`;
      a.click();
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

const MatlabFigureShell: React.FC<{
  figNum: string;
  title: string;
  subtitle?: string;
  filename: string;
  darkMode: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
  extraControls?: React.ReactNode;
  children: React.ReactNode;
}> = ({ figNum, title, subtitle, filename, darkMode, svgRef, extraControls, children }) => {
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [modalZoom, setModalZoom] = useState(1.1);
  const [modalPan, setModalPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!zoomModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomModalOpen(false);
      else if (e.key === '+' || e.key === '=') setModalZoom((z) => Math.min(3.6, +(z * 1.15).toFixed(2)));
      else if (e.key === '-') setModalZoom((z) => Math.max(0.5, +(z * 0.87).toFixed(2)));
      else if (e.key === '0') {
        setModalZoom(1);
        setModalPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomModalOpen]);

  useEffect(() => {
    if (!zoomModalOpen) return;
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setModalZoom((z) => Math.max(0.5, Math.min(3.6, +(z * factor).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomModalOpen]);

  const openZoomModal = () => {
    setModalZoom(1.08);
    setModalPan({ x: 0, y: 0 });
    setZoomModalOpen(true);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement)?.closest('button')) return;
    panStartRef.current = { x: e.clientX, y: e.clientY, px: modalPan.x, py: modalPan.y };
    setIsPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setModalPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
  };

  const handlePointerUp = () => {
    panStartRef.current = null;
    setIsPanning(false);
  };

  const modalPortal =
    zoomModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`fixed inset-0 z-[95] flex flex-col backdrop-blur-sm ${
              darkMode ? 'bg-slate-950/96 text-slate-100' : 'bg-white/98 text-slate-900'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={`${figNum} ${title} 放大查看`}
          >
            {/* Fullscreen Lightbox Top Toolbar */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50/90'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded bg-[#0072BD] px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                  {figNum}
                </span>
                <h3 className="text-base font-bold tracking-tight">{title}</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {extraControls}
                <div
                  className={`inline-flex items-center rounded-xl border ${
                    darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setModalZoom((z) => Math.max(0.5, +(z * 0.85).toFixed(2)))}
                    title="缩小 (-)"
                    className="px-2.5 py-1.5 text-slate-600 hover:text-[#0072BD] dark:text-slate-300"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="min-w-[54px] text-center font-mono text-xs font-semibold">
                    {Math.round(modalZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalZoom((z) => Math.min(3.6, +(z * 1.18).toFixed(2)))}
                    title="放大 (+)"
                    className="px-2.5 py-1.5 text-slate-600 hover:text-[#0072BD] dark:text-slate-300"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModalZoom(1);
                    setModalPan({ x: 0, y: 0 });
                  }}
                  title="重置缩放与位置 (0)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCcw className="h-4 w-4" /> 重置
                </button>

                <button
                  type="button"
                  onClick={() => downloadSvgElement(svgRef.current, filename, false)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-4 w-4" /> SVG
                </button>
                <button
                  type="button"
                  onClick={() => downloadSvgElement(svgRef.current, filename, true)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  PNG
                </button>

                <button
                  type="button"
                  onClick={() => setZoomModalOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#005a96]"
                >
                  <Minimize2 className="h-4 w-4" /> 退出放大
                </button>
              </div>
            </div>

            {/* Interactive Zoom & Pan Viewport */}
            <div
              ref={viewportRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className={`relative flex flex-1 items-center justify-center overflow-hidden p-6 select-none ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <div
                style={{
                  transform: `translate(${modalPan.x}px, ${modalPan.y}px) scale(${modalZoom})`,
                  transformOrigin: 'center center',
                  width: 'min(92vw, 1320px)',
                }}
                className="transition-transform duration-75 [&_svg]:mx-auto [&_svg]:block [&_svg]:max-h-[78vh] [&_svg]:max-w-none [&_svg]:w-full"
              >
                {children}
              </div>

              <div
                className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-xs ${
                  darkMode
                    ? 'border-slate-700 bg-slate-900/90 text-slate-300'
                    : 'border-slate-200 bg-white/90 text-slate-600'
                }`}
              >
                滚轮自由缩放 · 按住拖拽平移 · 按 ESC 退出全屏
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section
        className={`rounded-2xl border p-4 sm:p-5 transition-shadow hover:shadow-md ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-xs'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#0072BD] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                {figNum}
              </span>
              <h3 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-100">
                {title}
              </h3>
            </div>
            {subtitle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {extraControls}
            <button
              type="button"
              onClick={openZoomModal}
              title="全屏放大并支持滚轮缩放与拖拽查看"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0072BD]/40 bg-[#0072BD]/8 px-2.5 py-1 text-xs font-semibold text-[#0072BD] hover:bg-[#0072BD] hover:text-white dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500 dark:hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" /> 放大
            </button>
            <button
              type="button"
              onClick={() => downloadSvgElement(svgRef.current, filename, false)}
              title="导出高清矢量 SVG（适合论文插图）"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:text-slate-300"
            >
              <Download className="h-3.5 w-3.5" /> SVG
            </button>
            <button
              type="button"
              onClick={() => downloadSvgElement(svgRef.current, filename, true)}
              title="导出 2x 高清 PNG"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:text-slate-300"
            >
              PNG
            </button>
          </div>
        </div>
        {zoomModalOpen ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-slate-600 dark:text-slate-300">图表正在全屏放大视图中展示</p>
            <button
              type="button"
              onClick={() => setZoomModalOpen(false)}
              className="rounded-lg bg-[#0072BD] px-3.5 py-1.5 font-semibold text-white hover:bg-[#005a96]"
            >
              返回原位
            </button>
          </div>
        ) : (
          children
        )}
      </section>
      {modalPortal}
    </>
  );
};

/* ============================================================================
 * Fig. 1: MATLAB Dual-Axis (yyaxis) Publication Timeline & Cumulative Growth
 * ============================================================================ */
export const MatlabPublicationTimeline: React.FC<{
  yearCounts: Array<{ year: number; count: number; cumulative: number }>;
  darkMode: boolean;
  onSelectYear: (year: number) => void;
}> = ({ yearCounts, darkMode, onSelectYear }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const W = 620;
  const H = 290;
  const pad = { top: 28, right: 62, bottom: 48, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxCount = Math.max(...yearCounts.map((d) => d.count), 4);
  const yLeftMax = Math.ceil((maxCount + 1) / 2) * 2;
  const maxCum = Math.max(...yearCounts.map((d) => d.cumulative), 5);
  const yRightMax = Math.ceil((maxCum + 2) / 5) * 5;

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';
  const plotBg = darkMode ? '#0f172a' : '#ffffff';

  const band = plotW / Math.max(yearCounts.length, 1);
  const barW = Math.min(46, band * 0.46);

  const pts = yearCounts.map((d, i) => {
    const cx = pad.left + band * (i + 0.5);
    const barH = (d.count / yLeftMax) * plotH;
    const barY = pad.top + plotH - barH;
    const cumY = pad.top + plotH - (d.cumulative / yRightMax) * plotH;
    return { ...d, cx, barH, barY, cumY };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cumY}`).join(' ');
  const leftTicks = Array.from({ length: 5 }, (_, i) => Math.round((yLeftMax * i) / 4));
  const rightTicks = Array.from({ length: 5 }, (_, i) => Math.round((yRightMax * i) / 4));

  return (
    <MatlabFigureShell
      figNum="Fig. 1"
      title="年度发表趋势与累计增长"
      filename="paperpulse-lab-fig1-timeline"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="年度发文与累计增长双轴图">
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        {/* Plot Box */}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={plotBg} stroke={axisInk} strokeWidth={1.25} />

        {/* Horizontal dashed MATLAB gridlines + left/right inward ticks */}
        {leftTicks.map((v, idx) => {
          const y = pad.top + plotH - (v / yLeftMax) * plotH;
          const rv = rightTicks[idx];
          return (
            <g key={idx}>
              {idx > 0 && idx < leftTicks.length - 1 && (
                <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={pad.left} y1={y} x2={pad.left + 5} y2={y} stroke={MATLAB_COLORS[0]} strokeWidth={1.1} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fontFamily="ui-monospace, monospace" fill={MATLAB_COLORS[0]}>
                {v}
              </text>
              <line x1={pad.left + plotW - 5} y1={y} x2={pad.left + plotW} y2={y} stroke={MATLAB_COLORS[1]} strokeWidth={1.1} />
              <text x={pad.left + plotW + 8} y={y + 4} textAnchor="start" fontSize="11" fontFamily="ui-monospace, monospace" fill={MATLAB_COLORS[1]}>
                {rv}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {pts.map((p) => {
          const active = hoveredYear === p.year;
          return (
            <g
              key={p.year}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredYear(p.year)}
              onMouseLeave={() => setHoveredYear(null)}
              onClick={() => onSelectYear(p.year)}
            >
              <rect
                x={p.cx - barW / 2}
                y={p.barY}
                width={barW}
                height={Math.max(2, p.barH)}
                fill={active ? '#005596' : MATLAB_COLORS[0]}
                fillOpacity={active ? 0.96 : 0.84}
                stroke={darkMode ? '#93c5fd' : '#003f6b'}
                strokeWidth={1}
              />
              <text
                x={p.cx}
                y={p.barY - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
                fill={MATLAB_COLORS[0]}
              >
                {p.count}
              </text>
              {/* X inward tick + label */}
              <line x1={p.cx} y1={pad.top + plotH} x2={p.cx} y2={pad.top + plotH - 5} stroke={axisInk} strokeWidth={1.1} />
              <text x={p.cx} y={pad.top + plotH + 17} textAnchor="middle" fontSize="11.5" fontWeight="600" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {p.year}
              </text>
            </g>
          );
        })}

        {/* Cumulative Line & Markers */}
        {pts.length > 1 && <path d={linePath} fill="none" stroke={MATLAB_COLORS[1]} strokeWidth={2.2} />}
        {pts.map((p) => (
          <g key={`cum-${p.year}`} pointerEvents="none">
            <circle cx={p.cx} cy={p.cumY} r={4.5} fill={plotBg} stroke={MATLAB_COLORS[1]} strokeWidth={2.2} />
            <text
              x={p.cx + 7}
              y={p.cumY - 7}
              textAnchor="start"
              fontSize="10"
              fontWeight="600"
              fontFamily="ui-monospace, monospace"
              fill={MATLAB_COLORS[1]}
            >
              Σ{p.cumulative}
            </text>
          </g>
        ))}

        {/* Axis Titles */}
        <text x={pad.left + plotW / 2} y={H - 10} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={axisInk}>
          Publication Year / 发表年份
        </text>
        <text
          x={16}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={MATLAB_COLORS[0]}
          transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
        >
          Annual Papers (篇)
        </text>
        <text
          x={W - 14}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={MATLAB_COLORS[1]}
          transform={`rotate(90 ${W - 14} ${pad.top + plotH / 2})`}
        >
          Cumulative (篇)
        </text>

        {/* MATLAB Legend Box */}
        <g transform={`translate(${pad.left + 10}, ${pad.top + 8})`}>
          <rect width={205} height={24} rx={2} fill={plotBg} fillOpacity={0.92} stroke={gridInk} strokeWidth={0.9} />
          <rect x={8} y={7} width={12} height={9} fill={MATLAB_COLORS[0]} fillOpacity={0.85} />
          <text x={24} y={15} fontSize="10.5" fill={axisInk}>年度发文量</text>
          <line x1={96} y1={11.5} x2={116} y2={11.5} stroke={MATLAB_COLORS[1]} strokeWidth={2} />
          <circle cx={106} cy={11.5} r={3} fill={plotBg} stroke={MATLAB_COLORS[1]} strokeWidth={1.8} />
          <text x={122} y={15} fontSize="10.5" fill={axisInk}>累计发表量</text>
        </g>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 2: MATLAB Horizontal Bar Chart (barh) — Journal Distribution
 * ============================================================================ */
export const MatlabJournalBarChart: React.FC<{
  journals: [string, number][];
  darkMode: boolean;
  onSelectJournal: (journal: string) => void;
}> = ({ journals, darkMode, onSelectJournal }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const items = journals.slice(0, 12);
  const W = 620;
  const rowH = 24;
  const pad = { top: 20, right: 48, bottom: 42, left: 220 };
  const plotH = Math.max(190, items.length * rowH + 10);
  const H = plotH + pad.top + pad.bottom;
  const plotW = W - pad.left - pad.right;

  const maxN = Math.max(...items.map((x) => x[1]), 1);
  const xMax = Math.max(4, Math.ceil(maxN + 1));
  const xTicks = Array.from({ length: Math.min(xMax + 1, 7) }, (_, i) => Math.round((xMax * i) / Math.min(xMax, 6)));
  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';
  const plotBg = darkMode ? '#0f172a' : '#ffffff';

  const shortName = (j: string) => (j.length > 34 ? `${j.slice(0, 32)}…` : j);

  return (
    <MatlabFigureShell
      figNum="Fig. 2"
      title="发表期刊与核心载体分布"
      filename="paperpulse-lab-fig2-journals"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="期刊分布水平柱状图">
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={plotBg} stroke={axisInk} strokeWidth={1.25} />

        {/* Vertical dashed gridlines */}
        {xTicks.map((v, i) => {
          const x = pad.left + (v / xMax) * plotW;
          return (
            <g key={i}>
              {v > 0 && v < xMax && (
                <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH - 4} stroke={axisInk} strokeWidth={1.1} />
              <text x={x} y={pad.top + plotH + 15} textAnchor="middle" fontSize="10.5" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}

        {items.map(([j, n], i) => {
          const y = pad.top + 8 + i * rowH;
          const barW = (n / xMax) * plotW;
          const isZh = /[\u3400-\u9fff]/.test(j);
          const color = isZh ? MATLAB_COLORS[4] : MATLAB_COLORS[0];
          const isHov = hovered === j;
          return (
            <g
              key={j}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(j)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectJournal(j)}
            >
              <text x={pad.left - 8} y={y + 13} textAnchor="end" fontSize="10.5" fontWeight={isHov ? '700' : '500'} fill={axisInk}>
                {shortName(j)}
              </text>
              <rect
                x={pad.left}
                y={y + 2}
                width={Math.max(4, barW)}
                height={15}
                fill={color}
                fillOpacity={isHov ? 0.98 : 0.82}
                stroke={darkMode ? '#e2e8f0' : '#0f172a'}
                strokeWidth={isHov ? 1 : 0.5}
              />
              <text
                x={pad.left + barW + 6}
                y={y + 13}
                fontSize="10.5"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
                fill={color}
              >
                {n}
              </text>
              <title>{`${j}：${n} 篇`}</title>
            </g>
          );
        })}

        <text x={pad.left + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
          Number of Publications (篇) — 蓝色: 英文SCI期刊 · 绿色: 中文核心期刊
        </text>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 3: MATLAB Parula Heatmap (imagesc + Colorbar) — Topic × Year Evolution
 * ============================================================================ */
export const MatlabTopicYearHeatmap: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectCell: (year: number, topic: ResearchTopic) => void;
}> = ({ analysis, darkMode, onSelectCell }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const topics = analysis.topics.slice(0, 10);
  const years = analysis.years;

  const matrix = useMemo(() => {
    let maxVal = 1;
    const rows = topics.map(([t]) => {
      const cells = years.map((y) => {
        const cnt = analysis.papers.filter(
          (p) => (analysis.paperYearById.get(p.id) || 0) === y && (p.topics || []).includes(t)
        ).length;
        if (cnt > maxVal) maxVal = cnt;
        return { year: y, topic: t, count: cnt };
      });
      return { topic: t, cells };
    });
    return { rows, maxVal };
  }, [analysis, topics, years]);

  const W = 640;
  const cellH = 26;
  const pad = { top: 24, right: 78, bottom: 44, left: 162 };
  const plotH = Math.max(160, matrix.rows.length * cellH);
  const H = plotH + pad.top + pad.bottom;
  const plotW = W - pad.left - pad.right;
  const cellW = plotW / Math.max(years.length, 1);

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';

  return (
    <MatlabFigureShell
      figNum="Fig. 3"
      title="研究方向 × 年份演进热力矩阵"
      filename="paperpulse-lab-fig3-topic-heatmap"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="研究方向年份演进热力图">
        <defs>
          <linearGradient id="matlab-parula-vert" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={parulaColor(0)} />
            <stop offset="20%" stopColor={parulaColor(0.2)} />
            <stop offset="40%" stopColor={parulaColor(0.4)} />
            <stop offset="60%" stopColor={parulaColor(0.6)} />
            <stop offset="80%" stopColor={parulaColor(0.8)} />
            <stop offset="100%" stopColor={parulaColor(1)} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />

        {matrix.rows.map((row, ri) => {
          const y = pad.top + ri * cellH;
          const label = (TOPIC_META[row.topic]?.label || row.topic).replace(/\s*\(.*?\)/, '');
          return (
            <g key={row.topic}>
              <text x={pad.left - 8} y={y + cellH / 2 + 4} textAnchor="end" fontSize="11" fontWeight="500" fill={axisInk}>
                {label}
              </text>
              {row.cells.map((c, ci) => {
                const x = pad.left + ci * cellW;
                const norm = c.count === 0 ? 0 : 0.14 + 0.86 * (c.count / matrix.maxVal);
                const bg = c.count === 0 ? (darkMode ? '#1e293b' : '#f1f5f9') : parulaColor(norm);
                const textFill = c.count === 0 ? (darkMode ? '#475569' : '#94a3b8') : norm > 0.64 ? '#0f172a' : '#ffffff';
                return (
                  <g
                    key={c.year}
                    className={c.count > 0 ? 'cursor-pointer' : ''}
                    onClick={() => c.count > 0 && onSelectCell(c.year, c.topic)}
                  >
                    <rect x={x} y={y} width={cellW} height={cellH} fill={bg} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={1.5} />
                    <text
                      x={x + cellW / 2}
                      y={y + cellH / 2 + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={c.count > 0 ? '700' : '400'}
                      fontFamily="ui-monospace, monospace"
                      fill={textFill}
                    >
                      {c.count}
                    </text>
                    <title>{`${label} (${c.year}): ${c.count} 篇`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Outer Axis Box */}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="none" stroke={axisInk} strokeWidth={1.25} />

        {/* Year X Labels */}
        {years.map((yr, ci) => {
          const x = pad.left + (ci + 0.5) * cellW;
          return (
            <text key={yr} x={x} y={pad.top + plotH + 17} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="ui-monospace, monospace" fill={axisInk}>
              {yr}
            </text>
          );
        })}
        <text x={pad.left + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
          Publication Year / 发表年份
        </text>

        {/* Right Calibrated Colorbar */}
        <g transform={`translate(${pad.left + plotW + 18}, ${pad.top})`}>
          <rect x={0} y={0} width={14} height={plotH} fill="url(#matlab-parula-vert)" stroke={axisInk} strokeWidth={1} />
          {[0, 0.5, 1].map((t) => {
            const cy = plotH * (1 - t);
            const val = Math.round(t * matrix.maxVal);
            return (
              <g key={t}>
                <line x1={14} y1={cy} x2={18} y2={cy} stroke={axisInk} strokeWidth={1} />
                <text x={22} y={cy + 3.5} fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                  {val}
                </text>
              </g>
            );
          })}
          <text
            x={46}
            y={plotH / 2}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={axisInk}
            transform={`rotate(90 46 ${plotH / 2})`}
          >
            Papers (篇)
          </text>
        </g>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 4: Deduplicated Bilingual Author Contribution Chart (MATLAB Stacked barh)
 * ============================================================================ */
export const MatlabAuthorContributionChart: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectAuthor: (authorName: string) => void;
}> = ({ analysis, darkMode, onSelectAuthor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const items = analysis.canonicalAuthors.slice(0, 14);

  const W = 620;
  const rowH = 22;
  const pad = { top: 36, right: 56, bottom: 40, left: 146 };
  const plotH = Math.max(190, items.length * rowH + 8);
  const H = plotH + pad.top + pad.bottom;
  const plotW = W - pad.left - pad.right;
  const maxN = Math.max(...items.map((a) => a.count), 4);
  const xMax = Math.ceil((maxN + 2) / 5) * 5;
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((xMax * i) / 5));

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';
  const plotBg = darkMode ? '#0f172a' : '#ffffff';

  return (
    <MatlabFigureShell
      figNum="Fig. 4"
      title="核心作者贡献排行"
      filename="paperpulse-lab-fig4-authors"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="去重合并后的作者发文排行">
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={plotBg} stroke={axisInk} strokeWidth={1.25} />

        {ticks.map((v, i) => {
          const x = pad.left + (v / xMax) * plotW;
          return (
            <g key={i}>
              {v > 0 && v < xMax && (
                <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH - 4} stroke={axisInk} strokeWidth={1.1} />
              <text x={x} y={pad.top + plotH + 15} textAnchor="middle" fontSize="10.5" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}

        {items.map((a, i) => {
          const y = pad.top + 6 + i * rowH;
          const leadCount = Math.min(a.count, a.firstAuthorCount + a.correspondingCount);
          const totalW = (a.count / xMax) * plotW;
          const leadW = (leadCount / xMax) * plotW;
          const coopW = Math.max(0, totalW - leadW);
          return (
            <g key={a.info.id} className="cursor-pointer" onClick={() => onSelectAuthor(a.info.shortName)}>
              <text x={pad.left - 8} y={y + 12} textAnchor="end" fontSize="10.5" fontWeight="600" fill={axisInk}>
                {a.info.displayName.length > 20 ? a.info.shortName : a.info.displayName}
              </text>
              {leadW > 0 && (
                <rect x={pad.left} y={y + 2} width={leadW} height={13} fill={MATLAB_COLORS[1]} fillOpacity={0.88} />
              )}
              {coopW > 0 && (
                <rect x={pad.left + leadW} y={y + 2} width={coopW} height={13} fill={MATLAB_COLORS[0]} fillOpacity={0.78} />
              )}
              <text
                x={pad.left + totalW + 6}
                y={y + 12}
                fontSize="10.5"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
                fill={axisInk}
              >
                {a.count}
              </text>
              <title>{`${a.info.displayName}：共 ${a.count} 篇（一作 ${a.firstAuthorCount} / 通讯 ${a.correspondingCount}），已合并署名变体：${a.rawVariants.join('、')}`}</title>
            </g>
          );
        })}

        {/* Legend neatly placed above plot box so it never overlaps top bar */}
        <g transform={`translate(${pad.left + plotW - 204}, 6)`}>
          <rect width={204} height={22} rx={3} fill={plotBg} stroke={gridInk} strokeWidth={0.9} />
          <rect x={8} y={6} width={10} height={9} fill={MATLAB_COLORS[1]} />
          <text x={22} y={14} fontSize="10" fill={axisInk}>一作/通讯</text>
          <rect x={92} y={6} width={10} height={9} fill={MATLAB_COLORS[0]} />
          <text x={106} y={14} fontSize="10" fill={axisInk}>共同署名参与</text>
        </g>

        <text x={pad.left + plotW / 2} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
          Deduplicated Publications Count (篇)
        </text>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 5: MATLAB Force-Packed Bilingual Hot-Word Bubble Field (Parula Year Scale)
 * ============================================================================ */
interface KwBubbleNode extends SimulationNodeDatum {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  avgYear: number;
  category: string;
  r: number;
}

export const MatlabKeywordBubbleChart: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectKeyword: (kw: string) => void;
}> = ({ analysis, darkMode, onSelectKeyword }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<KwBubbleNode | null>(null);

  const W = 760;
  const H = 430;
  const boxX = 12;
  const boxY = 12;
  const boxW = W - 92;
  const boxH = H - 24;
  const minYear = Math.min(...analysis.years, 2023);
  const maxYear = Math.max(...analysis.years, 2027);
  const spanYear = Math.max(1, maxYear - minYear);

  const bubbles = useMemo<KwBubbleNode[]>(() => {
    const top = analysis.canonicalKeywords.slice(0, 20);
    const maxCnt = Math.max(...top.map((k) => k.count), 1);
    const cx0 = boxX + boxW / 2;
    const cy0 = boxY + boxH / 2;
    const nodes: KwBubbleNode[] = top.map((k, idx) => {
      const r = 24 + Math.sqrt(k.count / maxCnt) * 28;
      const angle = idx * 2.39996;
      const rad = 26 + idx * 7.2;
      return {
        id: k.info.id,
        label: k.info.label,
        shortLabel: k.info.shortLabel,
        count: k.count,
        avgYear: k.avgYear,
        category: k.info.category,
        r,
        x: cx0 + Math.cos(angle) * rad,
        y: cy0 + Math.sin(angle) * rad * 0.58,
      };
    });
    const sim = forceSimulation(nodes)
      .force('center', forceCenter(cx0, cy0))
      .force('charge', forceManyBody().strength(-14))
      .force('x', forceX<KwBubbleNode>(cx0).strength(0.06))
      .force('y', forceY<KwBubbleNode>(cy0).strength(0.11))
      .force('collide', forceCollide<KwBubbleNode>((d) => d.r + 5).iterations(8))
      .stop();
    for (let i = 0; i < 200; i++) {
      sim.tick();
      for (const n of nodes) {
        n.x = Math.max(boxX + n.r + 6, Math.min(boxX + boxW - n.r - 6, n.x || cx0));
        n.y = Math.max(boxY + n.r + 6, Math.min(boxY + boxH - n.r - 6, n.y || cy0));
      }
    }
    return nodes;
  }, [analysis.canonicalKeywords, boxW, boxH]);

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';

  return (
    <MatlabFigureShell
      figNum="Fig. 5"
      title="核心热词演进气泡图"
      filename="paperpulse-lab-fig5-keyword-bubbles"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="中英文合并热词力导向气泡图">
        <defs>
          <linearGradient id="matlab-parula-kw" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={parulaColor(0)} />
            <stop offset="25%" stopColor={parulaColor(0.25)} />
            <stop offset="50%" stopColor={parulaColor(0.5)} />
            <stop offset="75%" stopColor={parulaColor(0.75)} />
            <stop offset="100%" stopColor={parulaColor(1)} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={4} fill={darkMode ? '#0b1220' : '#f8fafc'} stroke={axisInk} strokeWidth={1.1} />

        {bubbles.map((b) => {
          const t = (b.avgYear - minYear) / spanYear;
          const fill = parulaColor(t);
          const isHov = hovered?.id === b.id;
          const darkText = t > 0.62;
          const maxChars = b.r >= 40 ? 8 : b.r >= 32 ? 6 : 5;
          const displayTxt = b.shortLabel.length > maxChars ? `${b.shortLabel.slice(0, maxChars - 1)}…` : b.shortLabel;
          return (
            <g
              key={b.id}
              transform={`translate(${b.x}, ${b.y})`}
              className="cursor-pointer transition-transform"
              onMouseEnter={() => setHovered(b)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectKeyword(b.shortLabel)}
            >
              {isHov && <circle r={b.r + 4} fill="none" stroke={MATLAB_COLORS[1]} strokeWidth={2.2} strokeDasharray="4 2" />}
              <circle
                r={b.r}
                fill={fill}
                fillOpacity={isHov ? 0.98 : 0.9}
                stroke={darkMode ? '#e2e8f0' : '#0f172a'}
                strokeWidth={isHov ? 1.8 : 0.9}
              />
              <text
                y={-2}
                textAnchor="middle"
                fontSize={Math.max(8.5, Math.min(12, b.r * 0.25))}
                fontWeight="700"
                fill={darkText ? '#0f172a' : '#ffffff'}
              >
                {displayTxt}
              </text>
              <text
                y={12}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
                fill={darkText ? '#1e293b' : '#e2e8f0'}
              >
                {b.count}篇 · {b.avgYear.toFixed(1)}
              </text>
              <title>{`${b.label}：出现于 ${b.count} 篇文献，平均活跃年份 ${b.avgYear.toFixed(1)}`}</title>
            </g>
          );
        })}

        {/* Right Parula Colorbar for Active Year */}
        <g transform={`translate(${W - 64}, 24)`}>
          <rect x={0} y={0} width={14} height={H - 48} fill="url(#matlab-parula-kw)" stroke={axisInk} strokeWidth={1} />
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const cy = (H - 48) * (1 - t);
            const yr = (minYear + t * spanYear).toFixed(1);
            return (
              <g key={t}>
                <line x1={14} y1={cy} x2={18} y2={cy} stroke={axisInk} strokeWidth={1} />
                <text x={22} y={cy + 3.5} fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                  {yr}
                </text>
              </g>
            );
          })}
          <text x={7} y={-8} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={axisInk}>
            Avg Year
          </text>
        </g>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 6: MATLAB Technology × Domain Coverage & Potential Research Gap Matrix
 *         + Strategic Novelty × Feasibility Opportunity Quadrant
 * ============================================================================ */
export const MatlabGapOpportunityMatrix: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onOpenPaper: (paper: AcademicPaper) => void;
}> = ({ analysis, darkMode, onOpenPaper }) => {
  const matrixSvgRef = useRef<SVGSVGElement | null>(null);
  const quadSvgRef = useRef<SVGSVGElement | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ techId: string; domainId: string } | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<PotentialDirectionInsight | null>(
    analysis.potentialDirections[0] || null
  );

  const techs = analysis.techAxes;
  const doms = analysis.domainAxes;
  const cellLookup = useMemo(
    () => new Map(analysis.techDomainMatrix.map((c) => [`${c.techId}__${c.domainId}`, c])),
    [analysis.techDomainMatrix]
  );
  const maxCnt = Math.max(...analysis.techDomainMatrix.map((c) => c.papers.length), 1);

  const W = 760;
  const cellH = 38;
  const pad = { top: 44, right: 86, bottom: 30, left: 150 };
  const plotH = techs.length * cellH;
  const H = plotH + pad.top + pad.bottom;
  const plotW = W - pad.left - pad.right;
  const cellW = plotW / Math.max(doms.length, 1);

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';

  const activeCell = selectedCell ? cellLookup.get(`${selectedCell.techId}__${selectedCell.domainId}`) : null;
  const activeTech = selectedCell ? techs.find((t) => t.id === selectedCell.techId) : null;
  const activeDom = selectedCell ? doms.find((d) => d.id === selectedCell.domainId) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Technology × Industrial Domain Coverage & Gap Matrix */}
        <div className="xl:col-span-7">
          <MatlabFigureShell
            figNum="Fig. 6a"
            title="核心技术 × 工业场景覆盖矩阵与空白探测"
            filename="paperpulse-lab-fig6a-gap-matrix"
            darkMode={darkMode}
            svgRef={matrixSvgRef}
          >
            <svg ref={matrixSvgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="技术与工业场景交叉覆盖及潜在方向矩阵">
              <defs>
                <linearGradient id="matlab-gap-parula" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={parulaColor(0.08)} />
                  <stop offset="50%" stopColor={parulaColor(0.48)} />
                  <stop offset="100%" stopColor={parulaColor(0.95)} />
                </linearGradient>
              </defs>
              <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />

              {/* Domain Column Headers */}
              {doms.map((d, ci) => {
                const x = pad.left + (ci + 0.5) * cellW;
                return (
                  <text key={d.id} x={x} y={pad.top - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={axisInk}>
                    {d.shortLabel}
                  </text>
                );
              })}

              {/* Matrix Rows */}
              {techs.map((t, ri) => {
                const y = pad.top + ri * cellH;
                return (
                  <g key={t.id}>
                    <text x={pad.left - 10} y={y + cellH / 2 + 4} textAnchor="end" fontSize="11" fontWeight="600" fill={axisInk}>
                      {t.shortLabel}
                    </text>
                    {doms.map((d, ci) => {
                      const x = pad.left + ci * cellW;
                      const cell = cellLookup.get(`${t.id}__${d.id}`);
                      const cnt = cell?.papers.length || 0;
                      const isGap = Boolean(cell?.isGapOpportunity);
                      const isSel = selectedCell?.techId === t.id && selectedCell?.domainId === d.id;
                      const norm = cnt > 0 ? 0.15 + 0.8 * (cnt / maxCnt) : 0;
                      const bg =
                        cnt > 0
                          ? parulaColor(norm)
                          : isGap
                            ? darkMode
                              ? 'rgba(237, 177, 32, 0.18)'
                              : 'rgba(237, 177, 32, 0.16)'
                            : darkMode
                              ? '#1e293b'
                              : '#f8fafc';
                      const textFill =
                        cnt > 0
                          ? norm > 0.65
                            ? '#0f172a'
                            : '#ffffff'
                          : isGap
                            ? '#b45309'
                            : darkMode
                              ? '#475569'
                              : '#94a3b8';

                      return (
                        <g
                          key={d.id}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedCell({ techId: t.id, domainId: d.id });
                            const opp = analysis.potentialDirections.find(
                              (o) => o.techAxis.id === t.id && o.domainAxis.id === d.id
                            );
                            if (opp) setSelectedOpportunity(opp);
                          }}
                        >
                          <rect
                            x={x + 2}
                            y={y + 2}
                            width={cellW - 4}
                            height={cellH - 4}
                            rx={3}
                            fill={bg}
                            stroke={isSel ? MATLAB_COLORS[1] : isGap ? '#d97706' : darkMode ? '#334155' : '#e2e8f0'}
                            strokeWidth={isSel ? 2.4 : isGap ? 1.4 : 1}
                            strokeDasharray={isGap && !isSel ? '4 2.5' : undefined}
                          />
                          <text
                            x={x + cellW / 2}
                            y={y + cellH / 2 + 4}
                            textAnchor="middle"
                            fontSize={isGap ? '11.5' : '12'}
                            fontWeight="700"
                            fontFamily="ui-monospace, monospace"
                            fill={textFill}
                          >
                            {cnt > 0 ? `${cnt} 篇` : isGap ? '★ 空白' : '—'}
                          </text>
                          <title>
                            {cnt > 0
                              ? `${t.label} × ${d.label}：已有 ${cnt} 篇成果`
                              : isGap
                                ? `潜在交叉空白：${t.label} × ${d.label}（点击查看拓展路径）`
                                : `${t.label} × ${d.label}：0 篇`}
                          </title>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="none" stroke={axisInk} strokeWidth={1.25} />

              {/* Right Colorbar */}
              <g transform={`translate(${pad.left + plotW + 18}, ${pad.top})`}>
                <rect x={0} y={0} width={14} height={plotH} fill="url(#matlab-gap-parula)" stroke={axisInk} strokeWidth={1} />
                {[0, 0.5, 1].map((t) => {
                  const cy = plotH * (1 - t);
                  return (
                    <g key={t}>
                      <line x1={14} y1={cy} x2={18} y2={cy} stroke={axisInk} strokeWidth={1} />
                      <text x={22} y={cy + 3.5} fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                        {Math.round(t * maxCnt)}
                      </text>
                    </g>
                  );
                })}
                <text x={7} y={-8} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={axisInk}>
                  篇数
                </text>
              </g>
            </svg>

            {/* Cell Evidence Drawer */}
            {activeCell && activeTech && activeDom && (
              <div
                className={`mt-3 rounded-xl border p-3.5 text-xs ${
                  activeCell.isGapOpportunity
                    ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {activeTech.label} × {activeDom.label}
                  </span>
                  <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {activeCell.papers.length > 0 ? `已有 ${activeCell.papers.length} 篇支撑论文` : '★ 高潜力交叉空白机会'}
                  </span>
                </div>
                {activeCell.papers.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {activeCell.papers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenPaper(p)}
                        className="block w-full truncate text-left text-indigo-700 hover:underline dark:text-indigo-300"
                      >
                        • [{analysis.paperYearById.get(p.id) || p.publishedDate.slice(0, 4)}] {p.titleZh || p.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 leading-5 text-slate-700 dark:text-slate-300">
                    {activeCell.rationale || '该交叉方向尚未有课题组成果覆盖，右侧战略机会象限与下方卡片已给出具体技术迁移路径。'}
                  </p>
                )}
              </div>
            )}
          </MatlabFigureShell>
        </div>

        {/* Right: Strategic Novelty × Feasibility Bubble Quadrant */}
        <div className="xl:col-span-5">
          <MatlabFigureShell
            figNum="Fig. 6b"
            title="潜在方向「创新度 × 可行性」战略象限"
            filename="paperpulse-lab-fig6b-frontier-quadrant"
            darkMode={darkMode}
            svgRef={quadSvgRef}
          >
            {(() => {
              const QW = 520;
              const QH = 350;
              const qPad = { top: 32, right: 26, bottom: 48, left: 54 };
              const qpW = QW - qPad.left - qPad.right;
              const qpH = QH - qPad.top - qPad.bottom;
              const opps = analysis.potentialDirections.slice(0, 8);
              const xScale = (v: number) => qPad.left + ((v - 45) / 55) * qpW;
              const yScale = (v: number) => qPad.top + qpH - ((v - 55) / 45) * qpH;
              const midX = xScale(72);
              const midY = yScale(78);

              // Collision-free bubble positions so P1..P8 never overlap!
              type QNode = SimulationNodeDatum & { opp: PotentialDirectionInsight; idx: number; tx: number; ty: number };
              const qNodes: QNode[] = opps.map((opp, idx) => {
                const tx = xScale(opp.feasibilityScore);
                const ty = yScale(opp.noveltyScore);
                return { opp, idx, tx, ty, x: tx + ((idx % 3) - 1) * 14, y: ty + (idx % 2 === 0 ? -12 : 12) };
              });
              const qSim = forceSimulation<QNode>(qNodes)
                .force('x', forceX<QNode>((d) => d.tx).strength(0.24))
                .force('y', forceY<QNode>((d) => d.ty).strength(0.24))
                .force('collide', forceCollide<QNode>(34).iterations(8))
                .stop();
              for (let k = 0; k < 150; k++) {
                qSim.tick();
                for (const qn of qNodes) {
                  qn.x = Math.max(qPad.left + 32, Math.min(qPad.left + qpW - 32, qn.x || qn.tx));
                  qn.y = Math.max(qPad.top + 22, Math.min(qPad.top + qpH - 30, qn.y || qn.ty));
                }
              }

              return (
                <svg ref={quadSvgRef} viewBox={`0 0 ${QW} ${QH}`} className="w-full select-none" role="img" aria-label="潜在方向创新度与可行性象限图">
                  <rect x={0} y={0} width={QW} height={QH} fill={darkMode ? '#0f172a' : '#ffffff'} />
                  <rect x={qPad.left} y={qPad.top} width={qpW} height={qpH} fill={darkMode ? '#0b1220' : '#ffffff'} stroke={axisInk} strokeWidth={1.25} />

                  {/* Highlight Top-Right Priority Quadrant */}
                  <rect x={midX} y={qPad.top} width={qPad.left + qpW - midX} height={midY - qPad.top} fill={darkMode ? 'rgba(217,83,25,0.12)' : 'rgba(217,83,25,0.07)'} />
                  <text x={qPad.left + qpW} y={qPad.top - 10} textAnchor="end" fontSize="10" fontWeight="700" fill={MATLAB_COLORS[1]}>
                    右上象限：优先攻关区（高创新 · 高可行）
                  </text>
                  <line x1={midX} y1={qPad.top} x2={midX} y2={qPad.top + qpH} stroke={gridInk} strokeDasharray="4 3" strokeWidth={1} />
                  <line x1={qPad.left} y1={midY} x2={qPad.left + qpW} y2={midY} stroke={gridInk} strokeDasharray="4 3" strokeWidth={1} />

                  {/* Ticks */}
                  {[45, 58, 72, 86, 100].map((v) => (
                    <g key={`qx-${v}`}>
                      <line x1={xScale(v)} y1={qPad.top + qpH} x2={xScale(v)} y2={qPad.top + qpH - 4} stroke={axisInk} />
                      <text x={xScale(v)} y={qPad.top + qpH + 15} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                        {v}
                      </text>
                    </g>
                  ))}
                  {[55, 66, 78, 89, 100].map((v) => (
                    <g key={`qy-${v}`}>
                      <line x1={qPad.left} y1={yScale(v)} x2={qPad.left + 4} y2={yScale(v)} stroke={axisInk} />
                      <text x={qPad.left - 8} y={yScale(v) + 3.5} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                        {v}
                      </text>
                    </g>
                  ))}

                  {/* Collision-free Opportunity Bubbles */}
                  {qNodes.map((qn) => {
                    const { opp, idx } = qn;
                    const cx = qn.x || qn.tx;
                    const cy = qn.y || qn.ty;
                    const isSel = selectedOpportunity?.id === opp.id;
                    const color = MATLAB_COLORS[idx % MATLAB_COLORS.length];
                    return (
                      <g key={opp.id} className="cursor-pointer" onClick={() => setSelectedOpportunity(opp)}>
                        {isSel && <circle cx={cx} cy={cy} r={19} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 2" />}
                        <circle cx={cx} cy={cy} r={13.5} fill={color} fillOpacity={isSel ? 0.96 : 0.84} stroke="#ffffff" strokeWidth={1.5} />
                        <text x={cx} y={cy + 3.8} textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="ui-monospace, monospace" fill="#ffffff">
                          P{idx + 1}
                        </text>
                        <text
                          x={cx}
                          y={cy + 23}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight={isSel ? '700' : '600'}
                          fill={axisInk}
                          paintOrder="stroke"
                          stroke={darkMode ? '#0b1220' : '#ffffff'}
                          strokeWidth={2.5}
                        >
                          {opp.techAxis.shortLabel.slice(0, 4)}×{opp.domainAxis.shortLabel.slice(0, 4)}
                        </text>
                        <title>{`P${idx + 1}: ${opp.title}（可行性 ${opp.feasibilityScore} / 创新度 ${opp.noveltyScore}）`}</title>
                      </g>
                    );
                  })}

                  <text x={qPad.left + qpW / 2} y={QH - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
                    Feasibility Score / 依托现有积累的可行性
                  </text>
                  <text
                    x={16}
                    y={qPad.top + qpH / 2}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={axisInk}
                    transform={`rotate(-90 16 ${qPad.top + qpH / 2})`}
                  >
                    Frontier Novelty / 前沿空白度
                  </text>
                </svg>
              );
            })()}
          </MatlabFigureShell>
        </div>
      </div>

      {/* Selected Potential Frontier Deep-Dive Cards */}
      {analysis.potentialDirections.length > 0 && (
        <div
          className={`rounded-2xl border p-5 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-indigo-50/40 shadow-xs'
          }`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                潜在高价值研究方向深度推演（基于课题组已有成果交叉空白分析）
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.potentialDirections.slice(0, 6).map((opp, idx) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => setSelectedOpportunity(opp)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    selectedOpportunity?.id === opp.id
                      ? 'bg-[#0072BD] text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  P{idx + 1} · {opp.techAxis.shortLabel} × {opp.domainAxis.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {selectedOpportunity && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#D95319] px-2 py-0.5 text-xs font-bold text-white">
                    推荐前沿选题
                  </span>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">{selectedOpportunity.title}</h4>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">前沿创新度</div>
                    <div className="font-mono text-lg font-bold text-[#D95319]">{selectedOpportunity.noveltyScore}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">课题组可行性</div>
                    <div className="font-mono text-lg font-bold text-[#0072BD]">{selectedOpportunity.feasibilityScore}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">技术侧支撑</div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                      {selectedOpportunity.techSupportPapers.length}+ 篇
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white/90 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[11px] text-slate-500">场景侧支撑</div>
                    <div className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                      {selectedOpportunity.domainSupportPapers.length}+ 篇
                    </div>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-sm leading-6 dark:border-slate-700 dark:bg-slate-800/80">
                  <p>
                    <strong className="text-[#0072BD] dark:text-sky-400">待解科学问题：</strong>
                    {selectedOpportunity.scientificQuestion}
                  </p>
                  <p>
                    <strong className="text-[#7E2F8E] dark:text-purple-400">技术迁移路径：</strong>
                    {selectedOpportunity.migrationPath}
                  </p>
                  <p>
                    <strong className="text-[#77AC30] dark:text-emerald-400">实验验证建议：</strong>
                    {selectedOpportunity.validationHint}
                  </p>
                </div>
              </div>

              <div className="space-y-3 lg:col-span-5">
                <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="mb-1.5 text-xs font-bold text-[#0072BD] dark:text-sky-400">
                    技术侧基石论文（{selectedOpportunity.techAxis.label}）
                  </div>
                  <div className="space-y-1.5">
                    {selectedOpportunity.techSupportPapers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenPaper(p)}
                        className="block w-full text-left text-xs leading-5 text-slate-700 hover:text-[#0072BD] hover:underline dark:text-slate-200"
                      >
                        • [{analysis.paperYearById.get(p.id) || p.publishedDate.slice(0, 4)}] {p.titleZh || p.title}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="mb-1.5 text-xs font-bold text-[#D95319] dark:text-orange-400">
                    场景侧基石论文（{selectedOpportunity.domainAxis.label}）
                  </div>
                  <div className="space-y-1.5">
                    {selectedOpportunity.domainSupportPapers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenPaper(p)}
                        className="block w-full text-left text-xs leading-5 text-slate-700 hover:text-[#D95319] hover:underline dark:text-slate-200"
                      >
                        • [{analysis.paperYearById.get(p.id) || p.publishedDate.slice(0, 4)}] {p.titleZh || p.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


/* ============================================================================
 * Fig. 7: Author Social Attributes Bubble Chart
 *         X: Co-author Degree | Y: Cross-Domain/Tech Span | Size: Output | Color: Social Role
 * ============================================================================ */
export const MatlabAuthorSocialBubbleChart: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectAuthor: (authorName: string) => void;
}> = ({ analysis, darkMode, onSelectAuthor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const items = analysis.canonicalAuthors.slice(0, 18);
  const W = 640;
  const H = 370;
  const pad = { top: 38, right: 30, bottom: 48, left: 54 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxDeg = Math.max(...items.map((a) => a.coauthorDegree), 6) + 2;
  const maxSpan = Math.max(...items.map((a) => a.techSpan + a.domainSpan), 6) + 2;
  const maxCount = Math.max(...items.map((a) => a.count), 1);

  const xScale = (v: number) => pad.left + (v / maxDeg) * plotW;
  const yScale = (v: number) => pad.top + plotH - (v / maxSpan) * plotH;

  const roleColors: Record<string, string> = {
    '枢纽导师': MATLAB_COLORS[1],
    '跨方向桥梁': MATLAB_COLORS[3],
    '核心主力': MATLAB_COLORS[0],
    '合作成员': MATLAB_COLORS[4],
  };

  // Collision-free author bubble positions
  const socialBubbles = useMemo(() => {
    type SNode = SimulationNodeDatum & {
      a: (typeof items)[number];
      r: number;
      tx: number;
      ty: number;
    };
    const nodes: SNode[] = items.map((a, idx) => {
      const r = 11 + Math.sqrt(a.count / maxCount) * 16;
      const tx = xScale(a.coauthorDegree);
      const ty = yScale(a.techSpan + a.domainSpan);
      return { a, r, tx, ty, x: tx + ((idx % 3) - 1) * 6, y: ty + (idx % 2 === 0 ? -5 : 5) };
    });
    const sim = forceSimulation<SNode>(nodes)
      .force('x', forceX<SNode>((d) => d.tx).strength(0.32))
      .force('y', forceY<SNode>((d) => d.ty).strength(0.32))
      .force('collide', forceCollide<SNode>((d) => d.r + 3.5).iterations(8))
      .stop();
    for (let i = 0; i < 160; i++) {
      sim.tick();
      for (const n of nodes) {
        n.x = Math.max(pad.left + n.r + 4, Math.min(pad.left + plotW - n.r - 4, n.x || n.tx));
        n.y = Math.max(pad.top + n.r + 4, Math.min(pad.top + plotH - n.r - 4, n.y || n.ty));
      }
    }
    return nodes;
  }, [items, maxCount, maxDeg, maxSpan]);

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';
  const plotBg = darkMode ? '#0b1220' : '#ffffff';

  const xTicks = Array.from({ length: 6 }, (_, i) => Math.round((maxDeg * i) / 5));
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxSpan * i) / 4));

  return (
    <MatlabFigureShell
      figNum="Fig. 7"
      title="作者社交中心性 × 跨方向融合度气泡图"
      filename="paperpulse-lab-fig7-author-social-bubble"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="作者社交中心性与跨方向融合气泡图">
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />

        {/* Legend neatly placed above plot box so it never touches any bubble */}
        <g transform={`translate(${pad.left}, 8)`}>
          <rect width={320} height={22} rx={3} fill={plotBg} stroke={gridInk} strokeWidth={0.9} />
          {Object.entries(roleColors).map(([role, col], idx) => (
            <g key={role} transform={`translate(${12 + idx * 78}, 11)`}>
              <circle r={4.5} fill={col} />
              <text x={8} y={3.5} fontSize="10" fontWeight="600" fill={axisInk}>{role}</text>
            </g>
          ))}
        </g>

        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={plotBg} stroke={axisInk} strokeWidth={1.25} />

        {/* Dashed Grid */}
        {xTicks.map((v, i) => {
          const x = xScale(v);
          return (
            <g key={`x-${i}`}>
              {i > 0 && i < xTicks.length - 1 && (
                <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH - 4} stroke={axisInk} />
              <text x={x} y={pad.top + plotH + 16} textAnchor="middle" fontSize="10.5" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={`y-${i}`}>
              {i > 0 && i < yTicks.length - 1 && (
                <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={pad.left} y1={y} x2={pad.left + 4} y2={y} stroke={axisInk} />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}

        {/* Collision-free Bubbles */}
        {socialBubbles.map((bn) => {
          const { a, r } = bn;
          const cx = bn.x || bn.tx;
          const cy = bn.y || bn.ty;
          const col = roleColors[a.socialRole] || MATLAB_COLORS[0];
          const isHov = hoveredId === a.info.id;
          return (
            <g
              key={a.info.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredId(a.info.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectAuthor(a.info.shortName)}
            >
              {isHov && <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={col} strokeWidth={1.8} strokeDasharray="3 2" />}
              <circle cx={cx} cy={cy} r={r} fill={col} fillOpacity={isHov ? 0.96 : 0.84} stroke="#ffffff" strokeWidth={1.5} />
              <text
                x={cx}
                y={cy + 3.2}
                textAnchor="middle"
                fontSize={r > 16 ? '10' : '8.5'}
                fontWeight="700"
                fill="#ffffff"
              >
                {a.info.shortName.slice(0, 3)}
              </text>
              <title>{`${a.info.displayName} [${a.socialRole}] · 发文 ${a.count} 篇 · 合作者 ${a.coauthorDegree} 人 · 覆盖技术 ${a.techSpan} + 场景 ${a.domainSpan}`}</title>
            </g>
          );
        })}

        <text x={pad.left + plotW / 2} y={H - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
          Co-author Degree / 合作者广度（人）
        </text>
        <text
          x={16}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={axisInk}
          transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
        >
          Cross-Direction Span (技术+场景跨度)
        </text>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 8: Author × Tech/Domain Specialization Bubble Matrix
 * ============================================================================ */
export const MatlabAuthorThemeBubbleMatrix: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectAuthor: (authorName: string) => void;
}> = ({ analysis, darkMode, onSelectAuthor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [axisType, setAxisType] = useState<'tech' | 'domain'>('tech');

  const authors = analysis.canonicalAuthors.slice(0, 12);
  const axes = axisType === 'tech' ? analysis.techAxes : analysis.domainAxes;
  const countsSource = axisType === 'tech' ? analysis.authorTechCounts : analysis.authorDomainCounts;

  const minYear = Math.min(...analysis.years, 2023);
  const maxYear = Math.max(...analysis.years, 2027);
  const spanYear = Math.max(1, maxYear - minYear);

  let maxCell = 1;
  for (const a of authors) {
    const m = countsSource.get(a.info.id);
    if (m) m.forEach((v) => { if (v.count > maxCell) maxCell = v.count; });
  }

  const W = 680;
  const rowH = 26;
  const pad = { top: 44, right: 64, bottom: 26, left: 108 };
  const plotH = Math.max(200, authors.length * rowH);
  const H = plotH + pad.top + pad.bottom;
  const plotW = W - pad.left - pad.right;
  const colW = plotW / Math.max(axes.length, 1);

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#1e293b' : '#e2e8f0';

  return (
    <MatlabFigureShell
      figNum="Fig. 8"
      title="成员 × 方向学术分工与互补气泡矩阵"
      filename={`paperpulse-lab-fig8-author-${axisType}-bubbles`}
      darkMode={darkMode}
      svgRef={svgRef}
      extraControls={
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[11px] dark:border-slate-700">
          <button
            type="button"
            onClick={() => setAxisType('tech')}
            className={`rounded px-2 py-0.5 font-semibold ${axisType === 'tech' ? 'bg-[#0072BD] text-white' : 'text-slate-500'}`}
          >
            技术方法
          </button>
          <button
            type="button"
            onClick={() => setAxisType('domain')}
            className={`rounded px-2 py-0.5 font-semibold ${axisType === 'domain' ? 'bg-[#0072BD] text-white' : 'text-slate-500'}`}
          >
            工业场景
          </button>
        </div>
      }
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="成员与研究方向分工气泡矩阵">
        <defs>
          <linearGradient id="matlab-parula-f8" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={parulaColor(0)} />
            <stop offset="50%" stopColor={parulaColor(0.5)} />
            <stop offset="100%" stopColor={parulaColor(1)} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={darkMode ? '#0b1220' : '#ffffff'} stroke={axisInk} strokeWidth={1.2} />

        {/* Column headers & vertical guide lines */}
        {axes.map((ax, ci) => {
          const cx = pad.left + (ci + 0.5) * colW;
          return (
            <g key={ax.id}>
              <line x1={cx} y1={pad.top} x2={cx} y2={pad.top + plotH} stroke={gridInk} strokeDasharray="2 3" />
              <text x={cx} y={pad.top - 12} textAnchor="middle" fontSize="10" fontWeight="700" fill={axisInk}>
                {ax.shortLabel}
              </text>
            </g>
          );
        })}

        {/* Rows & Bubbles */}
        {authors.map((a, ri) => {
          const cy = pad.top + (ri + 0.5) * rowH;
          const m = countsSource.get(a.info.id);
          return (
            <g key={a.info.id}>
              <line x1={pad.left} y1={cy} x2={pad.left + plotW} y2={cy} stroke={gridInk} strokeDasharray="2 3" />
              <text
                x={pad.left - 8}
                y={cy + 4}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="600"
                fill={axisInk}
                className="cursor-pointer"
                onClick={() => onSelectAuthor(a.info.shortName)}
              >
                {a.info.shortName}
              </text>
              {axes.map((ax, ci) => {
                const cell = m?.get(ax.id);
                if (!cell || cell.count <= 0) return null;
                const cx = pad.left + (ci + 0.5) * colW;
                const r = 5 + Math.sqrt(cell.count / maxCell) * 7.5;
                const t = (cell.lastYear - minYear) / spanYear;
                const fill = parulaColor(t);
                const darkTxt = t > 0.62;
                return (
                  <g key={ax.id} className="cursor-pointer" onClick={() => onSelectAuthor(a.info.shortName)}>
                    <circle cx={cx} cy={cy} r={r} fill={fill} stroke={darkMode ? '#e2e8f0' : '#0f172a'} strokeWidth={0.8} />
                    <text
                      x={cx}
                      y={cy + 3.2}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fontFamily="ui-monospace, monospace"
                      fill={darkTxt ? '#0f172a' : '#ffffff'}
                    >
                      {cell.count}
                    </text>
                    <title>{`${a.info.displayName} × ${ax.label}：${cell.count} 篇（最新 ${cell.lastYear}）`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Colorbar */}
        <g transform={`translate(${pad.left + plotW + 14}, ${pad.top})`}>
          <rect width={12} height={plotH} fill="url(#matlab-parula-f8)" stroke={axisInk} strokeWidth={0.9} />
          <text x={16} y={9} fontSize="9.5" fontFamily="ui-monospace, monospace" fill={axisInk}>{maxYear}</text>
          <text x={16} y={plotH} fontSize="9.5" fontFamily="ui-monospace, monospace" fill={axisInk}>{minYear}</text>
        </g>
      </svg>
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 9: Symmetric Co-Authorship Affinity Heatmap (Sub-Team Discovery)
 * ============================================================================ */
export const MatlabCoauthorAffinityHeatmap: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onSelectAuthor: (authorName: string) => void;
}> = ({ analysis, darkMode, onSelectAuthor }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number } | null>(null);
  const top = analysis.canonicalAuthors.slice(0, 12);

  let maxPair = 1;
  const weightOf = (aId: string, bId: string): number => {
    if (aId === bId) return top.find((x) => x.info.id === aId)?.count || 0;
    const [u, v] = [aId, bId].sort();
    return analysis.coauthorEdgeMap.get(`${u}__${v}`)?.weight || 0;
  };
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const w = weightOf(top[i].info.id, top[j].info.id);
      if (w > maxPair) maxPair = w;
    }
  }

  const cell = 38;
  const pad = { top: 86, right: 78, bottom: 26, left: 94 };
  const gridSize = top.length * cell;
  const W = pad.left + gridSize + pad.right;
  const H = pad.top + gridSize + pad.bottom;
  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';

  const hoveredInfo =
    hoveredCell && top[hoveredCell.r] && top[hoveredCell.c]
      ? {
          row: top[hoveredCell.r],
          col: top[hoveredCell.c],
          isDiag: hoveredCell.r === hoveredCell.c,
          w: weightOf(top[hoveredCell.r].info.id, top[hoveredCell.c].info.id),
        }
      : null;

  return (
    <MatlabFigureShell
      figNum="Fig. 9"
      title="核心作者协作紧密度对称矩阵"
      filename="paperpulse-lab-fig9-coauthor-affinity"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full max-w-[780px] select-none"
        role="img"
        aria-label="作者合作紧密度热力矩阵"
        onMouseLeave={() => setHoveredCell(null)}
      >
        <defs>
          <linearGradient id="matlab-parula-f9" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={parulaColor(0.05)} />
            <stop offset="50%" stopColor={parulaColor(0.5)} />
            <stop offset="100%" stopColor={parulaColor(0.98)} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />

        {top.map((a, i) => {
          const isRowActive = hoveredCell?.r === i;
          const isColActive = hoveredCell?.c === i;
          return (
            <g key={`lbl-${a.info.id}`}>
              <text
                x={pad.left - 10}
                y={pad.top + i * cell + cell / 2 + 4.5}
                textAnchor="end"
                fontSize="13"
                fontWeight={isRowActive ? '800' : '600'}
                fill={isRowActive ? MATLAB_COLORS[0] : axisInk}
                className="cursor-pointer"
                onClick={() => onSelectAuthor(a.info.shortName)}
              >
                {a.info.shortName}
              </text>
              <text
                x={pad.left + i * cell + cell / 2}
                y={pad.top - 10}
                textAnchor="start"
                fontSize="13"
                fontWeight={isColActive ? '800' : '600'}
                fill={isColActive ? MATLAB_COLORS[0] : axisInk}
                className="cursor-pointer"
                onClick={() => onSelectAuthor(a.info.shortName)}
                transform={`rotate(-42 ${pad.left + i * cell + cell / 2} ${pad.top - 10})`}
              >
                {a.info.shortName}
              </text>
            </g>
          );
        })}

        {top.map((rowA, r) =>
          top.map((colA, c) => {
            const x = pad.left + c * cell;
            const y = pad.top + r * cell;
            const isDiag = r === c;
            const w = weightOf(rowA.info.id, colA.info.id);
            const norm = isDiag ? 0 : w > 0 ? 0.12 + 0.86 * (w / maxPair) : 0;
            const fill = isDiag
              ? darkMode ? '#1e293b' : '#e2e8f0'
              : w > 0
                ? parulaColor(norm)
                : darkMode ? '#0b1220' : '#f8fafc';
            const txtFill = isDiag ? axisInk : norm > 0.62 ? '#0f172a' : '#ffffff';
            const isFocus = hoveredCell?.r === r && hoveredCell?.c === c;
            const isCrosshair = hoveredCell && (hoveredCell.r === r || hoveredCell.c === c) && !isFocus;

            return (
              <g
                key={`${r}-${c}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredCell({ r, c })}
                onClick={() => onSelectAuthor(rowA.info.shortName)}
              >
                <rect
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  fill={fill}
                  fillOpacity={hoveredCell && !isFocus && !isCrosshair ? 0.72 : 1}
                  stroke={isFocus ? '#D95319' : darkMode ? '#0f172a' : '#ffffff'}
                  strokeWidth={isFocus ? 2.4 : 1.4}
                />
                {(isDiag || w > 0) && (
                  <text
                    x={x + cell / 2}
                    y={y + cell / 2 + 4.5}
                    textAnchor="middle"
                    fontSize="12.5"
                    fontWeight={isDiag || isFocus ? '800' : '600'}
                    fontFamily="ui-monospace, monospace"
                    fill={txtFill}
                  >
                    {w}
                  </text>
                )}
                <title>
                  {isDiag
                    ? `${rowA.info.displayName}：个人总发文 ${w} 篇`
                    : `${rowA.info.shortName} × ${colA.info.shortName}：共同署名 ${w} 篇`}
                </title>
              </g>
            );
          })
        )}

        <rect x={pad.left} y={pad.top} width={gridSize} height={gridSize} fill="none" stroke={axisInk} strokeWidth={1.5} />

        <g transform={`translate(${pad.left + gridSize + 18}, ${pad.top})`}>
          <rect width={16} height={gridSize} fill="url(#matlab-parula-f9)" stroke={axisInk} strokeWidth={1.1} />
          <text x={22} y={11} fontSize="11.5" fontFamily="ui-monospace, monospace" fill={axisInk}>{maxPair}</text>
          <text x={22} y={gridSize / 2 + 4} fontSize="11.5" fontFamily="ui-monospace, monospace" fill={axisInk}>{Math.round(maxPair / 2)}</text>
          <text x={22} y={gridSize} fontSize="11.5" fontFamily="ui-monospace, monospace" fill={axisInk}>0</text>
        </g>
      </svg>
      {hoveredInfo && (
        <div
          className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium ${
            darkMode ? 'border-slate-700 bg-slate-800/80 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <span>
            {hoveredInfo.isDiag
              ? `${hoveredInfo.row.info.displayName} · 个人收录总计 ${hoveredInfo.w} 篇`
              : `${hoveredInfo.row.info.shortName} × ${hoveredInfo.col.info.shortName} · 共同署名 ${hoveredInfo.w} 篇`}
          </span>
          <span className="text-slate-500 dark:text-slate-400">点击单元格可快速筛选该作者文献</span>
        </div>
      )}
    </MatlabFigureShell>
  );
};

/* ============================================================================
 * Fig. 10: Lab Papers Platform Social Engagement Bubble Chart
 *          X: Total Visits | Y: Social Actions (Like+Comment+Repost+Collect) | Size: Dwell Seconds
 * ============================================================================ */
export const MatlabEngagementBubbleChart: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onOpenPaper: (paper: AcademicPaper) => void;
}> = ({ analysis, darkMode, onOpenPaper }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const pts = useMemo(
    () =>
      analysis.papers.map((p, idx) => {
        const visits = p.totalVisits || 0;
        const dwell = p.totalDwellSeconds || 0;
        const actions =
          (p.likers?.length || 0) +
          (p.comments?.length || 0) +
          (p.reposts?.length || 0) +
          (p.collectors?.length || 0);
        const yr = analysis.paperYearById.get(p.id) || 2025;
        return { paper: p, idx: idx + 1, visits, dwell, actions, yr };
      }),
    [analysis]
  );

  const W = 640;
  const H = 310;
  const pad = { top: 24, right: 34, bottom: 48, left: 54 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxV = Math.max(...pts.map((d) => d.visits), 5) + 1;
  const maxA = Math.max(...pts.map((d) => d.actions), 4) + 1;
  const maxD = Math.max(...pts.map((d) => d.dwell), 30);

  const minYear = Math.min(...analysis.years, 2023);
  const maxYear = Math.max(...analysis.years, 2027);
  const spanYear = Math.max(1, maxYear - minYear);

  const xScale = (v: number) => pad.left + (v / maxV) * plotW;
  const yScale = (v: number) => pad.top + plotH - (v / maxA) * plotH;

  const axisInk = darkMode ? '#cbd5e1' : '#1e293b';
  const gridInk = darkMode ? '#334155' : '#cbd5e1';
  const plotBg = darkMode ? '#0b1220' : '#ffffff';

  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxV * i) / 4));
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxA * i) / 4));

  return (
    <MatlabFigureShell
      figNum="Fig. 10"
      title="组内论文「阅读访问 × 社交互动」热度气泡图"
      filename="paperpulse-lab-fig10-engagement-bubbles"
      darkMode={darkMode}
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label="论文阅读与社交互动气泡图">
        <rect x={0} y={0} width={W} height={H} fill={darkMode ? '#0f172a' : '#ffffff'} />
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill={plotBg} stroke={axisInk} strokeWidth={1.25} />

        {xTicks.map((v, i) => {
          const x = xScale(v);
          return (
            <g key={`ex-${i}`}>
              {i > 0 && i < xTicks.length - 1 && (
                <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH - 4} stroke={axisInk} />
              <text x={x} y={pad.top + plotH + 15} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={`ey-${i}`}>
              {i > 0 && i < yTicks.length - 1 && (
                <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke={gridInk} strokeDasharray="3 3" strokeWidth={0.8} />
              )}
              <line x1={pad.left} y1={y} x2={pad.left + 4} y2={y} stroke={axisInk} />
              <text x={pad.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill={axisInk}>
                {v}
              </text>
            </g>
          );
        })}

        {pts.map((d) => {
          const jitterX = ((d.idx * 7) % 15) - 7;
          const jitterY = ((d.idx * 11) % 13) - 6;
          const cx = Math.max(pad.left + 14, Math.min(pad.left + plotW - 14, xScale(d.visits) + jitterX));
          const cy = Math.max(pad.top + 14, Math.min(pad.top + plotH - 14, yScale(d.actions) + jitterY));
          const r = 7 + Math.sqrt(Math.max(d.dwell, 4) / maxD) * 16;
          const t = (d.yr - minYear) / spanYear;
          const col = parulaColor(t);
          const isHov = hoveredId === d.paper.id;
          return (
            <g
              key={d.paper.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredId(d.paper.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onOpenPaper(d.paper)}
            >
              {isHov && <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={MATLAB_COLORS[1]} strokeWidth={2} />}
              <circle cx={cx} cy={cy} r={r} fill={col} fillOpacity={isHov ? 0.96 : 0.78} stroke="#ffffff" strokeWidth={1.3} />
              <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="ui-monospace, monospace" fill={t > 0.62 ? '#0f172a' : '#ffffff'}>
                #{d.idx}
              </text>
              <title>{`#${d.idx} ${d.paper.titleZh || d.paper.title}｜访问 ${d.visits} 次 · 阅读 ${d.dwell} 秒 · 互动(赞/评/转/藏) ${d.actions} 次`}</title>
            </g>
          );
        })}

        <text x={pad.left + plotW / 2} y={H - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={axisInk}>
          Total Visits / 组内访问次数（气泡大小＝累计阅读时长）
        </text>
        <text
          x={16}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={axisInk}
          transform={`rotate(-90 16 ${pad.top + plotH / 2})`}
        >
          Social Actions (赞/评/转/藏)
        </text>
      </svg>
    </MatlabFigureShell>
  );
};
