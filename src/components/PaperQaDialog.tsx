import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { AcademicPaper, LlmProfile, LlmQaMessage } from '../types/paper';
import { activateLlmProfile, askPaperLlmApi, fetchLlmProfiles, LlmAskError } from '../lib/api';
import { LlmSettingsPanel } from './LlmSettingsPanel';

interface PaperQaDialogProps {
  paper: AcademicPaper;
  allPapers: AcademicPaper[];
  darkMode: boolean;
  onClose: () => void;
  onOpenPaper: (paper: AcademicPaper) => void;
  onGoToUserSettings?: () => void;
}

type QaScope = 'paper_and_related' | 'single_paper' | 'library_wide';

const QUICK_PROMPTS = [
  '请提炼本文的核心方法、创新点与局限性',
  '对比本文与文献库中其他相关论文在方法与场景上的异同',
  '总结本文的实验设计、关键指标与核心结论',
  '结合相关文献，给出 2-3 个可行的延伸研究方向',
];

export const PaperQaDialog: React.FC<PaperQaDialogProps> = ({
  paper,
  allPapers,
  darkMode,
  onClose,
  onOpenPaper,
  onGoToUserSettings,
}) => {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [showInlineConfig, setShowInlineConfig] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const [scope, setScope] = useState<QaScope>('paper_and_related');
  const [extraPaperIds, setExtraPaperIds] = useState<string[]>([]);
  const [showPaperPicker, setShowPaperPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const [messages, setMessages] = useState<LlmQaMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadProfiles = async () => {
    try {
      const list = await fetchLlmProfiles();
      setProfiles(list);
      const active = list.find((p) => p.isActive) || list[0];
      setSelectedProfileId(active?.id || '');
    } catch {
      /* handled cleanly via UI */
    } finally {
      setProfilesLoaded(true);
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  // Reset extra attachments when switching to a different paper
  useEffect(() => {
    setExtraPaperIds([]);
    setShowPaperPicker(false);
  }, [paper.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, showInlineConfig]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || profiles.find((p) => p.isActive) || profiles[0] || null,
    [profiles, selectedProfileId]
  );

  const candidatePapers = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allPapers
      .filter((p) => p.id !== paper.id)
      .filter((p) => {
        if (!q) return true;
        return `${p.title} ${p.titleZh || ''} ${p.journal} ${p.authors.join(' ')} ${(p.keywords || []).join(' ')}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 20);
  }, [allPapers, paper.id, pickerQuery]);

  const extraPaperObjects = useMemo(
    () => extraPaperIds.map((id) => allPapers.find((p) => p.id === id)).filter(Boolean) as AcademicPaper[],
    [extraPaperIds, allPapers]
  );

  const handleSwitchProfile = async (id: string) => {
    setSelectedProfileId(id);
    try {
      const next = await activateLlmProfile(id);
      setProfiles(next);
    } catch {
      /* keep local selection */
    }
  };

  const handleSend = async (customText?: string) => {
    const q = (customText ?? input).trim();
    if (!q || sending) return;

    if (!activeProfile) {
      setShowInlineConfig(true);
      return;
    }

    const userMsg: LlmQaMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!customText) setInput('');
    setSending(true);

    try {
      const historyPayload = messages
        .filter((m) => !m.errorCode)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await askPaperLlmApi({
        paperId: paper.id,
        question: q,
        history: historyPayload,
        profileId: activeProfile.id,
        scope,
        extraPaperIds,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.answer,
          createdAt: new Date().toISOString(),
          model: res.model,
          profileName: res.profileName,
          latencyMs: res.latencyMs,
          usedPapers: res.usedPapers,
        },
      ]);
    } catch (err) {
      const isLlmErr = err instanceof LlmAskError;
      const errCode = isLlmErr ? err.code : 'LLM_ERROR';
      const errHint = isLlmErr ? err.hint : '请检查 API Base URL、API Key 与网络连通性。';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : '智能问答请求失败',
          createdAt: new Date().toISOString(),
          errorCode: errCode,
          errorHint: errHint,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const paperMap = useMemo(() => new Map(allPapers.map((p) => [p.id, p])), [allPapers]);

  if (typeof document === 'undefined') return null;

  // Compact minimized floating pill
  if (minimized) {
    return createPortal(
      <div className="fixed right-5 bottom-5 z-[92]">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="inline-flex items-center gap-2 rounded-full bg-[#0072BD] px-4 py-2.5 font-semibold text-white shadow-xl hover:bg-[#005a96]"
        >
          <Sparkles className="h-4 w-4" />
          <span className="max-w-[220px] truncate">智能问答 · {paper.titleZh || paper.title}</span>
          <X
            className="ml-1 h-4 w-4 opacity-80 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-label="文献智能问答对话框"
      className={`fixed right-4 bottom-4 z-[92] flex h-[660px] max-h-[calc(100dvh-32px)] w-[540px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
        darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      {/* Dialog Header */}
      <div
        className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${
          darkMode ? 'border-slate-800 bg-slate-950/80' : 'border-slate-100 bg-gradient-to-r from-sky-50/90 via-white to-indigo-50/80'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0072BD] text-white">
            <MessageSquareText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white">文献智能问答</span>
            </div>
            <p className="truncate text-slate-500 dark:text-slate-400" title={paper.titleZh || paper.title}>
              {paper.titleZh || paper.title}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowInlineConfig((v) => !v)}
            title="配置或切换大模型 API"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition ${
              showInlineConfig || !activeProfile
                ? 'border-[#0072BD] bg-[#0072BD] text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] hover:text-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>API</span>
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              title="清空对话"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMinimized(true)}
            title="最小化对话框"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭 (ESC)"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub-bar: CCSwitch Active Profile Selector + Cross-Paper Context Scope */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 ${
          darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['paper_and_related', '本文+关联文献'],
              ['single_paper', '仅当前文献'],
              ['library_wide', '全库跨文献'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`rounded-lg px-2.5 py-0.5 font-medium transition ${
                scope === id
                  ? 'bg-[#0072BD] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPaperPicker((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-medium ${
              showPaperPicker || extraPaperIds.length > 0
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            指定文献{extraPaperIds.length > 0 ? ` (${extraPaperIds.length})` : ''}
          </button>
        </div>

        {profiles.length > 0 && (
          <select
            aria-label="切换大模型配置"
            value={activeProfile?.id || ''}
            onChange={(e) => void handleSwitchProfile(e.target.value)}
            className={`max-w-[190px] truncate rounded-lg border px-2 py-0.5 font-mono outline-none ${
              darkMode ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.model})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Manually Attached Extra Papers Chips */}
      {extraPaperObjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-1.5 dark:border-slate-800">
          <span className="text-slate-500">已附加对比：</span>
          {extraPaperObjects.map((ep) => (
            <span
              key={ep.id}
              className="inline-flex max-w-[230px] items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
            >
              <span className="truncate">{ep.titleZh || ep.title}</span>
              <button
                type="button"
                onClick={() => setExtraPaperIds((prev) => prev.filter((x) => x !== ep.id))}
                className="shrink-0 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Collapsible Extra-Paper Picker */}
      {showPaperPicker && (
        <div
          className={`max-h-52 overflow-y-auto border-b p-3 ${
            darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="搜索库内其他论文标题、作者或关键词进行联动对比…"
              className={`flex-1 rounded-lg border px-2.5 py-1 outline-none focus:border-[#0072BD] ${
                darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPaperPicker(false)}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              收起
            </button>
          </div>
          <div className="space-y-1">
            {candidatePapers.map((cp) => {
              const checked = extraPaperIds.includes(cp.id);
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() =>
                    setExtraPaperIds((prev) =>
                      prev.includes(cp.id) ? prev.filter((id) => id !== cp.id) : [...prev.slice(0, 5), cp.id]
                    )
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
                    checked
                      ? 'bg-[#0072BD]/10 font-semibold text-[#0072BD] dark:bg-sky-900/40 dark:text-sky-300'
                      : 'hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-[#0072BD] bg-[#0072BD] text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {checked ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-50" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{cp.titleZh || cp.title}</span>
                  <span className="shrink-0 font-mono text-slate-400">{(cp.publishedDate || '').slice(0, 4)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content: Either Inline API Config Panel OR Chat Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {showInlineConfig ? (
          <div className="space-y-3">
            <LlmSettingsPanel
              darkMode={darkMode}
              compact
              onProfilesChanged={(list) => {
                setProfiles(list);
                const act = list.find((p) => p.isActive) || list[0];
                setSelectedProfileId(act?.id || '');
              }}
              onDone={() => setShowInlineConfig(false)}
            />
            {onGoToUserSettings && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToUserSettings();
                  }}
                  className="font-medium text-[#0072BD] hover:underline dark:text-sky-400"
                >
                  前往「我的账户」管理完整 API 设置 →
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Friendly Prompt When No API Profile Is Configured Yet */}
            {profilesLoaded && !activeProfile && (
              <div
                className={`rounded-2xl border p-4 ${
                  darkMode ? 'border-amber-800/70 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50/90 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-2">
                    <div className="font-bold">请先配置您自己的大模型 API Key</div>
                    <p className="leading-relaxed opacity-90">
                      本平台采用自主接入模式，支持填写任意 OpenAI 兼容或 Anthropic 协议的 Base URL、API Key 与模型名称（如 DeepSeek、GPT-4o、通义千问、Claude 中转或本地 Ollama）。
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowInlineConfig(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0072BD] px-3.5 py-1.5 font-semibold text-white hover:bg-[#005a96]"
                      >
                        <Settings2 className="h-4 w-4" /> 立即在此配置 API
                      </button>
                      {onGoToUserSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onGoToUserSettings();
                          }}
                          className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-800 dark:text-amber-200"
                        >
                          前往用户设置
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty Chat Welcome + Quick Prompts */}
            {messages.length === 0 && activeProfile && (
              <div className="space-y-3">
                <div
                  className={`rounded-xl border p-3.5 ${
                    darkMode ? 'border-slate-800 bg-slate-800/50' : 'border-slate-200/80 bg-slate-50/80'
                  }`}
                >
                  <p className="leading-relaxed text-slate-700 dark:text-slate-200">
                    已就绪（当前模型：<strong className="font-mono text-[#0072BD] dark:text-sky-400">{activeProfile.model}</strong>）。
                    您可以直接针对本篇文献提问，也可以跨文献对比分析课题组或文献库中的其他相关论文。
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-slate-500">快捷提问：</div>
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSend(q)}
                      className={`block w-full rounded-xl border px-3.5 py-2 text-left transition ${
                        darkMode
                          ? 'border-slate-800 bg-slate-800/40 text-slate-200 hover:border-sky-500'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] hover:bg-sky-50/40'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message History */}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-[#0072BD] px-3.5 py-2.5 leading-relaxed text-white">
                    {m.content}
                  </div>
                ) : m.errorCode ? (
                  <div className="w-full rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <div className="flex items-start gap-2 font-semibold">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <span>{m.content}</span>
                    </div>
                    {m.errorHint && <p className="mt-1.5 leading-relaxed opacity-90">{m.errorHint}</p>}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineConfig(true)}
                        className="rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-700"
                      >
                        检查 / 修改 API 配置
                      </button>
                      {onGoToUserSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onGoToUserSettings();
                          }}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-1 font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-800 dark:text-rose-300"
                        >
                          前往用户设置
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`w-full rounded-2xl rounded-bl-sm border p-3.5 ${
                      darkMode ? 'border-slate-800 bg-slate-800/70 text-slate-100' : 'border-slate-200/90 bg-slate-50/80 text-slate-800'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>

                    {/* Referenced Papers Chips (Primary + Auto/Manual Related Papers) */}
                    {m.usedPapers && m.usedPapers.length > 0 && (
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 dark:border-slate-700">
                        <div className="mb-1.5 flex items-center gap-1 font-semibold text-slate-500">
                          <BookOpen className="h-3.5 w-3.5" /> 本次回答参考的文献 ({m.usedPapers.length})：
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.usedPapers.map((rp) => {
                            const target = paperMap.get(rp.id);
                            return (
                              <button
                                key={rp.id}
                                type="button"
                                disabled={!target}
                                onClick={() => target && onOpenPaper(target)}
                                title={`${rp.titleZh || rp.title}（${rp.reason}）`}
                                className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-0.5 text-left transition ${
                                  rp.isPrimary
                                    ? 'border-[#0072BD]/40 bg-sky-50 text-[#0072BD] dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <span className="truncate">{rp.titleZh || rp.title}</span>
                                <span className="shrink-0 font-mono opacity-65">{rp.year}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Meta Footer */}
                    <div className="mt-2 flex items-center justify-between gap-2 text-slate-400">
                      <span className="font-mono">
                        {m.profileName || m.model} {m.latencyMs ? `· ${(m.latencyMs / 1000).toFixed(1)}s` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(m.id, m.content)}
                        className="inline-flex items-center gap-1 hover:text-[#0072BD]"
                      >
                        {copiedId === m.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedId === m.id ? '已复制' : '复制'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-[#0072BD]" />
                <span>正在结合文献内容与关联论文进行思考…</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Input Bar */}
      {!showInlineConfig && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className={`flex items-end gap-2 border-t p-3 ${
            darkMode ? 'border-slate-800 bg-slate-950/70' : 'border-slate-100 bg-slate-50/70'
          }`}
        >
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              activeProfile
                ? '输入问题（Enter 发送，Shift+Enter 换行；支持跨文献对比提问）…'
                : '请先点击上方「立即在此配置 API」后再提问…'
            }
            className={`flex-1 resize-none rounded-xl border px-3 py-2 outline-none focus:border-[#0072BD] ${
              darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
            }`}
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && Boolean(activeProfile))}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0072BD] px-4 font-semibold text-white hover:bg-[#005a96] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>发送</span>
          </button>
        </form>
      )}
    </div>,
    document.body
  );
};
