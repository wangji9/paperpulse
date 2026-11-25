import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Check,
  Clock,
  Compass,
  Edit3,
  Eye,
  Heart,
  Loader2,
  Moon,
  Plus,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { UserProfile } from '../types/paper';
import {
  createManagedUser,
  deleteUserAccount,
  loginAccount,
  registerAccount,
  updateUserAccount,
} from '../lib/api';
import { formatDurationZh } from './SocialEngagement';

/**
 * Full-Screen Mandatory Login / Registration Portal
 * Users must sign into their own account before viewing any platform content.
 */
export const AuthGateScreen: React.FC<{
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onAuthenticated: (user: UserProfile) => void;
}> = ({ darkMode, onToggleDarkMode, onAuthenticated }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (tab === 'login') {
        const { user } = await loginAccount(username, password);
        onAuthenticated(user);
      } else {
        const userTags = tagsStr
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        const { user } = await registerAccount({
          username,
          password,
          displayName: displayName.trim() || username.trim(),
          userTags,
        });
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录或注册失败');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white'
  }`;

  return (
    <div
      className={`flex min-h-dvh w-full flex-col justify-between ${
        darkMode
          ? 'dark bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100'
          : 'bg-gradient-to-br from-slate-50 via-indigo-50/40 to-teal-50/40 text-slate-900'
      }`}
    >
      {/* Top Minimal Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
            <Compass className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">PaperPulse 协同文献与知识库平台</span>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-600 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          title="切换主题"
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Main Split Portal */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-8 lg:grid-cols-12">
        {/* Left Feature Highlights */}
        <div className="space-y-6 lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1 text-sm font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" />
            面向智能制造与人工智能团队的社交化文献空间
          </div>

          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            登录个人研究账户，开启可追溯的协同文献精读与知识沉淀
          </h1>

          <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
            平台采用成员实名/专属账号登录机制。登录后默认进入您的专属研究视角：既能沉淀独立的「我的知识库」矩阵与看板，也能在「公共文献池」实时查看课题组其他成员的阅读时长、访问足迹气泡图、点赞收藏与学术评论气泡。
          </p>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {[
              {
                icon: <BookOpen className="h-5 w-5 text-indigo-600" />,
                title: '16本制造顶刊 + AI顶会原图直出',
                desc: '自动追踪 IJMTM、JMS、RCIM、IEEE TII 等核心期刊，直接嵌入论文原图与原始实验表。',
              },
              {
                icon: <Clock className="h-5 w-5 text-teal-600" />,
                title: '成员阅读时长与读者互动气泡图',
                desc: '自动记录谁访问过、访问次数与累计阅读时长，以社交头像与力导向气泡图直观呈现。',
              },
              {
                icon: <Heart className="h-5 w-5 text-rose-600" />,
                title: '全链路可追溯点赞、收藏与评论气泡',
                desc: '支持论文与评论点赞、个人知识库选入标签及楼中楼回复，每项互动均可追溯具体成员。',
              },
              {
                icon: <Users className="h-5 w-5 text-amber-600" />,
                title: '个人专属工作台 vs 公共文献池协同',
                desc: '个人库提供横向对比矩阵与三阶段看板；公共池实时汇聚全团队共读动态。',
              },
            ].map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-slate-800 bg-slate-900/70' : 'border-white bg-white/85 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">{f.icon} {f.title}</div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Login / Register Card */}
        <div className="lg:col-span-5">
          <div
            className={`rounded-3xl border p-6 sm:p-8 shadow-xl ${
              darkMode ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200/90 bg-white'
            }`}
          >
            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError('');
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  tab === 'login'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                登录我的账户
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError('');
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  tab === 'register'
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                注册新成员账号
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入您的用户名"
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">登录密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码（至少 4 位）"
                  className={inputCls}
                  required
                />
              </div>

              {tab === 'register' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">显示姓名 / 昵称</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例如：王骥 / 张博士"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">研究方向标签（逗号分隔，展示在互动足迹中）</label>
                    <input
                      type="text"
                      value={tagsStr}
                      onChange={(e) => setTagsStr(e.target.value)}
                      placeholder="例如：具身智能, 知识图谱, 智能制造"
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {tab === 'login' ? '进入我的文献平台' : '立即注册并进入平台'}
              </button>

              {tab === 'login' && (
                <div
                  className={`rounded-xl border p-3 text-xs leading-5 ${
                    darkMode ? 'border-slate-800 bg-slate-800/60 text-slate-400' : 'border-slate-200/80 bg-slate-50 text-slate-600'
                  }`}
                >
                  首次使用请注册个人账号。登录后，阅读足迹、时长和互动会向平台成员展示；管理员账号由平台维护人员分配。
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 text-center text-xs text-slate-400">
        PaperPulse Collaborative Academic Platform · 支持多成员阅读时长追踪、互动气泡图与知识库沉淀
      </div>
    </div>
  );
};

interface AuthModalProps {
  darkMode: boolean;
  initialTab?: 'login' | 'register';
  onClose: () => void;
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  darkMode,
  initialTab = 'login',
  onClose,
  onAuthenticated,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (tab === 'login') {
        const { user } = await loginAccount(username, password);
        onAuthenticated(user);
        onClose();
      } else {
        const userTags = tagsStr
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        const { user } = await registerAccount({
          username,
          password,
          displayName: displayName.trim() || username.trim(),
          userTags,
        });
        onAuthenticated(user);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="切换账户"
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
          darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                tab === 'login' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              切换账号登录
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError('');
              }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                tab === 'register' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              注册新账号
            </button>
          </div>
          <button
            type="button"
            aria-label="关闭登录弹窗"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1 block text-sm font-medium">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className={inputCls}
              required
            />
          </div>
          {tab === 'register' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">显示名称</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">个人方向标签（逗号分隔）</label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  className={inputCls}
                />
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {tab === 'login' ? '立即切换登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

interface UserManagementPanelProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  darkMode: boolean;
  onRefreshUsers: () => Promise<void>;
  onCurrentUserUpdated: (user: UserProfile) => void;
  onFilterByUser: (userId: string) => void;
  onFilterByInteraction?: (userId: string) => void;
  onOpenAuth: () => void;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  currentUser,
  users,
  darkMode,
  onRefreshUsers,
  onCurrentUserUpdated,
  onFilterByUser,
  onFilterByInteraction,
  onOpenAuth,
}) => {
  const [myDisplayName, setMyDisplayName] = useState(currentUser?.displayName || '');
  const [myTagsStr, setMyTagsStr] = useState((currentUser?.userTags || []).join(', '));
  const [myNewPwd, setMyNewPwd] = useState('');
  const [savingMe, setSavingMe] = useState(false);

  const [newUname, setNewUname] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newDname, setNewDname] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');
  const [creating, setCreating] = useState(false);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserTagsStr, setEditUserTagsStr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setMyDisplayName(currentUser?.displayName || '');
    setMyTagsStr((currentUser?.userTags || []).join(', '));
  }, [currentUser]);

  const cardCls = `rounded-2xl border p-6 ${
    darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
  }`;
  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingMe(true);
    try {
      const updated = await updateUserAccount(currentUser.id, {
        displayName: myDisplayName,
        userTags: myTagsStr
          .split(/[,，]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        newPassword: myNewPwd.trim() ? myNewPwd.trim() : undefined,
      });
      setMyNewPwd('');
      onCurrentUserUpdated(updated);
      await onRefreshUsers();
      setMsg('个人资料与标签已更新');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingMe(false);
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUname.trim() || !newPwd.trim()) return;
    setCreating(true);
    try {
      await createManagedUser({
        username: newUname.trim(),
        password: newPwd,
        displayName: newDname.trim() || newUname.trim(),
        userTags: newTags
          .split(/[,，]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        role: newRole,
      });
      setNewUname('');
      setNewPwd('');
      setNewDname('');
      setNewTags('');
      await onRefreshUsers();
      setMsg('新用户创建成功');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveOtherUserTags = async (u: UserProfile) => {
    const updated = await updateUserAccount(u.id, {
      userTags: editUserTagsStr
        .split(/[,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (currentUser?.id === u.id) onCurrentUserUpdated(updated);
    setEditingUserId(null);
    await onRefreshUsers();
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Current User Profile */}
        <div className={`lg:col-span-5 ${cardCls}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <UserCheck className="h-5 w-5 text-indigo-600" />
              <span>我的账户与阅读统计</span>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              切换其他账号
            </button>
          </div>

          {currentUser && (
            <form onSubmit={handleSaveMyProfile} className="mt-4 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-xs"
                  style={{ backgroundColor: currentUser.avatarColor }}
                >
                  {currentUser.displayName.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span>{currentUser.displayName}</span>
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {currentUser.role === 'admin' ? '公共池管理员' : '研究员成员'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    @{currentUser.username} · 已浏览 {currentUser.readPaperCount ?? 0} 篇 · 累计阅读{' '}
                    {formatDurationZh(currentUser.totalReadSeconds)} · 点赞 {currentUser.likeCount ?? 0} · 收藏 {currentUser.kbCount ?? 0}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">显示名称</label>
                <input type="text" value={myDisplayName} onChange={(e) => setMyDisplayName(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">我的用户标签（逗号分隔，展示在阅读气泡与收藏足迹旁）</label>
                <input
                  type="text"
                  value={myTagsStr}
                  onChange={(e) => setMyTagsStr(e.target.value)}
                  placeholder="例如：多智能体组, 博士生, 柔性制造"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">重置密码（留空则不修改）</label>
                <input
                  type="password"
                  value={myNewPwd}
                  onChange={(e) => setMyNewPwd(e.target.value)}
                  placeholder="输入新密码（至少 4 位）"
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={savingMe}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingMe && <Loader2 className="h-4 w-4 animate-spin" />}
                保存个人设置
              </button>
            </form>
          )}
        </div>

        {/* Right: Member Reading Footprints & Directory */}
        <div className={`space-y-6 lg:col-span-7 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-indigo-600" />
              <span>团队成员阅读活跃度与知识库目录（共 {users.length} 人）</span>
            </div>
          </div>

          {currentUser?.role === 'admin' && (
            <form
              onSubmit={handleAdminCreateUser}
              className={`rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}
            >
              <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                <Shield className="h-4 w-4" />
                管理员快捷新增用户
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <input
                  type="text"
                  value={newUname}
                  onChange={(e) => setNewUname(e.target.value)}
                  placeholder="用户名 *"
                  className={inputCls}
                  required
                />
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="初始密码 *"
                  className={inputCls}
                  required
                />
                <input
                  type="text"
                  value={newDname}
                  onChange={(e) => setNewDname(e.target.value)}
                  placeholder="显示姓名"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="用户标签（逗号分隔）"
                  className={inputCls}
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}
                  className={inputCls}
                >
                  <option value="member">普通成员</option>
                  <option value="admin">管理员</option>
                </select>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  添加用户
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 ${
                  darkMode ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-2xs"
                    style={{ backgroundColor: u.avatarColor }}
                  >
                    {u.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{u.displayName}</span>
                      <span className="text-sm text-slate-400">@{u.username}</span>
                      {u.role === 'admin' && (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          管理员
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-indigo-500" /> 浏览 {u.readPaperCount ?? 0} 篇
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-teal-600" /> 阅读 {formatDurationZh(u.totalReadSeconds)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5 text-rose-500" /> 点赞 {u.likeCount ?? 0}
                      </span>
                    </div>

                    {editingUserId === u.id ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="text"
                          value={editUserTagsStr}
                          onChange={(e) => setEditUserTagsStr(e.target.value)}
                          placeholder="输入标签，逗号分隔"
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveOtherUserTags(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-sm text-white"
                        >
                          <Check className="h-3.5 w-3.5" /> 保存
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {u.userTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onFilterByInteraction && (u.readPaperCount ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => onFilterByInteraction(u.id)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      阅读足迹 ({u.readPaperCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onFilterByUser(u.id)}
                    className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                  >
                    收藏库 ({u.kbCount ?? 0})
                  </button>
                  {currentUser?.role === 'admin' && (
                    <>
                      <button
                        type="button"
                        title="编辑用户标签"
                        onClick={() => {
                          setEditingUserId(u.id);
                          setEditUserTagsStr(u.userTags.join(', '));
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {u.id !== 'usr-admin' && (
                        <button
                          type="button"
                          title="删除用户"
                          onClick={async () => {
                            if (!window.confirm(`确认删除用户 ${u.displayName} (@${u.username}) 吗？`)) return;
                            await deleteUserAccount(u.id);
                            await onRefreshUsers();
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
