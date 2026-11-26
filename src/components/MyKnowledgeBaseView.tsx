import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  Download,
  ExternalLink,
  Kanban,
  LayoutList,
  Lightbulb,
  Network,
  Plus,
  Sparkles,
  Table2,
  Tag,
  Trash2,
} from 'lucide-react';
import type { AcademicPaper, EntryType, ReadingStatus, UserProfile } from '../types/paper';
import { DATASET_SOURCE_META, READING_STATUS_META, resolvePaperOriginalUrl } from '../lib/constants';
import { PaperFeedCard } from './PaperFeedCard';
import { RelatedPapers } from './RelatedPapers';
import { PaperAbstract } from './PaperAbstract';

interface MyKnowledgeBaseViewProps {
  pool: AcademicPaper[];
  papers: AcademicPaper[];
  onSocialUpdate: (paper: AcademicPaper) => void;
  onLike: (id: string) => Promise<void>;
  onLikeComment: (paperId: string, commentId: string) => Promise<void>;
  trackingEnabled: boolean;
  currentUser: UserProfile;
  darkMode: boolean;
  onOpenDetail: (paper: AcademicPaper) => void;
  onAskAi?: (paper: AcademicPaper) => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onReparse: (id: string) => Promise<void>;
  onUploadMedia?: (
    paperId: string,
    payload: { kind: 'method_figure' | 'experiment_figure' | 'table_image'; dataUrl: string; analysisZh?: string }
  ) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper, personalTags?: string[]) => Promise<void>;
  onUpdateStatus: (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => void;
  onAddEntry: (paperId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onEditEntry: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onDeleteEntry: (paperId: string, commentId: string) => Promise<void>;
  onOpenAddModal: () => void;
  onBrowsePublicPool: () => void;
}

type KbLayoutMode = 'kanban' | 'matrix' | 'cards' | 'recommend';

export const MyKnowledgeBaseView: React.FC<MyKnowledgeBaseViewProps> = ({
  pool,
  papers,
  onSocialUpdate, onLike, onLikeComment, trackingEnabled,
  currentUser,
  darkMode,
  onOpenDetail,
  onAskAi,
  onEdit,
  onDelete,
  onReparse,
  onUploadMedia,
  onToggleMyKb,
  onUpdateStatus,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onOpenAddModal,
  onBrowsePublicPool,
}) => {
  const [layoutMode, setLayoutMode] = useState<KbLayoutMode>('matrix');
  const [selectedPersonalTag, setSelectedPersonalTag] = useState<string>('all');
  const [focusSeedId, setFocusSeedId] = useState<string>('all');
  const [copiedMd, setCopiedMd] = useState(false);

  // Collect all personal tags used by this user across their KB
  const allPersonalTags = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of papers) {
      for (const t of p.myPersonalTags || []) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [papers]);

  const filteredPapers = useMemo(() => {
    if (selectedPersonalTag === 'all') return papers;
    return papers.filter((p) => (p.myPersonalTags || []).includes(selectedPersonalTag));
  }, [papers, selectedPersonalTag]);

  const counts = useMemo(
    () => ({
      unread: papers.filter((p) => p.readingStatus === 'unread').length,
      reading: papers.filter((p) => p.readingStatus === 'reading').length,
      mastered: papers.filter((p) => p.readingStatus === 'mastered').length,
    }),
    [papers]
  );

  const exportMarkdownMatrix = async () => {
    const header = `| 序号 | 论文标题 | 期刊/年份 | 研究背景 | 核心问题 | 核心模型/方法 | 数据集 | 关键结论 | 我的思考 |\n|---|---|---|---|---|---|---|---|---|`;
    const rows = filteredPapers.map((p, i) => {
      const myThought =
        p.comments.find((c) => c.entryType === 'thought' && c.userId === currentUser.id)?.content || '—';
      const ds = p.anatomy.dataset.names.join(', ') || DATASET_SOURCE_META[p.anatomy.dataset.sourceType].shortLabel;
      const model = p.anatomy.modelName || p.anatomy.proposedMethod.slice(0, 36);
      return `| ${i + 1} | ${p.title.replace(/\|/g, ' ')} | ${p.journalShort} (${p.publishedDate.slice(0, 4)}) | ${p.anatomy.background.replace(/\n|\|/g, ' ')} | ${p.anatomy.problem.replace(/\n|\|/g, ' ')} | ${model.replace(/\|/g, ' ')} | ${ds.replace(/\|/g, ' ')} | ${p.anatomy.conclusion.slice(0, 50).replace(/\|/g, ' ')} | ${myThought.replace(/\n|\|/g, ' ')} |`;
    });
    const md = `# ${currentUser.displayName} 的个人文献知识库综述矩阵\n\n${header}\n${rows.join('\n')}`;
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-5">
      <RelatedPapers seeds={papers} pool={pool} onOpen={onOpenDetail} onCollect={onToggleMyKb} />
      {/* Distinct Personal Research Workbench Header (Teal-Indigo Theme) */}
      <div
        className={`rounded-2xl border p-5 ${
          darkMode
            ? 'border-teal-900/60 bg-gradient-to-r from-slate-900 via-teal-950/30 to-indigo-950/30'
            : 'border-teal-200/80 bg-gradient-to-r from-teal-50/70 via-white to-indigo-50/60 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: currentUser.avatarColor }}
            >
              {currentUser.displayName.slice(0, 1)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {currentUser.displayName} 的专属研究知识库
                </h2>
                {currentUser.userTags.map((ut) => (
                  <span
                    key={ut}
                    className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300"
                  >
                    {ut}
                  </span>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                <span>已选入知识库：{papers.length} 篇</span>
                <span className="text-slate-300">|</span>
                <span>待精读 {counts.unread}</span>
                <span>· 精读中 {counts.reading}</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">· 已掌握 {counts.mastered}</span>
              </div>
            </div>
          </div>

          {/* Workbench View Switcher & Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex rounded-xl border p-1 ${
                darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => setLayoutMode('matrix')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  layoutMode === 'matrix' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Table2 className="h-4 w-4" />
                横向对比矩阵
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('kanban')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  layoutMode === 'kanban' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Kanban className="h-4 w-4" />
                阅读阶段看板
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  layoutMode === 'cards' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <LayoutList className="h-4 w-4" />
                图文卡片流
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('recommend')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  layoutMode === 'recommend' ? 'bg-[#0072BD] text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Network className="h-4 w-4" />
                关联推荐与图谱
              </button>
            </div>

            {papers.length > 0 && (
              <button
                type="button"
                onClick={() => void exportMarkdownMatrix()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {copiedMd ? <Check className="h-4 w-4 text-emerald-600" /> : <Download className="h-4 w-4" />}
                {copiedMd ? '已复制综述Markdown' : '导出综述表'}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" />
              {currentUser.role === 'admin' ? '新增文献' : '从公共池收藏'}
            </button>
          </div>
        </div>

        {/* Personal Tag Filter Strip */}
        {allPersonalTags.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-teal-200/50 pt-3 dark:border-slate-800">
            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Tag className="h-4 w-4 text-teal-600" /> 我的个人标签：
            </span>
            <button
              type="button"
              onClick={() => setSelectedPersonalTag('all')}
              className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
                selectedPersonalTag === 'all'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              全部 ({papers.length})
            </button>
            {allPersonalTags.map(([tag, cnt]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedPersonalTag(selectedPersonalTag === tag ? 'all' : tag)}
                className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
                  selectedPersonalTag === tag
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-teal-50 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                #{tag} ({cnt})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredPapers.length === 0 ? (
        <div
          className={`rounded-2xl border border-dashed py-16 text-center ${
            darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
          }`}
        >
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
            您的个人知识库当前还没有收录文献
          </p>
          <p className="mt-1 text-sm text-slate-500">
            可从管理员维护的「公共文献池」挑选感兴趣的论文，建立独立的阅读与研究记录
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={onBrowsePublicPool}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              前往公共文献池挑选 <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              {currentUser.role === 'admin' ? '直接导入新文献' : '浏览公共文献'}
            </button>
          </div>
        </div>
      ) : layoutMode === 'matrix' ? (
        /* 1. Synthesis Comparison Matrix Table View */
        <div
          className={`overflow-hidden rounded-2xl border ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2200px] table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200">
                  <th className="w-72 px-4 py-3 font-semibold">文献标题与来源</th>
                  <th className="w-80 px-4 py-3 font-semibold">论文摘要</th>
                  <th className="w-64 px-4 py-3 font-semibold">研究背景</th>
                  <th className="w-60 px-4 py-3 font-semibold">核心问题</th>
                  <th className="w-64 px-4 py-3 font-semibold">方法 / 核心机制</th>
                  <th className="w-56 px-4 py-3 font-semibold">数据集与验证结果</th>
                  <th className="w-64 px-4 py-3 font-semibold">研究结论</th>
                  <th className="w-60 px-4 py-3 font-semibold">我的思考与标签</th>
                  <th className="w-32 px-4 py-3 font-semibold">进度与操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPapers.map((p) => {
                  const myThoughts = p.comments.filter((c) => c.entryType === 'thought' && c.userId === currentUser.id);
                  const dsMeta = DATASET_SOURCE_META[p.anatomy.dataset.sourceType] || DATASET_SOURCE_META.unspecified;
                  const statusMeta = READING_STATUS_META[p.readingStatus] || READING_STATUS_META.unread;
                  return (
                    <tr key={p.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-teal-700 px-2 py-0.5 text-xs font-medium text-white">
                            {p.journalShort}
                          </span>
                          <span className="text-xs text-slate-500">{p.publishedDate}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(p)}
                          className="mt-1.5 text-left font-semibold leading-snug text-slate-900 hover:text-indigo-600 dark:text-white"
                        >
                          {p.titleZh !== p.title ? p.titleZh : p.title}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1">{(p.keywords||[]).slice(0,5).map(k=><span key={k} className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{k}</span>)}</div>
                        {p.affiliations?.length > 0 && (
                          <div className="mt-1 text-xs text-slate-500">{p.affiliations.slice(0, 2).join('；')}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5"><PaperAbstract paper={p} compact /></td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300"><p className="whitespace-pre-line leading-6">{p.anatomy.background || '尚未解析研究背景'}</p></td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                        {p.anatomy.problem || '尚未解析核心问题'}
                      </td>

                      <td className="px-4 py-3.5">
                        {p.anatomy.modelName && (
                          <span className="mb-1 inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            {p.anatomy.modelName}
                          </span>
                        )}
                        <p className="text-slate-700 dark:text-slate-300">
                          {p.anatomy.proposedMethod || '尚未解析方法'}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`inline-block rounded border px-2 py-0.2 text-xs ${dsMeta.badgeClass}`}>
                          {dsMeta.shortLabel}
                        </span>
                        {p.anatomy.dataset.names.length > 0 && (
                          <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                            {p.anatomy.dataset.names.join('、')}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {(p.anatomy.experimentalValidation || p.anatomy.conclusion).slice(0, 72)}…
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300"><p className="whitespace-pre-line leading-6">{p.anatomy.conclusion || '尚未解析研究结论'}</p></td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {(p.myPersonalTags || []).map((pt) => (
                            <span
                              key={pt}
                              className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                            >
                              #{pt}
                            </span>
                          ))}
                        </div>
                        {myThoughts.length > 0 ? (
                          <p className="mt-1.5 rounded-lg bg-amber-50/70 p-2 text-xs text-slate-700 dark:bg-amber-950/30 dark:text-slate-200">
                            <Lightbulb className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                            {myThoughts[0].content.slice(0, 70)}
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenDetail(p)}
                            className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            + 添加深度思考
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const order: ReadingStatus[] = ['unread', 'reading', 'mastered'];
                              onUpdateStatus(p.id, {
                                readingStatus: order[(order.indexOf(p.readingStatus) + 1) % order.length],
                              });
                            }}
                            className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${statusMeta.cls}`}
                          >
                            {statusMeta.label}
                          </button>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenDetail(p)}
                              title="打开图文精读"
                              className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
                            >
                              <BookOpenCheck className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFocusSeedId(p.id);
                                setLayoutMode('recommend');
                              }}
                              title="分析该单篇文献的动态关联知识图谱"
                              className="rounded-lg border border-sky-200 bg-sky-50 p-1.5 text-[#0072BD] hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
                            >
                              <Network className="h-3.5 w-3.5" />
                            </button>
                            {resolvePaperOriginalUrl(p) && (
                              <a
                                href={resolvePaperOriginalUrl(p)}
                                target="_blank"
                                rel="noreferrer"
                                title="原文"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void onToggleMyKb(p)}
                              title="移出我的知识库"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-rose-600 dark:border-slate-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : layoutMode === 'kanban' ? (
        /* 2. 3-Column Academic Reading Stage Kanban View */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(['unread', 'reading', 'mastered'] as const).map((stKey) => {
            const colPapers = filteredPapers.filter((p) => p.readingStatus === stKey);
            const colTitle =
              stKey === 'unread' ? '待精读队列' : stKey === 'reading' ? '正在精读与实验拆解' : '已掌握与综述归档';
            const headerDot =
              stKey === 'unread' ? 'bg-slate-400' : stKey === 'reading' ? 'bg-indigo-600' : 'bg-emerald-600';
            return (
              <div
                key={stKey}
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-slate-100/70'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${headerDot}`} />
                    <span>{colTitle}</span>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {colPapers.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colPapers.map((p) => (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-4 ${
                        darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-medium text-white dark:bg-teal-700">
                          {p.journalShort}
                        </span>
                        <span>{p.publishedDate}</span>
                      </div>
                      <h4
                        onClick={() => onOpenDetail(p)}
                        className="mt-2 cursor-pointer text-sm font-semibold leading-snug text-slate-900 hover:text-indigo-600 dark:text-white"
                      >
                        {p.titleZh !== p.title ? p.titleZh : p.title}
                      </h4>
                      <dl className="mt-3 space-y-2 text-xs leading-5">{[['背景',p.anatomy.background],['问题',p.anatomy.problem],['方法',p.anatomy.proposedMethod],['结论',p.anatomy.conclusion]].map(([k,v])=><div key={k}><dt className="font-semibold text-indigo-600">{k}</dt><dd className="line-clamp-3 text-slate-600 dark:text-slate-300">{v || '尚未解析'}</dd></div>)}</dl>
                      {p.anatomy.modelName && (
                        <div className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          模型：{p.anatomy.modelName}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(p.myPersonalTags || []).map((t) => (
                          <span key={t} className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                            #{t}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(p)}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          图文精读 →
                        </button>
                        <div className="flex gap-1">
                          {(['unread', 'reading', 'mastered'] as const)
                            .filter((k) => k !== stKey)
                            .map((targetSt) => (
                              <button
                                key={targetSt}
                                type="button"
                                onClick={() => onUpdateStatus(p.id, { readingStatus: targetSt })}
                                className="rounded border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                              >
                                移至{READING_STATUS_META[targetSt].label}
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : layoutMode === 'recommend' ? (
        /* 4. Knowledge Base Recommendations & Single-Paper Dynamic Knowledge Graph Analysis */
        <div className="space-y-4">
          <div
            className={`rounded-2xl border p-4 ${
              darkMode ? 'border-slate-800 bg-slate-900' : 'border-sky-200/80 bg-white shadow-xs'
            }`}
          >
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0072BD]" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  选择分析视角：整体收藏推荐 或 单篇文献动态关联知识图谱
                </span>
              </div>
              <span className="text-xs text-slate-500">点击任意一篇收藏文献，即刻构建以该文献为中心的力导向相似文献知识图谱</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFocusSeedId('all')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  focusSeedId === 'all'
                    ? 'border-[#0072BD] bg-[#0072BD] text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                全部收藏文献综合推荐 ({filteredPapers.length} 篇)
              </button>
              {filteredPapers.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFocusSeedId(p.id)}
                  className={`max-w-[280px] truncate rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    focusSeedId === p.id
                      ? 'border-[#D95319] bg-[#D95319] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#D95319] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                  title={p.titleZh || p.title}
                >
                  [{idx + 1}] {(p.titleZh || p.title).slice(0, 22)}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const picked = focusSeedId === 'all' ? null : filteredPapers.find((p) => p.id === focusSeedId) || null;
            return (
              <RelatedPapers
                seeds={picked ? [picked] : filteredPapers}
                pool={pool}
                darkMode={darkMode}
                onOpen={onOpenDetail}
                onCollect={onToggleMyKb}
                graph={true}
                title={
                  picked
                    ? `单篇文献动态关联知识图谱：${picked.titleZh || picked.title}`
                    : '基于我的知识库收藏的动态关联推荐与知识图谱'
                }
              />
            );
          })()}
        </div>
      ) : (
        /* 3. Detailed Cards View */
        <div className="space-y-4">
          {filteredPapers.map((paper) => (
            <PaperFeedCard
              onSocialUpdate={onSocialUpdate} onLike={onLike} onLikeComment={onLikeComment} trackingEnabled={trackingEnabled}
              key={paper.id}
              paper={paper}
              currentUser={currentUser}
              darkMode={darkMode}
              onOpenDetail={onOpenDetail}
              onAskAi={onAskAi}
              onEdit={onEdit}
              onDelete={onDelete}
              onReparse={onReparse}
              onUploadMedia={onUploadMedia}
              onToggleMyKb={onToggleMyKb}
              onUpdateStatus={onUpdateStatus}
              onAddEntry={onAddEntry}
              onEditEntry={onEditEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}
        </div>
      )}

      {/* Always-available Recommendations Section below Matrix/Kanban/Cards */}
      {filteredPapers.length > 0 && layoutMode !== 'recommend' && (
        <RelatedPapers
          seeds={filteredPapers}
          pool={pool}
          darkMode={darkMode}
          onOpen={onOpenDetail}
          onCollect={onToggleMyKb}
        />
      )}
    </div>
  );
};
