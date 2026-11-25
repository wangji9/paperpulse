import React from 'react';
import { CheckCircle2, Database, Globe, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import type { AnalyticsResponse } from '../lib/api';

interface ArchitectureModalProps {
  analytics: AnalyticsResponse | null;
  darkMode: boolean;
}

export const ArchitectureObservatory: React.FC<ArchitectureModalProps> = ({ analytics, darkMode }) => {
  const cardCls = `rounded-2xl border p-5 ${
    darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-xs'
  }`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400">
            <Database className="h-4 w-4" />
            <span>持久化存储与数据库状态 (SQLite WAL)</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            当前系统采用 Node.js 24 原生内置 SQLite（WAL 并发日志模式）持久化存储文献十维结构、对比指标、消融数据、点赞收藏及同行批注，支持随时平滑升级至 PostgreSQL / pgvector。
          </p>
          <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 font-mono-code text-xs dark:bg-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">数据库文件:</span>
              <span className="truncate max-w-[180px] font-semibold">data/paperpulse.db</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">当前占用:</span>
              <span className="font-semibold text-emerald-600">{analytics?.storage.sizeKB ?? 0} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">入库文献 / 批注:</span>
              <span className="font-semibold">
                {analytics?.storage.totalPapers ?? 0} 篇 / {analytics?.storage.totalComments ?? 0} 条
              </span>
            </div>
          </div>
        </div>

        <div className={cardCls}>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <RefreshCw className="h-4 w-4" />
            <span>完整 CRUD 接口与每日实时追踪管线</span>
          </div>
          <ul className="mt-2.5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                <strong>Create / Import</strong>：支持 <code className="font-mono-code">POST /api/papers/import</code> 通过 arXiv ID/DOI 抓取，或完整十维录入 <code className="font-mono-code">POST /api/papers</code>。
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                <strong>Read / Filter</strong>：<code className="font-mono-code">GET /api/papers</code> 支持关键词、制造/CS领域、5大AI方向、期刊、数据集类型多维毫秒级检索。
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                <strong>Update / Engage</strong>：<code className="font-mono-code">PUT /api/papers/:id</code> 与 <code className="font-mono-code">PATCH /engage</code> 实时更新十维剖析与点赞收藏。
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>
                <strong>Delete</strong>：<code className="font-mono-code">DELETE /api/papers/:id</code> 级联清理文献与附属批注。
              </span>
            </li>
          </ul>
        </div>

        <div className={cardCls}>
          <div className="flex items-center gap-2 text-sm font-bold text-sky-600 dark:text-sky-400">
            <Globe className="h-4 w-4" />
            <span>实时域名访问与生产部署方案</span>
          </div>
          <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>
              <strong>1. 单体同源托管：</strong>运行 <code className="font-mono-code">npm run build && npm start</code>，Express 在单端口同时托管前端静态构建产物与 <code className="font-mono-code">/api/*</code>，零跨域问题。
            </p>
            <p>
              <strong>2. 零公网IP秒级映射自定义域名：</strong>使用 <strong>Cloudflare Tunnel</strong>（<code className="font-mono-code">cloudflared tunnel --url http://localhost:3000</code>）即可将您购买的域名（如 <code className="font-mono-code">papers.yourdomain.com</code>）直接 HTTPS 实时访问本机服务。
            </p>
            <p>
              <strong>3. 云服务器正式部署：</strong>部署至阿里云/腾讯云/VPS 后，通过 Nginx 反向代理 + Certbot 自动续期 Let&apos;s Encrypt SSL 证书，配合 cron 每日定时调用 <code className="font-mono-code">POST /api/sync</code> 实现 24 小时自动更新。
            </p>
          </div>
        </div>
      </div>

      {/* Sync Audit Logs */}
      <div className={cardCls}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Server className="h-4 w-4 text-indigo-600" />
            <span>近期实时追踪同步审计日志</span>
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
                <th className="py-2">同步时间</th>
                <th className="py-2">数据源</th>
                <th className="py-2">新增数量</th>
                <th className="py-2">备注说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(analytics?.storage.recentSyncs ?? []).map((log) => (
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
