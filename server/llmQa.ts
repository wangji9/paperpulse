import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  AcademicPaper,
  LlmProfile,
  LlmProtocol,
  LlmReferencedPaper,
  LlmTestResult,
  UserProfile,
} from '../src/types/paper.js';
import { getPaperById, listPapers } from './db.js';
import { listLabEntries } from './labLibrary.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const db = new DatabaseSync(path.join(DATA_DIR, 'paperpulse.db'));

db.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS user_llm_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.3,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_llm_profiles_user ON user_llm_profiles(user_id);
`);

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  protocol: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function maskApiKey(key: string): string {
  const k = key.trim();
  if (!k) return '';
  if (k.length <= 8) return `${k.slice(0, 2)}••••`;
  return `${k.slice(0, 5)}••••••${k.slice(-4)}`;
}

function rowToPublic(row: ProfileRow): LlmProfile {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: row.base_url,
    apiKeyMasked: maskApiKey(row.api_key),
    hasApiKey: Boolean(row.api_key && row.api_key.trim()),
    model: row.model,
    temperature: Number.isFinite(row.temperature) ? row.temperature : 0.3,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listUserLlmProfiles(userId: string): LlmProfile[] {
  const rows = db
    .prepare('SELECT * FROM user_llm_profiles WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC')
    .all(userId) as unknown as ProfileRow[];
  return rows.map(rowToPublic);
}

function getRawProfile(userId: string, profileId?: string): ProfileRow | null {
  if (profileId) {
    const exact = db
      .prepare('SELECT * FROM user_llm_profiles WHERE id = ? AND user_id = ?')
      .get(profileId, userId) as unknown as ProfileRow | undefined;
    if (exact) return exact;
  }
  const active = db
    .prepare('SELECT * FROM user_llm_profiles WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1')
    .get(userId) as unknown as ProfileRow | undefined;
  if (active) return active;
  const fallback = db
    .prepare('SELECT * FROM user_llm_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(userId) as unknown as ProfileRow | undefined;
  return fallback || null;
}

export function upsertUserLlmProfile(
  userId: string,
  body: {
    id?: string;
    name?: string;
    protocol?: LlmProtocol;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    isActive?: boolean;
  }
): { profile: LlmProfile; profiles: LlmProfile[] } {
  const name = String(body.name || '').trim().slice(0, 80);
  const protocol: LlmProtocol = body.protocol === 'anthropic' ? 'anthropic' : 'openai';
  const baseUrl = String(body.baseUrl || '').trim().slice(0, 400);
  const model = String(body.model || '').trim().slice(0, 140);
  const rawKey = typeof body.apiKey === 'string' ? body.apiKey.trim().slice(0, 500) : '';
  const temp = Math.max(0, Math.min(2, Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.3));

  if (!name) throw Object.assign(new Error('请填写配置名称（例如 DeepSeek / GPT-4o / 自定义）'), { status: 400 });
  if (!baseUrl || !/^https?:\/\/[^\s]+$/i.test(baseUrl)) {
    throw Object.assign(new Error('Base URL 格式不正确，请以 http:// 或 https:// 开头'), { status: 400 });
  }
  if (!model) throw Object.assign(new Error('请输入模型名称（例如 deepseek-chat / gpt-4o-mini / qwen-plus）'), { status: 400 });

  const now = new Date().toISOString();
  const existing = body.id
    ? (db.prepare('SELECT * FROM user_llm_profiles WHERE id = ? AND user_id = ?').get(body.id, userId) as unknown as ProfileRow | undefined)
    : undefined;

  const finalKey = rawKey || existing?.api_key || '';
  if (!finalKey) {
    throw Object.assign(new Error('请填写 API Key'), { status: 400 });
  }

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM user_llm_profiles WHERE user_id = ?').get(userId) as { cnt: number };
  const shouldActivate = body.isActive === true || (!existing && countRow.cnt === 0) || existing?.is_active === 1;

  if (shouldActivate) {
    db.prepare('UPDATE user_llm_profiles SET is_active = 0 WHERE user_id = ?').run(userId);
  }

  let savedId: string;
  if (existing) {
    savedId = existing.id;
    db.prepare(
      `UPDATE user_llm_profiles
       SET name = ?, protocol = ?, base_url = ?, api_key = ?, model = ?, temperature = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(name, protocol, baseUrl, finalKey, model, temp, shouldActivate ? 1 : 0, now, savedId, userId);
  } else {
    savedId = `llm-${randomUUID().slice(0, 12)}`;
    db.prepare(
      `INSERT INTO user_llm_profiles(id, user_id, name, protocol, base_url, api_key, model, temperature, is_active, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(savedId, userId, name, protocol, baseUrl, finalKey, model, temp, shouldActivate ? 1 : 0, now, now);
  }

  const saved = db.prepare('SELECT * FROM user_llm_profiles WHERE id = ? AND user_id = ?').get(savedId, userId) as unknown as ProfileRow;
  return { profile: rowToPublic(saved), profiles: listUserLlmProfiles(userId) };
}

export function activateUserLlmProfile(userId: string, profileId: string): LlmProfile[] {
  const row = db
    .prepare('SELECT id FROM user_llm_profiles WHERE id = ? AND user_id = ?')
    .get(profileId, userId) as { id: string } | undefined;
  if (!row) throw Object.assign(new Error('该模型配置不存在'), { status: 404 });
  db.prepare('UPDATE user_llm_profiles SET is_active = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE user_llm_profiles SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(
    new Date().toISOString(),
    profileId,
    userId
  );
  return listUserLlmProfiles(userId);
}

export function deleteUserLlmProfile(userId: string, profileId: string): LlmProfile[] {
  const row = db
    .prepare('SELECT id, is_active FROM user_llm_profiles WHERE id = ? AND user_id = ?')
    .get(profileId, userId) as { id: string; is_active: number } | undefined;
  if (!row) throw Object.assign(new Error('该模型配置不存在'), { status: 404 });
  db.prepare('DELETE FROM user_llm_profiles WHERE id = ? AND user_id = ?').run(profileId, userId);
  if (row.is_active === 1) {
    const next = db
      .prepare('SELECT id FROM user_llm_profiles WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(userId) as { id: string } | undefined;
    if (next) {
      db.prepare('UPDATE user_llm_profiles SET is_active = 1 WHERE id = ?').run(next.id);
    }
  }
  return listUserLlmProfiles(userId);
}

export function resolveLlmEndpoint(baseUrl: string, protocol: LlmProtocol): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (protocol === 'anthropic') {
    if (/\/messages$/i.test(clean)) return clean;
    if (/\/v\d+$/i.test(clean)) return `${clean}/messages`;
    return `${clean}/v1/messages`;
  }
  if (/\/chat\/completions$/i.test(clean)) return clean;
  if (/\/(?:v\d+|openai|compatible-mode\/v\d+)$/i.test(clean)) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

export interface FriendlyLlmError {
  code: string;
  error: string;
  hint: string;
  httpStatus?: number;
}

function extractUpstreamErrorMessage(rawText: string): string {
  try {
    const j = JSON.parse(rawText) as {
      error?: { message?: string; type?: string; code?: string } | string;
      message?: string;
      detail?: string;
    };
    if (typeof j.error === 'string' && j.error.trim()) return j.error.trim().slice(0, 260);
    if (j.error && typeof j.error === 'object' && j.error.message) return String(j.error.message).slice(0, 260);
    if (j.message) return String(j.message).slice(0, 260);
    if (j.detail) return String(j.detail).slice(0, 260);
  } catch {
    /* plain text */
  }
  return rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

export function classifyHttpError(status: number, rawBody: string, model: string): FriendlyLlmError {
  const detail = extractUpstreamErrorMessage(rawBody);
  const suffix = detail ? `（上游返回：${detail}）` : '';

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_ERROR',
      httpStatus: status,
      error: `API Key 鉴权失败或权限不足（HTTP ${status}）${suffix}`,
      hint: '请核对 API Key 是否复制完整、是否已过期，或当前密钥是否开通了该模型的调用权限。',
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      httpStatus: status,
      error: `接口路径或模型「${model}」不存在（HTTP 404）${suffix}`,
      hint: '请检查 Base URL 是否正确（部分接口需包含 /v1 或 /v4），以及模型名称拼写是否与服务商一致。',
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMIT',
      httpStatus: status,
      error: `请求频率超限或账户余额不足（HTTP 429）${suffix}`,
      hint: '请稍等几秒后重试，或前往模型服务商控制台检查账户额度与限流状态。',
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      httpStatus: status,
      error: `模型参数或接口协议不匹配（HTTP ${status}）${suffix}`,
      hint: '请确认协议类型（OpenAI 兼容 / Anthropic）与所填 Base URL、模型名称是否匹配。',
    };
  }
  if (status >= 500) {
    return {
      code: 'UPSTREAM_ERROR',
      httpStatus: status,
      error: `上游模型服务暂时异常（HTTP ${status}）${suffix}`,
      hint: '目标模型平台可能正在波动或维护，请稍后重试，或在配置中一键切换至其他备用 API。',
    };
  }
  return {
    code: 'HTTP_ERROR',
    httpStatus: status,
    error: `模型接口返回异常状态（HTTP ${status}）${suffix}`,
    hint: '请检查 Base URL 与模型配置，并点击「测试连通性」排查。',
  };
}

export function classifyNetworkError(err: unknown): FriendlyLlmError {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  const code = String(e?.cause?.code || e?.code || '').toUpperCase();
  const msg = `${e?.name || ''} ${e?.message || ''} ${e?.cause?.message || ''}`;

  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || code === 'ETIMEDOUT' || /timeout|timed out|aborted/i.test(msg)) {
    return {
      code: 'TIMEOUT',
      error: '连接模型服务超时，长时间未收到响应',
      hint: '目标接口可能网络受限或响应过慢；若调用海外官方 API，请改用国内可直连的中转 Base URL。',
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo|enotfound/i.test(msg)) {
    return {
      code: 'DNS_ERROR',
      error: '域名无法解析，无法访问该 Base URL',
      hint: '请检查 Base URL 域名拼写是否正确，并确认服务器网络可访问该域名。',
    };
  }
  if (code === 'ECONNREFUSED' || /econnrefused/i.test(msg)) {
    return {
      code: 'CONNECTION_REFUSED',
      error: '目标服务拒绝连接（Connection Refused）',
      hint: '请确认端口号无误，且本地 Ollama / vLLM / 代理中转服务已正常运行。',
    };
  }
  if (/CERT_|SSL|TLS|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(`${code} ${msg}`)) {
    return {
      code: 'TLS_ERROR',
      error: 'HTTPS 安全证书校验失败',
      hint: '请检查中转服务的 SSL/TLS 证书是否有效，或确认是否误填了 http/https 协议头。',
    };
  }
  if (
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNRESET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    /fetch failed|network|socket|unreachable|reset/i.test(msg)
  ) {
    return {
      code: 'NETWORK_UNREACHABLE',
      error: '网络不可达或连接被上游中断',
      hint: '服务器当前网络无法直连该地址；如调用 OpenAI / Claude 官方接口，请填写可连通的中转 Base URL。',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    error: e?.message ? `调用模型失败：${e.message}` : '调用模型时发生未知网络错误',
    hint: '请检查 Base URL、API Key 与模型名称，并尝试点击「测试连通性」。',
  };
}

async function callUpstreamLlm(params: {
  protocol: LlmProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; latencyMs: number; endpoint: string }> {
  const endpoint = resolveLlmEndpoint(params.baseUrl, params.protocol);
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('invalid_protocol');
    }
  } catch {
    throw {
      code: 'INVALID_URL',
      error: 'Base URL 格式不正确',
      hint: '请输入有效的 http:// 或 https:// 地址，例如 https://api.deepseek.com/v1',
    } as FriendlyLlmError;
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs || 55000);

  try {
    let headers: Record<string, string>;
    let bodyObj: Record<string, unknown>;

    if (params.protocol === 'anthropic') {
      const systemMsg = params.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const chatMsgs = params.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      };
      bodyObj = {
        model: params.model,
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature ?? 0.3,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: chatMsgs,
      };
    } else {
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      };
      bodyObj = {
        model: params.model,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens || 2048,
        messages: params.messages,
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;
    const rawText = await res.text();
    if (!res.ok) {
      throw classifyHttpError(res.status, rawText, params.model);
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw {
        code: 'INVALID_RESPONSE',
        error: '模型接口返回的不是合法 JSON 数据',
        hint: '请检查 Base URL 是否误指向了网页登录页或错误的接口路径。',
      } as FriendlyLlmError;
    }

    let content = '';
    if (params.protocol === 'anthropic') {
      const blocks = Array.isArray(data.content) ? (data.content as Array<{ type?: string; text?: string }>) : [];
      content = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
    } else {
      const choices = Array.isArray(data.choices)
        ? (data.choices as Array<{ message?: { content?: string; reasoning_content?: string }; text?: string }>)
        : [];
      const first = choices[0];
      content = String(first?.message?.content || first?.text || '').trim();
    }

    if (!content) {
      throw {
        code: 'EMPTY_RESPONSE',
        error: '模型返回了空内容',
        hint: '请检查模型名称是否正确，或尝试降低上下文长度后重试。',
      } as FriendlyLlmError;
    }

    return { text: content, latencyMs, endpoint };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && 'hint' in err) {
      throw err;
    }
    throw classifyNetworkError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function testUserLlmConnection(
  userId: string,
  payload: {
    profileId?: string;
    protocol?: LlmProtocol;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }
): Promise<LlmTestResult> {
  const saved = payload.profileId ? getRawProfile(userId, payload.profileId) : null;
  const protocol: LlmProtocol = payload.protocol || (saved?.protocol === 'anthropic' ? 'anthropic' : 'openai');
  const baseUrl = (payload.baseUrl || saved?.base_url || '').trim();
  const apiKey = (payload.apiKey || saved?.api_key || '').trim();
  const model = (payload.model || saved?.model || '').trim();

  if (!baseUrl || !apiKey || !model) {
    return {
      ok: false,
      latencyMs: 0,
      code: 'MISSING_CONFIG',
      error: '配置信息不完整，无法测试连通性',
      hint: '请先填写完整的 Base URL、API Key 与模型名称。',
    };
  }

  const t0 = Date.now();
  try {
    const out = await callUpstreamLlm({
      protocol,
      baseUrl,
      apiKey,
      model,
      temperature: 0,
      maxTokens: 32,
      timeoutMs: 20000,
      messages: [{ role: 'user', content: '请仅回复 "OK" 两个字母以确认连通性。' }],
    });
    return {
      ok: true,
      latencyMs: out.latencyMs,
      model,
      endpoint: out.endpoint,
      replyPreview: out.text.slice(0, 60),
    };
  } catch (err) {
    const f = err as FriendlyLlmError;
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      model,
      code: f.code || 'UNKNOWN_ERROR',
      error: f.error || '连接测试失败',
      hint: f.hint || '请检查网络与 API 配置。',
    };
  }
}

function tokenizeQuery(text: string): string[] {
  const cleaned = text.toLowerCase();
  const enTokens = cleaned.match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
  const zhChunks = cleaned.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const zhBigrams: string[] = [];
  for (const chunk of zhChunks) {
    zhBigrams.push(chunk);
    if (chunk.length > 2) {
      for (let i = 0; i < Math.min(chunk.length - 1, 12); i++) {
        zhBigrams.push(chunk.slice(i, i + 2));
      }
    }
  }
  return Array.from(new Set([...enTokens, ...zhBigrams]));
}

function formatPaperContextBlock(paper: AcademicPaper, tag: string, detailed: boolean): string {
  const yr = (paper.publishedDate || '').slice(0, 4) || '未知年份';
  const lines: string[] = [
    `【${tag}】${paper.titleZh || paper.title}`,
    paper.title && paper.titleZh && paper.title !== paper.titleZh ? `英文标题：${paper.title}` : '',
    `作者：${(paper.authors || []).join(', ')}｜期刊/会议：${paper.journal}｜年份：${yr}${paper.doi ? `｜DOI: ${paper.doi}` : ''}`,
    paper.keywords?.length ? `关键词：${paper.keywords.slice(0, 12).join('、')}` : '',
    paper.abstractZh ? `中文摘要：${paper.abstractZh.slice(0, detailed ? 2400 : 850)}` : '',
    paper.abstractOriginal && (!paper.abstractZh || detailed)
      ? `英文摘要：${paper.abstractOriginal.slice(0, detailed ? 2000 : 650)}`
      : '',
  ];

  const a = paper.anatomy;
  if (a) {
    if (detailed) {
      if (a.background) lines.push(`研究背景：${a.background.slice(0, 700)}`);
      if (a.problem) lines.push(`核心问题：${a.problem.slice(0, 700)}`);
      if (a.proposedMethod) lines.push(`核心方法：${a.proposedMethod.slice(0, 1400)}`);
      if (a.experimentalValidation) lines.push(`实验验证：${a.experimentalValidation.slice(0, 1100)}`);
      if (a.conclusion) lines.push(`主要结论：${a.conclusion.slice(0, 800)}`);
      if (a.futureAndLimitations?.paperLimitations?.length) {
        lines.push(`局限性：${a.futureAndLimitations.paperLimitations.slice(0, 4).join('；')}`);
      }
      if (a.paperFigures?.length) {
        const figSummary = a.paperFigures
          .slice(0, 10)
          .map((f) => `${f.label}: ${(f.captionZh || f.captionOriginal || '').slice(0, 150)}`)
          .join(' | ');
        lines.push(`论文插图图注：${figSummary}`);
      }
    } else {
      if (a.proposedMethod) lines.push(`方法要点：${a.proposedMethod.slice(0, 420)}`);
      if (a.conclusion) lines.push(`核心结论：${a.conclusion.slice(0, 320)}`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

export async function askPaperQuestion(
  user: UserProfile,
  payload: {
    paperId?: string;
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    profileId?: string;
    scope?: 'paper_and_related' | 'single_paper' | 'library_wide';
    extraPaperIds?: string[];
  }
): Promise<{
  answer: string;
  model: string;
  profileName: string;
  latencyMs: number;
  usedPapers: LlmReferencedPaper[];
}> {
  const question = String(payload.question || '').trim();
  if (!question) {
    throw Object.assign(new Error('请输入您想咨询的问题'), { status: 400, code: 'EMPTY_QUESTION' });
  }

  const profile = getRawProfile(user.id, payload.profileId);
  if (!profile || !profile.api_key || !profile.base_url || !profile.model) {
    throw Object.assign(new Error('尚未配置大模型 API，请先在设置中填写 Base URL、API Key 与模型名称'), {
      status: 400,
      code: 'NO_API_CONFIG',
      hint: '点击右上角「API 设置」或前往「我的账户 → 大模型 API 配置」添加您的密钥后即可使用。',
    });
  }

  const scope = payload.scope || 'paper_and_related';
  const primaryPaper = payload.paperId ? getPaperById(payload.paperId, user.id) : null;

  // Gather candidate pool (lab library first + public pool)
  const labEntries = listLabEntries(user);
  const labIdSet = new Set(labEntries.map((e) => e.paperId));
  const poolPapers = listPapers({}, user.id);
  const byId = new Map<string, AcademicPaper>();
  for (const e of labEntries) byId.set(e.paperId, e.paper);
  for (const p of poolPapers) if (!byId.has(p.id)) byId.set(p.id, p);
  if (primaryPaper) byId.set(primaryPaper.id, primaryPaper);

  const usedPapers: LlmReferencedPaper[] = [];
  const contextBlocks: string[] = [];
  const includedIds = new Set<string>();

  if (primaryPaper) {
    includedIds.add(primaryPaper.id);
    contextBlocks.push(formatPaperContextBlock(primaryPaper, '当前主文献', true));
    usedPapers.push({
      id: primaryPaper.id,
      title: primaryPaper.title,
      titleZh: primaryPaper.titleZh,
      year: (primaryPaper.publishedDate || '').slice(0, 4),
      journal: primaryPaper.journalShort || primaryPaper.journal,
      isPrimary: true,
      reason: '当前聚焦文献',
    });
  }

  // Always include any manually attached extra papers
  const extraIds = Array.isArray(payload.extraPaperIds) ? payload.extraPaperIds.slice(0, 6) : [];
  let relIdx = 0;
  for (const eid of extraIds) {
    if (includedIds.has(eid)) continue;
    const ep = byId.get(eid);
    if (!ep) continue;
    includedIds.add(ep.id);
    relIdx++;
    contextBlocks.push(formatPaperContextBlock(ep, `关联文献 ${relIdx}（用户指定）`, false));
    usedPapers.push({
      id: ep.id,
      title: ep.title,
      titleZh: ep.titleZh,
      year: (ep.publishedDate || '').slice(0, 4),
      journal: ep.journalShort || ep.journal,
      isPrimary: false,
      reason: '手动关联文献',
    });
  }

  // Automatically rank & attach related papers across lab library + pool when scope allows
  if (scope !== 'single_paper') {
    const qTokens = tokenizeQuery(question);
    const primaryTopics = new Set(primaryPaper?.topics || []);
    const primaryKws = new Set((primaryPaper?.keywords || []).map((k) => k.toLowerCase()));
    const primaryIsLab = primaryPaper ? labIdSet.has(primaryPaper.id) : false;

    const scored: Array<{ paper: AcademicPaper; score: number; reason: string }> = [];
    for (const cand of byId.values()) {
      if (includedIds.has(cand.id)) continue;
      const hay = `${cand.title} ${cand.titleZh || ''} ${cand.abstractOriginal || ''} ${cand.abstractZh || ''} ${(cand.keywords || []).join(' ')} ${(cand.authors || []).join(' ')} ${cand.journal} ${cand.publishedDate}`.toLowerCase();

      let qHits = 0;
      for (const tok of qTokens) {
        if (hay.includes(tok)) qHits += tok.length >= 4 ? 2.2 : 1.2;
      }

      let topicHits = 0;
      for (const t of cand.topics || []) if (primaryTopics.has(t)) topicHits++;

      let kwHits = 0;
      for (const k of cand.keywords || []) if (primaryKws.has(k.toLowerCase())) kwHits++;

      const sameLabBonus = primaryIsLab && labIdSet.has(cand.id) ? 1.8 : labIdSet.has(cand.id) ? 0.6 : 0;
      const score = qHits * 2.4 + topicHits * 1.6 + kwHits * 1.8 + sameLabBonus;
      if (score > 1.2) {
        const reason =
          qHits >= 2
            ? labIdSet.has(cand.id)
              ? '问题语义高相关（课题组）'
              : '问题语义高相关'
            : labIdSet.has(cand.id)
              ? '课题组同方向相关文献'
              : '同主题关联文献';
        scored.push({ paper: cand, score, reason });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const maxAuto = scope === 'library_wide' ? 6 : 4;
    for (const item of scored.slice(0, maxAuto)) {
      if (includedIds.size >= 8) break;
      includedIds.add(item.paper.id);
      relIdx++;
      contextBlocks.push(formatPaperContextBlock(item.paper, `关联文献 ${relIdx}`, false));
      usedPapers.push({
        id: item.paper.id,
        title: item.paper.title,
        titleZh: item.paper.titleZh,
        year: (item.paper.publishedDate || '').slice(0, 4),
        journal: item.paper.journalShort || item.paper.journal,
        isPrimary: false,
        reason: item.reason,
      });
    }
  }

  const systemPrompt = [
    '你是 PaperPulse 学术科研智能助手，擅长深度文献解读、跨文献对比分析与研究方向推演。',
    '回答要求：',
    '1. 严格基于下方提供的【当前主文献】与【关联文献】内容作答，不编造未给出的数据或实验结果；若材料未提及某个细节，请明确指出并可结合通用学术背景补充分析。',
    '2. 当涉及跨文献对比或关联分析时，明确标明文献标题或编号（如「当前主文献」「关联文献 1」），结构清晰（可用分点或简明对比表）。',
    '3. 默认使用简洁专业的中文回答（专业术语可保留英文对照）。',
    '',
    '=== 可用文献上下文 ===',
    contextBlocks.join('\n\n---\n\n'),
  ].join('\n');

  const safeHistory = (Array.isArray(payload.history) ? payload.history : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 3000) }));

  const out = await callUpstreamLlm({
    protocol: profile.protocol === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: profile.base_url,
    apiKey: profile.api_key,
    model: profile.model,
    temperature: profile.temperature,
    maxTokens: 2048,
    timeoutMs: 65000,
    messages: [{ role: 'system', content: systemPrompt }, ...safeHistory, { role: 'user', content: question }],
  });

  return {
    answer: out.text,
    model: profile.model,
    profileName: profile.name,
    latencyMs: out.latencyMs,
    usedPapers,
  };
}
