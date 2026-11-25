import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, ImagePlus, Loader2, Maximize2, Table2, X } from 'lucide-react';
import type { DatasetDetail, OriginalPaperFigure, OriginalPaperTable } from '../../types/paper';
import { DATASET_SOURCE_META } from '../../lib/constants';

export const LOGIC_STEPS = [
  { id: 'sec-bg', num: '01', label: '研究背景' },
  { id: 'sec-prob', num: '02', label: '核心问题' },
  { id: 'sec-status', num: '03', label: '研究现状' },
  { id: 'sec-gaps', num: '04', label: '现存局限' },
  { id: 'sec-method', num: '05', label: '方法与原文图' },
  { id: 'sec-exp', num: '06', label: '实验验证' },
  { id: 'sec-data', num: '07', label: '数据集' },
  { id: 'sec-cmp', num: '08', label: '原文实验图表' },
  { id: 'sec-conc', num: '09', label: '研究结论' },
  { id: 'sec-future', num: '10', label: '局限展望' },
  { id: 'sec-cite', num: '11', label: '引用图谱' },
];

export const LogicChainFlow: React.FC<{
  steps: typeof LOGIC_STEPS;
  activeStep: string;
  onSelectStep: (id: string) => void;
  darkMode?: boolean;
}> = ({ steps, activeStep, onSelectStep, darkMode }) => (
  <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
    {steps.map((step) => {
      const isActive = activeStep === step.id;
      return (
        <button
          key={step.id}
          type="button"
          onClick={() => onSelectStep(step.id)}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-1 text-sm transition ${
            isActive
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : darkMode
                ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500'
                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
          }`}
        >
          {step.num} {step.label}
        </button>
      );
    })}
  </div>
);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ImageLightbox: React.FC<{ src: string; caption: string; onClose: () => void }> = ({ src, caption, onClose }) =>
  createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] max-w-6xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg bg-slate-900/80 p-1.5 text-white hover:bg-slate-900"
        >
          <X className="h-5 w-5" />
        </button>
        <img src={src} alt={caption} className="mx-auto max-h-[78vh] w-auto object-contain bg-white" />
        {caption && <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{caption}</p>}
      </div>
    </div>,
    document.body
  );

/**
 * Directly embeds ACTUAL ORIGINAL FIGURES extracted from the paper (no self-drawn SVG diagrams!)
 */
export const OriginalFiguresSection: React.FC<{
  figures: OriginalPaperFigure[];
  legacyFigureUrl?: string;
  legacyCaption?: string;
  title?: string;
  maxItems?: number;
  allowUpload?: boolean;
  uploadKind?: 'method_figure' | 'experiment_figure';
  onUploadMedia?: (payload: {
    kind: 'method_figure' | 'experiment_figure' | 'table_image';
    dataUrl: string;
    analysisZh?: string;
  }) => Promise<void>;
  darkMode?: boolean;
}> = ({
  figures,
  legacyFigureUrl,
  legacyCaption,
  title = '论文原文方法与架构图',
  maxItems,
  allowUpload = false,
  uploadKind = 'method_figure',
  onUploadMedia,
  darkMode = false,
}) => {
  const [zoomItem, setZoomItem] = useState<{ src: string; cap: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const effectiveFigs: OriginalPaperFigure[] =
    figures && figures.length > 0
      ? figures
      : legacyFigureUrl
        ? [
            {
              id: 'legacy-fig',
              label: 'Figure 1',
              url: legacyFigureUrl,
              captionOriginal: '',
              analysisZh: legacyCaption || '',
              category: 'method',
            },
          ]
        : [];

  const shown = maxItems ? effectiveFigs.slice(0, maxItems) : effectiveFigs;

  const handleUploadFile = async (file?: File | null) => {
    if (!file || !onUploadMedia) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await onUploadMedia({ kind: uploadKind, dataUrl });
    } finally {
      setUploading(false);
    }
  };

  if (shown.length === 0 && !allowUpload) return null;

  return (
    <div className="space-y-3">
      {zoomItem && <ImageLightbox src={zoomItem.src} caption={zoomItem.cap} onClose={() => setZoomItem(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        {allowUpload && onUploadMedia && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 text-indigo-600" />}
            <span>上传原文配图</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleUploadFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <div
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
            if (item) void handleUploadFile(item.getAsFile());
          }}
          tabIndex={0}
          className={`rounded-xl border border-dashed px-4 py-5 text-center text-sm outline-none focus:border-indigo-500 ${
            darkMode ? 'border-slate-700 bg-slate-900/50 text-slate-400' : 'border-slate-300 bg-slate-50/70 text-slate-500'
          }`}
        >
          该期刊原文受出版商访问限制暂未公开原图文件；可点击右上角「上传原文配图」，或单击此处直接按 Ctrl+V 粘贴论文原图截图。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {shown.map((fig) => (
            <figure
              key={fig.id}
              className={`overflow-hidden rounded-xl border p-3 sm:p-4 ${
                darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="group relative overflow-hidden rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-800">
                <img
                  src={fig.url}
                  alt={fig.captionOriginal || fig.label}
                  loading="lazy"
                  onClick={() => setZoomItem({ src: fig.url, cap: fig.analysisZh || fig.captionOriginal })}
                  className="mx-auto max-h-[420px] w-auto cursor-zoom-in object-contain"
                />
                <button
                  type="button"
                  onClick={() => setZoomItem({ src: fig.url, cap: fig.analysisZh || fig.captionOriginal })}
                  className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Maximize2 className="h-3.5 w-3.5" /> 放大原图
                </button>
              </div>

              <figcaption className="mt-3 space-y-1.5 text-sm leading-6">
                {fig.captionOriginal && (
                  <p className="text-slate-500 dark:text-slate-400">
                    <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {fig.label}
                    </span>
                    {fig.captionOriginal}
                  </p>
                )}
                {fig.analysisZh && (
                  <p className="text-slate-800 dark:text-slate-200">{fig.analysisZh}</p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Directly embeds ACTUAL ORIGINAL EXPERIMENTAL / ABLATION TABLES from the paper (HTML or PDF Table Snapshot!)
 */
export const OriginalTablesSection: React.FC<{
  tables: OriginalPaperTable[];
  maxItems?: number;
  allowUpload?: boolean;
  onUploadMedia?: (payload: {
    kind: 'method_figure' | 'experiment_figure' | 'table_image';
    dataUrl: string;
    analysisZh?: string;
  }) => Promise<void>;
  darkMode?: boolean;
}> = ({ tables, maxItems, allowUpload = false, onUploadMedia, darkMode = false }) => {
  const [zoomItem, setZoomItem] = useState<{ src: string; cap: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const shown = maxItems ? (tables || []).slice(0, maxItems) : tables || [];

  const handleUploadFile = async (file?: File | null) => {
    if (!file || !onUploadMedia) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await onUploadMedia({ kind: 'table_image', dataUrl });
    } finally {
      setUploading(false);
    }
  };

  if (shown.length === 0 && !allowUpload) return null;

  return (
    <div className="space-y-3">
      {zoomItem && <ImageLightbox src={zoomItem.src} caption={zoomItem.cap} onClose={() => setZoomItem(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Table2 className="h-4 w-4 text-indigo-600" />
          <span>论文原文实验表格与结果解析</span>
        </div>
        {allowUpload && onUploadMedia && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 text-indigo-600" />}
            <span>上传原文实验表截图</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleUploadFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <div
          onPaste={(e) => {
            const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
            if (item) void handleUploadFile(item.getAsFile());
          }}
          tabIndex={0}
          className={`rounded-xl border border-dashed px-4 py-5 text-center text-sm outline-none focus:border-indigo-500 ${
            darkMode ? 'border-slate-700 bg-slate-900/50 text-slate-400' : 'border-slate-300 bg-slate-50/70 text-slate-500'
          }`}
        >
          该文献暂未公开机器可读实验原表；可点击右上角「上传原文实验表截图」，或单击此处按 Ctrl+V 直接粘贴论文中的实验表截图。
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((tbl) => (
            <div
              key={tbl.id}
              className={`rounded-xl border p-3.5 sm:p-4 ${
                darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white'
              }`}
            >
              {tbl.captionOriginal && (
                <div className="mb-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <span className="mr-1.5 rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {tbl.label}
                  </span>
                  <span>{tbl.captionOriginal}</span>
                </div>
              )}

              {tbl.imageUrl ? (
                <div className="overflow-hidden rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-800">
                  <img
                    src={tbl.imageUrl}
                    alt={tbl.captionOriginal || tbl.label}
                    loading="lazy"
                    onClick={() => setZoomItem({ src: tbl.imageUrl!, cap: tbl.analysisZh || tbl.captionOriginal })}
                    className="mx-auto max-h-[420px] w-auto cursor-zoom-in object-contain"
                  />
                </div>
              ) : tbl.html ? (
                <div
                  className="original-paper-table overflow-x-auto rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-950"
                  dangerouslySetInnerHTML={{ __html: tbl.html }}
                />
              ) : null}

              {tbl.analysisZh && (
                <p className="mt-2.5 text-sm leading-6 text-slate-800 dark:text-slate-200">{tbl.analysisZh}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DatasetProvenanceVisual: React.FC<{ dataset: DatasetDetail; darkMode?: boolean }> = ({ dataset, darkMode }) => {
  const meta = DATASET_SOURCE_META[dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Database className="h-4 w-4 text-emerald-600" />
        <span className={`rounded-md border px-2.5 py-0.5 text-sm font-medium ${meta.badgeClass}`}>{meta.label}</span>
        {dataset.names.map((name) => (
          <span
            key={name}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {name}
          </span>
        ))}
      </div>
      {dataset.scale && <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">规模与划分：{dataset.scale}</p>}
      {dataset.summary && <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">构建与评测说明：{dataset.summary}</p>}
      {dataset.constructionSteps.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {dataset.constructionSteps.map((st) => (
            <div key={st.step} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-sm font-medium text-white">
                {st.step}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{st.title}</div>
                <div className="mt-0.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{st.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
