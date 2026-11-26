import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  PlugZap,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { LlmProfile, LlmProtocol, LlmTestResult } from '../types/paper';
import {
  activateLlmProfile,
  deleteLlmProfile,
  fetchLlmProfiles,
  saveLlmProfile,
  testLlmProfileApi,
} from '../lib/api';

interface ProviderTemplate {
  label: string;
  name: string;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
}

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { label: 'DeepSeek', name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '通义千问', name: '通义千问 Qwen', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', name: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '硅基流动', name: 'SiliconFlow', protocol: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
  { label: 'Claude', name: 'Claude (Anthropic)', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { label: '本地 Ollama', name: '本地 Ollama', protocol: 'openai', baseUrl: 'http://host.docker.internal:11434/v1', model: 'qwen2.5:7b' },
];

interface LlmSettingsPanelProps {
  darkMode: boolean;
  compact?: boolean;
  onProfilesChanged?: (profiles: LlmProfile[]) => void;
  onDone?: () => void;
}

export const LlmSettingsPanel: React.FC<LlmSettingsPanelProps> = ({
  darkMode,
  compact = false,
  onProfilesChanged,
  onDone,
}) => {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<LlmProtocol>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, LlmTestResult>>({});
  const [formTestResult, setFormTestResult] = useState<LlmTestResult | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const list = await fetchLlmProfiles();
      setProfiles(list);
      onProfilesChanged?.(list);
      if (list.length === 0) setShowForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载大模型配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setProtocol('openai');
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setShowKey(false);
    setFormTestResult(null);
    setError('');
  };

  const applyTemplate = (tpl: ProviderTemplate) => {
    setName(tpl.name);
    setProtocol(tpl.protocol);
    setBaseUrl(tpl.baseUrl);
    setModel(tpl.model);
    setFormTestResult(null);
    setError('');
  };

  const startEdit = (p: LlmProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setProtocol(p.protocol);
    setBaseUrl(p.baseUrl);
    setApiKey('');
    setModel(p.model);
    setShowKey(false);
    setFormTestResult(null);
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { profiles: next } = await saveLlmProfile({
        id: editingId || undefined,
        name: name.trim(),
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        isActive: true,
      });
      setProfiles(next);
      onProfilesChanged?.(next);
      setNotice(editingId ? '模型配置已更新并启用' : '新模型配置已保存并设为当前启用');
      resetForm();
      setShowForm(false);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestForm = async () => {
    setTestingId('form');
    setFormTestResult(null);
    setError('');
    try {
      const res = await testLlmProfileApi({
        profileId: editingId || undefined,
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
      });
      setFormTestResult(res);
    } finally {
      setTestingId(null);
    }
  };

  const handleTestSaved = async (p: LlmProfile) => {
    setTestingId(p.id);
    try {
      const res = await testLlmProfileApi({ profileId: p.id });
      setTestResults((prev) => ({ ...prev, [p.id]: res }));
    } finally {
      setTestingId(null);
    }
  };

  const handleActivate = async (id: string) => {
    setError('');
    try {
      const next = await activateLlmProfile(id);
      setProfiles(next);
      onProfilesChanged?.(next);
      setNotice('已切换当前默认大模型配置');
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    }
  };

  const handleDelete = async (p: LlmProfile) => {
    if (!window.confirm(`确认删除配置「${p.name}」吗？`)) return;
    setError('');
    try {
      const next = await deleteLlmProfile(p.id);
      setProfiles(next);
      onProfilesChanged?.(next);
      if (next.length === 0) setShowForm(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const inputCls = `w-full rounded-xl border px-3 py-2 outline-none focus:border-[#0072BD] ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  return (
    <section
      className={
        compact
          ? 'space-y-3'
          : `rounded-2xl border p-6 ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'}`
      }
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[#0072BD]" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            大模型 API 配置切换器
          </h3>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#0072BD] dark:bg-sky-950/60 dark:text-sky-300">
            {profiles.length} 套配置
          </span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3.5 py-1.5 font-semibold text-white hover:bg-[#005a96]"
          >
            <Plus className="h-4 w-4" /> 新增 API 配置
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Saved Multi-Profile Switcher (CCSwitch Style) */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#0072BD]" /> 正在读取模型配置…
        </div>
      ) : profiles.length > 0 ? (
        <div className={`grid grid-cols-1 gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
          {profiles.map((p) => {
            const tr = testResults[p.id];
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-3.5 transition ${
                  p.isActive
                    ? darkMode
                      ? 'border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/40'
                      : 'border-[#0072BD] bg-sky-50/40 ring-1 ring-[#0072BD]/20'
                    : darkMode
                      ? 'border-slate-800 bg-slate-800/40'
                      : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                      {p.isActive && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                          当前启用
                        </span>
                      )}
                      <span className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {p.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0072BD] dark:text-sky-400">
                        <Cpu className="h-3.5 w-3.5" /> {p.model}
                      </span>
                      <span>·</span>
                      <span className="truncate">{p.apiKeyMasked}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-slate-500 dark:text-slate-400" title={p.baseUrl}>
                      {p.baseUrl}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!p.isActive && (
                    <button
                      type="button"
                      onClick={() => void handleActivate(p.id)}
                      className="rounded-lg bg-[#0072BD] px-3 py-1 font-semibold text-white hover:bg-[#005a96]"
                    >
                      一键切换启用
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={testingId === p.id}
                    onClick={() => void handleTestSaved(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {testingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                    测试连通性
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> 编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(p)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    title="删除该配置"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {tr && (
                  <div
                    className={`mt-2.5 rounded-lg border px-3 py-2 ${
                      tr.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                    }`}
                  >
                    {tr.ok ? (
                      <div className="flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>连通正常！模型响应耗时 {tr.latencyMs} ms</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5 font-semibold">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{tr.error}</span>
                        </div>
                        {tr.hint && <p className="opacity-90">{tr.hint}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`rounded-xl border border-dashed p-3.5 ${
            darkMode ? 'border-slate-700 bg-slate-800/40 text-slate-300' : 'border-amber-300 bg-amber-50/70 text-amber-900'
          }`}
        >
          您尚未配置个人大模型 API Key。请填写下方 Base URL、API Key 与模型名称并保存，密钥仅归您本人账号私密保存与调用。
        </div>
      )}

      {/* Add / Edit Profile Form */}
      {showForm && (
        <form
          onSubmit={handleSave}
          className={`space-y-3.5 rounded-xl border p-4 ${
            darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 text-[#0072BD]" />
              {editingId ? '编辑大模型配置' : '添加大模型 API 配置'}
            </span>
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                取消
              </button>
            )}
          </div>

          {/* One-Click Provider Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500">快捷填充模板：</span>
            {PROVIDER_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">配置名称 *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：DeepSeek / 我的中转 GPT-4o"
                className={inputCls}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">接口协议</span>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as LlmProtocol)}
                className={inputCls}
              >
                <option value="openai">OpenAI 兼容协议（通用推荐）</option>
                <option value="anthropic">Anthropic Claude 协议</option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block font-medium">Base URL *</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="例如：https://api.deepseek.com/v1 或您的中转地址"
                className={`${inputCls} font-mono`}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">
                API Key {editingId ? '（留空则保留原密钥）' : '*'}
              </span>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={editingId ? '留空不修改已保存密钥' : 'sk-...'}
                  className={`${inputCls} pr-10 font-mono`}
                  required={!editingId}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title={showKey ? '隐藏密钥' : '显示密钥'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">模型名称（自由输入）*</span>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="例如：deepseek-chat / gpt-4o-mini / qwen-plus"
                className={`${inputCls} font-mono`}
                required
              />
            </label>
          </div>

          {formTestResult && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 ${
                formTestResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {formTestResult.ok ? (
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    连接成功！模型「{formTestResult.model}」响应正常（耗时 {formTestResult.latencyMs} ms）
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formTestResult.error}</span>
                  </div>
                  {formTestResult.hint && <p className="opacity-90">{formTestResult.hint}</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={testingId === 'form'}
              onClick={() => void handleTestForm()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {testingId === 'form' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              测试连通性
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-5 py-2 font-semibold text-white hover:bg-[#005a96] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存并设为默认
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
