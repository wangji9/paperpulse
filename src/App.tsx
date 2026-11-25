import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Calendar,
  Compass,
  Filter,
  GitCommitHorizontal,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type {
  AcademicPaper,
  AutoSyncConfig,
  EntryType,
  ReadingStatus,
  ResearchTopic,
  UserProfile,
} from './types/paper';
import {
  StorageStats,
  removePaper as apiDeletePaper,
  editComment,
  fetchAutoSyncStatus,
  fetchCurrentUser,
  fetchPapers,
  fetchUsersList,
  importPaperByIdentifier,
  logoutAccount,
  postComment,
  removeComment,
  removeMyKbPaper,
  reparsePaper,
  syncLiveFeed,
  updateAutoSyncConfig,
  updatePaperLibraryState,
  upsertMyKbPaper,
} from './lib/api';
import { TOPIC_META, TRACKED_JOURNALS } from './lib/constants';
import { PaperFeedCard } from './components/PaperFeedCard';
import { DeepAnatomyModal } from './components/DeepAnatomyModal';
import { PaperFormModal } from './components/PaperFormModal';
import { GlobalCitationGraph } from './components/CitationGraph';
import { ArchitectureObservatory } from './components/ArchitectureModal';
import { AuthModal, UserManagementPanel } from './components/AuthAndUsersModal';

type ViewTab = 'pool' | 'my_kb' | 'citations' | 'users' | 'automation';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('pool');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Auth & Users
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Data
  const [papers, setPapers] = useState<AcademicPaper[]>([]);
  const [allPoolPapers, setAllPoolPapers] = useState<AcademicPaper[]>([]);
  const [autoSyncConfig, setAutoSyncConfig] = useState<AutoSyncConfig | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [journalFilter, setJournalFilter] = useState<string>('all');
  const [datasetFilter, setDatasetFilter] = useState<string>('all');
  const [recentOnly, setRecentOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [collectedByFilter, setCollectedByFilter] = useState<string>('all');

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

  const refreshAuthAndUsers = useCallback(async () => {
    const [me, uList] = await Promise.all([fetchCurrentUser(), fetchUsersList()]);
    setCurrentUser(me);
    setUsersList(uList);
  }, []);

  useEffect(() => {
    void refreshAuthAndUsers();
  }, [refreshAuthAndUsers]);

  const currentScope: 'pool' | 'my_kb' = activeTab === 'my_kb' ? 'my_kb' : 'pool';

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [filteredList, fullList, syncInfo, uList] = await Promise.all([
          fetchPapers({
            q: searchQuery,
            domain: domainFilter,
            topic: topicFilter,
            journal: journalFilter,
            datasetType: datasetFilter,
            readingStatus: statusFilter,
            recentOnly,
            scope: currentScope,
            collectedBy: collectedByFilter,
          }),
          fetchPapers({ scope: 'pool' }),
          fetchAutoSyncStatus(),
          fetchUsersList(),
        ]);
        setPapers(filteredList);
        setAllPoolPapers(fullList);
        setAutoSyncConfig(syncInfo.config);
        setStorageStats(syncInfo.storage);
        setUsersList(uList);
      } catch (err) {
        if (!silent) showToast('error', err instanceof Error ? err.message : '数据加载失败');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      searchQuery,
      domainFilter,
      topicFilter,
      journalFilter,
      datasetFilter,
      statusFilter,
      recentOnly,
      currentScope,
      collectedByFilter,
      showToast,
    ]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const t = setInterval(() => void loadData(true), 30000);
    return () => clearInterval(t);
  }, [loadData]);

  const myKbCount = useMemo(() => allPoolPapers.filter((p) => p.inMyKb).length, [allPoolPapers]);

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
      showToast(
        'success',
        res.addedCount > 0 ? `已拉取并自动解析新增 ${res.addedCount} 篇最新文献` : '已完成实时检索，暂无未入库新文献'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportIdentifier = async (identifier: string) => {
    const { paper, alreadyExists } = await importPaperByIdentifier(identifier, { addToMyKb: Boolean(currentUser) });
    await loadData();
    setSelectedPaper(paper);
    showToast('success', alreadyExists ? '该文献已在文献池中' : '已自动解析文献内容、作者单位与引文并入库');
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

  const handleReparse = async (id: string) => {
    try {
      const updated = await reparsePaper(id);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setAllPoolPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPaper?.id === id) setSelectedPaper(updated);
      showToast('success', '已完成文献正文结构、作者单位与引文补全');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '解析失败');
    }
  };

  const handleToggleMyKb = async (paper: AcademicPaper, personalTags?: string[]) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      showToast('error', '请先登录或注册账号，再选入个人知识库');
      return;
    }
    try {
      let updated: AcademicPaper;
      if (paper.inMyKb && personalTags === undefined) {
        updated = await removeMyKbPaper(paper.id);
        showToast('success', '已从我的个人知识库移除');
      } else {
        updated = await upsertMyKbPaper(paper.id, { personalTags });
        showToast('success', personalTags ? '个人文献标签已保存' : '已加入我的个人知识库，并在公共池展示您的标签');
      }
      await loadData(true);
      await refreshAuthAndUsers();
      if (selectedPaper?.id === paper.id) setSelectedPaper(updated);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleUpdateStatus = async (id: string, patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }) => {
    try {
      const updated = await updatePaperLibraryState(id, patch);
      setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setAllPoolPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPaper?.id === id) setSelectedPaper(updated);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    const msg =
      currentUser && currentUser.role !== 'admin'
        ? '确认将该文献移出您的个人知识库吗？'
        : '确认从公共文献池永久删除该文献吗？';
    if (!window.confirm(msg)) return;
    try {
      await apiDeletePaper(id);
      if (selectedPaper?.id === id) setSelectedPaper(null);
      await loadData();
      showToast('success', '操作成功');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleAddEntry = async (paperId: string, payload: { content: string; entryType: EntryType }) => {
    const comment = await postComment(paperId, payload);
    const updater = (list: AcademicPaper[]) =>
      list.map((p) => (p.id === paperId ? { ...p, comments: [comment, ...p.comments] } : p));
    setPapers(updater);
    setAllPoolPapers(updater);
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) => (prev ? { ...prev, comments: [comment, ...prev.comments] } : null));
    }
  };

  const handleEditEntry = async (
    paperId: string,
    commentId: string,
    payload: { content: string; entryType: EntryType }
  ) => {
    const updated = await editComment(paperId, commentId, payload);
    const updater = (list: AcademicPaper[]) =>
      list.map((p) =>
        p.id === paperId ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? updated : c)) } : p
      );
    setPapers(updater);
    setAllPoolPapers(updater);
    if (selectedPaper?.id === paperId) {
      setSelectedPaper((prev) =>
        prev ? { ...prev, comments: prev.comments.map((c) => (c.id === commentId ? updated : c)) } : null
      );
    }
  };

  const handleDeleteEntry = async (paperId: string, commentId: string) => {
    await removeComment(paperId, commentId);
    const updater = (list: AcademicPaper[]) =>
      list.map((p) =>
        p.id === paperId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p
      );
    setPapers(updater);
    setAllPoolPapers(updater);
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
    setRecentOnly(false);
    setStatusFilter('all');
    setCollectedByFilter('all');
  };

  const renderFilterContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">筛选与导航</span>
        <button type="button" onClick={resetFilters} className="text-sm font-medium text-indigo-600 hover:underline">
          重置
        </button>
      </div>

      {/* Views */}
      <div className="space-y-1">
        <div className="mb-1 text-sm font-semibold text-slate-500">时间与状态</div>
        {[
          {
            label: '全部文献',
            active: !recentOnly && statusFilter === 'all' && collectedByFilter === 'all',
            onClick: () => {
              setRecentOnly(false);
              setStatusFilter('all');
              setCollectedByFilter('all');
            },
          },
          {
            label: '昨日与今日新增',
            active: recentOnly,
            onClick: () => setRecentOnly((v) => !v),
          },
          {
            label: '待精读队列',
            active: statusFilter === 'unread',
            onClick: () => setStatusFilter(statusFilter === 'unread' ? 'all' : 'unread'),
          },
        ].map((v) => (
          <button
            key={v.label}
            type="button"
            onClick={v.onClick}
            className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition ${
              v.active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filter by Collector User */}
      {usersList.some((u) => (u.kbCount ?? 0) > 0) && (
        <div className="space-y-1">
          <div className="mb-1 text-sm font-semibold text-slate-500">按成员知识库筛选</div>
          <div className="flex flex-wrap gap-1.5">
            {usersList
              .filter((u) => (u.kbCount ?? 0) > 0)
              .map((u) => {
                const active = collectedByFilter === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setCollectedByFilter(active ? 'all' : u.id)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-sm ${
                      active
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <span>{u.displayName}</span>
                    <span>({u.kbCount})</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Domain */}
      <div className="space-y-1">
        <div className="mb-1 text-sm font-semibold text-slate-500">领域</div>
        {[
          { id: 'all', label: '全部领域' },
          { id: 'manufacturing', label: '智能制造' },
          { id: 'computer_science', label: '计算机' },
          { id: 'interdisciplinary', label: '制造与AI交叉' },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDomainFilter(d.id)}
            className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition ${
              domainFilter === d.id
                ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Topics */}
      <div className="space-y-1">
        <div className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-500">
          <Layers className="h-3.5 w-3.5" /> 研究方向
        </div>
        {(Object.keys(TOPIC_META) as ResearchTopic[]).map((t) => {
          const active = topicFilter === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTopicFilter(active ? 'all' : t)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition ${
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
        <div className="text-sm font-semibold text-slate-500">数据集来源</div>
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
              className={`rounded-md border px-2.5 py-1 text-sm font-medium ${
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

      {/* Tracked Journals (Always reachable via sidebar independent scroll!) */}
      <div className="pb-2">
        <div className="mb-1.5 text-sm font-semibold text-slate-500">期刊与顶会（{TRACKED_JOURNALS.length}）</div>
        <div className="flex flex-wrap gap-1.5">
          {TRACKED_JOURNALS.map((j) => {
            const active = journalFilter === j.short;
            return (
              <button
                key={j.short}
                type="button"
                onClick={() => setJournalFilter(active ? 'all' : j.short)}
                title={j.full}
                className={`rounded-md border px-2 py-1 text-sm font-medium transition ${
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
    </div>
  );

  return (
    <div className={darkMode ? 'dark min-h-screen bg-slate-950 text-slate-100' : 'min-h-screen bg-[#F5F7FA] text-slate-900'}>
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[120] flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-600 text-white'
              : 'border-rose-200 bg-rose-600 text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Full-Width Edge-to-Edge Responsive Header */}
      <header
        className={`sticky top-0 z-40 w-full border-b backdrop-blur-md ${
          darkMode ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200/90 bg-white/95'
        }`}
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 sm:px-5 lg:px-6">
          {/* Brand + Mobile Filter Drawer Trigger */}
          <div className="flex items-center gap-2.5">
            {(activeTab === 'pool' || activeTab === 'my_kb') && (
              <button
                type="button"
                aria-label="打开筛选抽屉"
                onClick={() => setMobileFilterOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-medium lg:hidden dark:border-slate-700"
              >
                <Filter className="h-4 w-4" />
                筛选
              </button>
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-indigo-600">
              <Compass className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">PaperPulse 文献平台</h1>
              <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-600 sm:inline-block dark:bg-slate-800 dark:text-slate-300">
                池 {allPoolPapers.length} 篇
              </span>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative order-3 w-full md:order-2 md:w-64 xl:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、作者、单位、标签、方法"
              className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 ${
                darkMode
                  ? 'border-slate-800 bg-slate-900 text-white placeholder:text-slate-500'
                  : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
              }`}
            />
          </div>

          {/* Navigation Tabs & User Bar */}
          <div className="order-2 flex max-w-full flex-wrap items-center gap-2 md:order-3">
            <div
              className={`flex max-w-full overflow-x-auto rounded-xl border p-1 ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-100/80'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab('pool')}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 ${
                  activeTab === 'pool'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <BookMarked className="h-4 w-4" />
                公共文献池
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    setAuthModalOpen(true);
                    return;
                  }
                  setActiveTab('my_kb');
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 ${
                  activeTab === 'my_kb'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                我的知识库 {currentUser ? `(${myKbCount})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('citations')}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 ${
                  activeTab === 'citations'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <GitCommitHorizontal className="h-4 w-4" />
                知识图谱
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 ${
                  activeTab === 'users'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Users className="h-4 w-4" />
                用户管理
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('automation')}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:px-3 ${
                  activeTab === 'automation'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-800 dark:text-indigo-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Server className="h-4 w-4" />
                自动追踪
              </button>
            </div>

            <button
              type="button"
              onClick={handleSyncLive}
              disabled={syncing}
              className="hidden items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60 xl:inline-flex dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '检索中' : '拉取最新'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingPaper(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">添加文献</span>
            </button>

            {/* User Login / Avatar Pill */}
            {currentUser ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className="flex items-center gap-1.5 font-medium"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: currentUser.avatarColor }}
                  >
                    {currentUser.displayName.slice(0, 1)}
                  </span>
                  <span className="max-w-[90px] truncate">{currentUser.displayName}</span>
                </button>
                <button
                  type="button"
                  title="退出登录"
                  onClick={async () => {
                    await logoutAccount();
                    setCurrentUser(null);
                    if (activeTab === 'my_kb') setActiveTab('pool');
                    await loadData(true);
                    showToast('success', '已退出登录');
                  }}
                  className="rounded p-1 text-slate-400 hover:text-rose-600"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LogIn className="h-4 w-4" />
                登录 / 注册
              </button>
            )}

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

      {/* Mobile / Tablet Slide-Over Filter Drawer */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-[90] flex bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`h-full w-80 max-w-[85vw] overflow-y-auto p-4 shadow-2xl ${
              darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-semibold">文献筛选</span>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderFilterContent()}
          </div>
        </div>
      )}

      {/* Full-Width Responsive Main Container (Zero Side Blank Gaps) */}
      <main className="w-full px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
        {activeTab === 'citations' ? (
          <GlobalCitationGraph
            papers={allPoolPapers}
            darkMode={darkMode}
            onSelectPaper={(p) => setSelectedPaper(p)}
            onImportReference={handleImportIdentifier}
          />
        ) : activeTab === 'users' ? (
          <UserManagementPanel
            currentUser={currentUser}
            users={usersList}
            darkMode={darkMode}
            onRefreshUsers={refreshAuthAndUsers}
            onCurrentUserUpdated={(u) => {
              setCurrentUser(u);
              void loadData(true);
            }}
            onFilterByUser={(uid) => {
              setCollectedByFilter(uid);
              setActiveTab('pool');
            }}
            onOpenAuth={() => setAuthModalOpen(true)}
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            {/* Desktop Independent Scrollable Sticky Sidebar (All Journals Reachable on Scroll!) */}
            <aside
              className={`hidden w-72 shrink-0 rounded-2xl border p-4 lg:sticky lg:top-[68px] lg:block lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto xl:w-80 ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
              }`}
            >
              {renderFilterContent()}
            </aside>

            {/* Fluid Full-Width Content Stream */}
            <section className="min-w-0 flex-1 space-y-5">
              {/* Quick Auto-Parse Import Bar */}
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
                }`}
              >
                <form onSubmit={handleQuickImport} className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder={
                      activeTab === 'my_kb'
                        ? '输入 arXiv 编号、DOI 或论文标题，自动解析内容与作者单位并直接存入我的知识库'
                        : '输入 arXiv 编号、DOI 或论文标题，自动解析文献内容、作者单位与引文入库'
                    }
                    className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 ${
                      darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 focus:bg-white'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={quickImporting || !quickInput.trim()}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600"
                  >
                    {quickImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    自动解析入库
                  </button>
                </form>
              </div>

              {loading ? (
                <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
                  加载中...
                </div>
              ) : papers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                    {activeTab === 'my_kb'
                      ? '您的个人知识库暂未收录文献，可前往「公共文献池」点击「选入我的知识库」或直接上方解析添加'
                      : '当前筛选条件下暂无匹配文献'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'my_kb') setActiveTab('pool');
                      else resetFilters();
                    }}
                    className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {activeTab === 'my_kb' ? '浏览公共文献池' : '重置筛选'}
                  </button>
                </div>
              ) : (
                groupedByDate.map(([date, list]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-sm font-semibold text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        <Calendar className="h-4 w-4 text-indigo-600" />
                        {date === todayStr
                          ? `${date} · 今日新增`
                          : date === yesterdayStr
                            ? `${date} · 昨日新增`
                            : date}
                        <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.2 text-xs text-white">
                          {list.length} 篇
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {list.map((paper) => (
                      <PaperFeedCard
                        key={paper.id}
                        paper={paper}
                        currentUser={currentUser}
                        darkMode={darkMode}
                        onOpenDetail={(p) => setSelectedPaper(p)}
                        onEdit={(p) => {
                          setEditingPaper(p);
                          setFormOpen(true);
                        }}
                        onDelete={handleDelete}
                        onReparse={handleReparse}
                        onToggleMyKb={handleToggleMyKb}
                        onUpdateStatus={handleUpdateStatus}
                        onAddEntry={handleAddEntry}
                        onEditEntry={handleEditEntry}
                        onDeleteEntry={handleDeleteEntry}
                        onFilterByCollector={(uid) => {
                          setCollectedByFilter(uid);
                          setActiveTab('pool');
                        }}
                      />
                    ))}
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </main>

      {/* Deep Anatomy & Citation Graph Modal */}
      {selectedPaper && (
        <DeepAnatomyModal
          paper={selectedPaper}
          libraryPapers={allPoolPapers}
          currentUser={currentUser}
          darkMode={darkMode}
          onClose={() => setSelectedPaper(null)}
          onEdit={(p) => {
            setSelectedPaper(null);
            setEditingPaper(p);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
          onReparse={handleReparse}
          onToggleMyKb={(p) => handleToggleMyKb(p)}
          onSelectOtherPaper={(p) => setSelectedPaper(p)}
          onImportReference={handleImportIdentifier}
          onAddEntry={handleAddEntry}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {/* Add / Edit Paper Modal */}
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
            void refreshAuthAndUsers();
            setSelectedPaper(savedPaper);
            showToast('success', isNew ? '新文献已自动解析入库' : '文献已更新');
          }}
        />
      )}

      {/* User Login / Register Modal */}
      {authModalOpen && (
        <AuthModal
          darkMode={darkMode}
          onClose={() => setAuthModalOpen(false)}
          onAuthenticated={(u) => {
            setCurrentUser(u);
            void refreshAuthAndUsers();
            void loadData(true);
            showToast('success', `欢迎回来，${u.displayName}`);
          }}
        />
      )}
    </div>
  );
}
