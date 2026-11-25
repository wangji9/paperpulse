import React, { useState } from 'react';
import {
  Bookmark,
  BookOpenCheck,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  GitCommitHorizontal,
  MessageSquare,
  Send,
  Trash2,
} from 'lucide-react';
import type { AcademicPaper, ReadingStatus } from '../types/paper';
import {
  DATASET_SOURCE_META,
  DOMAIN_META,
  READING_STATUS_META,
  TOPIC_META,
  generateBibtex,
} from '../lib/constants';

interface PaperFeedCardProps {
  paper: AcademicPaper;
  darkMode: boolean;
  onOpenDetail: (paper: AcademicPaper) => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => void;
  onAddComment: (paperId: string, author: string, role: string, content: string) => Promise<void>;
  onDeleteComment: (paperId: string, commentId: string) => Promise<void>;
}

export const PaperFeedCard: React.FC<PaperFeedCardProps> = ({
  paper,
  darkMode,
  onOpenDetail,
  onEdit,
  onDelete,
  onUpdateStatus,
  onAddComment,
  onDeleteComment,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);

  const domainInfo = DOMAIN_META[paper.domain];
  const dsMeta = DATASET_SOURCE_META[paper.anatomy.dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  const statusInfo = READING_STATUS_META[paper.readingStatus] || READING_STATUS_META.unread;

  const handleCopyBibtex = async () => {
    try {
      await navigator.clipboard.writeText(generateBibtex(paper));
      setCopiedBib(true);
      setTimeout(() => setCopiedBib(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCycleStatus = () => {
    const order: ReadingStatus[] = ['unread', 'reading', 'mastered'];
    const next = order[(order.indexOf(paper.readingStatus) + 1) % order.length];
    onUpdateStatus(paper.id, { readingStatus: next });
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(paper.id, '个人笔记', '精读记录', noteText.trim());
      setNoteText('');
    } finally {
      setSubmitting(false);
    }
  };

  const { anatomy } = paper;
  const cmpRows = anatomy.comparisonMetrics.rows.slice(0, 3);
  const cmpCols = anatomy.comparisonMetrics.metricNames.slice(0, 3);

  return (
    <article
      className={`rounded-2xl border p-6 transition-all ${
        darkMode
          ? 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
          : 'border-slate-200/90 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.04)] hover:border-indigo-200'
      }`}
    >
      {/* Top Bibliographic Metadata Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2.5 py-0.5 font-mono-code text-xs font-bold text-white dark:bg-indigo-600">
              {paper.journalShort}
            </span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{paper.journal}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${domainInfo.badgeClass}`}>
              {domainInfo.label}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${dsMeta.badgeClass}`}>
              {dsMeta.shortLabel}
            </span>
            {paper.citedByCount > 0 && (
              <span className="font-mono-code rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                OpenAlex 被引 {paper.citedByCount}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono-code font-medium text-slate-600 dark:text-slate-300">{paper.publishedDate}</span>
            <span>·</span>
            <span>{paper.authors.slice(0, 4).join(', ')}</span>
            {paper.doi && (
              <>
                <span>·</span>
                <span className="font-mono-code text-[11px]">DOI: {paper.doi}</span>
              </>
            )}
          </div>
        </div>

        {/* Reading status + actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCycleStatus}
            title="点击切换阅读状态"
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${statusInfo.cls}`}
          >
            {statusInfo.label}
          </button>
          <button
            type="button"
            onClick={() => onEdit(paper)}
            title="编辑文献与十维解析"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(paper.id)}
            title="从文献库删除"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            title="访问原文链接"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Title & Topic Tags */}
      <div className="mt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {paper.topics.map((t) => {
            const meta = TOPIC_META[t];
            return (
              <span
                key={t}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
              >
                {meta.label} · {meta.labelEn}
              </span>
            );
          })}
        </div>
        <h2
          onClick={() => onOpenDetail(paper)}
          className="font-serif-academic cursor-pointer text-xl font-bold leading-snug text-slate-900 transition hover:text-indigo-700 dark:text-white dark:hover:text-indigo-400"
        >
          {paper.titleZh}
        </h2>
        {paper.titleZh !== paper.title && (
          <p className="mt-1 font-mono-code text-xs leading-relaxed text-slate-500 dark:text-slate-400">{paper.title}</p>
        )}
        <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{paper.digestSummary}</p>
      </div>

      {/* Structured Content Anatomy Preview (Clean Editorial Blocks, No Truncated Thumbnails) */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={`rounded-xl border p-3.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50/70'}`}>
          <div className="mb-1 text-xs font-bold text-slate-800 dark:text-slate-100">01-02 研究背景与核心问题</div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{anatomy.problem}</p>
        </div>

        <div className={`rounded-xl border p-3.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50/70'}`}>
          <div className="mb-1 text-xs font-bold text-rose-700 dark:text-rose-400">03-04 现状与现存局限</div>
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {anatomy.limitationsOfPriorWork}
          </p>
        </div>

        <div className={`rounded-xl border p-3.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-indigo-100/80 bg-indigo-50/30'}`}>
          <div className="mb-1 text-xs font-bold text-indigo-700 dark:text-indigo-400">05 本文提出的方法</div>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">{anatomy.proposedMethod}</p>
        </div>

        <div className={`rounded-xl border p-3.5 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-emerald-100/80 bg-emerald-50/30'}`}>
          <div className="mb-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">06-07 实验验证与数据集构建</div>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <span className="font-semibold">[{dsMeta.shortLabel}]</span> {anatomy.dataset.names.join('、')} — {anatomy.dataset.summary}
          </p>
        </div>
      </div>

      {/* Compact Academic Comparison Table */}
      {cmpRows.length > 0 && cmpCols.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="px-3 py-2 font-semibold">实验与方法对照</th>
                {cmpCols.map((col) => (
                  <th key={col} className="px-3 py-2 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cmpRows.map((row) => (
                <tr
                  key={row.method}
                  className={
                    row.isProposed
                      ? 'bg-indigo-50/40 font-semibold text-indigo-950 dark:bg-indigo-950/25 dark:text-indigo-200'
                      : 'text-slate-600 dark:text-slate-300'
                  }
                >
                  <td className="px-3 py-2">{row.method}</td>
                  {cmpCols.map((col) => (
                    <td key={col} className="px-3 py-2">
                      {String(row.values[col] ?? '—')}
                      {anatomy.comparisonMetrics.hasQuantitativeData && typeof row.values[col] === 'number'
                        ? anatomy.comparisonMetrics.unit
                        : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Conclusion & Citations strip */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs dark:bg-slate-800/50">
        <div className="flex-1 text-slate-700 dark:text-slate-300">
          <span className="font-bold text-slate-900 dark:text-white">核心结论：</span>
          {anatomy.conclusion}
        </div>
        {paper.citations.length > 0 && (
          <span className="font-mono-code inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-indigo-300">
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            已关联 {paper.citations.length} 条引文节点
          </span>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(paper)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            深度精读 · 完整十维拆解与引用图谱
          </button>

          <button
            type="button"
            onClick={() => onUpdateStatus(paper.id, { isBookmarked: !paper.isBookmarked })}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              paper.isBookmarked
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${paper.isBookmarked ? 'fill-current' : ''}`} />
            {paper.isBookmarked ? '已星标收藏' : '星标收藏'}
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            个人笔记 ({paper.comments.length})
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyBibtex}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {copiedBib ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedBib ? '已复制 BibTeX' : '复制 BibTeX'}
        </button>
      </div>

      {/* Expandable Personal Reading Notes */}
      {showNotes && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <form onSubmit={handleSubmitNote} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="记录您的精读感悟、公式推导疑点、可借鉴的方法模块..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={submitting || !noteText.trim()}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              保存笔记
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {paper.comments.length === 0 ? (
              <div className="py-2 text-center text-xs text-slate-400">暂无个人精读笔记</div>
            ) : (
              paper.comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{c.author}</span>
                      <span>·</span>
                      <span>{c.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{c.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteComment(paper.id, c.id)}
                    className="text-slate-300 hover:text-rose-500"
                    title="删除笔记"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
};
