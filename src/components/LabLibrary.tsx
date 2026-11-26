import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Compass,
  Edit3,
  ExternalLink,
  FileText,
  FileUp,
  FolderPlus,
  Library,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AcademicPaper, LabEntry, ResearchTopic } from '../types/paper';
import { labRequest, uploadLabPaperPdf } from '../lib/api';
import { TOPIC_META } from '../lib/constants';
import { analyzeLab } from '../lib/labAnalysis';
import { PaperAbstract } from './PaperAbstract';
import { LabTopicGraph } from './LabTopicGraph';
import { PdfUploadModal } from './PdfUploadModal';
import { RelatedPapers } from './RelatedPapers';
import {
  MatlabAuthorContributionChart,
  MatlabGapOpportunityMatrix,
  MatlabJournalBarChart,
  MatlabKeywordBubbleChart,
  MatlabPublicationTimeline,
  MatlabTopicYearHeatmap,
} from './MatlabCharts';

export function LabLibrary({
  pool,
  darkMode,
  onOpen,
  onChanged,
}: {
  pool: AcademicPaper[];
  darkMode: boolean;
  onOpen: (p: AcademicPaper) => void;
  onChanged: () => void;
}) {
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

  const analysis = useMemo(() => analyzeLab(entries), [entries]);

  // Smart bilingual search: matches canonical Chinese/English authors, keywords, titles, journal & abstract
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
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
  }, [entries, query, year, topic, analysis]);

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
    try {
      const next = await uploadLabPaperPdf(targetId, file);
      setEntries(next);
      setNotice('原文 PDF 已成功关联到该课题组文献，可直接在线阅读全文');
      setTimeout(() => setNotice(''), 3500);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 补充失败');
    } finally {
      setAttachingPaperId(null);
    }
  };

  const cardCls = `rounded-2xl border p-4 sm:p-5 ${
    darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white shadow-xs'
  }`;
  const btnOutline = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-medium transition ${
    darkMode
      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-sky-500'
      : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD]'
  }`;
  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#0072BD] ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
  }`;

  const jumpFilter = (patch: { query?: string; year?: string; topic?: string }) => {
    if (patch.query !== undefined) setQuery(patch.query);
    if (patch.year !== undefined) setYear(patch.year);
    if (patch.topic !== undefined) setTopic(patch.topic);
    setMode('papers');
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 text-slate-800 dark:text-slate-100">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => void handleAttachPdfSelected(e)}
      />

      {/* Hero Header */}
      <header
        className={`rounded-2xl border p-5 ${
          darkMode
            ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-sky-950/30 to-indigo-950/30'
            : 'border-sky-200/70 bg-gradient-to-r from-sky-50/70 via-white to-indigo-50/60 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0072BD]/10 px-3 py-1 text-xs font-bold tracking-wider text-[#0072BD] dark:bg-sky-500/20 dark:text-sky-300">
              <Library className="h-3.5 w-3.5" />
              课题组成果知识库 · 脉络梳理 · 潜在研究方向挖掘
            </div>
            <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              课题组文献库与研究演进观测台
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
              系统收录课题组发表论文（支持上传 PDF、手动新增、修订与全文在线阅读），自动完成中英文作者/热词合并去重，并以 MATLAB 学术图表与动态力导向知识图谱梳理既有方向并探测潜在研究空白。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnOutline} onClick={() => setArchiveOpen((v) => !v)}>
              <FolderPlus className="h-4 w-4 text-[#0072BD]" /> 从公共池归档
            </button>
            <button type="button" className={btnOutline} onClick={openCreate}>
              <Plus className="h-4 w-4 text-teal-600" /> 手动录入文献
            </button>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#005a96]"
            >
              <Upload className="h-4 w-4" /> 上传课题组 PDF
            </button>
          </div>
        </div>

        {/* KPI Cards (All Deduplicated!) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['课题组论文', entries.length, '篇', '#0072BD'],
            ['时间跨度', analysis.years.length ? `${analysis.years[0]}–${analysis.years[analysis.years.length - 1]}` : '—', '', '#7E2F8E'],
            ['核心作者(已去重)', analysis.canonicalAuthors.length, '人', '#D95319'],
            ['发表期刊载体', analysis.journals.length, '种', '#77AC30'],
            ['合并核心热词', analysis.canonicalKeywords.length, '个', '#EDB120'],
            ['潜在空白方向', analysis.potentialDirections.length, '项', '#A2142F'],
          ].map(([label, val, unit, color]) => (
            <div
              key={String(label)}
              className={`rounded-xl border p-3 ${
                darkMode ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200/70 bg-white/90'
              }`}
            >
              <div className="font-mono text-xl font-bold" style={{ color: String(color) }}>
                {val}
                {unit && <span className="ml-0.5 text-xs font-medium text-slate-400">{unit}</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
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
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'papers'
                ? 'bg-[#0072BD] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            成果目录与全文阅读 ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('analysis')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === 'analysis'
                ? 'bg-[#0072BD] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            知识图谱 · MATLAB统计 · 潜在方向分析
          </button>
        </div>

        <span className="text-xs text-slate-500">
          {mode === 'analysis'
            ? '中英文作者与热词已自动合并去重；所有 MATLAB 图表均支持导出高清矢量 SVG / PNG'
            : '支持中英文作者别名（如“李心雨”与“Xinyu Li”）、标题、期刊、摘要与热词联动检索'}
        </span>
      </div>

      {/* Archive from Public Pool Drawer */}
      {archiveOpen && (
        <section className={cardCls}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">从公共文献池选择并归档到课题组文献库</h2>
            <button type="button" onClick={() => setArchiveOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            className={inputCls}
            placeholder="输入论文标题、作者或期刊搜索公共池文献…"
            value={archiveQuery}
            onChange={(e) => setArchiveQuery(e.target.value)}
          />
          <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {pool
              .filter(
                (p) =>
                  !entries.some((e) => e.paperId === p.id) &&
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
        /* ==================== VIEW 1: LAB PUBLICATIONS CATALOG ==================== */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className={`${cardCls} flex flex-wrap items-center gap-3 !p-3.5`}>
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="搜索课题组成果"
                className={`${inputCls} pl-9`}
                placeholder="搜索题名、作者（支持中英文如 李心雨 / Wang J）、期刊、关键词或摘要…"
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
              <option value="all">全部研究方向</option>
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
              当前展示 {filtered.length} / {entries.length} 篇
            </span>
          </div>

          {!loaded && <p className="py-10 text-center text-sm text-slate-500">正在读取课题组成果…</p>}
          {loaded && !filtered.length && (
            <div className={`${cardCls} py-12 text-center text-sm text-slate-500`}>
              暂无匹配成果。可清除筛选条件，或上传课题组 PDF / 手动录入新文献。
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filtered.map((e, idx) => {
              const yr = e.publicationYear || Number(e.paper.publishedDate.slice(0, 4)) || '';
              const canonAuthors = analysis.paperCanonicalAuthors.get(e.paper.id) || [];
              const canonKws = analysis.paperCanonicalKeywords.get(e.paper.id) || [];
              return (
                <article key={e.paperId} className={`${cardCls} flex flex-col justify-between transition-shadow hover:shadow-md`}>
                  <div>
                    {/* Top Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-[#0072BD] px-2 py-0.5 font-mono font-bold text-white">
                          {yr || '年份待核'}
                        </span>
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 font-semibold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                          {e.paper.journal}
                        </span>
                        {e.paper.localPdfUrl && (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            站内全文PDF就绪
                          </span>
                        )}
                      </div>

                      {e.canEdit && (
                        <div className="flex shrink-0 items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-[#0072BD] hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> 修订
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('确认将该文献移出课题组文献库吗？（公共池文献与个人收藏会保留）')) {
                                void mutate('DELETE', e.paperId, undefined, '已移出课题组文献库');
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> 移出
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <button
                      type="button"
                      onClick={() => onOpen(e.paper)}
                      className="mt-2.5 block text-left text-base font-bold leading-snug text-slate-900 hover:text-[#0072BD] sm:text-lg dark:text-white dark:hover:text-sky-400"
                    >
                      {idx + 1}. {e.paper.titleZh || e.paper.title}
                    </button>
                    {e.paper.titleZh && e.paper.title && e.paper.titleZh !== e.paper.title && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{e.paper.title}</p>
                    )}

                    {/* Deduplicated Bilingual Authors */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-500">作者：</span>
                      {canonAuthors.length > 0 ? (
                        canonAuthors.map((au) => (
                          <button
                            key={au.id}
                            type="button"
                            title={`点击筛选 ${au.displayName} 的全部成果`}
                            onClick={() => setQuery(au.shortName)}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {au.shortName}
                          </button>
                        ))
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">{e.paper.authors.join('；')}</span>
                      )}
                    </div>

                    {/* Deduplicated Bilingual Keywords */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {canonKws.slice(0, 7).map((kw) => (
                        <button
                          key={kw.id}
                          type="button"
                          onClick={() => setQuery(kw.shortLabel)}
                          className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
                        >
                          #{kw.shortLabel}
                        </button>
                      ))}
                    </div>

                    {/* Full Paper Abstract */}
                    <PaperAbstract paper={e.paper} compact />
                  </div>

                  {/* Action Footer */}
                  <div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpen(e.paper)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#005a96]"
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" /> 精读与单篇关联图谱
                      </button>

                      {e.paper.localPdfUrl ? (
                        <button
                          type="button"
                          onClick={() => setPdfPaper(e.paper)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                        >
                          <FileText className="h-3.5 w-3.5" /> 在线阅读全文 PDF
                        </button>
                      ) : (
                        <>
                          {e.paper.pdfUrl && (
                            <a
                              href={e.paper.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                            >
                              <FileText className="h-3.5 w-3.5" /> 访问公开 PDF
                            </a>
                          )}
                          {e.canEdit && (
                            <button
                              type="button"
                              disabled={attachingPaperId === e.paperId}
                              onClick={() => triggerAttachPdf(e.paperId)}
                              className={btnOutline}
                            >
                              <FileUp className="h-3.5 w-3.5" />
                              {attachingPaperId === e.paperId ? '上传中…' : '关联全文 PDF'}
                            </button>
                          )}
                        </>
                      )}

                      {e.paper.doi && (
                        <a
                          href={`https://doi.org/${e.paper.doi.replace(/^https?:\/\/doi\.org\//i, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className={btnOutline}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> DOI 原文
                        </a>
                      )}
                    </div>

                    <details className="mt-2.5 text-xs leading-5 text-slate-500">
                      <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                        引用格式与收录说明
                      </summary>
                      <div className="mt-1.5 space-y-1 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                        {e.citation && <p>{e.citation}</p>}
                        {e.notes && <p className="text-indigo-700 dark:text-indigo-300">研究备注：{e.notes}</p>}
                        <p className="text-[11px] text-slate-400">
                          来源：{e.source} · 归档时间：{new Date(e.addedAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        /* ==================== VIEW 2: KNOWLEDGE GRAPH, MATLAB CHARTS & FRONTIER INSIGHTS ==================== */
        <div className="space-y-6">
          {/* 1. Three-Stage Research Trajectory Synthesis */}
          <section className={cardCls}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-[#0072BD]" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  课题组既有研究方向系统梳理（2023 → 2027 演进脉络）
                </h2>
              </div>
              <span className="text-xs text-slate-500">基于全部 {entries.length} 篇已收录成果自动聚合</span>
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
                    <span className="font-mono text-xs font-semibold text-slate-500">{c.papers.length} 篇成果</span>
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

          {/* 2. Flagship 4-Mode Interactive Dynamic Force-Directed Knowledge Graph */}
          <LabTopicGraph
            analysis={analysis}
            darkMode={darkMode}
            onOpen={onOpen}
            onFilterByAuthor={(a) => jumpFilter({ query: a, year: 'all', topic: 'all' })}
            onFilterByKeyword={(kw) => jumpFilter({ query: kw, year: 'all', topic: 'all' })}
            onFilterByTopic={(t) => jumpFilter({ topic: t, year: 'all', query: '' })}
          />

          {/* 3. MATLAB Publication-Quality Statistical Charts Grid (Fig. 1 — Fig. 5) */}
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

          <MatlabKeywordBubbleChart
            analysis={analysis}
            darkMode={darkMode}
            onSelectKeyword={(kw) => jumpFilter({ query: kw, year: 'all', topic: 'all' })}
          />

          {/* 4. Technology × Industrial Domain Coverage Matrix & Potential Research Frontier Discovery (Fig. 6) */}
          <MatlabGapOpportunityMatrix analysis={analysis} darkMode={darkMode} onOpenPaper={onOpen} />

          {/* 5. External Related Literature Recommendations for the Lab */}
          <RelatedPapers
            seeds={analysis.papers}
            pool={pool}
            darkMode={darkMode}
            onOpen={onOpen}
            title="面向课题组研究方向的外部高关联前沿文献推荐"
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
              <div>
                <h2 className="text-base font-bold">{editing ? '修订课题组文献信息' : '手动录入课题组新文献'}</h2>
                <p className="text-xs text-slate-500">
                  {editing
                    ? '修订仅作用于课题组条目，不影响公共文献池原始记录'
                    : '录入后可随时点击「关联全文 PDF」上传对应论文 PDF 并在线全文阅读'}
                </p>
              </div>
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
              关键词（分号或逗号分隔，中英文均自动合并去重）
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
              研究方向梳理与组内备注
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
