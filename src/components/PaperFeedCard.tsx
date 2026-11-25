import React, { useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpenCheck,
  Building2,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Lightbulb,
  Loader2,
  MessageSquare,
  Sparkles,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type { AcademicPaper, EntryType, ReadingStatus, UserProfile } from '../types/paper';
import {
  DATASET_SOURCE_META,
  DOMAIN_META,
  READING_STATUS_META,
  TOPIC_META,
  generateBibtex,
  resolveDoiUrl,
  resolvePaperOriginalUrl,
} from '../lib/constants';
import { CommentsAndThoughts } from './CommentsAndThoughts';

interface PaperFeedCardProps {
  paper: AcademicPaper;
  currentUser: UserProfile | null;
  darkMode: boolean;
  onOpenDetail: (paper: AcademicPaper) => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onReparse: (id: string) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper, personalTags?: string[]) => Promise<void>;
  onUpdateStatus: (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => void;
  onAddEntry: (paperId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onEditEntry: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onDeleteEntry: (paperId: string, commentId: string) => Promise<void>;
  onFilterByCollector?: (userId: string) => void;
}

const hasChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

export const PaperFeedCard: React.FC<PaperFeedCardProps> = ({
  paper,
  currentUser,
  darkMode,
  onOpenDetail,
  onEdit,
  onDelete,
  onReparse,
  onToggleMyKb,
  onUpdateStatus,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onFilterByCollector,
}) => {
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [personalTagInput, setPersonalTagInput] = useState((paper.myPersonalTags || []).join(', '));
  const [copiedBib, setCopiedBib] = useState(false);
  const [reparsing, setReparsing] = useState(false);

  const { anatomy } = paper;
  const dsMeta = DATASET_SOURCE_META[anatomy.dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  const statusInfo = READING_STATUS_META[paper.readingStatus] || READING_STATUS_META.unread;
  const showZhTitle = paper.titleZh && paper.titleZh !== paper.title && hasChinese(paper.titleZh);
  const collectors = paper.collectors || [];
  const thoughtCount = paper.comments.filter((c) => c.entryType === 'thought').length;
  const commentCount = paper.comments.filter((c) => c.entryType !== 'thought').length;

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

  const handleSavePersonalTags = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = personalTagInput
      .split(/[,，]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    await onToggleMyKb(paper, tags);
    setShowTagEditor(false);
  };

  const chip = 'rounded-md border px-2.5 py-0.5 text-sm';
  const iconBtn = 'rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';

  return (
    <article
      className={`rounded-2xl border p-4 sm:p-6 ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      {/* Top Meta Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="rounded-md bg-slate-800 px-2.5 py-0.5 font-medium text-white dark:bg-indigo-600">
            {paper.journalShort}
          </span>
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

        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={handleCycleStatus} className={`${chip} font-medium ${statusInfo.cls}`}>
            {statusInfo.label}
          </button>
          <button
            type="button"
            disabled={reparsing}
            onClick={async () => {
              setReparsing(true);
              try {
                await onReparse(paper.id);
              } finally {
                setReparsing(false);
              }
            }}
            title="自动解析补全正文结构、作者单位与引文"
            className={`${iconBtn} hover:text-indigo-600`}
          >
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Sparkles className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => onEdit(paper)} title="编辑" className={`${iconBtn} hover:text-indigo-600`}>
            <Edit3 className="h-4 w-4" />
          </button>
          {(!currentUser || currentUser.role === 'admin' || paper.inMyKb) && (
            <button type="button" onClick={() => onDelete(paper.id)} title="删除" className={`${iconBtn} hover:text-rose-600`}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h2
        onClick={() => onOpenDetail(paper)}
        className="mt-3 cursor-pointer text-lg font-semibold leading-snug text-slate-900 hover:text-indigo-700 sm:text-xl dark:text-white"
      >
        {paper.title}
      </h2>
      {showZhTitle && <p className="mt-1 text-base text-slate-600 dark:text-slate-300">{paper.titleZh}</p>}

      {/* Authors + Clickable DOI */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
        <span>作者：{paper.authors.slice(0, 6).join(', ')}</span>
        {paper.doi && resolveDoiUrl(paper.doi, paper.url) && (
          <>
            <span className="text-slate-300">|</span>
            <a
              href={resolveDoiUrl(paper.doi, paper.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              DOI: {paper.doi}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>

      {/* Author Affiliations / Institutions Row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="text-slate-500">作者单位：</span>
        {paper.affiliations && paper.affiliations.length > 0 ? (
          paper.affiliations.map((aff) => (
            <span
              key={aff}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {aff}
            </span>
          ))
        ) : (
          <span className="text-slate-400">预印本未标注单位（可点击右上角解析图标补全或手动编辑）</span>
        )}
      </div>

      {/* Topic & Dataset Tags */}
      <div className="mt-3 flex flex-wrap gap-2">
        {paper.topics.map((t) => (
          <span key={t} className={`${chip} ${TOPIC_META[t].bgClass} ${TOPIC_META[t].textClass} ${TOPIC_META[t].borderClass}`}>
            {TOPIC_META[t].label}
          </span>
        ))}
        <span className={`${chip} ${DOMAIN_META[paper.domain].badgeClass}`}>{DOMAIN_META[paper.domain].label}</span>
        {anatomy.dataset.sourceType !== 'unspecified' && (
          <span className={`${chip} ${dsMeta.badgeClass}`}>{dsMeta.shortLabel}</span>
        )}
        {(paper.myPersonalTags || []).map((pt) => (
          <span
            key={pt}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
          >
            <Tag className="h-3 w-3" /> {pt}
          </span>
        ))}
      </div>

      {/* Collectors in Public Pool: Who selected this paper into their Knowledge Base + their User Tags */}
      {collectors.length > 0 && (
        <div
          className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-sm ${
            darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-indigo-100 bg-indigo-50/40'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
            <Users className="h-4 w-4" />
            已选入知识库：
          </span>
          {collectors.map((col) => (
            <button
              key={col.userId}
              type="button"
              onClick={() => onFilterByCollector?.(col.userId)}
              className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm shadow-2xs hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: col.avatarColor }}
              >
                {col.displayName.slice(0, 1)}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{col.displayName}</span>
              {col.userTags.slice(0, 2).map((ut) => (
                <span key={ut} className="rounded bg-indigo-50 px-1.5 py-0.2 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {ut}
                </span>
              ))}
              {col.personalTags.slice(0, 2).map((pt) => (
                <span key={pt} className="rounded bg-amber-50 px-1.5 py-0.2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  #{pt}
                </span>
              ))}
            </button>
          ))}
        </div>
      )}

      {/* Digest */}
      {paper.digestSummary && <p className="mt-4 text-base leading-7 text-slate-800 dark:text-slate-200">{paper.digestSummary}</p>}

      {/* Content Blocks */}
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

      {/* Comparison Table */}
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <BookOpenCheck className="h-4 w-4" />
            精读全文解析
          </button>

          {resolvePaperOriginalUrl(paper) && (
            <a
              href={resolvePaperOriginalUrl(paper)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
            >
              <ExternalLink className="h-4 w-4" />
              查看原文
            </a>
          )}

          <button
            type="button"
            onClick={() => void onToggleMyKb(paper)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              paper.inMyKb
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            {paper.inMyKb ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
            {paper.inMyKb ? '已在我的知识库' : '选入我的知识库'}
          </button>

          {paper.inMyKb && (
            <button
              type="button"
              onClick={() => {
                setPersonalTagInput((paper.myPersonalTags || []).join(', '));
                setShowTagEditor((v) => !v);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              <Tag className="h-4 w-4" />
              标签
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDiscussion((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span>思考 {thoughtCount}</span>
            <span className="text-slate-300">/</span>
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            <span>评论 {commentCount}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyBibtex}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          {copiedBib ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copiedBib ? '已复制' : '复制引用'}
        </button>
      </div>

      {/* Personal Paper Tag Editor */}
      {showTagEditor && (
        <form
          onSubmit={handleSavePersonalTags}
          className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
            darkMode ? 'border-slate-800 bg-slate-800/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <span className="text-sm font-medium">我的文献标签：</span>
          <input
            type="text"
            value={personalTagInput}
            onChange={(e) => setPersonalTagInput(e.target.value)}
            placeholder="例如：精读必看, 开题参考, 实验对比"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            保存标签
          </button>
        </form>
      )}

      {/* Expandable Comments & Thoughts CRUD */}
      {showDiscussion && (
        <div className={`mt-4 rounded-xl p-4 ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <CommentsAndThoughts
            paperId={paper.id}
            comments={paper.comments}
            currentUser={currentUser}
            darkMode={darkMode}
            onAdd={onAddEntry}
            onEdit={onEditEntry}
            onDelete={onDeleteEntry}
          />
        </div>
      )}
    </article>
  );
};
