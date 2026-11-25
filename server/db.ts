import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper, AutoSyncConfig, PaperComment, ReadingStatus } from '../src/types/paper.js';
import { SEED_PAPERS } from './seedData.js';
import { getBulkSeedPapers } from './seedBulk.js';
import { getAgentAndJournalSeedPapers } from './seedAgents.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'paperpulse.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    open_alex_id TEXT,
    doi TEXT,
    title TEXT NOT NULL,
    published_date TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    domain TEXT NOT NULL,
    dataset_type TEXT NOT NULL,
    cited_by_count INTEGER DEFAULT 0,
    reading_status TEXT DEFAULT 'unread',
    is_bookmarked INTEGER DEFAULT 0,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    author TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at TEXT NOT NULL,
    source TEXT NOT NULL,
    added_count INTEGER NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function ensureColumns(): void {
  const cols = (db.prepare('PRAGMA table_info(papers)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes('open_alex_id')) db.exec('ALTER TABLE papers ADD COLUMN open_alex_id TEXT;');
  if (!cols.includes('cited_by_count')) db.exec('ALTER TABLE papers ADD COLUMN cited_by_count INTEGER DEFAULT 0;');
  if (!cols.includes('reading_status')) db.exec("ALTER TABLE papers ADD COLUMN reading_status TEXT DEFAULT 'unread';");
}
ensureColumns();

const DEFAULT_AUTO_SYNC: AutoSyncConfig = {
  enabled: true,
  intervalHours: 6,
  targetWindow: 'yesterday_today',
  trackedTopics: ['LLM', 'AgentCollaboration', 'KnowledgeGraph', 'ComputerVision', 'Multimodal', 'EmbodiedAI'],
  trackedJournals: ['JMS', 'RCIM', 'AEI', 'IJPR', 'IEEE TII', 'CIRP', 'IJMTM', 'JAS', 'INFFUS', 'TPAMI', 'CVPR', 'ICML', 'ICLR', 'EMNLP', 'CHI', 'CoRL', 'RSS', 'ICRA', 'arXiv'],
  lastAutoSyncAt: null,
  nextAutoSyncAt: null,
};

export function initDatabase(): void {
  const LIB_VERSION = 'v3.3-multiagent-doi';
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'library_version'").get() as { value: string } | undefined;
  if (!ver || ver.value !== LIB_VERSION) {
    const seeds = [...SEED_PAPERS, ...getBulkSeedPapers(), ...getAgentAndJournalSeedPapers()];
    for (const paper of seeds) {
      upsertPaper(paper);
    }
    recordSyncLog('文献库扩充', seeds.length, `新增多智能体、人智协作与多期刊核心文献，累计核心库 ${seeds.length} 篇`);
    db.prepare("INSERT INTO settings (key, value) VALUES ('library_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(LIB_VERSION);
  }

  const cfgRow = db.prepare("SELECT value FROM settings WHERE key = 'auto_sync_config'").get();
  if (!cfgRow) {
    saveAutoSyncConfig(DEFAULT_AUTO_SYNC);
  }
}

export function getAutoSyncConfig(): AutoSyncConfig {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'auto_sync_config'").get() as { value: string } | undefined;
  if (!row) return DEFAULT_AUTO_SYNC;
  try {
    return { ...DEFAULT_AUTO_SYNC, ...(JSON.parse(row.value) as Partial<AutoSyncConfig>) };
  } catch {
    return DEFAULT_AUTO_SYNC;
  }
}

export function saveAutoSyncConfig(config: AutoSyncConfig): AutoSyncConfig {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('auto_sync_config', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(config));
  return config;
}

function hydratePaper(row: Record<string, unknown>): AcademicPaper {
  const base = JSON.parse(String(row.payload)) as Omit<AcademicPaper, 'comments'>;
  const commentsRows = db
    .prepare('SELECT id, paper_id as paperId, author, role, content, created_at as createdAt FROM comments WHERE paper_id = ? ORDER BY created_at DESC')
    .all(String(row.id)) as unknown as PaperComment[];

  return {
    ...base,
    openAlexId: row.open_alex_id ? String(row.open_alex_id) : base.openAlexId,
    citedByCount: Number(row.cited_by_count ?? base.citedByCount ?? 0),
    readingStatus: (row.reading_status ? String(row.reading_status) : base.readingStatus || 'unread') as ReadingStatus,
    isBookmarked: Boolean(row.is_bookmarked),
    comments: commentsRows,
  };
}

export interface PaperQueryFilters {
  q?: string;
  domain?: string;
  topic?: string;
  journal?: string;
  datasetType?: string;
  bookmarked?: boolean;
  readingStatus?: string;
  recentOnly?: boolean;
  date?: string;
}

export function listPapers(filters: PaperQueryFilters = {}): AcademicPaper[] {
  const rows = db
    .prepare('SELECT * FROM papers ORDER BY published_date DESC, synced_at DESC')
    .all() as Record<string, unknown>[];

  let papers = rows.map(hydratePaper);

  if (filters.domain && filters.domain !== 'all') {
    papers = papers.filter((p) => p.domain === filters.domain);
  }
  if (filters.topic && filters.topic !== 'all') {
    papers = papers.filter((p) => p.topics.includes(filters.topic as AcademicPaper['topics'][number]));
  }
  if (filters.journal && filters.journal !== 'all') {
    papers = papers.filter((p) => p.journalShort === filters.journal || p.journal === filters.journal);
  }
  if (filters.datasetType && filters.datasetType !== 'all') {
    papers = papers.filter((p) => p.anatomy.dataset.sourceType === filters.datasetType);
  }
  if (filters.bookmarked) {
    papers = papers.filter((p) => p.isBookmarked);
  }
  if (filters.readingStatus && filters.readingStatus !== 'all') {
    papers = papers.filter((p) => p.readingStatus === filters.readingStatus);
  }
  if (filters.recentOnly) {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    papers = papers.filter((p) => p.publishedDate === today || p.publishedDate === yesterday);
  }
  if (filters.date) {
    papers = papers.filter((p) => p.publishedDate === filters.date);
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim().toLowerCase();
    papers = papers.filter((p) => {
      const hay = [
        p.title,
        p.titleZh,
        p.journal,
        p.journalShort,
        p.doi,
        p.digestSummary,
        p.abstractOriginal,
        ...p.authors,
        ...p.tags,
        p.anatomy.proposedMethod,
        p.anatomy.problem,
        ...p.anatomy.dataset.names,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return papers;
}

export function getPaperById(id: string): AcademicPaper | null {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? hydratePaper(row) : null;
}

export function paperExistsByTitleOrDoi(title: string, doi?: string): boolean {
  if (doi && doi.trim()) {
    const byDoi = db.prepare('SELECT id FROM papers WHERE lower(doi) = lower(?)').get(doi.trim());
    if (byDoi) return true;
  }
  const byTitle = db.prepare('SELECT id FROM papers WHERE lower(title) = lower(?)').get(title.trim());
  return Boolean(byTitle);
}

export function upsertPaper(paper: AcademicPaper): AcademicPaper {
  const { comments, ...rest } = paper;
  const existing = db.prepare('SELECT id FROM papers WHERE id = ?').get(paper.id);
  if (existing) {
    db.prepare(`
      UPDATE papers
      SET open_alex_id = ?, doi = ?, title = ?, published_date = ?, synced_at = ?, domain = ?, dataset_type = ?,
          cited_by_count = ?, reading_status = ?, is_bookmarked = ?, payload = ?
      WHERE id = ?
    `).run(
      paper.openAlexId || null,
      paper.doi,
      paper.title,
      paper.publishedDate,
      paper.syncedAt,
      paper.domain,
      paper.anatomy.dataset.sourceType,
      paper.citedByCount || 0,
      paper.readingStatus || 'unread',
      paper.isBookmarked ? 1 : 0,
      JSON.stringify(rest),
      paper.id
    );
  } else {
    db.prepare(`
      INSERT INTO papers (id, open_alex_id, doi, title, published_date, synced_at, domain, dataset_type, cited_by_count, reading_status, is_bookmarked, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paper.id,
      paper.openAlexId || null,
      paper.doi,
      paper.title,
      paper.publishedDate,
      paper.syncedAt,
      paper.domain,
      paper.anatomy.dataset.sourceType,
      paper.citedByCount || 0,
      paper.readingStatus || 'unread',
      paper.isBookmarked ? 1 : 0,
      JSON.stringify(rest)
    );
  }
  if (comments && comments.length > 0) {
    const insC = db.prepare('INSERT OR IGNORE INTO comments (id, paper_id, author, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of comments) {
      insC.run(c.id, paper.id, c.author, c.role, c.content, c.createdAt);
    }
  }
  return getPaperById(paper.id)!;
}

export function updatePaperLibraryState(
  id: string,
  patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }
): AcademicPaper | null {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  const nextBookmarked = patch.isBookmarked !== undefined ? (patch.isBookmarked ? 1 : 0) : Number(row.is_bookmarked);
  const nextStatus = patch.readingStatus ?? String(row.reading_status || 'unread');

  db.prepare('UPDATE papers SET is_bookmarked = ?, reading_status = ? WHERE id = ?')
    .run(nextBookmarked, nextStatus, id);

  return getPaperById(id);
}

export function deletePaper(id: string): boolean {
  db.prepare('DELETE FROM comments WHERE paper_id = ?').run(id);
  const res = db.prepare('DELETE FROM papers WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function addComment(paperId: string, author: string, role: string, content: string): PaperComment | null {
  const exists = db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);
  if (!exists) return null;
  const comment: PaperComment = {
    id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    paperId,
    author: author.trim() || '个人笔记',
    role: role.trim() || '精读批注',
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  db.prepare('INSERT INTO comments (id, paper_id, author, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(comment.id, comment.paperId, comment.author, comment.role, comment.content, comment.createdAt);
  return comment;
}

export function deleteComment(paperId: string, commentId: string): boolean {
  const res = db.prepare('DELETE FROM comments WHERE id = ? AND paper_id = ?').run(commentId, paperId);
  return Number(res.changes) > 0;
}

export function recordSyncLog(source: string, addedCount: number, notes: string): void {
  db.prepare('INSERT INTO sync_logs (synced_at, source, added_count, notes) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), source, addedCount, notes);
}

export function getSyncLogs(limit = 12): Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }> {
  return db
    .prepare('SELECT id, synced_at as syncedAt, source, added_count as addedCount, notes FROM sync_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }>;
}

export function getDatabaseStats() {
  const stats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
  const totalPapers = (db.prepare('SELECT COUNT(*) as c FROM papers').get() as { c: number }).c;
  const totalComments = (db.prepare('SELECT COUNT(*) as c FROM comments').get() as { c: number }).c;
  const recentSyncs = getSyncLogs(8);
  return {
    dbPath: DB_PATH,
    sizeKB: stats ? Math.round((stats.size / 1024) * 10) / 10 : 0,
    totalPapers,
    totalComments,
    recentSyncs,
  };
}

