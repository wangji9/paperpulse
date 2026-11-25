import { chineseText } from '../lib/chinese';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  BookmarkCheck,
  BookmarkPlus,
  Building2,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { AcademicPaper, EntryType, UserProfile } from '../types/paper';
import { DOMAIN_META, TOPIC_META, generateBibtex, resolveDoiUrl, resolvePaperOriginalUrl } from '../lib/constants';
import {
  DatasetProvenanceVisual,
  LOGIC_STEPS,
  LogicChainFlow,
  OriginalFiguresSection,
  OriginalTablesSection,
} from './visuals/PaperVisuals';
import { EgoCitationGraph } from './CitationGraph';
import { PaperKeywords } from './PaperKeywords';
import { CommentsAndThoughts } from './CommentsAndThoughts';
import { PaperSocialFootprintPanel, useCardReadingTracker, useModalReadingTracker, formatDurationZh } from './SocialEngagement';

interface DeepAnatomyModalProps {
  paper: AcademicPaper;
  onSocialUpdate: (paper: AcademicPaper) => void;
  onLike: (id: string) => Promise<void>;
  onLikeComment: (paperId: string, commentId: string) => Promise<void>;
  trackingEnabled?: boolean;
  libraryPapers: AcademicPaper[];
  currentUser: UserProfile | null;
  darkMode: boolean;
  onClose: () => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onReparse: (id: string) => Promise<void>;
  onUploadMedia?: (
    paperId: string,
    payload: { kind: 'method_figure' | 'experiment_figure' | 'table_image'; dataUrl: string; analysisZh?: string }
  ) => Promise<void>;
  onToggleMyKb: (paper: AcademicPaper) => Promise<void>;
  onSelectOtherPaper: (paper: AcademicPaper) => void;
  onImportReference: (identifier: string) => Promise<void>;
  onAddEntry: (paperId: string, payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }) => Promise<void>;
  onEditEntry: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }) => Promise<void>;
  onDeleteEntry: (paperId: string, commentId: string) => Promise<void>;
}

const Section: React.FC<{ id: string; num: string; title: string; darkMode: boolean; children: React.ReactNode }> = ({
  id,
  num,
  title,
  darkMode,
  children,
}) => (
  <section id={id} className={`scroll-mt-44 rounded-2xl border p-4 sm:p-5 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
    <h3 className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-3 text-lg font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white">{num}</span>
      {title}
    </h3>
    {children}
  </section>
);

const Text: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="whitespace-pre-line text-base leading-7 text-slate-700 dark:text-slate-300">{typeof children==='string'?chineseText(children):children}</p>
);

export const DeepAnatomyModal: React.FC<DeepAnatomyModalProps> = ({
  paper,
  onSocialUpdate,
  onLike,
  onLikeComment,
  trackingEnabled = true,
  libraryPapers,
  currentUser,
  darkMode,
  onClose,
  onEdit,
  onDelete,
  onReparse,
  onUploadMedia,
  onToggleMyKb,
  onSelectOtherPaper,
  onImportReference,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
}) => {
  const sessionSeconds = useModalReadingTracker(paper.id, Boolean(currentUser), onSocialUpdate);
  const [activeStep, setActiveStep] = useState('sec-bg');
  const [copiedBib, setCopiedBib] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const { anatomy } = paper;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allFigures = anatomy.paperFigures || [];
  const methodFigures = allFigures.filter((f) => f.category === 'method');
  const expFigures = allFigures.filter((f) => f.category === 'experiment');
  const paperTables = anatomy.paperTables || [];

  const visible = useMemo(() => {
    const has: Record<string, boolean> = {
      'sec-bg': !!anatomy.background,
      'sec-prob': !!anatomy.problem,
      'sec-status': !!anatomy.currentStatus,
      'sec-gaps': !!anatomy.limitationsOfPriorWork,
      'sec-method': true,
      'sec-exp': !!anatomy.experimentalValidation,
      'sec-data': anatomy.dataset.sourceType !== 'unspecified' || anatomy.dataset.names.length > 0,
      'sec-cmp': true,
      'sec-conc': !!anatomy.conclusion,
      'sec-future': anatomy.futureAndLimitations.paperLimitations.length + anatomy.futureAndLimitations.futureDirections.length > 0,
      'sec-cite': paper.citations.length > 0,
    };
    return has;
  }, [anatomy, paper.citations.length]);

  const steps = LOGIC_STEPS.filter((s) => visible[s.id]);

  const jumpTo = (id: string) => {
    setActiveStep(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyBib = async () => {
    try {
      await navigator.clipboard.writeText(generateBibtex(paper));
      setCopiedBib(true);
      setTimeout(() => setCopiedBib(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const btn =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={paper.title}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-7xl flex-col overflow-hidden border shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-2xl ${
          darkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'
        }`}
      >
        <div className="shrink-0 px-4 py-2 text-sm text-indigo-600">本次有效阅读 {formatDurationZh(sessionSeconds)} · 切到后台暂停计时
          <button type="button" aria-pressed={paper.likedByMe} onClick={() => void onLike(paper.id)} className="ml-4 inline-flex items-center gap-1 text-rose-600"><Heart className={`h-4 w-4 ${paper.likedByMe ? 'fill-current' : ''}`} />{paper.likedByMe ? '已点赞' : '点赞'} ({paper.likers?.length || 0})</button>
        </div>
        <div className={`shrink-0 border-b px-4 py-3.5 sm:px-6 sm:py-4 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
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
                {paper.topics.map((t) => (
                  <span key={t} className={`rounded-md border px-2 py-0.5 ${TOPIC_META[t].bgClass} ${TOPIC_META[t].textClass} ${TOPIC_META[t].borderClass}`}>
                    {TOPIC_META[t].label}
                  </span>
                ))}
                <span className={`rounded-md border px-2 py-0.5 ${DOMAIN_META[paper.domain].badgeClass}`}>{DOMAIN_META[paper.domain].label}</span>
              </div>

              <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900 sm:text-xl dark:text-white">{chineseText(paper.titleZh || paper.title)}</h2>


              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                <span>作者：{paper.authors.join(', ')}</span>
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
                {resolvePaperOriginalUrl(paper) && (
                  <>
                    <span className="text-slate-300">|</span>
                    <a
                      href={resolvePaperOriginalUrl(paper)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      直达原文页面
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                )}
              </div>

              {paper.affiliations && paper.affiliations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>作者单位：{paper.affiliations.join('；')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void onToggleMyKb(paper)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  paper.inMyKb
                    ? 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300'
                }`}
              >
                {paper.inMyKb ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                {paper.inMyKb ? '已在知识库' : '加入知识库'}
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
                className={btn}
              >
                {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-indigo-600" />}
                提取原文图表
              </button>
              </>}
              <button type="button" onClick={handleCopyBib} className={btn}>
                {copiedBib ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                引用
              </button>
              {currentUser?.role === 'admin' && <>
              <button type="button" onClick={() => onEdit(paper)} className={btn}>
                <Edit3 className="h-4 w-4" />
                编辑
              </button>
              </>}
              {currentUser?.role === 'admin' && (
                <button type="button" onClick={() => onDelete(paper.id)} className={`${btn} text-rose-600`} title="删除">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                aria-label="关闭弹窗"
                title="关闭"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className={btn}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <LogicChainFlow steps={steps} activeStep={activeStep} onSelectStep={jumpTo} darkMode={darkMode} />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <PaperKeywords paper={paper} />
          {visible['sec-bg'] && (
            <Section id="sec-bg" num="01" title="研究背景" darkMode={darkMode}>
              <Text>{anatomy.background}</Text>
            </Section>
          )}
          {visible['sec-prob'] && (
            <Section id="sec-prob" num="02" title="核心问题" darkMode={darkMode}>
              <Text>{anatomy.problem}</Text>
            </Section>
          )}
          {visible['sec-status'] && (
            <Section id="sec-status" num="03" title="研究现状" darkMode={darkMode}>
              <Text>{anatomy.currentStatus}</Text>
            </Section>
          )}
          {visible['sec-gaps'] && (
            <Section id="sec-gaps" num="04" title="现存局限" darkMode={darkMode}>
              <Text>{anatomy.limitationsOfPriorWork}</Text>
            </Section>
          )}
          <Section
            id="sec-method"
            num="05"
            title={anatomy.modelName ? `提出方法与原文架构图（${anatomy.modelName}）` : '提出方法与原文架构图'}
            darkMode={darkMode}
          >
            {anatomy.proposedMethod && <Text>{anatomy.proposedMethod}</Text>}
            <div className="mt-4">
              <OriginalFiguresSection
                figures={methodFigures.length > 0 ? methodFigures : allFigures}
                legacyFigureUrl={anatomy.figureUrl}
                legacyCaption={anatomy.figureCaption}
                title="论文原文方法图 / 总体架构图"
                allowUpload={true}
                uploadKind="method_figure"
                onUploadMedia={onUploadMedia ? (pl) => onUploadMedia(paper.id, pl) : undefined}
                darkMode={darkMode}
              />
            </div>
          </Section>

          {visible['sec-exp'] && (
            <Section id="sec-exp" num="06" title="实验验证" darkMode={darkMode}>
              <Text>{anatomy.experimentalValidation}</Text>
            </Section>
          )}
          {visible['sec-data'] && (
            <Section id="sec-data" num="07" title="数据集" darkMode={darkMode}>
              <DatasetProvenanceVisual dataset={anatomy.dataset} darkMode={darkMode} />
            </Section>
          )}

          <Section id="sec-cmp" num="08" title="原文实验图表与结果解析" darkMode={darkMode}>
            <div className="space-y-4">
              <OriginalTablesSection
                tables={paperTables}
                allowUpload={true}
                onUploadMedia={onUploadMedia ? (pl) => onUploadMedia(paper.id, pl) : undefined}
                darkMode={darkMode}
              />
              {expFigures.length > 0 && (
                <OriginalFiguresSection
                  figures={expFigures}
                  title="论文原文实验结果对比图"
                  allowUpload={false}
                  uploadKind="experiment_figure"
                  onUploadMedia={onUploadMedia ? (pl) => onUploadMedia(paper.id, pl) : undefined}
                  darkMode={darkMode}
                />
              )}
            </div>
          </Section>

          {visible['sec-conc'] && (
            <Section id="sec-conc" num="09" title="研究结论" darkMode={darkMode}>
              <Text>{anatomy.conclusion}</Text>
            </Section>
          )}
          {visible['sec-future'] && (
            <Section id="sec-future" num="10" title="局限与展望" darkMode={darkMode}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {anatomy.futureAndLimitations.paperLimitations.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">本文局限</h4>
                    <ul className="list-disc space-y-1.5 pl-5 text-base leading-7 text-slate-700 dark:text-slate-300">
                      {anatomy.futureAndLimitations.paperLimitations.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {anatomy.futureAndLimitations.futureDirections.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">未来展望</h4>
                    <ul className="list-disc space-y-1.5 pl-5 text-base leading-7 text-slate-700 dark:text-slate-300">
                      {anatomy.futureAndLimitations.futureDirections.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}
          {visible['sec-cite'] && (
            <Section id="sec-cite" num="11" title="引用关系图谱" darkMode={darkMode}>
              <EgoCitationGraph
                paper={paper}
                libraryPapers={libraryPapers}
                darkMode={darkMode}
                onImportReference={onImportReference}
                onOpenPaper={onSelectOtherPaper}
              />
            </Section>
          )}

          <section className={`rounded-2xl border p-4 sm:p-5 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <h3 className="mb-3 text-lg font-semibold">深度思考与学术评论</h3>
            <PaperSocialFootprintPanel paper={paper} darkMode={darkMode} defaultShowBubbles />
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
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};
