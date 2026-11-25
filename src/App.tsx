import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart2,
  Bookmark,
  Calendar,
  Compass,
  Database,
  Flame,
  Layers,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import type { AcademicPaper, ResearchTopic } from './types/paper';
import {
  AnalyticsResponse,
  removePaper as apiDeletePaper,
  engagePaper,
  fetchAnalytics,
  fetchPapers,
  importPaperByIdentifier,
  postComment,
  removeComment,
  syncLiveFeed,
} from './lib/api';
import { TOPIC_META, TRACKED_JOURNALS } from './lib/constants';
import { PaperFeedCard } from './components/PaperFeedCard';
import { DeepAnatomyModal } from './components/DeepAnatomyModal';
import { PaperFormModal } from './components/PaperFormModal';
import { AnalyticsObservatory } from './components/AnalyticsObservatory';
import { ArchitectureObservatory } from './components/ArchitectureModal';

type ViewTab = 'feed' | 'analytics' | 'architecture';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('feed');
  const [papers, setPapers] = useState<AcademicPaper[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [journalFilter, setJournalFilter] = useState<string>('all');
  const [datasetFilter, setDatasetFilter] = useState<string>('all');
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);

  // Quick Weibo-style composer
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
      const [paperList, stats] = await Promise.all([
        fetchPapers({
          q: searchQuery,
          domain: domainFilter,
          topic: topicFilter,
          journal: journalFilter,
          datasetType: datasetFilter,
          bookmarked: onlyBookmarked,
        }),
        fetchAnalytics(),
      ]);
      setPapers(paperList);
      setAnalytics(stats);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, domainFilter, topicFilter, journalFilter, datasetFilter, onlyBookmarked, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Group feed papers by date (Weibo daily stream)
  const groupedByDate = useMemo(() => {
    const groups: Record<string, AcademicPaper[]> = {};
    for (const p of papers) {
      if (!groups[p.publishedDate]) groups[p.publishedDate] = [];
      groups[p.publishedDate].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [papers]);

  const handleSyncLive = async () => {
    setSyncing(true);
    try {
      const res = await syncLiveFeed();
      await loadData();
      if (res.addedCount > 0) {
        showToast('success', `实时同步成功：从 ${res.source} 拉取并解析了 ${res.addedCount} 篇最新前沿文献！`);
      } else {
        showToast('success', '已完成实时轮询，当前追踪文献已为最新状态。');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setQuickImporting(true);
    try {
      const { paper, alreadyExists } = await importPaperByIdentifier(quickInput.trim());
      setQuickInput('');
      await loadData();
      setSelectedPaper(paper);
      showToast(
        'success',
        alreadyExists ? '该文献已在库中，已为您打开十维精读视图' : '已实时抓取文献并自动生成十维学术结构！'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '解析失败');
    } finally {
      setQuickImporting(false);
    }
  };

  const handleEngage = async (id: string, action: 'like' | 'bookmark' | 'repost') => {
    try {
      const updated = await engagePaper(id, action);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPaper?.id === id) setSelectedPaper(updated);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认从 SQLite 数据库永久删除该文献及其全部学术批注吗？')) return;
    try {
      await apiDeletePaper(id);
      setPapers((prev) => prev.filter((p) => p.id !== id));
      if (selectedPaper?.id === id) setSelectedPaper(null);
      const stats = await fetchAnalytics();
      setAnalytics(stats);
      showToast('success', '文献已从本地数据库删除');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleAddComment = async (paperId: string, author: string, role: string, content: string) => {
    const comment = await postComment(paperId, author, role, content);
    setPapers((prev) =>
      prev.map((p) => (p.id === paperId ? { ...p, comments: [comment, ...p.comments] } : p))
    );
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) => (prev ? { ...prev, comments: [comment, ...prev.comments] } : null));
    }
  };

  const handleDeleteComment = async (paperId: string, commentId: string) => {
    await removeComment(paperId, commentId);
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p
      )
    );
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) =>
        prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : null
      );
    }
  };

  const hotKeywords = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of papers) {
      for (const t of p.tags) {
        map[t] = (map[t] || 0) + p.likes + 20;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
  }, [papers]);

  const resetFilters = () => {
    setSearchQuery('');
    setDomainFilter('all');
    setTopicFilter('all');
    setJournalFilter('all');
    setDatasetFilter('all');
    setOnlyBookmarked(false);
  };

  return (
    <div className={darkMode ? 'dark min-h-screen bg-slate-950 text-slate-100' : 'min-h-screen bg-[#F4F6FA] text-slate-900'}>
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-xl ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-600 text-white'
              : 'border-rose-200 bg-rose-600 text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Top Sticky Observatory Navbar */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md ${
          darkMode ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200/90 bg-white/90'
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-indigo-800 to-cyan-600 text-white shadow-md shadow-indigo-500/20">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif-academic text-lg font-bold tracking-tight">PaperPulse · 智研脉</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  实时追踪在线
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                制造顶刊 × 计算机前沿 · 大模型 / 知识图谱 / CV / 多模态 / 具身智能
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative order-3 w-full lg:order-2 lg:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="检索标题、期刊、痛点、方法、数据集、DOI..."
              className={`w-full rounded-xl border py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-500 ${
                darkMode
                  ? 'border-slate-800 bg-slate-900 text-white placeholder:text-slate-500'
                  : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
              }`}
            />
          </div>

          {/* Navigation Tabs & Actions */}
          <div className="order-2 flex flex-wrap items-center gap-2 lg:order-3">
            <div
              className={`flex rounded-xl border p-1 ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-100/80'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab('feed')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'feed'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                实时学术流
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'analytics'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                全景可视化
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('architecture')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'architecture'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Server className="h-3.5 w-3.5" />
                存储与域名
              </button>
            </div>

            <button
              type="button"
              onClick={handleSyncLive}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中...' : '实时同步最新'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingPaper(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              录入 / 解析文献
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="切换学术日间/深空观测主题"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {activeTab === 'analytics' ? (
          <AnalyticsObservatory
            papers={papers}
            darkMode={darkMode}
            onSelectPaper={(p) => setSelectedPaper(p)}
          />
        ) : activeTab === 'architecture' ? (
          <ArchitectureObservatory analytics={analytics} darkMode={darkMode} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT SIDEBAR: Navigation & Multi-Dimensional Filters */}
            <aside className="space-y-4 lg:col-span-3">
              {/* Domain Filter Card */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">领域期刊矩阵</span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    重置筛选
                  </button>
                </div>
                <div className="space-y-1">
                  {[
                    { id: 'all', label: '全部追踪前沿', count: analytics?.totalPapers ?? papers.length },
                    { id: 'manufacturing', label: '智能制造顶刊', count: analytics?.domainCounts.manufacturing ?? 0 },
                    { id: 'computer_science', label: '计算机顶刊顶会', count: analytics?.domainCounts.computer_science ?? 0 },
                    { id: 'interdisciplinary', label: '制造 × AI 交叉', count: analytics?.domainCounts.interdisciplinary ?? 0 },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDomainFilter(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        domainFilter === item.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`font-mono-code rounded-md px-1.5 py-0.5 text-[10px] ${
                          domainFilter === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Bookmarked quick toggle */}
                <button
                  type="button"
                  onClick={() => setOnlyBookmarked((v) => !v)}
                  className={`mt-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    onlyBookmarked
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5" />
                    仅看我的收藏精读
                  </span>
                  <span>{onlyBookmarked ? '已开启' : '全部'}</span>
                </button>
              </div>

              {/* 5 Core Research Topics */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Layers className="h-3.5 w-3.5 text-indigo-500" />
                  五大核心技术方向
                </div>
                <div className="space-y-1.5">
                  {(Object.keys(TOPIC_META) as ResearchTopic[]).map((topicKey) => {
                    const meta = TOPIC_META[topicKey];
                    const active = topicFilter === topicKey;
                    const count = analytics?.topicCounts[topicKey] ?? 0;
                    return (
                      <button
                        key={topicKey}
                        type="button"
                        onClick={() => setTopicFilter(active ? 'all' : topicKey)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                          <span className="text-[10px] font-normal text-slate-400">{meta.labelEn}</span>
                        </span>
                        <span className="font-mono-code text-[11px] text-slate-500">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dataset Provenance Filter */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Database className="h-3.5 w-3.5 text-emerald-500" />
                  数据集构建类型筛选
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'all', label: '全部来源' },
                    { id: 'public', label: '公开数据集' },
                    { id: 'self_built', label: '自建数据集' },
                    { id: 'hybrid', label: '混合验证' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDatasetFilter(d.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        datasetFilter === d.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tracked Core Journals */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">重点追踪期刊 / 顶会</div>
                <div className="flex flex-wrap gap-1.5">
                  {TRACKED_JOURNALS.map((j) => {
                    const active = journalFilter === j.short;
                    return (
                      <button
                        key={j.short}
                        type="button"
                        onClick={() => setJournalFilter(active ? 'all' : j.short)}
                        title={`${j.full} (${j.domain})`}
                        className={`rounded-lg border px-2 py-1 font-mono-code text-[11px] font-semibold transition ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {j.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* CENTER MAIN FEED: Weibo-style Real-Time Academic Timeline */}
            <section className="space-y-4 lg:col-span-6">
              {/* Weibo-style Quick Import / Publish Bar */}
              <form
                onSubmit={handleQuickImport}
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    <Zap className="h-3.5 w-3.5" />
                    快速学术动态解析台 (支持粘贴 arXiv ID / DOI / 英文关键词即时解析)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPaper(null);
                      setFormOpen(true);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-indigo-600"
                  >
                    切换完整10维表单 →
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="例如输入: 2410.06164 或 Embodied AI manufacturing 或 10.1016/..."
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
                    解析并发布动态
                  </button>
                </div>
              </form>

              {/* Feed Timeline */}
              {loading ? (
                <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
                  正在加载实时学术文献流...
                </div>
              ) : papers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">当前筛选条件下暂无文献</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    查看全部实时文献
                  </button>
                </div>
              ) : (
                groupedByDate.map(([date, list]) => (
                  <div key={date} className="space-y-4">
                    {/* Daily Date Divider */}
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono-code text-xs font-bold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300">
                        <Calendar className="h-3.5 w-3.5" />
                        {date === '2026-11-25' ? `${date} · 今日动态更新` : date}
                        <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[10px] text-white">
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
                        onEngage={handleEngage}
                        onAddComment={handleAddComment}
                        onDeleteComment={handleDeleteComment}
                        onFilterTag={(tag) => setSearchQuery(tag)}
                      />
                    ))}
                  </div>
                ))
              )}
            </section>

            {/* RIGHT SIDEBAR: Trending Hot Topics & Telemetry */}
            <aside className="space-y-4 lg:col-span-3">
              {/* Hot Academic Trends (Weibo Hot Search Style) */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    <Flame className="h-4 w-4" />
                    今日学术热搜榜
                  </span>
                  <span className="text-[11px] text-slate-400">实时热度</span>
                </div>
                <div className="space-y-2">
                  {hotKeywords.map(([tag, score], idx) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSearchQuery(tag)}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`font-mono-code w-4 text-center font-bold ${
                            idx < 3 ? 'text-rose-500' : 'text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">#{tag}#</span>
                      </div>
                      <span className="font-mono-code text-[11px] text-slate-400">{score}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Update Telemetry */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">每日论文动态脉搏</span>
                  <span className="font-mono-code text-[11px] text-emerald-600">Auto-Sync Ready</span>
                </div>
                <div className="mt-3 flex h-24 items-end gap-2">
                  {(analytics?.dailyTimeline ?? []).map((item) => {
                    const max = Math.max(1, ...(analytics?.dailyTimeline.map((d) => d.count) ?? [1]));
                    return (
                      <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="font-mono-code text-[10px] font-bold text-indigo-600">{item.count}</span>
                        <div
                          style={{ height: `${Math.max(16, (item.count / max) * 56)}px` }}
                          className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-cyan-400"
                        />
                        <span className="font-mono-code text-[10px] text-slate-400">{item.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Storage & Live Status Summary */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-emerald-500" />
                    数据存储与接口状态
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('architecture')}
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                  >
                    域名部署指南
                  </button>
                </div>
                <div className="mt-2.5 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>存储引擎</span>
                    <span className="font-mono-code font-semibold text-slate-700 dark:text-slate-200">SQLite WAL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>已入库文献</span>
                    <span className="font-mono-code font-semibold text-slate-700 dark:text-slate-200">
                      {analytics?.storage.totalPapers ?? papers.length} 篇
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>同行批注数</span>
                    <span className="font-mono-code font-semibold text-slate-700 dark:text-slate-200">
                      {analytics?.storage.totalComments ?? 0} 条
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Deep 10-Part Paper Anatomy Reader Modal */}
      {selectedPaper && (
        <DeepAnatomyModal
          paper={selectedPaper}
          darkMode={darkMode}
          onClose={() => setSelectedPaper(null)}
          onEdit={(p) => {
            setSelectedPaper(null);
            setEditingPaper(p);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      {/* Create / Edit / Auto-Import Modal */}
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
            showToast('success', isNew ? '新文献已解析并持久化存入 SQLite' : '文献十维逻辑已更新保存');
          }}
        />
      )}
    </div>
  );
}
