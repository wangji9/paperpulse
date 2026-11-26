import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { OriginalPaperFigure } from '../types/paper';

interface AdaptiveFigureGalleryProps {
  figures: OriginalPaperFigure[];
  darkMode: boolean;
}

interface LayoutTile {
  fig: OriginalPaperFigure;
  index: number;
  w: number;
  h: number;
}

interface LayoutRow {
  tiles: LayoutTile[];
}

const GAP = 10;

function formatCaptionText(fig: OriginalPaperFigure): string {
  const raw = (fig.captionZh || fig.analysisZh || fig.captionOriginal || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^(?:Figure|Fig\.?|FIG\.?|图)\s*[\dIVX.]+\s*(?:原文图注译文|原文图注)?\s*[:：.\-—]?\s*/i, '')
    .trim();
}

/**
 * Aspect-Ratio-Aware Justified Row Packer (Zero Blank Margins + Clean Paired Captions!)
 */
function computeJustifiedRows(
  figures: OriginalPaperFigure[],
  ratios: Record<string, number>,
  containerW: number
): LayoutRow[] {
  if (!figures.length || containerW < 120) return [];

  const isNarrow = containerW < 560;
  const targetRowH = isNarrow ? 175 : containerW > 1050 ? 255 : 225;
  const minRowH = isNarrow ? 115 : 150;
  const maxRowH = isNarrow ? 290 : 360;
  const maxPerRow = isNarrow ? 2 : 4;

  const getRatio = (f: OriginalPaperFigure): number => {
    const measured = ratios[f.id];
    if (measured && Number.isFinite(measured) && measured > 0.15 && measured < 12) return measured;
    if (f.width && f.height && f.width > 0 && f.height > 0) {
      return Math.max(0.2, Math.min(10, f.width / f.height));
    }
    return 1.45;
  };

  if (figures.length === 1) {
    const f = figures[0];
    const r = getRatio(f);
    const maxSingleH = isNarrow ? 340 : 460;
    const w = Math.min(containerW, Math.round(maxSingleH * r));
    const h = Math.max(120, Math.round(w / r));
    return [{ tiles: [{ fig: f, index: 0, w, h }] }];
  }

  const rows: LayoutRow[] = [];
  let cur: Array<{ fig: OriginalPaperFigure; index: number; r: number }> = [];
  let curSum = 0;

  const flushRow = (isLast: boolean) => {
    if (!cur.length) return;
    const availW = Math.max(120, containerW - GAP * (cur.length - 1));
    const exactH = availW / Math.max(curSum, 0.25);

    if (isLast && exactH > maxRowH) {
      const h = Math.round(Math.min(maxRowH, Math.max(targetRowH, minRowH)));
      rows.push({
        tiles: cur.map((it) => ({
          fig: it.fig,
          index: it.index,
          w: Math.min(availW, Math.round(h * it.r)),
          h,
        })),
      });
    } else {
      const h = Math.round(Math.max(minRowH, Math.min(maxRowH, exactH)));
      const rawWidths = cur.map((it) => h * it.r);
      const rawTotal = rawWidths.reduce((s, v) => s + v, 0);
      const scale = exactH <= maxRowH && rawTotal > 0 ? availW / rawTotal : 1;
      const finalH = Math.round(h * scale);
      let usedW = 0;
      const tiles: LayoutTile[] = cur.map((it, idx) => {
        const isEnd = idx === cur.length - 1;
        const w =
          scale !== 1 && isEnd
            ? Math.max(70, Math.round(availW - usedW))
            : Math.max(70, Math.round(rawWidths[idx] * scale));
        usedW += w;
        return { fig: it.fig, index: it.index, w, h: finalH };
      });
      rows.push({ tiles });
    }
    cur = [];
    curSum = 0;
  };

  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    const r = getRatio(fig);

    if (r >= 2.25) {
      flushRow(false);
      const h = Math.round(Math.max(135, Math.min(390, containerW / r)));
      rows.push({ tiles: [{ fig, index: i, w: Math.round(containerW), h }] });
      continue;
    }

    cur.push({ fig, index: i, r });
    curSum += r;
    const estWidth = curSum * targetRowH + GAP * (cur.length - 1);

    const remaining = figures.length - 1 - i;
    if (cur.length === 2 && remaining === 2 && !isNarrow && estWidth >= containerW * 0.72) {
      flushRow(false);
      continue;
    }

    if (estWidth >= containerW * 0.94 || cur.length >= maxPerRow) {
      flushRow(false);
    }
  }
  flushRow(true);
  return rows;
}

export const AdaptiveFigureGallery: React.FC<AdaptiveFigureGalleryProps> = ({ figures, darkMode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(860);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 120) setContainerW((prev) => (Math.abs(prev - w) > 2 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      else if (e.key === 'ArrowRight') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setLightboxIdx((idx) => (idx === null ? null : (idx + 1) % figures.length));
      } else if (e.key === 'ArrowLeft') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setLightboxIdx((idx) => (idx === null ? null : (idx - 1 + figures.length) % figures.length));
      } else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, +(z * 1.18).toFixed(2)));
      else if (e.key === '-') setZoom((z) => Math.max(0.5, +(z * 0.85).toFixed(2)));
      else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, figures.length]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.14 : 0.88;
      setZoom((z) => Math.max(0.5, Math.min(4, +(z * factor).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [lightboxIdx]);

  const rows = useMemo(() => computeJustifiedRows(figures, ratios, containerW), [figures, ratios, containerW]);

  const handleImgLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const r = img.naturalWidth / img.naturalHeight;
      setRatios((prev) => (prev[id] && Math.abs(prev[id] - r) < 0.01 ? prev : { ...prev, [id]: r }));
    }
  };

  const openLightbox = (index: number) => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLightboxIdx(index);
  };

  if (!figures.length) return null;

  const activeFig = lightboxIdx !== null ? figures[lightboxIdx] : null;

  const lightboxPortal =
    activeFig && lightboxIdx !== null && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[98] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeFig.label} 大图查看`}
          >
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="rounded-md bg-[#0072BD] px-2.5 py-0.5 font-mono font-bold text-white">
                  {activeFig.label}
                </span>
                <span className="font-mono text-slate-300">
                  {lightboxIdx + 1} / {figures.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z * 0.85).toFixed(2)))}
                    className="px-2.5 py-1.5 text-slate-200 hover:text-sky-400"
                    title="缩小 (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="min-w-[54px] text-center font-mono font-semibold">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(4, +(z * 1.18).toFixed(2)))}
                    className="px-2.5 py-1.5 text-slate-200 hover:text-sky-400"
                    title="放大 (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200 hover:border-sky-400"
                >
                  <RotateCcw className="h-4 w-4" /> 重置
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIdx(null)}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#0072BD] px-3.5 py-1.5 font-semibold text-white hover:bg-[#005a96]"
                >
                  <X className="h-4 w-4" /> 关闭
                </button>
              </div>
            </div>

            {/* Interactive Image Stage */}
            <div
              ref={viewportRef}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement)?.closest('button')) return;
                panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
                setIsPanning(true);
              }}
              onPointerMove={(e) => {
                if (!panStartRef.current) return;
                setPan({
                  x: panStartRef.current.px + (e.clientX - panStartRef.current.x),
                  y: panStartRef.current.py + (e.clientY - panStartRef.current.y),
                });
              }}
              onPointerUp={() => {
                panStartRef.current = null;
                setIsPanning(false);
              }}
              onPointerLeave={() => {
                panStartRef.current = null;
                setIsPanning(false);
              }}
              className={`relative flex flex-1 items-center justify-center overflow-hidden p-6 select-none ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              {figures.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                      setLightboxIdx((lightboxIdx - 1 + figures.length) % figures.length);
                    }}
                    className="absolute left-4 z-10 rounded-full border border-slate-700 bg-slate-900/85 p-3 text-white shadow-lg hover:bg-[#0072BD]"
                    title="上一张 (←)"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                      setLightboxIdx((lightboxIdx + 1) % figures.length);
                    }}
                    className="absolute right-4 z-10 rounded-full border border-slate-700 bg-slate-900/85 p-3 text-white shadow-lg hover:bg-[#0072BD]"
                    title="下一张 (→)"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}

              <img
                src={activeFig.url}
                alt={activeFig.label}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                className="max-h-[72vh] max-w-[90vw] rounded-lg bg-white object-contain shadow-2xl transition-transform duration-75"
              />
            </div>

            {/* Paired Full Caption Footer */}
            {(activeFig.captionZh || activeFig.analysisZh || activeFig.captionOriginal) && (
              <div className="border-t border-slate-800 bg-slate-900/95 px-6 py-3.5">
                <p className="leading-relaxed text-slate-100">
                  <span className="mr-2 font-mono font-bold text-sky-400">{activeFig.label}</span>
                  {formatCaptionText(activeFig)}
                </p>
                {activeFig.captionOriginal &&
                  formatCaptionText(activeFig) !==
                    activeFig.captionOriginal.replace(/^(?:Figure|Fig\.?|FIG\.?|图)\s*[\dIVX.]+\s*[:：.\-—]?\s*/i, '').trim() && (
                    <p className="mt-1 leading-relaxed text-slate-400">{activeFig.captionOriginal}</p>
                  )}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={containerRef} className="mt-3 w-full space-y-2.5">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-stretch" style={{ gap: `${GAP}px` }}>
            {row.tiles.map(({ fig, index, w, h }) => {
              const captionText = formatCaptionText(fig);
              return (
                <figure
                  key={fig.id}
                  style={{ width: `${w}px` }}
                  className={`group flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all hover:shadow-md ${
                    darkMode
                      ? 'border-slate-700 bg-slate-900 hover:border-sky-400'
                      : 'border-slate-200/90 bg-white hover:border-[#0072BD]'
                  }`}
                >
                  {/* Pure Unobstructed Image Box — Exact Aspect-Ratio Match, Zero Side Whitespace */}
                  <button
                    type="button"
                    onClick={() => openLightbox(index)}
                    title={`${fig.label}${captionText ? `：${captionText}` : ''}（点击放大查看）`}
                    style={{ height: `${h}px` }}
                    className="relative block w-full overflow-hidden bg-white"
                  >
                    <img
                      src={fig.url}
                      alt={fig.label}
                      loading="lazy"
                      onLoad={(e) => handleImgLoad(fig.id, e)}
                      className="block h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.015]"
                    />
                    <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-md bg-slate-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </span>
                  </button>

                  {/* Paired Figure Caption Bar Below Image (Never Covers Diagram!) */}
                  <figcaption
                    onClick={() => openLightbox(index)}
                    title={captionText ? `${fig.label}: ${captionText}` : fig.label}
                    className={`flex flex-1 cursor-pointer items-start gap-1.5 border-t px-2.5 py-2 text-left leading-snug ${
                      darkMode
                        ? 'border-slate-800 bg-slate-900/90 text-slate-300'
                        : 'border-slate-100 bg-slate-50/90 text-slate-700'
                    }`}
                  >
                    <span className="shrink-0 rounded bg-[#0072BD] px-1.5 py-0.5 font-mono font-bold text-white">
                      {fig.label}
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1">
                      {captionText || '点击查看原图'}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        ))}
      </div>
      {lightboxPortal}
    </>
  );
};
