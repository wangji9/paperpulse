import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Compass,
  Copy,
  Edit3,
  ExternalLink,
  GitCommitHorizontal,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type { AcademicPaper } from '../types/paper';
import { DOMAIN_META, TOPIC_META, generateBibtex } from '../lib/constants';
import {
  AblationTable,
  ArchitectureDiagram,
  ComparisonTable,
  DatasetProvenanceVisual,
  LogicChainFlow,
} from './visuals/PaperVisuals';
import { EgoCitationGraph } from './CitationGraph';

interface DeepAnatomyModalProps {
  paper: AcademicPaper;
  libraryPapers: AcademicPaper[];
  darkMode: boolean;
  onClose: () => void;
  onEdit: (paper: AcademicPaper) => void;
  onDelete: (id: string) => void;
  onSelectOtherPaper: (paper: AcademicPaper) => void;
  onImportReference: (identifier: string) => Promise<void>;
  onAddComment: (paperId: string, author: string, role: string, content: string) => Promise<void>;
  onDeleteComment: (paperId: string, commentId: string) => Promise<void>;
}

const SectionCard: React.FC<{
  id: string;
  num: string;
  title: string;
  subtitleEn: string;
  icon: React.ReactNode;
  darkMode: boolean;
  children: React.ReactNode;
}> = ({ id, num, title, subtitleEn, icon, darkMode, children }) => (
  <section
    id={id}
    className={`scroll-mt-36 rounded-2xl border p-5 transition-all ${
      darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white shadow-xs'
    }`}
  >
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
      <div className="flex items-center gap-2.5">
        <span className="font-mono-code flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
          {num}
        </span>
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
        </div>
      </div>
      <span className="font-mono-code text-[11px] uppercase tracking-wider text-slate-400">{subtitleEn}</span>
    </div>
    {children}
  </section>
);

export const DeepAnatomyModal: React.FC<DeepAnatomyModalProps> = ({
  paper,
  libraryPapers,
  darkMode,
  onClose,
  onEdit,
  onDelete,
  onSelectOtherPaper,
  onImportReference,
  onAddComment,
  onDeleteComment,
}) => {
  const [activeStep, setActiveStep] = useState('sec-bg');
  const [copiedBib, setCopiedBib] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const jumpTo = (id: string) => {
    setActiveStep(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyBib = async () => {
    try {
      await navigator.clipboard.writeText(generateBibtex(paper));
      setCopiedBib(true);
      setTimeout(() => setCopiedBib(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(paper.id, '个人笔记', '精读批注', noteText.trim());
      setNoteText('');
    } finally {
      setSubmitting(false);
    }
  };

  const { anatomy } = paper;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={paper.titleZh}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          darkMode ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'
        }`}
      >
        {/* Sticky Top Header */}
        <div
          className={`shrink-0 border-b px-5 py-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono-code text-xs font-bold text-white dark:bg-indigo-600">
                  {paper.journalShort}
                </span>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{paper.journal}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${DOMAIN_META[paper.domain].badgeClass}`}>
                  {DOMAIN_META[paper.domain].label}
                </span>
                {paper.topics.map((t) => (
                  <span
                    key={t}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TOPIC_META[t].bgClass} ${TOPIC_META[t].textClass} ${TOPIC_META[t].borderClass}`}
                  >
                    {TOPIC_META[t].label}
                  </span>
                ))}
                <span className="font-mono-code rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  发表 {paper.publishedDate} · 被引 {paper.citedByCount}
                </span>
              </div>
              <h2 className="font-serif-academic mt-2 text-xl font-bold leading-snug text-slate-900 dark:text-white">
                {paper.titleZh}
              </h2>
              {paper.titleZh !== paper.title && (
                <p className="mt-1 font-mono-code text-xs text-slate-500">{paper.title}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>作者：{paper.authors.join(', ')}</span>
                <span>机构：{paper.affiliations.join(' · ')}</span>
                <span className="font-mono-code">DOI: {paper.doi}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyBib}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {copiedBib ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedBib ? '已复制BibTeX' : 'BibTeX'}
              </button>
              <button
                type="button"
                onClick={() => onEdit(paper)}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              >
                <Edit3 className="h-3.5 w-3.5" />
                编辑精读
              </button>
              <button
                type="button"
                onClick={() => onDelete(paper.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                原文
              </a>
              <button
                type="button"
                aria-label="关闭弹窗"
                title="关闭 (ESC)"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="ml-1 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <LogicChainFlow activeStep={activeStep} onSelectStep={jumpTo} darkMode={darkMode} />
          </div>
        </div>

        {/* Scrollable 10-Part Deep Anatomy + Citation Graph Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              id="sec-bg"
              num="01"
              title="研究背景"
              subtitleEn="Research Background"
              icon={<BookOpen className="h-4 w-4 text-sky-600" />}
              darkMode={darkMode}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {anatomy.background}
              </p>
            </SectionCard>

            <SectionCard
              id="sec-prob"
              num="02"
              title="核心科学/工程问题"
              subtitleEn="Problem Statement"
              icon={<Target className="h-4 w-4 text-rose-600" />}
              darkMode={darkMode}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {anatomy.problem}
              </p>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              id="sec-status"
              num="03"
              title="研究现状梳理"
              subtitleEn="State of the Art"
              icon={<Compass className="h-4 w-4 text-cyan-600" />}
              darkMode={darkMode}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {anatomy.currentStatus}
              </p>
            </SectionCard>

            <SectionCard
              id="sec-gaps"
              num="04"
              title="现有研究局限性"
              subtitleEn="Research Gaps"
              icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
              darkMode={darkMode}
            >
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {anatomy.limitationsOfPriorWork}
                </p>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            id="sec-method"
            num="05"
            title="本文提出的方法与原理框图"
            subtitleEn="Proposed Methodology & Architecture"
            icon={<Sparkles className="h-4 w-4 text-indigo-600" />}
            darkMode={darkMode}
          >
            <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {anatomy.proposedMethod}
            </p>
            <ArchitectureDiagram modules={anatomy.architectureModules} darkMode={darkMode} />
          </SectionCard>

          <SectionCard
            id="sec-exp"
            num="06"
            title="实验验证设计"
            subtitleEn="Experimental Validation"
            icon={<Compass className="h-4 w-4 text-emerald-600" />}
            darkMode={darkMode}
          >
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {anatomy.experimentalValidation}
            </p>
          </SectionCard>

          <SectionCard
            id="sec-data"
            num="07"
            title="数据集来源（公开 / 自建）与构建方式"
            subtitleEn="Dataset Provenance & Construction"
            icon={<BookOpen className="h-4 w-4 text-emerald-600" />}
            darkMode={darkMode}
          >
            <DatasetProvenanceVisual dataset={anatomy.dataset} darkMode={darkMode} />
          </SectionCard>

          <SectionCard
            id="sec-cmp"
            num="08"
            title="对比实验与消融实验结果表"
            subtitleEn="Comparative & Ablation Tables"
            icon={<Sparkles className="h-4 w-4 text-indigo-600" />}
            darkMode={darkMode}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ComparisonTable comparison={anatomy.comparisonMetrics} darkMode={darkMode} />
              <AblationTable ablation={anatomy.ablationStudy} darkMode={darkMode} />
            </div>
          </SectionCard>

          <SectionCard
            id="sec-conc"
            num="09"
            title="核心研究结论"
            subtitleEn="Key Conclusions"
            icon={<Lightbulb className="h-4 w-4 text-emerald-600" />}
            darkMode={darkMode}
          >
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
                {anatomy.conclusion}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            id="sec-future"
            num="10"
            title="本文局限性与未来研究展望"
            subtitleEn="Limitations & Future Outlook"
            icon={<Compass className="h-4 w-4 text-violet-600" />}
            darkMode={darkMode}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  本文现存局限性 (Paper Limitations)
                </h4>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {anatomy.futureAndLimitations.paperLimitations.map((item, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="font-mono-code font-bold text-rose-500">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  未来研究展望 (Future Directions)
                </h4>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  {anatomy.futureAndLimitations.futureDirections.map((item, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="font-mono-code font-bold text-indigo-500">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="sec-cite"
            num="11"
            title="论文引用关系拓扑图（上游参考文献与下游施引研究）"
            subtitleEn="Citation Lineage Graph"
            icon={<GitCommitHorizontal className="h-4 w-4 text-indigo-600" />}
            darkMode={darkMode}
          >
            <EgoCitationGraph
              paper={paper}
              libraryPapers={libraryPapers}
              darkMode={darkMode}
              onImportReference={onImportReference}
              onOpenPaper={onSelectOtherPaper}
            />
          </SectionCard>

          {/* Personal Reading Notes */}
          <section
            className={`rounded-2xl border p-5 ${
              darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              <span>我的精读笔记 ({paper.comments.length})</span>
            </div>

            <form onSubmit={handleNoteSubmit} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="记录复现要点、论文灵感、与自身课题的切入点..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="submit"
                disabled={submitting || !noteText.trim()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                保存笔记
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {paper.comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{c.author}</span>
                      <span>·</span>
                      <span>{c.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{c.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteComment(paper.id, c.id)}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};
