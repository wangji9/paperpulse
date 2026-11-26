import { chineseText } from '../lib/chinese';
import { PaperAbstract } from './PaperAbstract';
import React, { useRef, useState } from 'react';
import {
  Heart,
  BookmarkCheck,
  BookmarkPlus,
  BookOpenCheck,
  Building2,
  Check,
  Copy,
  Cpu,
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
import { OriginalFiguresSection, OriginalTablesSection } from './visuals/PaperVisuals';
import { PaperKeywords } from './PaperKeywords';
import { CommentsAndThoughts } from './CommentsAndThoughts';
import { PaperSocialFootprintPanel, useCardReadingTracker, useModalReadingTracker, formatDurationZh } from './SocialEngagement';

interface PaperFeedCardProps {
  paper: AcademicPaper;
  onSocialUpdate: (paper: AcademicPaper) => void;
  onLike: (id: string) => Promise<void>;
  onLikeComment: (paperId: string, commentId: string) => Promise<void>;
  trackingEnabled?: boolean;
  currentUser: UserProfile | null;
  darkMode: boolean;
  onOpenDetail: (paper: AcademicPaper) => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onReparse: (id: string) => Promise<void>;
  onUploadMedia?: (
    paperId: string,
    payload: { kind: 'method_figure' | 'experiment_figure' | 'table_image'; dataUrl: string; analysisZh?: string }
  ) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper, personalTags?: string[]) => Promise<void>;
  onUpdateStatus: (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => void;
  onAddEntry: (paperId: string, payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }) => Promise<void>;
  onEditEntry: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }) => Promise<void>;
  onDeleteEntry: (paperId: string, commentId: string) => Promise<void>;
  onFilterByCollector?: (userId: string) => void;
}

const hasChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

export const PaperFeedCard: React.FC<PaperFeedCardProps> = ({
  paper,
  onSocialUpdate,
  onLike,
  onLikeComment,
  trackingEnabled = true,
  currentUser,
  darkMode,
  onOpenDetail,
  onEdit,
  onDelete,
  onReparse,
  onUploadMedia,
  onToggleMyKb,
  onUpdateStatus,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onFilterByCollector,
}) => {
  const cardRef = useRef<HTMLElement>(null);
  const [liking, setLiking] = useState(false);
  useCardReadingTracker(paper.id, cardRef, Boolean(currentUser) && trackingEnabled, onSocialUpdate);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [personalTagInput, setPersonalTagInput] = useState((paper.myPersonalTags || []).join(', '));
  const [copiedBib, setCopiedBib] = useState(false);
  const [reparsing, setReparsing] = useState(false);

  const { anatomy } = paper;
  const dsMeta = DATASET_SOURCE_META[anatomy.dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  const statusInfo = READING_STATUS_META[paper.readingStatus] || READING_STATUS_META.unread;
  const collectors = paper.collectors || [];
  const thoughtCount = paper.comments.filter((c) => c.entryType === 'thought').length;
  const commentCount = paper.comments.filter((c) => c.entryType !== 'thought').length;

  const blocks = [
    {
      num: '01',
      title: '研究背景与核心问题',
      text: [anatomy.background, anatomy.problem].filter(Boolean).join('\n'),
    },
    {
      num: '02',
      title: '研究现状与现存局限',
      text: [anatomy.currentStatus, anatomy.limitationsOfPriorWork].filter(Boolean).join('\n'),
    },
    {
      num: '03',
      title: anatomy.modelName ? `提出方法（${anatomy.modelName}）` : '本文提出方法',
      text: anatomy.proposedMethod,
    },
    {
      num: '04',
      title: '实验设计与数据集',
      text: [
        anatomy.experimentalValidation,
        anatomy.dataset.names.length ? `数据集：${anatomy.dataset.names.join('、')}` : '',
        anatomy.dataset.summary ? `构建说明：${anatomy.dataset.summary}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ].filter((b) => b.text && b.text.trim());

  const paperFigures = anatomy.paperFigures || [];
  const paperTables = anatomy.paperTables || [];

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
    <article ref={cardRef}
      className={`rounded-2xl border p-4 sm:p-6 transition-shadow hover:shadow-md ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-sm'
      }`}
    >
      {/* Top Meta Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="rounded-md bg-indigo-600 px-2.5 py-0.5 font-semibold text-white">
            {paper.journalShort}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{paper.journalShort}</span>
          <span className="text-slate-300">|</span>
          <span>{paper.publishedDate}</span>
          {paper.citedByCount > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span>被引 {paper.citedByCount}</span>
            </>
          )}
          {anatomy.modelName && (
            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/80 px-2 py-0.5 font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
              <Cpu className="h-3.5 w-3.5" />
              {anatomy.modelName}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={handleCycleStatus} className={`${chip} font-medium ${statusInfo.cls}`}>
            {statusInfo.label}
          </button>
          {currentUser?.role === 'admin' && <>
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
            title="自动提取论文原图、原表、作者单位与引文"
            className={`${iconBtn} hover:text-indigo-600`}
          >
            {reparsing ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Sparkles className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => onEdit(paper)} title="编辑" className={`${iconBtn} hover:text-indigo-600`}>
            <Edit3 className="h-4 w-4" />
          </button>
          </>}
          {currentUser?.role === 'admin' && (
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
        {chineseText(paper.titleZh || paper.title)}
      </h2>


      <PaperKeywords paper={paper} />
      <PaperAbstract paper={paper} compact />
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

      {/* Author Affiliations */}
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
          <span className="text-slate-400">预印本未标注单位（可点击解析图标补全或手动编辑）</span>
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
            className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
          >
            <Tag className="h-3 w-3" /> {pt}
          </span>
        ))}
      </div>

      {/* Collectors in Public Pool */}
      {collectors.length > 0 && (
        <div
          className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-sm ${
            darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-teal-100 bg-teal-50/40'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
            <Users className="h-4 w-4" />
            已选入知识库：
          </span>
          {collectors.map((col) => (
            <button
              key={col.userId}
              type="button"
              onClick={() => onFilterByCollector?.(col.userId)}
              className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm shadow-2xs hover:border-teal-500 dark:border-slate-700 dark:bg-slate-900"
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
                <span key={pt} className="rounded bg-teal-50 px-1.5 py-0.2 text-xs text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  #{pt}
                </span>
              ))}
            </button>
          ))}
        </div>
      )}

      {/* Core Digest */}
      {paper.digestSummary && (
        <div
          className={`mt-4 rounded-xl border-l-4 border-indigo-600 px-4 py-3 text-base leading-7 ${
            darkMode ? 'bg-slate-800/50 text-slate-200' : 'bg-indigo-50/40 text-slate-800'
          }`}
        >
          {chineseText(paper.digestSummary)}
        </div>
      )}

      {/* Structured 4-Part Deep Logic Grid */}
      {blocks.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {blocks.map((b) => (
            <div
              key={b.num}
              className={`rounded-xl border p-4 ${
                darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200/70 bg-slate-50/70'
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                <span className="rounded bg-indigo-600 px-1.5 py-0.2 text-xs text-white">{b.num}</span>
                <span>{b.title}</span>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-300">{chineseText(b.text)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Directly Embedded Original Paper Figures (No self-drawn SVG!) */}
      {(paperFigures.length > 0 || anatomy.figureUrl) && (
        <div className="mt-4">
          <OriginalFiguresSection
            figures={paperFigures}
            legacyFigureUrl={anatomy.figureUrl}
            legacyCaption={anatomy.figureCaption}
            title="论文原文方法与实验配图"
            maxItems={2}
            onUploadMedia={onUploadMedia ? (pl) => onUploadMedia(paper.id, pl) : undefined}
            darkMode={darkMode}
          />
        </div>
      )}

      {/* Directly Embedded Original Paper Experimental Tables */}
      {paperTables.length > 0 && (
        <div className="mt-4">
          <OriginalTablesSection
            tables={paperTables}
            maxItems={1}
            onUploadMedia={onUploadMedia ? (pl) => onUploadMedia(paper.id, pl) : undefined}
            darkMode={darkMode}
          />
        </div>
      )}

      {/* Conclusion & Limitations Summary */}
      {anatomy.conclusion && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${
            darkMode ? 'border-slate-800 bg-slate-800/40 text-slate-300' : 'border-slate-200/80 bg-slate-50/60 text-slate-700'
          }`}
        >
          <p>
            <span className="font-semibold text-slate-900 dark:text-white">核心结论：</span>
            {chineseText(anatomy.conclusion)}
          </p>
        </div>
      )}

      <PaperSocialFootprintPanel paper={paper} darkMode={darkMode} onFilterByUser={onFilterByCollector} />
      <button type="button" disabled={liking} aria-pressed={paper.likedByMe} onClick={async () => { setLiking(true); try { await onLike(paper.id); } finally { setLiking(false); } }} className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-600 disabled:opacity-50">
        <Heart className={`h-4 w-4 ${paper.likedByMe ? 'fill-current' : ''}`} />{paper.likedByMe ? '已点赞' : '点赞'} · {paper.likers?.length || 0}
      </button>
      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(paper)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <BookOpenCheck className="h-4 w-4" />
            精读全文与原文图表
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
                ? 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
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
              个人标签
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
            darkMode ? 'border-slate-800 bg-slate-800/60' : 'border-teal-200 bg-teal-50/50'
          }`}
        >
          <span className="text-sm font-medium">我的知识库标签：</span>
          <input
            type="text"
            value={personalTagInput}
            onChange={(e) => setPersonalTagInput(e.target.value)}
            placeholder="例如：精读必看, 开题参考, 实验基线对比"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
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
            onToggleLike={onLikeComment}
            onAdd={onAddEntry}
            onEdit={onEditEntry}
            onDelete={onDeleteEntry}
          />
        </div>
      )}
    </article>
  );
};
