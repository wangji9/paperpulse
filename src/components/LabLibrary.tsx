import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  BookmarkPlus,
  BookOpenCheck,
  Compass,
  Edit3,
  ExternalLink,
  FileText,
  FileUp,
  Flame,
  FolderPlus,
  Hash,
  Heart,
  Library,
  Loader2,
  MessageSquare,
  Plus,
  Repeat2,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { AcademicPaper, EntryType, LabEntry, ResearchTopic, UserProfile } from '../types/paper';
import { labRequest, repostPaperApi, unrepostPaperApi, uploadLabPaperPdf } from '../lib/api';
import { TOPIC_META } from '../lib/constants';
import { analyzeLab, type LabAnalysisResult } from '../lib/labAnalysis';
import { extractChineseKeywordTags } from '../lib/canonicalize';
import { PaperAbstract } from './PaperAbstract';
import { AdaptiveFigureGallery } from './AdaptiveFigureGallery';
import { LabTopicGraph } from './LabTopicGraph';
import { PdfUploadModal } from './PdfUploadModal';
import { RelatedPapers } from './RelatedPapers';
import { CommentsAndThoughts } from './CommentsAndThoughts';
import {
  PaperSocialFootprintPanel,
  formatRelativeTimeZh,
  useCardReadingTracker,
} from './SocialEngagement';
import {
  MatlabAuthorContributionChart,
  MatlabAuthorSocialBubbleChart,
  MatlabAuthorThemeBubbleMatrix,
  MatlabCoauthorAffinityHeatmap,
  MatlabEngagementBubbleChart,
  MatlabGapOpportunityMatrix,
  MatlabJournalBarChart,
  MatlabKeywordBubbleChart,
  MatlabPublicationTimeline,
  MatlabTopicYearHeatmap,
} from './MatlabCharts';

interface LabLibraryProps {
  pool: AcademicPaper[];
  currentUser: UserProfile | null;
  darkMode: boolean;
  onOpen: (p: AcademicPaper) => void;
  onAskAi?: (p: AcademicPaper) => void;
  onChanged: () => void;
  onSocialUpdate: (paper: AcademicPaper) => void;
  onLike: (id: string) => Promise<void>;
  onLikeComment: (paperId: string, commentId: string) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper, personalTags?: string[]) => Promise<void>;
  onAddEntry: (
    paperId: string,
    payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }
  ) => Promise<void>;
  onEditEntry: (
    paperId: string,
    commentId: string,
    payload: { content: string; entryType: EntryType }
  ) => Promise<void>;
  onDeleteEntry: (paperId: string, commentId: string) => Promise<void>;
}

const AVATAR_PALETTE = ['#0072BD', '#D95319', '#7E2F8E', '#77AC30', '#0F766E', '#A2142F', '#2563EB'];
function pickAuthorColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/* ============================================================================
 * Weibo-Style Lab Publication Post Card
 * ============================================================================ */
const LabWeiboCard: React.FC<{
  entry: LabEntry;
  index: number;
  analysis: LabAnalysisResult;
  currentUser: UserProfile | null;
  darkMode: boolean;
  attachingPdf: boolean;
  onOpen: (p: AcademicPaper) => void;
  onAskAi?: (p: AcademicPaper) => void;
  onEdit: (e: LabEntry) => void;
  onDelete: (paperId: string) => void;
  onOpenPdf: (p: AcademicPaper) => void;
  onAttachPdf: (paperId: string) => void;
  onSelectQuery: (q: string) => void;
  onPaperUpdated: (p: AcademicPaper) => void;
  onLike: (id: string) => Promise<void>;
  onLikeComment: (paperId: string, commentId: string) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper) => Promise<void>;
  onAddEntry: LabLibraryProps['onAddEntry'];
  onEditEntry: LabLibraryProps['onEditEntry'];
  onDeleteEntry: LabLibraryProps['onDeleteEntry'];
}> = ({
  entry,
  index,
  analysis,
  currentUser,
  darkMode,
  attachingPdf,
  onOpen,
  onAskAi,
  onEdit,
  onDelete,
  onOpenPdf,
  onAttachPdf,
  onSelectQuery,
  onPaperUpdated,
  onLike,
  onLikeComment,
  onToggleMyKb,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
}) => {
  const cardRef = useRef<HTMLElement | null>(null);
  const paper = entry.paper;
  useCardReadingTracker(paper.id, cardRef, Boolean(currentUser), onPaperUpdated);

  const [showComments, setShowComments] = useState(false);
  const [showRepostBox, setShowRepostBox] = useState(false);
  const [repostNote, setRepostNote] = useState('');
  const [repostAlsoCollect, setRepostAlsoCollect] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [liking, setLiking] = useState(false);

  const yr = entry.publicationYear || Number((paper.publishedDate || '').slice(0, 4)) || '';
  const canonAuthors = analysis.paperCanonicalAuthors.get(paper.id) || [];
  const chineseTags = useMemo(() => extractChineseKeywordTags(paper, 8), [paper]);
  const leadAuthor = canonAuthors[0]?.shortName || paper.authors[0] || '课题组';
  const leadColor = pickAuthorColor(leadAuthor);

  const reposts = paper.reposts || [];
  const likers = paper.likers || [];
  const collectors = paper.collectors || [];
  const comments = paper.comments || [];

  const handleRepostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReposting(true);
    try {
      const updated = await repostPaperApi(paper.id, repostNote.trim());
      onPaperUpdated(updated);
      if (repostAlsoCollect && !paper.inMyKb) {
        await onToggleMyKb(paper);
      }
      setRepostNote('');
      setShowRepostBox(false);
    } finally {
      setReposting(false);
    }
  };

  const handleCancelRepost = async () => {
    setReposting(true);
    try {
      const updated = await unrepostPaperApi(paper.id);
      onPaperUpdated(updated);
    } finally {
      setReposting(false);
    }
  };

  const handleLikeClick = async () => {
    setLiking(true);
    try {
      await onLike(paper.id);
    } finally {
      setLiking(false);
    }
  };

  return (
    <article
      ref={cardRef}
      className={`rounded-2xl border transition-shadow hover:shadow-md ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-xs'
      }`}
    >
      {/* 1. Weibo Author & Metadata Header */}
      <div className="flex items-start justify-between gap-2.5 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => onSelectQuery(leadAuthor)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-xs ring-2 ring-white dark:ring-slate-900"
            style={{ backgroundColor: leadColor }}
            title={`筛选 ${leadAuthor} 的全部成果`}
          >
            {leadAuthor.slice(0, 2)}
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectQuery(leadAuthor)}
                className="text-lg font-bold text-slate-900 hover:text-[#0072BD] dark:text-white dark:hover:text-sky-400"
              >
                {leadAuthor}
              </button>
              <span className="rounded-md bg-[#0072BD] px-2 py-0.5 font-mono text-base font-bold text-white">
                {yr || '年份待核'}
              </span>
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-base font-semibold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                {paper.journal}
              </span>
              {paper.localPdfUrl && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-base font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  全文PDF
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-base text-slate-600 dark:text-slate-300">
              <span className="font-mono font-semibold text-slate-400">#{index + 1}</span>
              <span>·</span>
              <span>
                作者：
                {canonAuthors.length > 0
                  ? canonAuthors.map((a, idx) => (
                      <React.Fragment key={a.id}>
                        {idx > 0 && '、'}
                        <button
                          type="button"
                          onClick={() => onSelectQuery(a.shortName)}
                          className="hover:text-[#0072BD] hover:underline"
                        >
                          {a.shortName}
                        </button>
                      </React.Fragment>
                    ))
                  : paper.authors.join('、')}
              </span>
            </div>
          </div>
        </div>

        {entry.canEdit && (
          <div className="flex shrink-0 items-center gap-1 text-base">
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-[#0072BD] dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Edit3 className="h-4 w-4" /> 修订
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry.paperId)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-4 w-4" /> 移出
            </button>
          </div>
        )}
      </div>

      {/* 2. Weibo Main Content Body */}
      <div className="px-4 pt-2.5 pb-3">
        <button
          type="button"
          onClick={() => onOpen(paper)}
          className="block text-left text-xl font-bold leading-snug text-slate-900 hover:text-[#0072BD] sm:text-[21px] dark:text-white dark:hover:text-sky-400"
        >
          {paper.titleZh || paper.title}
        </button>
        {paper.titleZh && paper.title && paper.titleZh !== paper.title && (
          <p className="mt-1 text-base leading-snug text-slate-500 dark:text-slate-400">{paper.title}</p>
        )}

        {/* 100% Chinese Deduplicated Hashtags */}
        {chineseTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chineseTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectQuery(tag)}
                className="rounded-full bg-sky-50 px-2.5 py-0.5 text-base font-medium text-[#0072BD] hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300"
              >
                #{tag}#
              </button>
            ))}
          </div>
        )}

        {/* Full Paper Abstract (Always Expanded) */}
        <PaperAbstract paper={paper} />

        {/* All Original Figures — Aspect-Ratio-Aware Compact Justified Gallery (Zero Blank Margins) */}
        {(paper.anatomy?.paperFigures?.length || 0) > 0 && (
          <AdaptiveFigureGallery figures={paper.anatomy.paperFigures!} darkMode={darkMode} />
        )}

        {/* All Original Tables — Compact Collapsible Gallery (Every Table Recorded!) */}
        {(paper.anatomy?.paperTables?.length || 0) > 0 && (
          <details className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-800/35">
            <summary className="cursor-pointer font-semibold text-slate-700 hover:text-[#0072BD] dark:text-slate-200">
              原文全部表格（共 {paper.anatomy.paperTables!.length} 张 · 点击展开查看与放大）
            </summary>
            <div className="pt-2">
              <AdaptiveFigureGallery
                figures={paper.anatomy.paperTables!
                  .filter((t) => Boolean(t.imageUrl))
                  .map((t) => ({
                    id: t.id,
                    label: t.label,
                    url: t.imageUrl!,
                    captionOriginal: t.captionOriginal,
                    captionZh: t.captionZh,
                    analysisZh: t.analysisZh,
                    category: 'experiment' as const,
                  }))}
                darkMode={darkMode}
              />
            </div>
          </details>
        )}

        {/* Quick Resource Bar (Deep Read / PDF / DOI) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onOpen(paper)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3 py-1.5 font-semibold text-white hover:bg-[#005a96]"
          >
            <BookOpenCheck className="h-3.5 w-3.5" /> 精读与单篇图谱
          </button>

          {onAskAi && (
            <button
              type="button"
              onClick={() => onAskAi(paper)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300"
            >
              <Sparkles className="h-3.5 w-3.5" /> 智能问答
            </button>
          )}

          {paper.localPdfUrl ? (
            <>
              <button
                type="button"
                onClick={() => onOpenPdf(paper)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                <FileText className="h-3.5 w-3.5" /> 在线全文 PDF
              </button>
              <button
                type="button"
                disabled={attachingPdf}
                onClick={() => onAttachPdf(entry.paperId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:border-[#0072BD] hover:text-[#0072BD] disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
              >
                {attachingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0072BD]" /> : <FileUp className="h-3.5 w-3.5" />}
                {attachingPdf ? '自动解析PDF中…' : '替换并重析 PDF'}
              </button>
            </>
          ) : (
            <>
              {paper.pdfUrl && (
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                >
                  <FileText className="h-3.5 w-3.5" /> 公开 PDF
                </a>
              )}
              <button
                type="button"
                disabled={attachingPdf}
                onClick={() => onAttachPdf(entry.paperId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                {attachingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                {attachingPdf ? '自动解析PDF中…' : '上传并解析 PDF'}
              </button>
            </>
          )}

          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//i, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:text-slate-300"
            >
              <ExternalLink className="h-3.5 w-3.5" /> DOI
            </a>
          )}

          {entry.citation && (
            <details className="ml-auto text-[11px] text-slate-400">
              <summary className="cursor-pointer hover:text-slate-600">引用格式</summary>
              <p className="mt-1 max-w-xl rounded-lg bg-slate-50 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {entry.citation}
              </p>
            </details>
          )}
        </div>

        {/* Shared Repost Recommendation Strip (Visible to all members) */}
        {reposts.length > 0 && (
          <div
            className={`mt-3 space-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs ${
              darkMode ? 'border-slate-800 bg-slate-800/50' : 'border-sky-100 bg-sky-50/50'
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold text-[#0072BD] dark:text-sky-400">
              <Repeat2 className="h-3.5 w-3.5" /> 组内转发推荐 ({reposts.length})
            </div>
            {reposts.slice(0, 4).map((rp) => (
              <div key={rp.id} className="flex items-start gap-2">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                  style={{ backgroundColor: rp.avatarColor }}
                >
                  {rp.displayName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1 leading-5">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{rp.displayName}</span>
                  <span className="mx-1.5 text-[11px] text-slate-400">{formatRelativeTimeZh(rp.repostedAt)}</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {rp.note || '转发推荐了这篇课题组成果'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Visible Shared Social Footprint & Reader Bubble Strip */}
        <PaperSocialFootprintPanel paper={paper} darkMode={darkMode} />
      </div>

      {/* 3. Classic Weibo 4-Column Social Action Footer */}
      <div
        className={`grid grid-cols-4 divide-x border-t text-base font-semibold ${
          darkMode ? 'divide-slate-800 border-slate-800' : 'divide-slate-100 border-slate-100'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setShowRepostBox((v) => !v);
            setShowComments(false);
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 transition ${
            paper.repostedByMe
              ? 'text-[#0072BD] dark:text-sky-400'
              : 'text-slate-600 hover:bg-slate-50 hover:text-[#0072BD] dark:text-slate-300 dark:hover:bg-slate-800/70'
          }`}
        >
          <Repeat2 className="h-4 w-4" />
          <span>转发{reposts.length > 0 ? ` ${reposts.length}` : ''}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowComments((v) => !v);
            setShowRepostBox(false);
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 transition ${
            showComments
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800/70'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>评论{comments.length > 0 ? ` ${comments.length}` : ''}</span>
        </button>

        <button
          type="button"
          disabled={liking}
          onClick={() => void handleLikeClick()}
          className={`flex items-center justify-center gap-1.5 py-2.5 transition ${
            paper.likedByMe
              ? 'text-rose-600'
              : 'text-slate-600 hover:bg-slate-50 hover:text-rose-600 dark:text-slate-300 dark:hover:bg-slate-800/70'
          }`}
        >
          <Heart className={`h-4 w-4 ${paper.likedByMe ? 'fill-current' : ''}`} />
          <span>点赞{likers.length > 0 ? ` ${likers.length}` : ''}</span>
        </button>

        <button
          type="button"
          onClick={() => void onToggleMyKb(paper)}
          className={`flex items-center justify-center gap-1.5 py-2.5 transition ${
            paper.inMyKb
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-600 hover:bg-slate-50 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-slate-800/70'
          }`}
        >
          {paper.inMyKb ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
          <span>收藏{collectors.length > 0 ? ` ${collectors.length}` : ''}</span>
        </button>
      </div>

      {/* 4. Expandable Weibo Repost Composer */}
      {showRepostBox && (
        <form
          onSubmit={(e) => void handleRepostSubmit(e)}
          className={`border-t px-5 py-3.5 ${
            darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50/70'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <input
              type="text"
              value={repostNote}
              onChange={(e) => setRepostNote(e.target.value)}
              placeholder="附上一句转发推荐心得（选填），全组同学均可看到…"
              className={`flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#0072BD] ${
                darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'
              }`}
            />
            <button
              type="submit"
              disabled={reposting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0072BD] px-4 py-2 text-xs font-semibold text-white hover:bg-[#005a96] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> {reposting ? '转发中…' : '立即转发'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={repostAlsoCollect}
                onChange={(e) => setRepostAlsoCollect(e.target.checked)}
                className="rounded border-slate-300"
              />
              同时收藏到我的知识库
            </label>
            {paper.repostedByMe && (
              <button
                type="button"
                disabled={reposting}
                onClick={() => void handleCancelRepost()}
                className="text-rose-600 hover:underline"
              >
                撤销我的转发记录
              </button>
            )}
          </div>
        </form>
      )}

      {/* 5. Expandable Weibo Bubble Comments & Thoughts */}
      {showComments && (
        <div
          className={`border-t px-5 py-4 ${
            darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50/70'
          }`}
        >
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

/* ============================================================================
 * Main LabLibrary Component
 * ============================================================================ */
export function LabLibrary({
  pool,
  currentUser,
  darkMode,
  onOpen,
  onAskAi,
  onChanged,
  onSocialUpdate,
  onLike,
  onLikeComment,
  onToggleMyKb,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
}: LabLibraryProps) {
  const [entries, setEntries] = useState<LabEntry[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'papers' | 'analysis'>('papers');
  const [year, setYear] = useState('all');
  const [topic, setTopic] = useState('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState('');

  const [editing, setEditing] = useState<LabEntry | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attachingPaperId, setAttachingPaperId] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const attachTargetIdRef = useRef<string | null>(null);

  const [pdfPaper, setPdfPaper] = useState<AcademicPaper | null>(null);

  const refresh = () =>
    labRequest()
      .then(setEntries)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));

  useEffect(() => {
    let disposed = false;
    const load = () =>
      labRequest()
        .then((items) => {
          if (!disposed) {
            setEntries(items);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (!disposed) {
            setError((e as Error).message);
            setLoaded(true);
          }
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  // Merge live social state from global pool into lab entries so likes/comments/reposts update instantaneously!
  const syncedEntries = useMemo(() => {
    const poolMap = new Map(pool.map((p) => [p.id, p]));
    return entries.map((e) => {
      const fresh = poolMap.get(e.paperId);
      if (!fresh) return e;
      return {
        ...e,
        paper: {
          ...fresh,
          ...e.metadata,
          labMetadata: e.metadata,
        },
      };
    });
  }, [entries, pool]);

  const handleLabPaperUpdated = (updated: AcademicPaper) => {
    setEntries((prev) =>
      prev.map((e) => (e.paperId === updated.id ? { ...e, paper: { ...updated, ...e.metadata, labMetadata: e.metadata } } : e))
    );
    onSocialUpdate(updated);
  };

  const analysis = useMemo(() => analyzeLab(syncedEntries), [syncedEntries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return syncedEntries.filter((e) => {
      const yr = String(e.publicationYear || e.paper.publishedDate.slice(0, 4));
      if (year !== 'all' && yr !== year) return false;
      if (topic !== 'all' && !(e.paper.topics || []).includes(topic as ResearchTopic)) return false;
      if (!q) return true;
      const canonAuthors = (analysis.paperCanonicalAuthors.get(e.paper.id) || [])
        .map((a) => `${a.displayName} ${a.aliases.join(' ')}`)
        .join(' ');
      const canonKws = (analysis.paperCanonicalKeywords.get(e.paper.id) || [])
        .map((k) => `${k.label} ${k.shortLabel}`)
        .join(' ');
      const blob = [
        e.paper.title,
        e.paper.titleZh,
        e.paper.authors.join(' '),
        canonAuthors,
        e.paper.journal,
        e.paper.journalShort,
        (e.paper.keywords || []).join(' '),
        canonKws,
        e.paper.abstractOriginal || '',
        e.paper.abstractZh || '',
        e.citation || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [syncedEntries, query, year, topic, analysis]);

  // Right-sidebar Weibo Plaza data: Hot Papers & Latest Repost Stream
  const hotPapers = useMemo(() => {
    return [...syncedEntries]
      .map((e) => {
        const p = e.paper;
        const heat =
          (p.likers?.length || 0) * 3 +
          (p.reposts?.length || 0) * 4 +
          (p.comments?.length || 0) * 3 +
          (p.collectors?.length || 0) * 2 +
          (p.totalVisits || 0);
        return { entry: e, heat };
      })
      .sort((a, b) => b.heat - a.heat || (b.entry.publicationYear || 0) - (a.entry.publicationYear || 0))
      .slice(0, 6);
  }, [syncedEntries]);

  const recentReposts = useMemo(() => {
    const list: Array<{
      id: string;
      displayName: string;
      avatarColor: string;
      note: string;
      repostedAt: string;
      paper: AcademicPaper;
    }> = [];
    for (const e of syncedEntries) {
      for (const rp of e.paper.reposts || []) {
        list.push({
          id: rp.id,
          displayName: rp.displayName,
          avatarColor: rp.avatarColor,
          note: rp.note,
          repostedAt: rp.repostedAt,
          paper: e.paper,
        });
      }
    }
    return list.sort((a, b) => b.repostedAt.localeCompare(a.repostedAt)).slice(0, 8);
  }, [syncedEntries]);

  const mutate = async (method: string, id: string, body?: unknown, successMsg?: string) => {
    setSaving(true);
    setError('');
    try {
      const next = await labRequest(method, id, body);
      setEntries(next);
      setEditing(null);
      setCreateOpen(false);
      if (successMsg) {
        setNotice(successMsg);
        setTimeout(() => setNotice(''), 3500);
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (e: LabEntry) => {
    setEditing(e);
    setDraft({
      title: e.paper.title,
      titleZh: e.paper.titleZh,
      authors: e.paper.authors.join('; '),
      journal: e.paper.journal,
      abstractOriginal: e.paper.abstractOriginal || '',
      abstractZh: e.paper.abstractZh || '',
      keywords: (e.paper.keywords || []).join('; '),
      doi: e.paper.doi || '',
      publicationYear: String(e.publicationYear || e.paper.publishedDate.slice(0, 4)),
      notes: e.notes || '',
    });
  };

  const openCreate = () => {
    setCreateOpen(true);
    setDraft({
      title: '',
      titleZh: '',
      authors: '',
      journal: '',
      publicationYear: String(new Date().getFullYear()),
      doi: '',
      keywords: '',
      abstractOriginal: '',
      abstractZh: '',
      notes: '',
    });
  };

  const triggerAttachPdf = (paperId: string) => {
    attachTargetIdRef.current = paperId;
    pdfInputRef.current?.click();
  };

  const handleAttachPdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = attachTargetIdRef.current;
    e.target.value = '';
    if (!file || !targetId) return;
    setAttachingPaperId(targetId);
    setError('');
    setNotice('正在上传并自动解析 PDF 正文、摘要与原文图表，请稍候…');
    try {
      const { entries: next, paper } = await uploadLabPaperPdf(targetId, file);
      setEntries(next);
      onSocialUpdate(paper);
      setNotice('PDF 上传并自动解析完成，已更新全文内容、图表与在线阅读器');
      setTimeout(() => setNotice(''), 4500);
      onChanged();
    } catch (err) {
      setNotice('');
      setError(err instanceof Error ? err.message : 'PDF 上传与解析失败');
    } finally {
      setAttachingPaperId(null);
    }
  };

  const cardCls = `rounded-2xl border p-4 sm:p-5 ${
    darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-xs'
  }`;
  const btnOutline = `inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-base font-medium transition ${
    darkMode
      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-sky-500'
      : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD]'
  }`;
  const inputCls = `w-full rounded-xl border px-3.5 py-2.5 text-base outline-none focus:border-[#0072BD] ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
  }`;

  const jumpFilter = (patch: { query?: string; year?: string; topic?: string }) => {
    if (patch.query !== undefined) setQuery(patch.query);
    if (patch.year !== undefined) setYear(patch.year);
    if (patch.topic !== undefined) setTopic(patch.topic);
    setMode('papers');
  };

  return (
    <div className="lab-space w-full space-y-3 text-base text-slate-800 dark:text-slate-100">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => void handleAttachPdfSelected(e)}
      />

      {/* Clean Compact Header */}
      <header
        className={`rounded-2xl border p-3.5 sm:p-4 ${
          darkMode
            ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-sky-950/30 to-indigo-950/30'
            : 'border-sky-200/70 bg-gradient-to-r from-sky-50/70 via-white to-indigo-50/60 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0072BD] text-white shadow-sm">
              <Library className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              课题组文献库
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnOutline} onClick={() => setArchiveOpen((v) => !v)}>
              <FolderPlus className="h-4 w-4 text-[#0072BD]" /> 从公共池归档
            </button>
            <button type="button" className={btnOutline} onClick={openCreate}>
              <Plus className="h-4 w-4 text-teal-600" /> 手动录入
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3.5 py-1.5 text-base font-semibold text-white shadow-xs hover:bg-[#005a96]"
            >
              <Upload className="h-4 w-4" /> 上传课题组 PDF
            </button>
          </div>
        </div>

        {/* Compact KPI Bar */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['课题组论文', syncedEntries.length, '篇', '#0072BD'],
            ['时间跨度', analysis.years.length ? `${analysis.years[0]}–${analysis.years[analysis.years.length - 1]}` : '—', '', '#7E2F8E'],
            ['核心作者', analysis.canonicalAuthors.length, '人', '#D95319'],
            ['发表期刊', analysis.journals.length, '种', '#77AC30'],
            ['核心热词', analysis.canonicalKeywords.filter((k) => /[\u3400-\u9fff]/.test(k.info.shortLabel)).length, '个', '#EDB120'],
            ['潜在空白方向', analysis.potentialDirections.length, '项', '#A2142F'],
          ].map(([label, val, unit, color]) => (
            <div
              key={String(label)}
              className={`rounded-xl border px-3 py-2 ${
                darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200/70 bg-white/90'
              }`}
            >
              <div className="font-mono text-xl font-bold sm:text-2xl" style={{ color: String(color) }}>
                {val}
                {unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{label}</div>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {/* Primary View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className={`inline-flex rounded-xl border p-1 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-2xs'
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('papers')}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-lg font-semibold transition ${
              mode === 'papers'
                ? 'bg-[#0072BD] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <Flame className="h-5 w-5" />
            学术动态流 ({syncedEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('analysis')}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-lg font-semibold transition ${
              mode === 'analysis'
                ? 'bg-[#0072BD] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 dark:text-slate-200'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            知识图谱与可视化分析
          </button>
        </div>
      </div>

      {/* Archive from Public Pool Drawer */}
      {archiveOpen && (
        <section className={cardCls}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">从公共文献池归档到课题组文献库</h2>
            <button type="button" onClick={() => setArchiveOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            className={inputCls}
            placeholder="搜索公共池文献标题、作者或期刊…"
            value={archiveQuery}
            onChange={(e) => setArchiveQuery(e.target.value)}
          />
          <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {pool
              .filter(
                (p) =>
                  !syncedEntries.some((e) => e.paperId === p.id) &&
                  `${p.title} ${p.titleZh} ${p.authors.join(' ')} ${p.journal}`
                    .toLowerCase()
                    .includes(archiveQuery.toLowerCase())
              )
              .slice(0, 30)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.titleZh || p.title}</div>
                    <div className="truncate text-xs text-slate-500">
                      {p.journalShort} · {p.publishedDate.slice(0, 4)} · {p.authors.slice(0, 4).join(', ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    className={`${btnOutline} shrink-0`}
                    onClick={() => void mutate('POST', '', { paperId: p.id }, '已归档到课题组文献库')}
                  >
                    归档入库
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}

      {mode === 'papers' ? (
        /* ==================== VIEW 1: WEIBO-STYLE LAB ACADEMIC FEED + RIGHT PLAZA SIDEBAR ==================== */
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
          {/* Main Weibo Stream */}
          <div className="space-y-3 xl:col-span-9">
            {/* Clean Filter Bar */}
            <div className={`${cardCls} flex flex-wrap items-center gap-2.5 !p-2.5`}>
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="搜索课题组成果"
                  className={`${inputCls} pl-9`}
                  placeholder="搜索题名、作者、期刊、关键词或摘要"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="成果年份"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="all">全部年份</option>
                {[...analysis.years].reverse().map((y) => (
                  <option key={y} value={String(y)}>
                    {y} 年
                  </option>
                ))}
              </select>
              <select
                aria-label="成果研究方向"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="all">全部方向</option>
                {analysis.topics.map(([t, n]) => (
                  <option key={t} value={t}>
                    {TOPIC_META[t]?.label || t} ({n})
                  </option>
                ))}
              </select>
              {(query || year !== 'all' || topic !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setYear('all');
                    setTopic('all');
                  }}
                  className="text-xs font-semibold text-[#0072BD] hover:underline"
                >
                  清除筛选
                </button>
              )}
              <span className="ml-auto font-mono text-xs text-slate-500">
                {filtered.length} / {syncedEntries.length} 篇
              </span>
            </div>

            {!loaded && <p className="py-10 text-center text-sm text-slate-500">正在加载课题组成果…</p>}
            {loaded && !filtered.length && (
              <div className={`${cardCls} py-12 text-center text-sm text-slate-500`}>
                暂无匹配成果。
              </div>
            )}

            <div className="space-y-3">
              {filtered.map((entry, idx) => (
                <LabWeiboCard
                  key={entry.paperId}
                  entry={entry}
                  index={idx}
                  analysis={analysis}
                  currentUser={currentUser}
                  darkMode={darkMode}
                  attachingPdf={attachingPaperId === entry.paperId}
                  onOpen={onOpen}
                  onAskAi={onAskAi}
                  onEdit={openEdit}
                  onDelete={(pid) => {
                    if (window.confirm('确认将该文献移出课题组文献库吗？（公共池与个人收藏会保留）')) {
                      void mutate('DELETE', pid, undefined, '已移出课题组文献库');
                    }
                  }}
                  onOpenPdf={setPdfPaper}
                  onAttachPdf={triggerAttachPdf}
                  onSelectQuery={setQuery}
                  onPaperUpdated={handleLabPaperUpdated}
                  onLike={onLike}
                  onLikeComment={onLikeComment}
                  onToggleMyKb={(p) => onToggleMyKb(p)}
                  onAddEntry={onAddEntry}
                  onEditEntry={onEditEntry}
                  onDeleteEntry={onDeleteEntry}
                />
              ))}
            </div>
          </div>

          {/* Right Sticky Weibo Plaza Sidebar */}
          <aside className="space-y-3 xl:col-span-3">
            <div className="space-y-3 xl:sticky xl:top-[70px]">
              {/* 1. Hot Lab Topics (#Hashtags — 100% Chinese) */}
              <section className={`${cardCls} !p-3.5`}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                    <Hash className="h-4 w-4 text-[#0072BD]" /> 热门研究话题
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMode('analysis')}
                    className="text-xs font-medium text-[#0072BD] hover:underline"
                  >
                    热词气泡 →
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.canonicalKeywords
                    .filter((kw) => /[\u3400-\u9fff]/.test(kw.info.shortLabel))
                    .slice(0, 14)
                    .map((kw) => (
                      <button
                        key={kw.info.id}
                        type="button"
                        onClick={() => setQuery(kw.info.shortLabel)}
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium transition ${
                          query === kw.info.shortLabel
                            ? 'border-[#0072BD] bg-[#0072BD] text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        #{kw.info.shortLabel}# <span className="font-mono opacity-75">{kw.count}</span>
                      </button>
                    ))}
                </div>
              </section>

              {/* 2. Latest Group Reposts & Recommendations */}
              <section className={cardCls}>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <Repeat2 className="h-4 w-4 text-[#D95319]" /> 组内最新转发推荐
                </h2>
                {recentReposts.length === 0 ? (
                  <p className="text-xs text-slate-500">暂无转发推荐，点击任意论文底部「转发」分享您的阅读心得。</p>
                ) : (
                  <div className="space-y-3">
                    {recentReposts.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: item.avatarColor }}
                            >
                              {item.displayName.slice(0, 1)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{item.displayName}</span>
                          </div>
                          <span className="text-[11px] text-slate-400">{formatRelativeTimeZh(item.repostedAt)}</span>
                        </div>
                        {item.note && (
                          <p className="mt-1.5 leading-5 text-slate-700 dark:text-slate-200">“{item.note}”</p>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpen(item.paper)}
                          className="mt-1.5 block w-full truncate text-left font-medium text-[#0072BD] hover:underline dark:text-sky-400"
                        >
                          ↗ {item.paper.titleZh || item.paper.title}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. Lab Hot Engagement Leaderboard */}
              <section className={cardCls}>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <Flame className="h-4 w-4 text-rose-500" /> 组内热度榜
                </h2>
                <div className="space-y-2.5">
                  {hotPapers.map(({ entry, heat }, idx) => (
                    <button
                      key={entry.paperId}
                      type="button"
                      onClick={() => onOpen(entry.paper)}
                      className="flex w-full items-start gap-2.5 text-left group"
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded font-mono text-base font-bold ${
                          idx < 3 ? 'bg-[#D95319] text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-medium leading-5 text-slate-800 group-hover:text-[#0072BD] dark:text-slate-200 dark:group-hover:text-sky-400">
                          {entry.paper.titleZh || entry.paper.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-slate-400">
                          <span>{entry.publicationYear}</span>
                          <span>·</span>
                          <span>赞 {entry.paper.likers?.length || 0}</span>
                          <span>评 {entry.paper.comments?.length || 0}</span>
                          <span>转 {entry.paper.reposts?.length || 0}</span>
                          {heat > 0 && <span className="text-rose-500">热 {heat}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* 4. Core Authors Quick Social Cards */}
              <section className={cardCls}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                    <Users className="h-4 w-4 text-[#7E2F8E]" /> 核心成员与角色
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMode('analysis')}
                    className="text-xs font-medium text-[#0072BD] hover:underline"
                  >
                    社交图谱 →
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {analysis.canonicalAuthors.slice(0, 12).map((a) => (
                    <button
                      key={a.info.id}
                      type="button"
                      title={a.info.honors ? `${a.info.displayName} · ${a.info.cohort || ''} · ${a.info.honors}` : `${a.info.displayName} · ${a.info.cohort || a.socialRole}`}
                      onClick={() => setQuery(a.info.shortName)}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-left hover:border-[#0072BD] dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                        style={{ backgroundColor: pickAuthorColor(a.info.shortName) }}
                      >
                        {a.info.shortName.slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-base font-bold text-slate-800 dark:text-slate-100">
                          {a.info.shortName}
                        </div>
                        <div className="truncate text-base text-slate-500">
                          {a.info.cohort || a.socialRole} · {a.count}篇
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : (
        /* ==================== VIEW 2: KNOWLEDGE GRAPHS, SOCIAL ATTRIBUTES & FRONTIER ANALYTICS ==================== */
        <div className="space-y-6">
          {/* 1. Three-Stage Research Evolution Trajectory */}
          <section className={cardCls}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-[#0072BD]" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  课题组既有研究脉络梳理（2023 → 2027）
                </h2>
              </div>
              <span className="font-mono text-xs text-slate-500">{syncedEntries.length} 篇成果</span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {analysis.researchClusters.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 ${
                    darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200/80 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-md px-2.5 py-0.5 font-mono text-xs font-bold text-white"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.period}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-500">{c.papers.length} 篇</span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-white">{c.title}</h3>
                  <p className="mt-1.5 text-xs leading-6 text-slate-600 dark:text-slate-300">{c.summary}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {c.keyMethods.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs dark:bg-slate-800 dark:text-slate-200"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                    {c.papers.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpen(p)}
                        className="block w-full truncate text-left text-xs text-[#0072BD] hover:underline dark:text-sky-400"
                      >
                        • {p.titleZh || p.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. 5-Mode Dynamic Force-Directed Knowledge Graph */}
          <LabTopicGraph
            analysis={analysis}
            darkMode={darkMode}
            onOpen={onOpen}
            onFilterByAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            onFilterByKeyword={(kw) => jumpFilter({ query: kw, year: 'all', topic: 'all' })}
            onFilterByTopic={(t) => jumpFilter({ topic: t, year: 'all', query: '' })}
          />

          {/* 3. Publication & Author Contribution Charts (Fig. 1 — Fig. 4) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <MatlabPublicationTimeline
              yearCounts={analysis.yearCounts}
              darkMode={darkMode}
              onSelectYear={(y) => jumpFilter({ year: String(y), topic: 'all', query: '' })}
            />
            <MatlabJournalBarChart
              journals={analysis.journals}
              darkMode={darkMode}
              onSelectJournal={(j) => jumpFilter({ query: j, year: 'all', topic: 'all' })}
            />
            <MatlabTopicYearHeatmap
              analysis={analysis}
              darkMode={darkMode}
              onSelectCell={(y, t) => jumpFilter({ year: String(y), topic: t, query: '' })}
            />
            <MatlabAuthorContributionChart
              analysis={analysis}
              darkMode={darkMode}
              onSelectAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            />
          </div>

          {/* 4. Hot-Word Bubble Field (Fig. 5) */}
          <MatlabKeywordBubbleChart
            analysis={analysis}
            darkMode={darkMode}
            onSelectKeyword={(kw) => jumpFilter({ query: kw, year: 'all', topic: 'all' })}
          />

          {/* 5. NEW: Author Social Attributes, Division-of-Labor Bubble Matrix, Affinity Heatmap & Engagement Bubble Chart (Fig. 7 — Fig. 10) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <MatlabAuthorSocialBubbleChart
              analysis={analysis}
              darkMode={darkMode}
              onSelectAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            />
            <MatlabAuthorThemeBubbleMatrix
              analysis={analysis}
              darkMode={darkMode}
              onSelectAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            />
            <MatlabCoauthorAffinityHeatmap
              analysis={analysis}
              darkMode={darkMode}
              onSelectAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            />
            <MatlabEngagementBubbleChart
              analysis={analysis}
              darkMode={darkMode}
              onOpenPaper={onOpen}
            />
          </div>

          {/* 6. Technology × Industrial Domain Coverage Matrix & Frontier Opportunities (Fig. 6a & 6b) */}
          <MatlabGapOpportunityMatrix analysis={analysis} darkMode={darkMode} onOpenPaper={onOpen} />

          {/* 7. External Related Literature Recommendations */}
          <RelatedPapers
            seeds={analysis.papers}
            pool={pool}
            darkMode={darkMode}
            onOpen={onOpen}
            title="面向课题组方向的外部高关联文献推荐"
          />
        </div>
      )}

      {/* ==================== EDIT / CREATE MODAL ==================== */}
      {(editing || createOpen) && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => {
            setEditing(null);
            setCreateOpen(false);
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const payload = {
                ...draft,
                authors: (draft.authors || '').split(/[;；]/).map((s) => s.trim()).filter(Boolean),
                keywords: (draft.keywords || '').split(/[;；,，]/).map((s) => s.trim()).filter(Boolean),
              };
              if (editing) {
                void mutate('PUT', editing.paperId, payload, '课题组文献信息已修订');
              } else {
                void mutate('POST', '', payload, '新课题组文献已录入');
              }
            }}
            className={`${cardCls} max-h-[90vh] w-full max-w-3xl space-y-3 overflow-y-auto`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold">{editing ? '修订课题组文献信息' : '手动录入课题组新文献'}</h2>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCreateOpen(false);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries({
                title: '论文标题（必填）',
                titleZh: '中文标题（选填）',
                authors: '作者（分号分隔，通讯作者可加 *，必填）',
                journal: '期刊或会议名称（必填）',
                publicationYear: '发表年份（如 2027）',
                doi: 'DOI（如 10.1016/...）',
              }).map(([k, label]) => (
                <label key={k} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  {label}
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft[k] || ''}
                    required={k === 'title' || k === 'authors' || k === 'journal'}
                    onChange={(ev) => setDraft({ ...draft, [k]: ev.target.value })}
                  />
                </label>
              ))}
            </div>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              关键词（分号或逗号分隔）
              <input
                className={`${inputCls} mt-1`}
                value={draft.keywords || ''}
                onChange={(ev) => setDraft({ ...draft, keywords: ev.target.value })}
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              摘要原文
              <textarea
                className={`${inputCls} mt-1 min-h-24`}
                value={draft.abstractOriginal || ''}
                onChange={(ev) => setDraft({ ...draft, abstractOriginal: ev.target.value })}
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              中文摘要
              <textarea
                className={`${inputCls} mt-1 min-h-24`}
                value={draft.abstractZh || ''}
                onChange={(ev) => setDraft({ ...draft, abstractZh: ev.target.value })}
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              组内备注
              <textarea
                className={`${inputCls} mt-1 min-h-16`}
                value={draft.notes || ''}
                onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className={btnOutline}
                onClick={() => {
                  setEditing(null);
                  setCreateOpen(false);
                }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005a96] disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {saving ? '保存中…' : editing ? '保存修订' : '确认录入'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== IMMERSIVE FULL-TEXT PDF READER MODAL ==================== */}
      {pdfPaper && (
        <div className="fixed inset-0 z-[75] flex flex-col bg-white dark:bg-slate-950">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {pdfPaper.titleZh || pdfPaper.title}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {pdfPaper.journal} · {pdfPaper.authors.slice(0, 5).join(', ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a className={btnOutline} href={pdfPaper.localPdfUrl} target="_blank" rel="noreferrer">
                新窗口打开 / 下载 PDF
              </a>
              <button
                type="button"
                onClick={() => setPdfPaper(null)}
                className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700"
              >
                关闭阅读器
              </button>
            </div>
          </header>
          {/^\/paper-assets\/[\w-]+\/source\.pdf$/.test(pdfPaper.localPdfUrl || '') ? (
            <iframe title="论文全文PDF阅读器" src={pdfPaper.localPdfUrl} className="min-h-0 w-full flex-1 border-0" />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              站内 PDF 路径不可用，请重新关联 PDF 文件。
            </div>
          )}
        </div>
      )}

      {/* ==================== PDF UPLOAD MODAL ==================== */}
      {uploadOpen && (
        <PdfUploadModal
          destination="lab"
          darkMode={darkMode}
          onClose={() => {
            setUploadOpen(false);
            void refresh();
            onChanged();
          }}
          onOpenPaper={(p) => {
            setUploadOpen(false);
            void refresh();
            onChanged();
            onOpen(p);
          }}
        />
      )}
    </div>
  );
}
