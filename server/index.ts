import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper } from '../src/types/paper.js';
import {
  addComment,
  deleteComment,
  deletePaper,
  engagePaper,
  getDatabaseStats,
  getPaperById,
  initDatabase,
  listPapers,
  paperExistsByTitleOrDoi,
  recordSyncLog,
  upsertPaper,
} from './db.js';
import {
  buildStructuredAnatomy,
  fetchLivePapersFromOpenAlex,
  fetchSingleByArxivOrDoi,
  rawToAcademicPaper,
} from './liveFetcher.js';

initDatabase();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health & storage telemetry
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'PaperPulse Academic Observatory API',
    timestamp: new Date().toISOString(),
    storage: getDatabaseStats(),
  });
});

// List papers with rich filters
app.get('/api/papers', (req, res) => {
  const { q, domain, topic, journal, datasetType, bookmarked, date } = req.query;
  const papers = listPapers({
    q: typeof q === 'string' ? q : undefined,
    domain: typeof domain === 'string' ? domain : undefined,
    topic: typeof topic === 'string' ? topic : undefined,
    journal: typeof journal === 'string' ? journal : undefined,
    datasetType: typeof datasetType === 'string' ? datasetType : undefined,
    bookmarked: bookmarked === 'true',
    date: typeof date === 'string' ? date : undefined,
  });
  res.json({ papers, total: papers.length });
});

// Get single paper
app.get('/api/papers/:id', (req, res) => {
  const paper = getPaperById(req.params.id);
  if (!paper) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper });
});

// Create paper (full structured or quick note/abstract auto-parsed)
app.post('/api/papers', (req, res) => {
  try {
    const body = req.body as Partial<AcademicPaper> & { quickAbstract?: string };
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    let paper: AcademicPaper;
    if (body.anatomy && body.anatomy.background && body.anatomy.proposedMethod) {
      paper = {
        id: body.id || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: body.title.trim(),
        titleZh: body.titleZh?.trim() || body.title.trim(),
        authors: body.authors?.length ? body.authors : ['Research Team'],
        affiliations: body.affiliations?.length ? body.affiliations : ['Independent Lab'],
        journal: body.journal?.trim() || 'Academic Journal',
        journalShort: body.journalShort?.trim() || 'Journal',
        journalRank: body.journalRank?.trim() || '收录文献',
        domain: body.domain || 'interdisciplinary',
        topics: body.topics?.length ? body.topics : ['LLM'],
        publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
        syncedAt: new Date().toISOString(),
        doi: body.doi?.trim() || `local-${Date.now()}`,
        url: body.url?.trim() || '#',
        sourceOrigin: 'user_created',
        weiboSummary:
          body.weiboSummary?.trim() ||
          `【手动收录 · ${body.journalShort || '前沿速递'}】${body.anatomy.proposedMethod.slice(0, 130)}...`,
        keyHighlightMetric: body.keyHighlightMetric?.trim() || '已完成10维逻辑结构化入库',
        tags: body.tags?.length ? body.tags : ['用户收录'],
        likes: 1,
        isLiked: true,
        isBookmarked: true,
        reposts: 0,
        anatomy: body.anatomy,
        comments: [],
      };
    } else {
      const generated = buildStructuredAnatomy({
        title: body.title.trim(),
        abstract: body.quickAbstract || body.weiboSummary || body.title.trim(),
        authors: body.authors ?? ['Research Team'],
        affiliations: body.affiliations ?? ['Research Institute'],
        journal: body.journal || 'Smart Manufacturing & AI Track',
        journalShort: body.journalShort || 'Custom',
        journalRank: body.journalRank || '自主收录',
        publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
        doi: body.doi || `custom-${Date.now()}`,
        url: body.url || '#',
        sourceOrigin: 'user_created',
      });
      paper = {
        id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: body.title.trim(),
        titleZh: body.titleZh?.trim() || generated.titleZh,
        authors: body.authors?.length ? body.authors : ['Research Team'],
        affiliations: body.affiliations?.length ? body.affiliations : ['Research Lab'],
        journal: body.journal?.trim() || 'Smart Manufacturing & AI Track',
        journalShort: body.journalShort?.trim() || 'Custom',
        journalRank: body.journalRank?.trim() || '自主收录',
        domain: body.domain || generated.domain,
        topics: body.topics?.length ? body.topics : generated.topics,
        publishedDate: body.publishedDate || new Date().toISOString().slice(0, 10),
        syncedAt: new Date().toISOString(),
        doi: body.doi?.trim() || `custom-${Date.now()}`,
        url: body.url?.trim() || '#',
        sourceOrigin: 'user_created',
        weiboSummary: body.weiboSummary?.trim() || generated.weiboSummary,
        keyHighlightMetric: body.keyHighlightMetric?.trim() || generated.keyHighlightMetric,
        tags: body.tags?.length ? body.tags : generated.tags,
        likes: 1,
        isLiked: true,
        isBookmarked: true,
        reposts: 0,
        anatomy: generated.anatomy,
        comments: [],
      };
    }

    const saved = upsertPaper(paper);
    res.status(201).json({ paper: saved });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create paper' });
  }
});

// Import by DOI / arXiv ID / URL / Keyword
app.post('/api/papers/import', async (req, res) => {
  try {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier || !identifier.trim()) {
      res.status(400).json({ error: '请输入 arXiv ID、DOI 或论文标题关键词' });
      return;
    }

    const raw = await fetchSingleByArxivOrDoi(identifier);
    if (!raw) {
      res.status(404).json({ error: '未能从 arXiv / OpenAlex 匹配到该文献，请检查 DOI/ID 或改用手动创建' });
      return;
    }

    if (paperExistsByTitleOrDoi(raw.title, raw.doi)) {
      const existing = listPapers({ q: raw.title })[0];
      res.json({ paper: existing, alreadyExists: true });
      return;
    }

    const newPaper = rawToAcademicPaper(raw);
    const saved = upsertPaper(newPaper);
    recordSyncLog(raw.sourceOrigin, 1, `Imported via identifier: ${identifier}`);
    res.status(201).json({ paper: saved, alreadyExists: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '导入解析失败' });
  }
});

// Update existing paper (full CRUD update)
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

// Engage (like / bookmark / repost)
app.patch('/api/papers/:id/engage', (req, res) => {
  const { action } = req.body as { action?: 'like' | 'bookmark' | 'repost' };
  if (!action || !['like', 'bookmark', 'repost'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }
  const updated = engagePaper(req.params.id, action);
  if (!updated) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ paper: updated });
});

// Delete paper
app.delete('/api/papers/:id', (req, res) => {
  const ok = deletePaper(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

// Add comment
app.post('/api/papers/:id/comments', (req, res) => {
  const { author, role, content } = req.body as { author?: string; role?: string; content?: string };
  if (!content || !content.trim()) {
    res.status(400).json({ error: '评论内容不能为空' });
    return;
  }
  const comment = addComment(req.params.id, author || '研究学者', role || '同行评审', content);
  if (!comment) {
    res.status(404).json({ error: 'Paper not found' });
    return;
  }
  res.status(201).json({ comment });
});

// Delete comment
app.delete('/api/papers/:id/comments/:commentId', (req, res) => {
  const ok = deleteComment(req.params.id, req.params.commentId);
  if (!ok) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  res.json({ deleted: true });
});

// Live sync from OpenAlex (with graceful fallback/enrichment)
app.post('/api/sync', async (req, res) => {
  const { query } = (req.body as { query?: string }) ?? {};
  try {
    const fetched = await fetchLivePapersFromOpenAlex(query);
    const addedPapers: AcademicPaper[] = [];
    for (const raw of fetched) {
      if (!paperExistsByTitleOrDoi(raw.title, raw.doi)) {
        const paper = rawToAcademicPaper(raw);
        upsertPaper(paper);
        addedPapers.push(paper);
        if (addedPapers.length >= 3) break;
      }
    }
    recordSyncLog('openalex_live', addedPapers.length, `Synced ${addedPapers.length} new papers from OpenAlex`);
    res.json({
      syncedAt: new Date().toISOString(),
      addedCount: addedPapers.length,
      addedPapers,
      source: 'OpenAlex Live Academic API',
    });
  } catch (err) {
    res.status(502).json({
      error: '实时外部学术接口请求超时或受限，本地数据库仍保持在线可读写。',
      detail: err instanceof Error ? err.message : 'Network error',
    });
  }
});

// Analytics & Knowledge Graph Matrix
app.get('/api/analytics', (_req, res) => {
  const papers = listPapers();
  const topicCounts: Record<string, number> = {
    LLM: 0,
    KnowledgeGraph: 0,
    ComputerVision: 0,
    Multimodal: 0,
    EmbodiedAI: 0,
  };
  const domainCounts: Record<string, number> = {
    manufacturing: 0,
    computer_science: 0,
    interdisciplinary: 0,
  };
  const datasetCounts: Record<string, number> = {
    public: 0,
    self_built: 0,
    hybrid: 0,
  };
  const journalMap: Record<string, number> = {};
  const dailyMap: Record<string, number> = {};

  for (const p of papers) {
    domainCounts[p.domain] = (domainCounts[p.domain] || 0) + 1;
    datasetCounts[p.anatomy.dataset.sourceType] = (datasetCounts[p.anatomy.dataset.sourceType] || 0) + 1;
    journalMap[p.journalShort] = (journalMap[p.journalShort] || 0) + 1;
    dailyMap[p.publishedDate] = (dailyMap[p.publishedDate] || 0) + 1;
    for (const t of p.topics) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }

  res.json({
    totalPapers: papers.length,
    topicCounts,
    domainCounts,
    datasetCounts,
    journals: Object.entries(journalMap).map(([name, count]) => ({ name, count })),
    dailyTimeline: Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    storage: getDatabaseStats(),
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
});
