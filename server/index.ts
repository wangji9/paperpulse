import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper, AutoSyncConfig, EntryType, ReadingStatus, UserProfile } from '../src/types/paper.js';
import {
  addComment,
  deleteComment,
  deletePaper,
  deleteUserById,
  getAutoSyncConfig,
  getDatabaseStats,
  getPaperById,
  getUserByToken,
  initDatabase,
  listAllUsers,
  listPapers,
  loginUser,
  logoutSession,
  paperExistsByTitleOrDoi,
  recordPaperReading,
  recordSyncLog,
  registerUser,
  removeUserKbItem,
  saveAutoSyncConfig,
  toggleCommentLike,
  togglePaperLike,
  updateComment,
  updatePaperLibraryState,
  updateUserProfile,
  upsertPaper,
  upsertUserKbItem,
} from './db.js';
import {
  buildStructuredAnatomy,
  fetchSingleByArxivOrDoi,
  fetchYesterdayTodayFromArxiv,
  fetchYesterdayTodayFromOpenAlex,
  rawToAcademicPaper,
  reparseExistingPaper,
  translateToZh,
} from './liveFetcher.js';
import { PAPER_ASSETS_DIR, extractOriginalPaperMedia } from './paperMediaExtractor.js';

initDatabase();

process.on('unhandledRejection', (reason) => {
  console.error('[PaperPulse] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[PaperPulse] Uncaught Exception:', err);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));


function extractUser(req: express.Request): UserProfile | null {
  const authHeader = req.headers.authorization || '';
  const cookieToken = /(?:^|;\s*)paperpulse_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : cookieToken;
  return getUserByToken(token);
}

// Mandatory Login Gate Middleware: unauthenticated callers cannot view platform content
const requireAuth: express.RequestHandler = (req, res, next) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录您的账户后再查看平台内容', code: 'AUTH_REQUIRED' });
    return;
  }
  next();
};

let syncInProgress = false;

export async function runAutoDailySync(triggerLabel: string, query?: string): Promise<{
  syncedAt: string;
  addedCount: number;
  addedPapers: AcademicPaper[];
  source: string;
}> {
  if (syncInProgress) {
    return {
      syncedAt: new Date().toISOString(),
      addedCount: 0,
      addedPapers: [],
      source: '同步进行中',
    };
  }
  syncInProgress = true;
  try {
    const cfg = getAutoSyncConfig();
    const daysBack = cfg.targetWindow === 'last_3_days' ? 3 : 1;

    const [arxivPapers, oaPapers] = await Promise.all([
      fetchYesterdayTodayFromArxiv(daysBack),
      fetchYesterdayTodayFromOpenAlex(daysBack, query),
    ]);

    const combined = [...arxivPapers, ...oaPapers];
    const addedPapers: AcademicPaper[] = [];

    for (const raw of combined) {
      if (!paperExistsByTitleOrDoi(raw.title, raw.doi)) {
        const paper = await rawToAcademicPaper(raw);
        const media = await extractOriginalPaperMedia(paper);
        paper.anatomy.paperFigures = media.paperFigures;
        paper.anatomy.paperTables = media.paperTables;
        upsertPaper(paper);
        addedPapers.push(paper);
        if (addedPapers.length >= 5) break;
      }
    }

    const nowIso = new Date().toISOString();
    const nextDate = new Date(Date.now() + cfg.intervalHours * 3600 * 1000).toISOString();
    saveAutoSyncConfig({
      ...cfg,
      lastAutoSyncAt: nowIso,
      nextAutoSyncAt: nextDate,
    });

    recordSyncLog(
      triggerLabel,
      addedPapers.length,
      `自动检索16本制造与AI核心期刊及arXiv/OpenAlex最新文献（候选 ${combined.length} 篇），新增入库 ${addedPapers.length} 篇`
    );

    return {
      syncedAt: nowIso,
      addedCount: addedPapers.length,
      addedPapers,
      source: 'arXiv + OpenAlex',
    };
  } finally {
    syncInProgress = false;
  }
}

/* ---------- Auth & User Management APIs ---------- */
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, displayName, userTags } = req.body as {
      username?: string;
      password?: string;
      displayName?: string;
      userTags?: string[];
    };
    if (!username || !password) {
      res.status(400).json({ error: '请输入用户名和密码' });
      return;
    }
    const result = registerUser({ username, password, displayName, userTags });
    res.cookie('paperpulse_session', result.token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '注册失败' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: '请输入用户名和密码' });
      return;
    }
    const result = loginUser(username, password);
    res.cookie('paperpulse_session', result.token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : '登录失败' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const cookieToken = /(?:^|;\s*)paperpulse_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : cookieToken;
  if (token) logoutSession(token);
  res.clearCookie('paperpulse_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = extractUser(req);
  res.json({ user });
});

app.use('/paper-assets', requireAuth, express.static(PAPER_ASSETS_DIR));

// Protect all platform data endpoints behind mandatory account authentication
app.use('/api/users', requireAuth);
app.use('/api/kb', requireAuth);
app.use('/api/papers', requireAuth);
app.use('/api/sync', requireAuth);
app.use('/api/auto-sync', requireAuth);

app.get('/api/users', (_req, res) => {
  res.json({ users: listAllUsers() });
});

app.post('/api/users', (req, res) => {
  const actor = extractUser(req);
  if (!actor || actor.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可创建管理用户' });
    return;
  }
  try {
    const { username, password, displayName, userTags, role } = req.body as {
      username?: string;
      password?: string;
      displayName?: string;
      userTags?: string[];
      role?: 'admin' | 'member';
    };
    if (!username || !password) {
      res.status(400).json({ error: '请输入用户名和密码' });
      return;
    }
    const created = registerUser({ username, password, displayName, userTags, role });
    res.status(201).json({ user: created.user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '创建用户失败' });
  }
});

app.put('/api/users/:id', (req, res) => {
  const actor = extractUser(req);
  if (!actor || (actor.id !== req.params.id && actor.role !== 'admin')) {
    res.status(403).json({ error: '无权修改该用户信息' });
    return;
  }
  try {
    const { username, displayName, userTags, role, newPassword } = req.body;
    const updated = updateUserProfile(req.params.id, {
      username: actor.role === 'admin' ? username : undefined,
      displayName, userTags,
      role: actor.role === 'admin' ? role : undefined,
      newPassword,
    });
    if (!updated) { res.status(404).json({ error: '用户不存在' }); return; }
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '更新失败' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const actor = extractUser(req);
  if (!actor || actor.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可删除用户' });
    return;
  }
  const ok = deleteUserById(req.params.id);
  if (!ok) {
    res.status(400).json({ error: '无法删除默认管理员或用户不存在' });
    return;
  }
  res.json({ deleted: true });
});

/* ---------- Personal Knowledge Base Selection APIs ---------- */
app.post('/api/kb/:paperId', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录后再将文献加入个人知识库' });
    return;
  }
  const { personalTags, readingStatus } = (req.body as { personalTags?: string[]; readingStatus?: ReadingStatus }) || {};
  const ok = upsertUserKbItem(user.id, req.params.paperId, { personalTags, readingStatus });
  if (!ok) {
    res.status(404).json({ error: '文献不存在' });
    return;
  }
  res.json({ paper: getPaperById(req.params.paperId, user.id) });
});

app.delete('/api/kb/:paperId', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  removeUserKbItem(user.id, req.params.paperId);
  res.json({ paper: getPaperById(req.params.paperId, user.id) });
});

/* ---------- Health & Papers CRUD ---------- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'PaperPulse Collaborative Library',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/papers', (req, res) => {
  const user = extractUser(req);
  const {
    q,
    domain,
    topic,
    journal,
    datasetType,
    bookmarked,
    readingStatus,
    recentOnly,
    date,
    scope,
    collectedBy,
    interactedBy,
  } = req.query;
  const papers = listPapers(
    {
      q: typeof q === 'string' ? q : undefined,
      domain: typeof domain === 'string' ? domain : undefined,
      topic: typeof topic === 'string' ? topic : undefined,
      journal: typeof journal === 'string' ? journal : undefined,
      datasetType: typeof datasetType === 'string' ? datasetType : undefined,
      bookmarked: bookmarked === 'true',
      readingStatus: typeof readingStatus === 'string' ? readingStatus : undefined,
      recentOnly: recentOnly === 'true',
      date: typeof date === 'string' ? date : undefined,
      scope: scope === 'my_kb' ? 'my_kb' : 'pool',
      collectedByUserId: typeof collectedBy === 'string' ? collectedBy : undefined,
      interactedByUserId: typeof interactedBy === 'string' ? interactedBy : undefined,
    },
    user?.id
  );
  res.json({ papers, total: papers.length });
});

app.get('/api/papers/:id', (req, res) => {
  const user = extractUser(req);
  const paper = getPaperById(req.params.id, user?.id);
  if (!paper) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper });
});

// Create paper (also auto-parses abstract into Chinese structured anatomy & adds to user's KB if logged in)
app.post('/api/papers', async (req, res) => {
  try {
    const user = extractUser(req);
    const body = req.body as Partial<AcademicPaper> & { quickAbstract?: string; addToMyKb?: boolean; personalTags?: string[] };
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: '请输入论文标题' });
      return;
    }

    const abstractText = body.abstractOriginal || body.quickAbstract || body.digestSummary || body.title.trim();
    const zhAbs = await translateToZh(abstractText, 1100);
    const generated = buildStructuredAnatomy(
      {
        title: body.title.trim(),
        abstract: abstractText,
        authors: body.authors ?? ['未知作者'],
        affiliations: body.affiliations ?? [],
        journal: body.journal || 'arXiv',
        journalShort: body.journalShort || 'Custom',
        publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
        doi: body.doi || `local-${Date.now()}`,
        url: body.url || '#',
        citedByCount: body.citedByCount || 0,
        citations: body.citations || [],
        sourceOrigin: 'user_created',
      },
      zhAbs
    );

    const paper: AcademicPaper = {
      id: body.id || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openAlexId: body.openAlexId,
      title: body.title.trim(),
      titleZh: body.titleZh?.trim() || (await translateToZh(body.title.trim(), 300)) || body.title.trim(),
      authors: body.authors?.length ? body.authors : ['未知作者'],
      affiliations: body.affiliations?.length ? body.affiliations : [],
      journal: body.journal?.trim() || 'arXiv',
      journalShort: body.journalShort?.trim() || 'Custom',
      journalRank: body.journalRank?.trim() || '',
      domain: body.domain || generated.domain,
      topics: body.topics?.length ? body.topics : generated.topics,
      publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
      syncedAt: new Date().toISOString(),
      doi: body.doi?.trim() || '',
      url: body.url?.trim() || '#',
      sourceOrigin: 'user_created',
      abstractOriginal: abstractText,
      digestSummary: body.digestSummary?.trim() || generated.digestSummary,
      tags: body.tags?.length ? body.tags : generated.tags,
      citedByCount: Number(body.citedByCount || 0),
      citations: body.citations ?? [],
      readingStatus: body.readingStatus || 'unread',
      isBookmarked: false,
      anatomy: body.anatomy && body.anatomy.background ? body.anatomy : generated.anatomy,
      comments: [],
    };

    upsertPaper(paper, user?.id);
    if (user && body.addToMyKb !== false) {
      upsertUserKbItem(user.id, paper.id, { personalTags: body.personalTags || [] });
    }
    res.status(201).json({ paper: getPaperById(paper.id, user?.id) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '创建文献失败' });
  }
});

// Import by DOI / arXiv ID / OpenAlex ID / Keyword (auto-parses content, affiliations & citations; adds to user's KB if logged in)
app.post('/api/papers/import', async (req, res) => {
  try {
    const user = extractUser(req);
    const { identifier, addToMyKb, personalTags } = req.body as {
      identifier?: string;
      addToMyKb?: boolean;
      personalTags?: string[];
    };
    if (!identifier || !identifier.trim()) {
      res.status(400).json({ error: '请输入 arXiv 编号、DOI 或论文标题' });
      return;
    }

    const raw = await fetchSingleByArxivOrDoi(identifier);
    if (!raw) {
      res.status(404).json({ error: '未能匹配到该文献，请检查编号或改用手动录入' });
      return;
    }

    if (paperExistsByTitleOrDoi(raw.title, raw.doi)) {
      const existing = listPapers({ q: raw.title }, user?.id)[0];
      if (existing && user && addToMyKb !== false) {
        upsertUserKbItem(user.id, existing.id, { personalTags });
      }
      res.json({ paper: existing ? getPaperById(existing.id, user?.id) : null, alreadyExists: true });
      return;
    }

    const newPaper = await rawToAcademicPaper(raw);
    const media = await extractOriginalPaperMedia(newPaper);
    newPaper.anatomy.paperFigures = media.paperFigures;
    newPaper.anatomy.paperTables = media.paperTables;
    upsertPaper(newPaper, user?.id);
    if (user && addToMyKb !== false) {
      upsertUserKbItem(user.id, newPaper.id, { personalTags });
    }
    recordSyncLog(raw.sourceOrigin, 1, `导入并自动解析文献：${raw.title.slice(0, 60)}`);
    res.status(201).json({ paper: getPaperById(newPaper.id, user?.id), alreadyExists: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '导入解析失败' });
  }
});

// Auto-reparse & enrich paper content, affiliations, and citations
app.post('/api/papers/:id/reparse', async (req, res) => {
  try {
    const user = extractUser(req);
    const existing = getPaperById(req.params.id, user?.id);
    if (!existing) {
      res.status(404).json({ error: 'Paper not found' });
      return;
    }
    const enriched = await reparseExistingPaper(existing);
    const media = await extractOriginalPaperMedia(enriched);
    if (media.paperFigures.length > 0) enriched.anatomy.paperFigures = media.paperFigures;
    if (media.paperTables.length > 0) enriched.anatomy.paperTables = media.paperTables;
    const saved = upsertPaper(enriched, user?.id);
    res.json({ paper: saved });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '自动解析失败' });
  }
});

// Upload / Paste Original Figure or Experimental Table Image for a Paper
app.post('/api/papers/:id/media', async (req, res) => {
  try {
    const user = extractUser(req);
    const existing = getPaperById(req.params.id, user?.id);
    if (!existing) {
      res.status(404).json({ error: 'Paper not found' });
      return;
    }
    const { kind, dataUrl, label, captionOriginal, analysisZh } = req.body as {
      kind: 'method_figure' | 'experiment_figure' | 'table_image';
      dataUrl: string;
      label?: string;
      captionOriginal?: string;
      analysisZh?: string;
    };
    const m = (dataUrl || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
    if (!m) {
      res.status(400).json({ error: '请上传有效的图片文件或粘贴截图' });
      return;
    }
    const ext = m[1].includes('jpeg') || m[1].includes('jpg') ? 'jpg' : m[1].includes('webp') ? 'webp' : 'png';
    const buf = Buffer.from(m[2], 'base64');
    const safeId = existing.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const dir = path.join(PAPER_ASSETS_DIR, safeId);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `upload_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(dir, fileName), buf);
    const publicUrl = `/paper-assets/${safeId}/${fileName}`;

    const curFigs = [...(existing.anatomy.paperFigures || [])];
    const curTbls = [...(existing.anatomy.paperTables || [])];

    if (kind === 'table_image') {
      const idx = curTbls.length + 1;
      curTbls.push({
        id: `tbl-up-${Date.now()}`,
        label: label?.trim() || `Table ${idx}`,
        imageUrl: publicUrl,
        captionOriginal: captionOriginal?.trim() || '',
        analysisZh: analysisZh?.trim() || `Table ${idx} 原文实验图表解析：${(existing.anatomy.experimentalValidation || existing.anatomy.conclusion).slice(0, 120)}`,
      });
    } else {
      const idx = curFigs.length + 1;
      curFigs.push({
        id: `fig-up-${Date.now()}`,
        label: label?.trim() || `Figure ${idx}`,
        url: publicUrl,
        captionOriginal: captionOriginal?.trim() || '',
        analysisZh:
          analysisZh?.trim() ||
          `Figure ${idx} 原图解析：${(kind === 'method_figure' ? existing.anatomy.proposedMethod : existing.anatomy.experimentalValidation).slice(0, 120)}`,
        category: kind === 'experiment_figure' ? 'experiment' : 'method',
      });
    }

    const updated: AcademicPaper = {
      ...existing,
      anatomy: {
        ...existing.anatomy,
        paperFigures: curFigs,
        paperTables: curTbls,
      },
    };
    const saved = upsertPaper(updated, user?.id);
    res.json({ paper: saved });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '上传图表失败' });
  }
});

app.put('/api/papers/:id', (req, res) => {
  const user = extractUser(req);
  const existing = getPaperById(req.params.id, user?.id);
  if (!existing) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }

  const patch = req.body as Partial<AcademicPaper>;
  const updated: AcademicPaper = {
    ...existing,
    ...patch,
    id: existing.id,
    anatomy: patch.anatomy ? { ...existing.anatomy, ...patch.anatomy } : existing.anatomy,
    comments: existing.comments,
  };

  const saved = upsertPaper(updated, user?.id);
  res.json({ paper: saved });
});

app.patch('/api/papers/:id/status', (req, res) => {
  const user = extractUser(req);
  const { isBookmarked, readingStatus } = req.body as { isBookmarked?: boolean; readingStatus?: ReadingStatus };
  const updated = updatePaperLibraryState(req.params.id, { isBookmarked, readingStatus }, user?.id);
  if (!updated) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper: updated });
});

app.delete('/api/papers/:id', (req, res) => {
  const user = extractUser(req);
  if (user && user.role !== 'admin') {
    // Non-admin removes from their own knowledge base instead of deleting from public pool
    removeUserKbItem(user.id, req.params.id);
    res.json({ deletedFromKbOnly: true, id: req.params.id });
    return;
  }
  const ok = deletePaper(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

/* ---------- Social Reading Traces, Likes & Comments CRUD ---------- */
app.post('/api/papers/:id/read', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  const { incrementVisit, addDwellSeconds, visitId, elapsedSeconds } = (req.body as {
    visitId?: string; elapsedSeconds?: number;
    incrementVisit?: boolean;
    addDwellSeconds?: number;
  }) || {};
  const paper = recordPaperReading(user.id, req.params.id, { incrementVisit, addDwellSeconds, visitId, elapsedSeconds });
  if (!paper) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper });
});

app.post('/api/papers/:id/like', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  const paper = togglePaperLike(user.id, req.params.id);
  if (!paper) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper });
});

app.post('/api/papers/:id/comments', (req, res) => {
  const user = extractUser(req);
  const { author, role, content, entryType, parentId, replyToAuthor } = req.body as {
    author?: string;
    role?: string;
    content?: string;
    entryType?: EntryType;
    parentId?: string;
    replyToAuthor?: string;
  };
  if (!content || !content.trim()) {
    res.status(400).json({ error: '内容不能为空' });
    return;
  }
  const comment = addComment({
    paperId: req.params.id,
    entryType,
    user,
    author,
    role,
    content,
    parentId,
    replyToAuthor,
  });
  if (!comment) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.status(201).json({ comment });
});

app.post('/api/papers/:id/comments/:commentId/like', (req, res) => {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  const comment = toggleCommentLike(user.id, req.params.id, req.params.commentId);
  if (!comment) {
    res.status(404).json({ error: '评论不存在' });
    return;
  }
  res.json({ comment });
});

app.put('/api/papers/:id/comments/:commentId', (req, res) => {
  try {
    const user = extractUser(req);
    const { content, entryType } = req.body as { content?: string; entryType?: EntryType };
    if (!content || !content.trim()) {
      res.status(400).json({ error: '内容不能为空' });
      return;
    }
    const updated = updateComment(req.params.id, req.params.commentId, { content, entryType }, user);
    if (!updated) {
      res.status(404).json({ error: '条目不存在' });
      return;
    }
    res.json({ comment: updated });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : '修改失败' });
  }
});

app.delete('/api/papers/:id/comments/:commentId', (req, res) => {
  try {
    const user = extractUser(req);
    const ok = deleteComment(req.params.id, req.params.commentId, user);
    if (!ok) {
      res.status(404).json({ error: '条目不存在' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : '删除失败' });
  }
});

/* ---------- Auto-Sync ---------- */
app.post('/api/sync', async (req, res) => {
  const { query } = (req.body as { query?: string }) ?? {};
  try {
    const result = await runAutoDailySync('manual_live_sync', query);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: '实时学术抓取异常，本地文献库数据保持正常读写。',
      detail: err instanceof Error ? err.message : 'Network error',
    });
  }
});

app.get('/api/auto-sync/config', (_req, res) => {
  res.json({ config: getAutoSyncConfig(), storage: getDatabaseStats() });
});

app.put('/api/auto-sync/config', (req, res) => {
  const current = getAutoSyncConfig();
  const patch = req.body as Partial<AutoSyncConfig>;
  const saved = saveAutoSyncConfig({ ...current, ...patch });
  res.json({ config: saved });
});

const DIST_DIR = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`PaperPulse server running at http://${HOST}:${PORT}`);

  const cfg = getAutoSyncConfig();
  if (cfg.enabled && process.env.DISABLE_AUTO_SYNC !== '1') {
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = cfg.lastAutoSyncAt ? cfg.lastAutoSyncAt.slice(0, 10) : '';
    if (lastDay !== today) {
      setTimeout(() => {
        void runAutoDailySync('auto_startup_daily_sync').catch(() => {});
      }, 1500);
    }
    setInterval(() => {
      const latestCfg = getAutoSyncConfig();
      if (latestCfg.enabled) {
        void runAutoDailySync('auto_scheduled_daily_sync').catch(() => {});
      }
    }, Math.max(1, cfg.intervalHours) * 3600 * 1000);
  }
});
