import React, { useState } from 'react';
import { Clock, Database, Globe, Loader2, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import type { AutoSyncConfig } from '../types/paper';
import type { StorageStats } from '../lib/api';

interface ArchitectureModalProps {
  autoSyncConfig: AutoSyncConfig | null;
  storage: StorageStats | null;
  darkMode: boolean;
  onUpdateConfig: (patch: Partial<AutoSyncConfig>) => Promise<void>;
  onTriggerSync: () => Promise<void>;
}

export const ArchitectureObservatory: React.FC<ArchitectureModalProps> = ({
  autoSyncConfig,
  storage,
  darkMode,
  onUpdateConfig,
  onTriggerSync,
}) => {
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const cardCls = `rounded-2xl border p-5 ${
    darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
  }`;

  const handleToggleAuto = async () => {
    if (!autoSyncConfig) return;
    setSaving(true);
    try {
      await onUpdateConfig({ enabled: !autoSyncConfig.enabled });
    } finally {
      setSaving(false);
    }
  };

  const handleWindowChange = async (targetWindow: 'yesterday_today' | 'last_3_days') => {
    setSaving(true);
    try {
      await onUpdateConfig({ targetWindow });
    } finally {
      setSaving(false);
    }
  };

  const handleIntervalChange = async (intervalHours: number) => {
    setSaving(true);
    try {
      await onUpdateConfig({ intervalHours });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Auto-Crawler Scheduler Card */}
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
              <Clock className="h-4 w-4" />
              <span>每日自动抓论文调度器</span>
            </div>
            <button
              type="button"
              disabled={saving || !autoSyncConfig}
              onClick={handleToggleAuto}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                autoSyncConfig?.enabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {autoSyncConfig?.enabled ? '自动追踪已开启' : '已暂停'}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            后台定时任务每日自动检索 <strong>arXiv（cs.CV / cs.RO / cs.CL / cs.AI）</strong> 与{' '}
            <strong>OpenAlex 制造期刊索引</strong>，拉取昨天与今天新发表文献并去重入库。
          </p>

          <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">检索时间窗</span>
              <select
                value={autoSyncConfig?.targetWindow || 'yesterday_today'}
                onChange={(e) => void handleWindowChange(e.target.value as 'yesterday_today' | 'last_3_days')}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="yesterday_today">昨天 + 今天 (24~48h)</option>
                <option value="last_3_days">最近 3 天</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">自动轮询周期</span>
              <select
                value={autoSyncConfig?.intervalHours || 6}
                onChange={(e) => void handleIntervalChange(Number(e.target.value))}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value={2}>每 2 小时</option>
                <option value={6}>每 6 小时</option>
                <option value={12}>每 12 小时</option>
                <option value={24}>每 24 小时</option>
              </select>
            </div>
            <div className="flex items-center justify-between font-mono-code text-[11px]">
              <span className="text-slate-500">最近自动同步:</span>
              <span>{autoSyncConfig?.lastAutoSyncAt ? autoSyncConfig.lastAutoSyncAt.slice(0, 16).replace('T', ' ') : '启动中'}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await onTriggerSync();
              } finally {
                setSyncing(false);
              }
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            立即检索昨天与今天最新文献
          </button>
        </div>

        {/* Storage & CRUD */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <Database className="h-4 w-4" />
            <span>个人文献库本地持久化 (SQLite WAL)</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            所有十维精读笔记、引用拓扑节点、阅读状态与星标收藏均真实持久化于本地 SQLite 数据库（<code className="font-mono-code">data/paperpulse.db</code>），支持完整增删改查。
          </p>
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 font-mono-code text-xs dark:bg-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">文献总量:</span>
              <span className="font-bold">{storage?.totalPapers ?? 0} 篇</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">精读笔记:</span>
              <span className="font-bold">{storage?.totalComments ?? 0} 条</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">库文件体积:</span>
              <span className="font-bold text-emerald-600">{storage?.sizeKB ?? 0} KB</span>
            </div>
          </div>
        </div>

        {/* Domain Access */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-sm font-bold text-sky-600 dark:text-sky-400">
            <Globe className="h-4 w-4" />
            <span>自定义域名与实时公网访问</span>
          </div>
          <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>
              <strong>1. 单端口同源运行：</strong>运行 <code className="font-mono-code">npm run build && npm start</code>，Express 在 3000 端口同时提供前端页面与数据库 API。
            </p>
            <p>
              <strong>2. 零公网IP绑定自有域名：</strong>使用 Cloudflare Tunnel（<code className="font-mono-code">cloudflared tunnel --url http://localhost:3000</code>）映射至您的域名（如 <code className="font-mono-code">lib.yourdomain.com</code>）即可随时 HTTPS 访问个人文献库。
            </p>
            <p>
              <strong>3. 云服务器部署：</strong>部署至 Linux 服务器后配置 Nginx 反代与 Let&apos;s Encrypt 证书，后台自动定时器会每日持续为您抓取最新论文。
            </p>
          </div>
        </div>
      </div>

      {/* Real Sync Logs */}
      <div className={cardCls}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Server className="h-4 w-4 text-indigo-600" />
            <span>实时文献抓取与入库审计日志</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            SQLite 持久化在线
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                <th className="py-2">执行时间</th>
                <th className="py-2">触发源</th>
                <th className="py-2">新增文献数</th>
                <th className="py-2">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(storage?.recentSyncs ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="py-2 font-mono-code text-slate-500">{log.syncedAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="py-2 font-mono-code font-semibold text-indigo-600">{log.source}</td>
                  <td className="py-2 font-mono-code font-bold text-emerald-600">+{log.addedCount}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-300">{log.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
