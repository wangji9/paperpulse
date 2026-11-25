import React, { useState } from 'react';
import { BookOpen, Loader2, RefreshCw } from 'lucide-react';
import type { AutoSyncConfig } from '../types/paper';
import type { StorageStats } from '../lib/api';
import { TRACKED_JOURNALS } from '../lib/constants';

interface Props {
  autoSyncConfig: AutoSyncConfig | null;
  storage: StorageStats | null;
  darkMode: boolean;
  onUpdateConfig: (patch: Partial<AutoSyncConfig>) => Promise<void>;
  onTriggerSync: () => Promise<void>;
}

export const ArchitectureObservatory: React.FC<Props> = ({ autoSyncConfig, storage, darkMode, onUpdateConfig, onTriggerSync }) => {
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const card = `rounded-2xl border p-6 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'}`;
  const select = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800';

  const update = async (patch: Partial<AutoSyncConfig>) => {
    setBusy(true);
    try {
      await onUpdateConfig(patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">每日自动追踪</h2>
            <button
              type="button"
              disabled={busy || !autoSyncConfig}
              onClick={() => update({ enabled: !autoSyncConfig?.enabled })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${autoSyncConfig?.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
            >
              {autoSyncConfig?.enabled ? '已开启' : '已暂停'}
            </button>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">检索范围</span>
              <select value={autoSyncConfig?.targetWindow || 'yesterday_today'} onChange={(e) => update({ targetWindow: e.target.value as AutoSyncConfig['targetWindow'] })} className={select}>
                <option value="yesterday_today">昨天与今天</option>
                <option value="last_3_days">最近三天</option>
                <option value="current_year">优先本年度论文</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">检索周期</span>
              <select value={autoSyncConfig?.intervalHours || 6} onChange={(e) => update({ intervalHours: Number(e.target.value) })} className={select}>
                <option value={2}>每 2 小时</option>
                <option value={6}>每 6 小时</option>
                <option value={12}>每 12 小时</option>
                <option value={24}>每 24 小时</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">上次同步</span>
              <span>{autoSyncConfig?.lastAutoSyncAt ? autoSyncConfig.lastAutoSyncAt.slice(0, 16).replace('T', ' ') : '—'}</span>
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
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            立即拉取最新文献
          </button>
        </div>

        <div className={card}>
          <h2 className="text-lg font-semibold">文献库存储</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">文献数量</span>
              <span className="font-medium">{storage?.totalPapers ?? 0} 篇</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">笔记数量</span>
              <span className="font-medium">{storage?.totalComments ?? 0} 条</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">数据库大小</span>
              <span className="font-medium">{storage?.sizeKB ?? 0} KB</span>
            </div>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">自动收录的期刊与顶会（{TRACKED_JOURNALS.length}）</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {TRACKED_JOURNALS.map((j) => (
            <span
              key={j.short}
              title={j.full}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200"
            >
              {j.short}
            </span>
          ))}
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-lg font-semibold">同步记录</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                <th className="px-3 py-2 font-semibold">时间</th>
                <th className="px-3 py-2 font-semibold">来源</th>
                <th className="px-3 py-2 font-semibold">新增</th>
                <th className="px-3 py-2 font-semibold">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(storage?.recentSyncs ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2">{log.syncedAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="px-3 py-2">{log.source.replace('manual_live_sync', '手动同步').replace('auto_startup_daily_sync', '启动自动同步').replace('auto_scheduled_daily_sync', '定时自动同步')}</td>
                  <td className="px-3 py-2">+{log.addedCount}</td>
                  <td className="px-3 py-2">{log.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
