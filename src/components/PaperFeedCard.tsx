import React, { useState } from 'react';
import {
  Bookmark,
  BookOpenCheck,
  Check,
  Edit3,
  ExternalLink,
  Heart,
  MessageSquare,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AcademicPaper } from '../types/paper';
import {
  DOMAIN_META,
  TOPIC_META,
  formatRelativeTime,
  generateBibtex,
} from '../lib/constants';
import { FeedMiniVisual } from './visuals/PaperVisuals';

interface PaperFeedCardProps {
  paper: AcademicPaper;
  darkMode: boolean;
  onOpenDetail: (paper: AcademicPaper) => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onEngage: (id: string, action: 'like' | 'bookmark' | 'repost') => void;
  onAddComment: (paperId: string, author: string, role: string, content: string) => Promise<void>;
  onDeleteComment: (paperId: string, commentId: string) => Promise<void>;
  onFilterTag: (tag: string) => void;
}

export const PaperFeedCard: React.FC<PaperFeedCardProps> = ({
  paper,
  darkMode,
  onOpenDetail,
  onEdit,
  onDelete,
  onEngage,
  onAddComment,
  onDeleteComment,
  onFilterTag,
}) => {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('张研究员');
  const [submitting, setSubmitting] = useState(false);
  const [copiedBib, setCopiedBib] = useState(false);

  const domainInfo = DOMAIN_META[paper.domain];

  const handleCopyBibtex = async () => {
    try {
      await navigator.clipboard.writeText(generateBibtex(paper));
      setCopiedBib(true);
      onEngage(paper.id, 'repost');
      setTimeout(() => setCopiedBib(false), 2000);
    } catch {
      onEngage(paper.id, 'repost');
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(paper.id, commentAuthor, '同行学者', commentText.trim());
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article
      className={`group rounded-2xl border p-5 transition-all ${
        darkMode
          ? 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
          : 'border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] hover:border-indigo-200 hover:shadow-md'
      }`}
    >
      {/* Header: Journal Avatar + Verified Badge + Timestamp */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-indigo-800 font-mono-code text-xs font-bold text-white shadow-sm">
            {paper.journalShort.slice(0, 5)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{paper.journal}</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                <Sparkles className="h-2.5 w-2.5" />
                {paper.journalRank}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${domainInfo.badgeClass}`}>
                {domainInfo.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{formatRelativeTime(paper.syncedAt)}</span>
              <span>·</span>
              <span className="font-mono-code">{paper.publishedDate}</span>
              <span>·</span>
              <span className="truncate max-w-[280px]">{paper.authors.slice(0, 3).join(', ')}</span>
              {paper.sourceOrigin !== 'curated' && (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono-code text-[10px] font-semibold text-emerald-600">
                  {paper.sourceOrigin === 'arxiv_live'
                    ? 'arXiv实时'
                    : paper.sourceOrigin === 'openalex_live'
                      ? 'OpenAlex同步'
                      : '自主录入'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Edit / Delete / External */}
        <div className="flex items-center gap-1 opacity-80 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(paper)}
            title="编辑文献与10维解析"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(paper.id)}
            title="删除该文献"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            title="查看原文"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Topic Pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {paper.topics.map((t) => {
          const meta = TOPIC_META[t];
          return (
            <span
              key={t}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
            >
              #{meta.label}
            </span>
          );
        })}
        {paper.tags.slice(0, 3).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onFilterTag(tag)}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300"
          >
            #{tag}#
          </button>
        ))}
      </div>

      {/* Title & Weibo-style Summary */}
      <div className="mt-3 cursor-pointer" onClick={() => onOpenDetail(paper)}>
        <h2 className="font-serif-academic text-lg font-bold leading-snug text-slate-900 transition group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-400">
          {paper.titleZh}
        </h2>
        <p className="mt-1 font-mono-code text-xs leading-relaxed text-slate-500 dark:text-slate-400">{paper.title}</p>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{paper.weiboSummary}</p>
      </div>

      {/* 3-Point Logic Strip */}
      <div
        className={`mt-3 grid grid-cols-1 gap-2 rounded-xl border p-3 text-xs sm:grid-cols-3 ${
          darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <div className="min-w-0">
          <span className="font-bold text-rose-600 dark:text-rose-400">痛点局限：</span>
          <span className="line-clamp-2 text-slate-600 dark:text-slate-300">{paper.anatomy.problem}</span>
        </div>
        <div className="min-w-0">
          <span className="font-bold text-indigo-600 dark:text-indigo-400">创新方法：</span>
          <span className="line-clamp-2 text-slate-600 dark:text-slate-300">{paper.anatomy.proposedMethod}</span>
        </div>
        <div className="min-w-0">
          <span className="font-bold text-emerald-600 dark:text-emerald-400">核心结论：</span>
          <span className="line-clamp-2 text-slate-600 dark:text-slate-300">{paper.anatomy.conclusion}</span>
        </div>
      </div>

      {/* Embedded Mini Visual (Architecture + Benchmark Bars) */}
      <FeedMiniVisual paper={paper} darkMode={darkMode} onOpenDeep={() => onOpenDetail(paper)} />

      {/* Bottom Action Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(paper)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-700"
          >
            <BookOpenCheck className="h-3.5 w-3.5" />
            深度精读 · 10维逻辑拆解
          </button>

          <button
            type="button"
            onClick={() => onEngage(paper.id, 'like')}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              paper.isLiked
                ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/50'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${paper.isLiked ? 'fill-current' : ''}`} />
            {paper.likes}
          </button>

          <button
            type="button"
            onClick={() => onEngage(paper.id, 'bookmark')}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              paper.isBookmarked
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${paper.isBookmarked ? 'fill-current' : ''}`} />
            {paper.isBookmarked ? '已收藏' : '收藏'}
          </button>

          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            学术批注 ({paper.comments.length})
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyBibtex}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {copiedBib ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5" />}
          {copiedBib ? '已复制 BibTeX' : `引用转发 (${paper.reposts})`}
        </button>
      </div>

      {/* Expandable Inline Weibo Comment Thread */}
      {showComments && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <form onSubmit={handleSubmitComment} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              placeholder="您的称呼"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 sm:w-28 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="发表研究心得、实验疑问或方法点评..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              发布
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {paper.comments.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-2">暂无同行批注，欢迎发表首条学术见解</div>
            ) : (
              paper.comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">{c.author}</span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {c.role}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatRelativeTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{c.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteComment(paper.id, c.id)}
                    className="text-slate-300 hover:text-rose-500"
                    title="删除评论"
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
