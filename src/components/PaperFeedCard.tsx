import React, { useState } from 'react';
import { Bookmark, BookOpenCheck, Check, Copy, Edit3, ExternalLink, MessageSquare, Send, Trash2 } from 'lucide-react';
import type { AcademicPaper, ReadingStatus } from '../types/paper';
import {
  DATASET_SOURCE_META,
  DOMAIN_META,
  READING_STATUS_META,
  TOPIC_META,
  generateBibtex,
  resolveDoiUrl,
  resolvePaperOriginalUrl,
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

const hasChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

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

  const { anatomy } = paper;
  const dsMeta = DATASET_SOURCE_META[anatomy.dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  const statusInfo = READING_STATUS_META[paper.readingStatus] || READING_STATUS_META.unread;
  const showZhTitle = paper.titleZh && paper.titleZh !== paper.title && hasChinese(paper.titleZh);

  const blocks = [
    { title: '背景与问题', text: [anatomy.background, anatomy.problem].filter(Boolean).join('') },
    { title: '现状与局限', text: anatomy.limitationsOfPriorWork || anatomy.currentStatus },
    { title: '本文方法', text: anatomy.proposedMethod },
    {
      title: '实验与数据集',
      text: [anatomy.experimentalValidation, anatomy.dataset.names.length ? `数据集：${anatomy.dataset.names.join('、')}` : '']
        .filter(Boolean)
        .join(' '),
    },
  ].filter((b) => b.text && b.text.trim());

  const cmpRows = anatomy.comparisonMetrics.rows.slice(0, 3);
  const cmpCols = anatomy.comparisonMetrics.metricNames.slice(0, 3);

  const handleCopyBibtex = async () => {
    try {
      await navigator.clipboard.writeText(generateBibtex(paper));
      setCopiedBib(true);
      setTimeout(() => setCopiedBib(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleCycleStatus = () => {
    const order: ReadingStatus[] = ['unread', 'reading', 'mastered'];
    onUpdateStatus(paper.id, { readingStatus: order[(order.indexOf(paper.readingStatus) + 1) % order.length] });
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(paper.id, '我', '笔记', noteText.trim());
      setNoteText('');
    } finally {
      setSubmitting(false);
    }
  };

  const chip = 'rounded-md border px-2 py-0.5 text-sm';
  const iconBtn = 'rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';

  return (
    <article
      className={`rounded-2xl border p-6 ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      {/* Meta row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-medium text-white dark:bg-indigo-600">{paper.journalShort}</span>
          <span className="font-medium">{paper.journal}</span>
          <span className="text-slate-300">|</span>
          <span>{paper.publishedDate}</span>
          {paper.citedByCount > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span>被引 {paper.citedByCount}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleCycleStatus} className={`${chip} font-medium ${statusInfo.cls}`}>
            {statusInfo.label}
          </button>
          <button type="button" onClick={() => onEdit(paper)} title="编辑" className={`${iconBtn} hover:text-indigo-600`}>
            <Edit3 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDelete(paper.id)} title="删除" className={`${iconBtn} hover:text-rose-600`}>
            <Trash2 className="h-4 w-4" />
          </button>
          <a href={paper.url} target="_blank" rel="noreferrer" title="原文" className={`${iconBtn} hover:text-slate-700`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Title */}
      <h2
        onClick={() => onOpenDetail(paper)}
        className="mt-3 cursor-pointer text-xl font-semibold leading-snug text-slate-900 hover:text-indigo-700 dark:text-white"
      >
        {paper.title}
      </h2>
      {showZhTitle && <p className="mt-1 text-base text-slate-600 dark:text-slate-300">{paper.titleZh}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        <span>{paper.authors.slice(0, 5).join(', ')}</span>
        {paper.doi && resolveDoiUrl(paper.doi, paper.url) && (
          <>
            <span className="text-slate-300">|</span>
            <a
              href={resolveDoiUrl(paper.doi, paper.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
            >
              DOI: {paper.doi}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-2">
        {paper.topics.map((t) => (
          <span key={t} className={`${chip} ${TOPIC_META[t].bgClass} ${TOPIC_META[t].textClass} ${TOPIC_META[t].borderClass}`}>
            {TOPIC_META[t].label}
          </span>
        ))}
        <span className={`${chip} ${DOMAIN_META[paper.domain].badgeClass}`}>{DOMAIN_META[paper.domain].label}</span>
        {anatomy.dataset.sourceType !== 'unspecified' && <span className={`${chip} ${dsMeta.badgeClass}`}>{dsMeta.shortLabel}</span>}
      </div>

      {/* Digest */}
      {paper.digestSummary && <p className="mt-4 text-base leading-7 text-slate-800 dark:text-slate-200">{paper.digestSummary}</p>}

      {/* Content blocks */}
      {blocks.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {blocks.map((b) => (
            <div key={b.title} className={`rounded-xl p-4 ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
              <div className="mb-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">{b.title}</div>
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-300">{b.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Comparison table */}
      {cmpRows.length > 0 && cmpCols.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="px-3 py-2 font-semibold">方法</th>
                {cmpCols.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cmpRows.map((row) => (
                <tr key={row.method} className={row.isProposed ? 'bg-indigo-50/50 font-medium dark:bg-indigo-950/30' : ''}>
                  <td className="px-3 py-2">{row.method}</td>
                  {cmpCols.map((c) => (
                    <td key={c} className="px-3 py-2">
                      {String(row.values[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {anatomy.conclusion && (
        <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white">结论：</span>
          {anatomy.conclusion}
        </p>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(paper)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <BookOpenCheck className="h-4 w-4" />
            精读全文解析
          </button>
          {resolvePaperOriginalUrl(paper) && (
            <a
              href={resolvePaperOriginalUrl(paper)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
            >
              <ExternalLink className="h-4 w-4" />
              查看原文
            </a>
          )}
          <button
            type="button"
            onClick={() => onUpdateStatus(paper.id, { isBookmarked: !paper.isBookmarked })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              paper.isBookmarked
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${paper.isBookmarked ? 'fill-current' : ''}`} />
            {paper.isBookmarked ? '已收藏' : '收藏'}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            <MessageSquare className="h-4 w-4" />
            笔记 {paper.comments.length}
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopyBibtex}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          {copiedBib ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copiedBib ? '已复制' : '复制引用'}
        </button>
      </div>

      {showNotes && (
        <div className={`mt-3 rounded-xl p-4 ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
          <form onSubmit={handleSubmitNote} className="flex gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="写下阅读笔记"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              disabled={submitting || !noteText.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              保存
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {paper.comments.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
                <div>
                  <div className="text-slate-400">{c.createdAt.slice(0, 16).replace('T', ' ')}</div>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300">{c.content}</p>
                </div>
                <button type="button" onClick={() => onDeleteComment(paper.id, c.id)} className="text-slate-300 hover:text-rose-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
