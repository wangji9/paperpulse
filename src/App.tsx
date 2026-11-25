import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Calendar,
  Clock,
  Compass,
  GitCommitHorizontal,
  Layers,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { AcademicPaper, AutoSyncConfig, ReadingStatus, ResearchTopic } from './types/paper';
import {
  StorageStats,
  removePaper as apiDeletePaper,
  fetchAutoSyncStatus,
  fetchPapers,
  importPaperByIdentifier,
  postComment,
  removeComment,
  syncLiveFeed,
  updateAutoSyncConfig,
  updatePaperLibraryState,
} from './lib/api';
import { TOPIC_META, TRACKED_JOURNALS } from './lib/constants';
import { PaperFeedCard } from './components/PaperFeedCard';
import { DeepAnatomyModal } from './components/DeepAnatomyModal';
import { PaperFormModal } from './components/PaperFormModal';
import { GlobalCitationGraph } from './components/CitationGraph';
import { ArchitectureObservatory } from './components/ArchitectureModal';

type ViewTab = 'library' | 'citations' | 'automation';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('library');
  const [papers, setPapers] = useState<AcademicPaper[]>([]);
  const [allLibraryPapers, setAllLibraryPapers] = useState<AcademicPaper[]>([]);
  const [autoSyncConfig, setAutoSyncConfig] = useState<AutoSyncConfig | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Clean Personal Library Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [journalFilter, setJournalFilter] = useState<string>('all');
  const [datasetFilter, setDatasetFilter] = useState<string>('all');
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Quick Import Bar
  const [quickInput, setQuickInput] = useState('');
  const [quickImporting, setQuickImporting] = useState(false);

  // Modals
  const [selectedPaper, setSelectedPaper] = useState<AcademicPaper | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState<AcademicPaper | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filteredList, fullList, syncInfo] = await Promise.all([
        fetchPapers({
          q: searchQuery,
          domain: domainFilter,
          topic: topicFilter,
          journal: journalFilter,
          datasetType: datasetFilter,
          bookmarked: onlyBookmarked,
          readingStatus: statusFilter,
          recentOnly,
        }),
        fetchPapers({}),
        fetchAutoSyncStatus(),
      ]);
      setPapers(filteredList);
      setAllLibraryPapers(fullList);
      setAutoSyncConfig(syncInfo.config);
      setStorageStats(syncInfo.storage);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, domainFilter, topicFilter, journalFilter, datasetFilter, onlyBookmarked, statusFilter, recentOnly, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 160);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Group papers by date descending
  const groupedByDate = useMemo(() => {
    const groups: Record<string, AcademicPaper[]> = {};
    for (const p of papers) {
      if (!groups[p.publishedDate]) groups[p.publishedDate] = [];
      groups[p.publishedDate].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [papers]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const handleSyncLive = async () => {
    setSyncing(true);
    try {
      const res = await syncLiveFeed();
      await loadData();
      if (res.addedCount > 0) {
        showToast('success', `实时检索完成：新增 ${res.addedCount} 篇昨日/今日前沿文献入库！`);
      } else {
        showToast('success', '已完成 arXiv + OpenAlex 实时检索，暂无新的未入库文献。');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportIdentifier = async (identifier: string) => {
    const { paper, alreadyExists } = await importPaperByIdentifier(identifier);
    await loadData();
    setSelectedPaper(paper);
    showToast('success', alreadyExists ? '该文献已在您的文献库中' : '已抓取文献元信息与引文拓扑并入库');
  };

  const handleQuickImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setQuickImporting(true);
    try {
      await handleImportIdentifier(quickInput.trim());
      setQuickInput('');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '抓取失败');
    } finally {
      setQuickImporting(false);
    }
  };

  const handleUpdateStatus = async (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => {
    try {
      const updated = await updatePaperLibraryState(id, patch);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setAllLibraryPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPaper?.id === id) setSelectedPaper(updated);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认从个人文献库中删除该篇文献及关联笔记吗？')) return;
    try {
      await apiDeletePaper(id);
      if (selectedPaper?.id === id) setSelectedPaper(null);
      await loadData();
      showToast('success', '文献已移除');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleAddComment = async (paperId: string, author: string, role: string, content: string) => {
    const comment = await postComment(paperId, author, role, content);
    const updater = (list: AcademicPaper[]) =>
      list.map((p) => (p.id === paperId ? { ...p, comments: [comment, ...p.comments] } : p));
    setPapers(updater);
    setAllLibraryPapers(updater);
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) => (prev ? { ...prev, comments: [comment, ...prev.comments] } : null));
    }
  };

  const handleDeleteComment = async (paperId: string, commentId: string) => {
    await removeComment(paperId, commentId);
    const updater = (list: AcademicPaper[]) =>
      list.map((p) =>
        p.id === paperId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p
      );
    setPapers(updater);
    setAllLibraryPapers(updater);
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) =>
        prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : null
      );
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setDomainFilter('all');
    setTopicFilter('all');
    setJournalFilter('all');
    setDatasetFilter('all');
    setOnlyBookmarked(false);
    setRecentOnly(false);
    setStatusFilter('all');
  };

  return (
    <div className={darkMode ? 'dark min-h-screen bg-slate-950 text-slate-100' : 'min-h-screen bg-[#F5F7FA] text-slate-900'}>
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[110] flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-xl ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-600 text-white'
              : 'border-rose-200 bg-rose-600 text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Clean Sticky Header */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md ${
          darkMode ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200/90 bg-white/95'
        }`}
      >
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-indigo-600">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif-academic text-lg font-bold tracking-tight">PaperPulse · 个人文献库</h1>
                <span className="font-mono-code rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {allLibraryPapers.length} 篇
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                制造与计算机前沿精读库 · 每日自动同步昨日/今日文献 · 引文拓扑可视化
              </p>
            </div>
          </div>

          <div className="relative order-3 w-full lg:order-2 lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="检索标题、方法、数据集、DOI..."
              className={`w-full rounded-xl border py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500 ${
                darkMode
                  ? 'border-slate-800 bg-slate-900 text-white placeholder:text-slate-500'
                  : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
              }`}
            />
          </div>

          <div className="order-2 flex flex-wrap items-center gap-2 lg:order-3">
            <div
              className={`flex rounded-xl border p-1 ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-100/80'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'library'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <BookMarked className="h-3.5 w-3.5" />
                文献内容流
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('citations')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'citations'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                引用关系图谱
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('automation')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'automation'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Server className="h-3.5 w-3.5" />
                自动追踪与存储
              </button>
            </div>

            <button
              type="button"
              onClick={handleSyncLive}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '检索中...' : '拉取昨日/今日文献'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingPaper(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              录入文献
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="切换主题"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeTab === 'citations' ? (
          <GlobalCitationGraph
            papers={allLibraryPapers}
            darkMode={darkMode}
            onSelectPaper={(p) => setSelectedPaper(p)}
            onImportReference={handleImportIdentifier}
          />
        ) : activeTab === 'automation' ? (
          <ArchitectureObservatory
            autoSyncConfig={autoSyncConfig}
            storage={storageStats}
            darkMode={darkMode}
            onUpdateConfig={async (patch) => {
              const updated = await updateAutoSyncConfig(patch);
              setAutoSyncConfig(updated);
              showToast('success', '自动追踪设置已保存');
            }}
            onTriggerSync={handleSyncLive}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Slim Left Filter Rail */}
            <aside className="lg:col-span-3">
              <div
                className={`sticky top-20 space-y-5 rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">文献库索引与筛选</span>
                  <button type="button" onClick={resetFilters} className="text-[11px] font-medium text-indigo-600 hover:underline">
                    重置
                  </button>
                </div>

                {/* Quick Views */}
                <div className="space-y-1">
                  <div className="mb-1 text-[11px] font-semibold text-slate-400">阅读分类</div>
                  {[
                    { label: '全部文献', active: !recentOnly && !onlyBookmarked && statusFilter === 'all', onClick: () => { setRecentOnly(false); setOnlyBookmarked(false); setStatusFilter('all'); } },
                    { label: `昨日与今日新收 (${yesterdayStr.slice(5)} ~ ${todayStr.slice(5)})`, active: recentOnly, onClick: () => { setRecentOnly((v) => !v); setOnlyBookmarked(false); } },
                    { label: '我的星标收藏', active: onlyBookmarked, onClick: () => { setOnlyBookmarked((v) => !v); setRecentOnly(false); } },
                    { label: '待精读队列', active: statusFilter === 'unread', onClick: () => setStatusFilter(statusFilter === 'unread' ? 'all' : 'unread') },
                  ].map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={v.onClick}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
                        v.active
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* Domain */}
                <div className="space-y-1">
                  <div className="mb-1 text-[11px] font-semibold text-slate-400">领域期刊归属</div>
                  {[
                    { id: 'all', label: '全部领域' },
                    { id: 'manufacturing', label: '智能制造期刊' },
                    { id: 'computer_science', label: '计算机顶刊顶会' },
                    { id: 'interdisciplinary', label: '制造 × AI 交叉' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDomainFilter(d.id)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
                        domainFilter === d.id
                          ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* 5 Topics */}
                <div className="space-y-1">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    <Layers className="h-3 w-3" /> 研究方向
                  </div>
                  {(Object.keys(TOPIC_META) as ResearchTopic[]).map((t) => {
                    const active = topicFilter === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTopicFilter(active ? 'all' : t)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
                          active
                            ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TOPIC_META[t].color }} />
                        <span>{TOPIC_META[t].label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dataset Type */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400">数据集来源</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: '全部' },
                      { id: 'public', label: '公开' },
                      { id: 'self_built', label: '自建' },
                      { id: 'hybrid', label: '混合' },
                    ].map((ds) => (
                      <button
                        key={ds.id}
                        type="button"
                        onClick={() => setDatasetFilter(ds.id)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                          datasetFilter === ds.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {ds.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tracked Journals */}
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-slate-400">期刊快捷过滤</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TRACKED_JOURNALS.map((j) => {
                      const active = journalFilter === j.short;
                      return (
                        <button
                          key={j.short}
                          type="button"
                          onClick={() => setJournalFilter(active ? 'all' : j.short)}
                          title={j.full}
                          className={`rounded-md border px-2 py-0.5 font-mono-code text-[11px] font-semibold ${
                            active
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {j.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>

            {/* Wide Main Content Reading Column (No Right Clutter) */}
            <section className="space-y-5 lg:col-span-9">
              {/* Auto-Sync & Quick DOI/arXiv Bar */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      <Clock className="h-3.5 w-3.5" />
                      每日自动追踪：{autoSyncConfig?.enabled ? `已启用（每 ${autoSyncConfig.intervalHours} 小时检索 ${yesterdayStr} ~ ${todayStr}）` : '已暂停'}
                    </span>
                    {autoSyncConfig?.lastAutoSyncAt && (
                      <span className="font-mono-code text-[11px] text-slate-400">
                        上次同步 {autoSyncConfig.lastAutoSyncAt.slice(0, 16).replace('T', ' ')}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('automation')}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    调整追踪规则 →
                  </button>
                </div>

                <form onSubmit={handleQuickImport} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="输入 arXiv ID（如 2503.20020）、DOI 或英文标题关键词，立即解析元数据与引用图谱存入我的文献库..."
                    className={`flex-1 rounded-xl border px-3.5 py-2 text-xs outline-none focus:border-indigo-500 ${
                      darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 focus:bg-white'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={quickImporting || !quickInput.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600"
                  >
                    {quickImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    解析并入库
                  </button>
                </form>
              </div>

              {/* Paper Stream */}
              {loading ? (
                <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
                  正在加载个人文献库...
                </div>
              ) : papers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">当前筛选条件下暂无匹配文献</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    查看全部文献
                  </button>
                </div>
              ) : (
                groupedByDate.map(([date, list]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-mono-code text-xs font-bold text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                        {date === todayStr
                          ? `${date} · 今日新收`
                          : date === yesterdayStr
                            ? `${date} · 昨日新收`
                            : date}
                        <span className="ml-1 rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
                          {list.length} 篇
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {list.map((paper) => (
                      <PaperFeedCard
                        key={paper.id}
                        paper={paper}
                        darkMode={darkMode}
                        onOpenDetail={(p) => setSelectedPaper(p)}
                        onEdit={(p) => {
                          setEditingPaper(p);
                          setFormOpen(true);
                        }}
                        onDelete={handleDelete}
                        onUpdateStatus={handleUpdateStatus}
                        onAddComment={handleAddComment}
                        onDeleteComment={handleDeleteComment}
                      />
                    ))}
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </main>

      {/* Deep 10-Part Paper Anatomy + Citation Graph Modal */}
      {selectedPaper && (
        <DeepAnatomyModal
          paper={selectedPaper}
          libraryPapers={allLibraryPapers}
          darkMode={darkMode}
          onClose={() => setSelectedPaper(null)}
          onEdit={(p) => {
            setSelectedPaper(null);
            setEditingPaper(p);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
          onSelectOtherPaper={(p) => setSelectedPaper(p)}
          onImportReference={handleImportIdentifier}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      {/* Create / Edit Modal */}
      {formOpen && (
        <PaperFormModal
          editingPaper={editingPaper}
          darkMode={darkMode}
          onClose={() => {
            setFormOpen(false);
            setEditingPaper(null);
          }}
          onSaved={(savedPaper, isNew) => {
            void loadData();
            setSelectedPaper(savedPaper);
            showToast('success', isNew ? '新文献已解析并入库' : '文献十维解析已更新');
          }}
        />
      )}
    </div>
  );
}
