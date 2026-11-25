import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicPaper, PaperComment } from '../src/types/paper.js';
import { SEED_PAPERS } from './seedData.js';

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
    doi TEXT,
    title TEXT NOT NULL,
    published_date TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    domain TEXT NOT NULL,
    dataset_type TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    is_liked INTEGER DEFAULT 0,
    is_bookmarked INTEGER DEFAULT 0,
    reposts INTEGER DEFAULT 0,
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
`);

export function initDatabase(): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM papers').get() as { cnt: number };
  if (countRow.cnt === 0) {
    const insertPaper = db.prepare(`
      INSERT INTO papers (id, doi, title, published_date, synced_at, domain, dataset_type, likes, is_liked, is_bookmarked, reposts, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertComment = db.prepare(`
      INSERT INTO comments (id, paper_id, author, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const paper of SEED_PAPERS) {
      const { comments, ...rest } = paper;
      insertPaper.run(
        paper.id,
        paper.doi,
        paper.title,
        paper.publishedDate,
        paper.syncedAt,
        paper.domain,
        paper.anatomy.dataset.sourceType,
        paper.likes,
        paper.isLiked ? 1 : 0,
        paper.isBookmarked ? 1 : 0,
        paper.reposts,
        JSON.stringify(rest)
      );
      for (const c of comments) {
        insertComment.run(c.id, paper.id, c.author, c.role, c.content, c.createdAt);
      }
    }

    db.prepare('INSERT INTO sync_logs (synced_at, source, added_count, notes) VALUES (?, ?, ?, ?)')
      .run(new Date().toISOString(), 'initial_seed', SEED_PAPERS.length, 'Initialized curated SCI Q1 & CCF-A dataset');
  }
}

function hydratePaper(row: Record<string, unknown>): AcademicPaper {
  const base = JSON.parse(String(row.payload)) as Omit<AcademicPaper, 'comments'>;
  const commentsRows = db
    .prepare('SELECT id, paper_id as paperId, author, role, content, created_at as createdAt FROM comments WHERE paper_id = ? ORDER BY created_at DESC')
    .all(String(row.id)) as unknown as PaperComment[];

  return {
    ...base,
    likes: Number(row.likes ?? base.likes ?? 0),
    isLiked: Boolean(row.is_liked),
    isBookmarked: Boolean(row.is_bookmarked),
    reposts: Number(row.reposts ?? base.reposts ?? 0),
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
  date?: string;
}

export function listPapers(filters: PaperQueryFilters = {}): AcademicPaper[] {
  const rows = db
    .prepare('SELECT * FROM papers ORDER BY synced_at DESC, published_date DESC')
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
        p.weiboSummary,
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
      SET doi = ?, title = ?, published_date = ?, synced_at = ?, domain = ?, dataset_type = ?,
          likes = ?, is_liked = ?, is_bookmarked = ?, reposts = ?, payload = ?
      WHERE id = ?
    `).run(
      paper.doi,
      paper.title,
      paper.publishedDate,
      paper.syncedAt,
      paper.domain,
      paper.anatomy.dataset.sourceType,
      paper.likes,
      paper.isLiked ? 1 : 0,
      paper.isBookmarked ? 1 : 0,
      paper.reposts,
      JSON.stringify(rest),
      paper.id
    );
  } else {
    db.prepare(`
      INSERT INTO papers (id, doi, title, published_date, synced_at, domain, dataset_type, likes, is_liked, is_bookmarked, reposts, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paper.id,
      paper.doi,
      paper.title,
      paper.publishedDate,
      paper.syncedAt,
      paper.domain,
      paper.anatomy.dataset.sourceType,
      paper.likes,
      paper.isLiked ? 1 : 0,
      paper.isBookmarked ? 1 : 0,
      paper.reposts,
      JSON.stringify(rest)
    );
  }
  return getPaperById(paper.id)!;
}

export function engagePaper(id: string, action: 'like' | 'bookmark' | 'repost'): AcademicPaper | null {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  let likes = Number(row.likes);
  let isLiked = Number(row.is_liked);
  let isBookmarked = Number(row.is_bookmarked);
  let reposts = Number(row.reposts);

  if (action === 'like') {
    isLiked = isLiked ? 0 : 1;
    likes = isLiked ? likes + 1 : Math.max(0, likes - 1);
  } else if (action === 'bookmark') {
    isBookmarked = isBookmarked ? 0 : 1;
  } else if (action === 'repost') {
    reposts += 1;
  }

  db.prepare('UPDATE papers SET likes = ?, is_liked = ?, is_bookmarked = ?, reposts = ? WHERE id = ?')
    .run(likes, isLiked, isBookmarked, reposts, id);

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
    author: author.trim() || '匿名学者',
    role: role.trim() || '研究员',
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

export function getSyncLogs(limit = 10): Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }> {
  return db
    .prepare('SELECT id, synced_at as syncedAt, source, added_count as addedCount, notes FROM sync_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }>;
}

export function getDatabaseStats() {
  const stats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
  const totalPapers = (db.prepare('SELECT COUNT(*) as c FROM papers').get() as { c: number }).c;
  const totalComments = (db.prepare('SELECT COUNT(*) as c FROM comments').get() as { c: number }).c;
  const recentSyncs = getSyncLogs(5);
  return {
    dbPath: DB_PATH,
    sizeKB: stats ? Math.round((stats.size / 1024) * 10) / 10 : 0,
    totalPapers,
    totalComments,
    recentSyncs,
  };
}
