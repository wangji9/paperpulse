import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper, AutoSyncConfig, ReadingStatus } from '../src/types/paper.js';
import {
  addComment,
  deleteComment,
  deletePaper,
  getAutoSyncConfig,
  getDatabaseStats,
  getPaperById,
  initDatabase,
  listPapers,
  paperExistsByTitleOrDoi,
  recordSyncLog,
  saveAutoSyncConfig,
  updatePaperLibraryState,
  upsertPaper,
} from './db.js';
import {
  buildStructuredAnatomy,
  fetchSingleByArxivOrDoi,
  fetchYesterdayTodayFromArxiv,
  fetchYesterdayTodayFromOpenAlex,
  rawToAcademicPaper,
} from './liveFetcher.js';

initDatabase();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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
      source: 'Sync already in progress',
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
        const paper = rawToAcademicPaper(raw);
        upsertPaper(paper);
        addedPapers.push(paper);
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
      `自动拉取昨日/今日文献（arXiv ${arxivPapers.length} 篇 + OpenAlex ${oaPapers.length} 篇），新增去重入库 ${addedPapers.length} 篇`
    );

    return {
      syncedAt: nowIso,
      addedCount: addedPapers.length,
      addedPapers,
      source: 'arXiv + OpenAlex 实时学术引擎',
    };
  } finally {
    syncInProgress = false;
  }
}

// Health & storage telemetry
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'PaperPulse Personal Academic Library',
    timestamp: new Date().toISOString(),
    storage: getDatabaseStats(),
    autoSync: getAutoSyncConfig(),
  });
});

// List papers with filters
app.get('/api/papers', (req, res) => {
  const { q, domain, topic, journal, datasetType, bookmarked, readingStatus, recentOnly, date } = req.query;
  const papers = listPapers({
    q: typeof q === 'string' ? q : undefined,
    domain: typeof domain === 'string' ? domain : undefined,
    topic: typeof topic === 'string' ? topic : undefined,
    journal: typeof journal === 'string' ? journal : undefined,
    datasetType: typeof datasetType === 'string' ? datasetType : undefined,
    bookmarked: bookmarked === 'true',
    readingStatus: typeof readingStatus === 'string' ? readingStatus : undefined,
    recentOnly: recentOnly === 'true',
    date: typeof date === 'string' ? date : undefined,
  });
  res.json({ papers, total: papers.length });
});

app.get('/api/papers/:id', (req, res) => {
  const paper = getPaperById(req.params.id);
  if (!paper) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper });
});

// Create paper manually
app.post('/api/papers', (req, res) => {
  try {
    const body = req.body as Partial<AcademicPaper> & { quickAbstract?: string };
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const abstractText = body.abstractOriginal || body.quickAbstract || body.digestSummary || body.title.trim();
    const generated = buildStructuredAnatomy({
      title: body.title.trim(),
      abstract: abstractText,
      authors: body.authors ?? ['Research Team'],
      affiliations: body.affiliations ?? ['Research Lab'],
      journal: body.journal || 'Personal Academic Library',
      journalShort: body.journalShort || 'Custom',
      journalRank: body.journalRank || '自主录入',
      publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
      doi: body.doi || `local-${Date.now()}`,
      url: body.url || '#',
      citedByCount: body.citedByCount || 0,
      citations: body.citations || [],
      sourceOrigin: 'user_created',
    });

    const paper: AcademicPaper = {
      id: body.id || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openAlexId: body.openAlexId,
      title: body.title.trim(),
      titleZh: body.titleZh?.trim() || generated.titleZh,
      authors: body.authors?.length ? body.authors : ['Research Team'],
      affiliations: body.affiliations?.length ? body.affiliations : ['Research Lab'],
      journal: body.journal?.trim() || 'Personal Academic Library',
      journalShort: body.journalShort?.trim() || 'Custom',
      journalRank: body.journalRank?.trim() || '自主录入',
      domain: body.domain || generated.domain,
      topics: body.topics?.length ? body.topics : generated.topics,
      publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
      syncedAt: new Date().toISOString(),
      doi: body.doi?.trim() || `local-${Date.now()}`,
      url: body.url?.trim() || '#',
      sourceOrigin: 'user_created',
      abstractOriginal: abstractText,
      digestSummary: body.digestSummary?.trim() || generated.digestSummary,
      tags: body.tags?.length ? body.tags : generated.tags,
      citedByCount: Number(body.citedByCount || 0),
      citations: body.citations ?? [],
      readingStatus: body.readingStatus || 'unread',
      isBookmarked: body.isBookmarked ?? true,
      anatomy: body.anatomy && body.anatomy.background ? body.anatomy : generated.anatomy,
      comments: [],
    };

    const saved = upsertPaper(paper);
    res.status(201).json({ paper: saved });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create paper' });
  }
});

// Import by DOI / arXiv ID / OpenAlex ID / Keyword
app.post('/api/papers/import', async (req, res) => {
  try {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier || !identifier.trim()) {
      res.status(400).json({ error: '请输入 arXiv ID、DOI、OpenAlex ID 或论文标题关键词' });
      return;
    }

    const raw = await fetchSingleByArxivOrDoi(identifier);
    if (!raw) {
      res.status(404).json({ error: '未能从 arXiv / OpenAlex 匹配到该文献，请检查编号或改用手动录入' });
      return;
    }

    if (paperExistsByTitleOrDoi(raw.title, raw.doi)) {
      const existing = listPapers({ q: raw.title })[0];
      res.json({ paper: existing, alreadyExists: true });
      return;
    }

    const newPaper = rawToAcademicPaper(raw);
    const saved = upsertPaper(newPaper);
    recordSyncLog(raw.sourceOrigin, 1, `导入文献：${raw.title.slice(0, 60)}`);
    res.status(201).json({ paper: saved, alreadyExists: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '导入解析失败' });
  }
});

// Update existing paper
app.put('/api/papers/:id', (req, res) => {
  const existing = getPaperById(req.params.id);
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

  const saved = upsertPaper(updated);
  res.json({ paper: saved });
});

// Update library reading status or bookmark
app.patch('/api/papers/:id/status', (req, res) => {
  const { isBookmarked, readingStatus } = req.body as { isBookmarked?: boolean; readingStatus?: ReadingStatus };
  const updated = updatePaperLibraryState(req.params.id, { isBookmarked, readingStatus });
  if (!updated) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper: updated });
});

app.delete('/api/papers/:id', (req, res) => {
  const ok = deletePaper(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

// Comments / Personal reading notes
app.post('/api/papers/:id/comments', (req, res) => {
  const { author, role, content } = req.body as { author?: string; role?: string; content?: string };
  if (!content || !content.trim()) {
    res.status(400).json({ error: '笔记内容不能为空' });
    return;
  }
  const comment = addComment(req.params.id, author || '个人笔记', role || '精读批注', content);
  if (!comment) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.status(201).json({ comment });
});

app.delete('/api/papers/:id/comments/:commentId', (req, res) => {
  const ok = deleteComment(req.params.id, req.params.commentId);
  if (!ok) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ deleted: true });
});

// Manual & Auto-Daily Sync endpoints
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

// Global Citation Network Endpoint (Real citation edges across library + referenced/citing works)
app.get('/api/citations/graph', (_req, res) => {
  const papers = listPapers();
  res.json({
    papers: papers.map((p) => ({
      id: p.id,
      openAlexId: p.openAlexId,
      title: p.title,
      titleZh: p.titleZh,
      journalShort: p.journalShort,
      publishedDate: p.publishedDate,
      domain: p.domain,
      topics: p.topics,
      citedByCount: p.citedByCount,
      doi: p.doi,
      url: p.url,
      citations: p.citations,
    })),
    storage: getDatabaseStats(),
    autoSync: getAutoSyncConfig(),
  });
});

// Serve built Vite SPA in production
const DIST_DIR = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`PaperPulse server running at http://localhost:${PORT}`);

  // Automatic daily background crawler: fetch yesterday/today papers if not synced recently
  const cfg = getAutoSyncConfig();
  if (cfg.enabled) {
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
