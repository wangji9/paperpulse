import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Edit3, Loader2, Plus, Shield, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import type { UserProfile } from '../types/paper';
import {
  createManagedUser,
  deleteUserAccount,
  loginAccount,
  registerAccount,
  updateUserAccount,
} from '../lib/api';

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
      aria-label="用户登录与注册"
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
              账号登录
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
              注册账号
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
              placeholder="请输入用户名（如 zhangsan 或 admin）"
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
              placeholder="请输入密码（至少 4 位）"
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
                  placeholder="例如：张同学 / 李老师"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">个人方向标签（用逗号分隔）</label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="例如：具身智能, 知识图谱, 课题组A"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {tab === 'login' && (
            <div className={`rounded-xl p-3 text-sm ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
              公共文献池管理员默认账号：<span className="font-semibold text-indigo-600 dark:text-indigo-400">admin</span>，密码：<span className="font-semibold text-indigo-600 dark:text-indigo-400">admin123</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {tab === 'login' ? '立即登录' : '注册并自动登录'}
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
  onOpenAuth: () => void;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  currentUser,
  users,
  darkMode,
  onRefreshUsers,
  onCurrentUserUpdated,
  onFilterByUser,
  onOpenAuth,
}) => {
  const [myDisplayName, setMyDisplayName] = useState(currentUser?.displayName || '');
  const [myTagsStr, setMyTagsStr] = useState((currentUser?.userTags || []).join(', '));
  const [myNewPwd, setMyNewPwd] = useState('');
  const [savingMe, setSavingMe] = useState(false);

  // Admin create user state
  const [newUname, setNewUname] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newDname, setNewDname] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');
  const [creating, setCreating] = useState(false);

  // Admin inline tag edit
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
        {/* Left: Current User Profile or Login Prompt */}
        <div className={`lg:col-span-5 ${cardCls}`}>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            <span>我的账户与标签设置</span>
          </div>

          {currentUser ? (
            <form onSubmit={handleSaveMyProfile} className="mt-4 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                  style={{ backgroundColor: currentUser.avatarColor }}
                >
                  {currentUser.displayName.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span>{currentUser.displayName}</span>
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-sm text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {currentUser.role === 'admin' ? '公共池管理员' : '研究员用户'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">账号：{currentUser.username} · 个人知识库已选 {currentUser.kbCount ?? 0} 篇</div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">显示名称</label>
                <input type="text" value={myDisplayName} onChange={(e) => setMyDisplayName(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">我的用户标签（逗号分隔，展示在选入的文献旁）</label>
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
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                您当前以访客身份浏览公共文献池。登录或注册后即可从公共文献池挑选感兴趣的论文进入<strong>我的个人知识库</strong>，设置专属用户标签，并发表署名评论与深度思考。
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                立即登录 / 注册新用户
              </button>
            </div>
          )}
        </div>

        {/* Right: Admin Add User (if admin) + Member Directory */}
        <div className={`space-y-6 lg:col-span-7 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-indigo-600" />
              <span>研究成员与知识库目录（共 {users.length} 人）</span>
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
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: u.avatarColor }}
                  >
                    {u.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{u.displayName}</span>
                      <span className="text-sm text-slate-400">@{u.username}</span>
                      {u.role === 'admin' && (
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          管理员
                        </span>
                      )}
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
                        {u.userTags.length > 0 ? (
                          u.userTags.map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400">未设置标签</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onFilterByUser(u.id)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                  >
                    已收录 {u.kbCount ?? 0} 篇 · 查看
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
