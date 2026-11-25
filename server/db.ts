import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AcademicPaper,
  AutoSyncConfig,
  EntryType,
  PaperCollectorBadge,
  PaperComment,
  PaperLikerBadge,
  PaperReaderTrace,
  ReadingStatus,
  ReadingAnalytics,
  UserProfile,
} from '../src/types/paper.js';
import { SEED_PAPERS } from './seedData.js';
import { getBulkSeedPapers } from './seedBulk.js';
import { getAgentAndJournalSeedPapers } from './seedAgents.js';
import { enrichPaperVisuals, getJournals16SeedPapers } from './seedJournals16.js';
import { ALL_JOURNAL_SOURCES, detectTopics } from './liveFetcher.js';
import { generateSessionToken, hashPassword, pickAvatarColor, verifyPassword } from './auth.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
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
    entry_type TEXT DEFAULT 'comment',
    user_id TEXT,
    username TEXT,
    user_tags TEXT DEFAULT '[]',
    author TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar_color TEXT NOT NULL,
    user_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_kb (
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    personal_tags TEXT NOT NULL DEFAULT '[]',
    reading_status TEXT NOT NULL DEFAULT 'unread',
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, paper_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS paper_reads (
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    visit_count INTEGER NOT NULL DEFAULT 0,
    total_dwell_seconds INTEGER NOT NULL DEFAULT 0,
    last_visited_at TEXT NOT NULL,
    PRIMARY KEY (user_id, paper_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_sessions (
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    PRIMARY KEY (user_id, paper_id, visit_id)
  );

  CREATE TABLE IF NOT EXISTS paper_likes (
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, paper_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comment_likes (
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, comment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at TEXT NOT NULL,
    source TEXT NOT NULL,
    added_count INTEGER NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS deleted_papers (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, doi TEXT, deleted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function ensureColumns(): void {
  const pCols = (db.prepare('PRAGMA table_info(papers)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!pCols.includes('open_alex_id')) db.exec('ALTER TABLE papers ADD COLUMN open_alex_id TEXT;');
  if (!pCols.includes('cited_by_count')) db.exec('ALTER TABLE papers ADD COLUMN cited_by_count INTEGER DEFAULT 0;');
  if (!pCols.includes('reading_status')) db.exec("ALTER TABLE papers ADD COLUMN reading_status TEXT DEFAULT 'unread';");

  const cCols = (db.prepare('PRAGMA table_info(comments)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!cCols.includes('entry_type')) db.exec("ALTER TABLE comments ADD COLUMN entry_type TEXT DEFAULT 'comment';");
  if (!cCols.includes('user_id')) db.exec('ALTER TABLE comments ADD COLUMN user_id TEXT;');
  if (!cCols.includes('username')) db.exec('ALTER TABLE comments ADD COLUMN username TEXT;');
  if (!cCols.includes('avatar_color')) db.exec('ALTER TABLE comments ADD COLUMN avatar_color TEXT;');
  if (!cCols.includes('parent_id')) db.exec('ALTER TABLE comments ADD COLUMN parent_id TEXT;');
  if (!cCols.includes('reply_to_author')) db.exec('ALTER TABLE comments ADD COLUMN reply_to_author TEXT;');
  if (!cCols.includes('user_tags')) db.exec("ALTER TABLE comments ADD COLUMN user_tags TEXT DEFAULT '[]';");
  if (!cCols.includes('updated_at')) db.exec('ALTER TABLE comments ADD COLUMN updated_at TEXT;');
}
ensureColumns();

const DEFAULT_AUTO_SYNC: AutoSyncConfig = {
  enabled: true,
  maxStoredPapers: 1000,
  intervalHours: 6,
  targetWindow: 'yesterday_today',
  trackedTopics: ['LLM', 'AgentCollaboration', 'HumanAICollaboration', 'ProductDesign', 'DesignOptimization', 'InteractionDesign', 'SustainableDesign', 'KnowledgeGraph', 'ComputerVision', 'Multimodal', 'EmbodiedAI'],
  trackedJournals: [
    ...ALL_JOURNAL_SOURCES.map((s) => s.short),
    'TPAMI',
    'INFFUS',
    'JAS',
    'IJPR',
    'CVPR',
    'ICML',
    'ICLR',
    'EMNLP',
    'CHI',
    'JAIR',
    'NHB',
    'CoRL',
    'RSS',
    'ICRA',
    'arXiv',
  ],
  lastAutoSyncAt: null,
  nextAutoSyncAt: null,
};

export function initDatabase(): void {
  // Ensure default admin account exists
  const adminRow = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!adminRow && bootstrapPassword) {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, role, avatar_color, user_tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'usr-admin',
      'admin',
      hashPassword(bootstrapPassword),
      '公共池管理员',
      'admin',
      '#4F46E5',
      JSON.stringify(['文献池维护', '智能制造与AI']),
      new Date().toISOString()
    );
  }

  // Retire the legacy public demo password while preserving configured admin accounts.
  if (adminRow && bootstrapPassword) {
    const legacy = db.prepare("SELECT password_hash FROM users WHERE username = 'admin'").get() as { password_hash: string };
    if (verifyPassword('admin123', legacy.password_hash)) {
      db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(hashPassword(bootstrapPassword));
      db.prepare("DELETE FROM sessions WHERE user_id = 'usr-admin'").run();
    }
  }

  const LIB_VERSION = 'v5.0-journals16-figures-kb';
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'library_version'").get() as { value: string } | undefined;
  if (!ver || ver.value !== LIB_VERSION) {
    const seeds = [
      ...SEED_PAPERS,
      ...getBulkSeedPapers(),
      ...getAgentAndJournalSeedPapers(),
      ...getJournals16SeedPapers(),
    ].map(enrichPaperVisuals);

    for (const paper of seeds) {
      if (!isPaperSuppressed(paper.title, paper.doi)) upsertPaper(paper);
    }

    // Enrich any previously live-fetched or user-created papers non-destructively
    const seedIds = new Set(seeds.map((s) => s.id));
    const existingRows = db.prepare('SELECT * FROM papers').all() as Record<string, unknown>[];
    for (const row of existingRows) {
      const pid = String(row.id);
      if (!seedIds.has(pid)) {
        const hydrated = hydratePaper(row, emptySocialContext());
        upsertPaper(enrichPaperVisuals(hydrated));
      }
    }

    recordSyncLog(
      '16本核心期刊与图表解析升级',
      seeds.length,
      `收录 IJMTM / JMS / RCIM / JIM / IEEE TII / IEEE TASE / AEI / COMPIND / ESWA / CIRP / IEEE TIE / JIII / KBS / INS / ASOC / EAAI 等16本期刊文献并补全方法架构图与实验表格解析`
    );
    db.prepare("INSERT INTO settings (key, value) VALUES ('library_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(LIB_VERSION);
  }

  const cfgRow = db.prepare("SELECT value FROM settings WHERE key = 'auto_sync_config'").get() as { value: string } | undefined;
  if (!cfgRow) {
    saveAutoSyncConfig(DEFAULT_AUTO_SYNC);
  } else {
    try {
      const parsed = JSON.parse(cfgRow.value) as AutoSyncConfig;
      const mergedJournals = Array.from(new Set([...DEFAULT_AUTO_SYNC.trackedJournals, ...(parsed.trackedJournals || [])]));
      if (mergedJournals.length !== (parsed.trackedJournals || []).length) {
        saveAutoSyncConfig({ ...parsed, trackedJournals: mergedJournals });
      }
    } catch {
      saveAutoSyncConfig(DEFAULT_AUTO_SYNC);
    }
  }
  if (!db.prepare("SELECT value FROM settings WHERE key = 'design_topics_v1'").get()) {
    for (const row of db.prepare('SELECT id, payload FROM papers').all() as Array<{ id: string; payload: string }>) {
      const paper = JSON.parse(row.payload) as AcademicPaper;
      const text = [paper.title, paper.abstractOriginal, paper.digestSummary].join(' ');
      const detected = detectTopics(text);
      const prior = (paper.topics || []).filter(t => t !== 'AgentCollaboration' || detected.includes('AgentCollaboration') || !detected.includes('HumanAICollaboration'));
      paper.topics = Array.from(new Set([...prior, ...detected.filter(t => t !== 'LLM' || prior.includes('LLM'))]));
      db.prepare('UPDATE papers SET payload = ? WHERE id = ?').run(JSON.stringify(paper), row.id);
    }
    const cfg = getAutoSyncConfig();
    saveAutoSyncConfig({ ...cfg, maxStoredPapers: cfg.maxStoredPapers || 1000, trackedTopics: Array.from(new Set([...cfg.trackedTopics, ...DEFAULT_AUTO_SYNC.trackedTopics])) });
    db.prepare("INSERT INTO settings (key, value) VALUES ('design_topics_v1', '1')").run();
  }

}

/* ---------- User & Auth Operations ---------- */
function mapUserRow(row: Record<string, unknown>): UserProfile {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.user_tags || '[]'));
  } catch {
    tags = [];
  }
  const uid = String(row.id);
  const kbCountRow = db.prepare('SELECT COUNT(*) as c FROM user_kb WHERE user_id = ?').get(uid) as { c: number };
  const readStats = db
    .prepare('SELECT COUNT(*) as papers, COALESCE(SUM(total_dwell_seconds), 0) as secs FROM paper_reads WHERE user_id = ?')
    .get(uid) as { papers: number; secs: number };
  const likeRow = db.prepare('SELECT COUNT(*) as c FROM paper_likes WHERE user_id = ?').get(uid) as { c: number };
  return {
    id: uid,
    username: String(row.username),
    displayName: String(row.display_name),
    role: String(row.role) === 'admin' ? 'admin' : 'member',
    avatarColor: String(row.avatar_color || '#4F46E5'),
    userTags: tags,
    kbCount: kbCountRow.c,
    readPaperCount: readStats.papers,
    totalReadSeconds: readStats.secs,
    likeCount: likeRow.c,
    createdAt: String(row.created_at),
  };
}

export function registerUser(params: {
  username: string;
  password: string;
  displayName?: string;
  userTags?: string[];
  role?: 'admin' | 'member';
}): { user: UserProfile; token: string } {
  const uname = params.username.trim();
  if (!uname || uname.length < 2) throw new Error('用户名至少需要 2 个字符');
  if (!params.password || params.password.length < 4) throw new Error('密码至少需要 4 个字符');

  const existing = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(uname);
  if (existing) throw new Error('该用户名已被注册');

  const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const displayName = (params.displayName || uname).trim();
  const tags = (params.userTags || []).map((t) => t.trim()).filter(Boolean);
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role, avatar_color, user_tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    uname,
    hashPassword(params.password),
    displayName,
    params.role === 'admin' ? 'admin' : 'member',
    pickAvatarColor(uname),
    JSON.stringify(tags),
    createdAt
  );

  const token = generateSessionToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, id, createdAt);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  return { user: mapUserRow(row), token };
}

export function loginUser(username: string, password: string): { user: UserProfile; token: string } {
  const row = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username.trim()) as Record<string, unknown> | undefined;
  if (!row || !verifyPassword(password, String(row.password_hash))) {
    throw new Error('用户名或密码错误');
  }
  const token = generateSessionToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, String(row.id), new Date().toISOString());
  return { user: mapUserRow(row), token };
}

export function logoutSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserByToken(token?: string | null): UserProfile | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?')
    .get(token) as Record<string, unknown> | undefined;
  return row ? mapUserRow(row) : null;
}

export function listAllUsers(): UserProfile[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as Record<string, unknown>[];
  return rows.map(mapUserRow);
}

export function updateUserProfile(
  userId: string,
  patch: { username?: string; displayName?: string; userTags?: string[]; role?: 'admin' | 'member'; newPassword?: string }
): UserProfile | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const nextUsername = patch.username === undefined ? String(row.username) : patch.username.trim();
  if (nextUsername.length < 2 || nextUsername.length > 100) throw new Error('用户名需要2–100个字符');
  if (userId === 'usr-admin' && (nextUsername !== 'admin' || (patch.role !== undefined && patch.role !== 'admin'))) throw new Error('系统管理员的用户名和管理员权限不可更改');
  if (patch.role !== undefined && !['admin', 'member'].includes(patch.role)) throw new Error('无效的用户权限');
  if (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?').get(nextUsername, userId)) throw new Error('该用户名已被注册');
  if (patch.newPassword !== undefined && patch.newPassword.length < 4) throw new Error('新密码至少需要4个字符');
  const nextName = patch.displayName?.trim() || String(row.display_name);
  const nextTags = patch.userTags !== undefined ? JSON.stringify(patch.userTags.map((t) => t.trim()).filter(Boolean)) : String(row.user_tags);
  const nextRole = patch.role ?? String(row.role);
  const nextHash = patch.newPassword ? hashPassword(patch.newPassword) : String(row.password_hash);

  db.prepare('UPDATE users SET username = ?, display_name = ?, user_tags = ?, role = ?, password_hash = ? WHERE id = ?')
    .run(nextUsername, nextName, nextTags, nextRole, nextHash, userId);
  if (patch.newPassword) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  return mapUserRow(updated);
}

export function deleteUserById(userId: string): boolean {
  if (userId === 'usr-admin') return false;
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_kb WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM reading_sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM paper_reads WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM paper_likes WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM comment_likes WHERE user_id = ?').run(userId);
  const res = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return Number(res.changes) > 0;
}

/* ---------- User Personal Knowledge Base (user_kb) ---------- */
export function upsertUserKbItem(
  userId: string,
  paperId: string,
  patch: { personalTags?: string[]; readingStatus?: ReadingStatus } = {}
): boolean {
  const paperExists = db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);
  if (!paperExists) return false;

  const existing = db.prepare('SELECT * FROM user_kb WHERE user_id = ? AND paper_id = ?').get(userId, paperId) as Record<string, unknown> | undefined;
  if (existing) {
    const nextTags =
      patch.personalTags !== undefined
        ? JSON.stringify(patch.personalTags.map((t) => t.trim()).filter(Boolean))
        : String(existing.personal_tags || '[]');
    const nextStatus = patch.readingStatus ?? String(existing.reading_status || 'unread');
    db.prepare('UPDATE user_kb SET personal_tags = ?, reading_status = ? WHERE user_id = ? AND paper_id = ?')
      .run(nextTags, nextStatus, userId, paperId);
  } else {
    const tags = JSON.stringify((patch.personalTags || []).map((t) => t.trim()).filter(Boolean));
    const status = patch.readingStatus || 'unread';
    db.prepare('INSERT INTO user_kb (user_id, paper_id, personal_tags, reading_status, added_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, paperId, tags, status, new Date().toISOString());
  }
  return true;
}

export function removeUserKbItem(userId: string, paperId: string): boolean {
  const res = db.prepare('DELETE FROM user_kb WHERE user_id = ? AND paper_id = ?').run(userId, paperId);
  return Number(res.changes) > 0;
}

function getCollectorsMap(): Map<string, PaperCollectorBadge[]> {
  const rows = db
    .prepare(`
      SELECT kb.paper_id, kb.user_id, kb.personal_tags, kb.reading_status, kb.added_at,
             u.username, u.display_name, u.avatar_color, u.user_tags
      FROM user_kb kb
      JOIN users u ON kb.user_id = u.id
      ORDER BY kb.added_at DESC
    `)
    .all() as Record<string, unknown>[];

  const map = new Map<string, PaperCollectorBadge[]>();
  for (const r of rows) {
    const pid = String(r.paper_id);
    let uTags: string[] = [];
    let pTags: string[] = [];
    try { uTags = JSON.parse(String(r.user_tags || '[]')); } catch {}
    try { pTags = JSON.parse(String(r.personal_tags || '[]')); } catch {}
    const badge: PaperCollectorBadge = {
      userId: String(r.user_id),
      username: String(r.username),
      displayName: String(r.display_name),
      avatarColor: String(r.avatar_color || '#4F46E5'),
      userTags: uTags,
      personalTags: pTags,
      readingStatus: String(r.reading_status || 'unread') as ReadingStatus,
      addedAt: String(r.added_at),
    };
    const arr = map.get(pid) || [];
    arr.push(badge);
    map.set(pid, arr);
  }
  return map;
}

interface SocialHydrationContext {
  collectorsMap: Map<string, PaperCollectorBadge[]>;
  likesMap: Map<string, PaperLikerBadge[]>;
  readsMap: Map<string, Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarColor: string;
    userTags: string[];
    visitCount: number;
    totalDwellSeconds: number;
    lastVisitedAt: string;
  }>>;
  commentLikesMap: Map<string, PaperLikerBadge[]>;
  userColorsMap: Map<string, string>;
}

function emptySocialContext(): SocialHydrationContext {
  return {
    collectorsMap: new Map(),
    likesMap: new Map(),
    readsMap: new Map(),
    commentLikesMap: new Map(),
    userColorsMap: new Map(),
  };
}

function getSocialHydrationContext(): SocialHydrationContext {
  const collectorsMap = getCollectorsMap();

  const likeRows = db
    .prepare(`
      SELECT pl.paper_id, pl.user_id, pl.created_at,
             u.username, u.display_name, u.avatar_color, u.user_tags
      FROM paper_likes pl
      JOIN users u ON pl.user_id = u.id
      ORDER BY pl.created_at DESC
    `)
    .all() as Record<string, unknown>[];
  const likesMap = new Map<string, PaperLikerBadge[]>();
  for (const r of likeRows) {
    const pid = String(r.paper_id);
    let uTags: string[] = [];
    try { uTags = JSON.parse(String(r.user_tags || '[]')); } catch {}
    const arr = likesMap.get(pid) || [];
    arr.push({
      userId: String(r.user_id),
      username: String(r.username),
      displayName: String(r.display_name),
      avatarColor: String(r.avatar_color || '#4F46E5'),
      userTags: uTags,
      likedAt: String(r.created_at),
    });
    likesMap.set(pid, arr);
  }

  const readRows = db
    .prepare(`
      SELECT pr.paper_id, pr.user_id, pr.visit_count, pr.total_dwell_seconds, pr.last_visited_at,
             u.username, u.display_name, u.avatar_color, u.user_tags
      FROM paper_reads pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.last_visited_at DESC
    `)
    .all() as Record<string, unknown>[];
  const readsMap: SocialHydrationContext['readsMap'] = new Map();
  for (const r of readRows) {
    const pid = String(r.paper_id);
    let uTags: string[] = [];
    try { uTags = JSON.parse(String(r.user_tags || '[]')); } catch {}
    const arr = readsMap.get(pid) || [];
    arr.push({
      userId: String(r.user_id),
      username: String(r.username),
      displayName: String(r.display_name),
      avatarColor: String(r.avatar_color || '#4F46E5'),
      userTags: uTags,
      visitCount: Number(r.visit_count || 0),
      totalDwellSeconds: Number(r.total_dwell_seconds || 0),
      lastVisitedAt: String(r.last_visited_at),
    });
    readsMap.set(pid, arr);
  }

  const cLikeRows = db
    .prepare(`
      SELECT cl.comment_id, cl.user_id, cl.created_at,
             u.username, u.display_name, u.avatar_color, u.user_tags
      FROM comment_likes cl
      JOIN users u ON cl.user_id = u.id
      ORDER BY cl.created_at ASC
    `)
    .all() as Record<string, unknown>[];
  const commentLikesMap = new Map<string, PaperLikerBadge[]>();
  for (const r of cLikeRows) {
    const cid = String(r.comment_id);
    let uTags: string[] = [];
    try { uTags = JSON.parse(String(r.user_tags || '[]')); } catch {}
    const arr = commentLikesMap.get(cid) || [];
    arr.push({
      userId: String(r.user_id),
      username: String(r.username),
      displayName: String(r.display_name),
      avatarColor: String(r.avatar_color || '#4F46E5'),
      userTags: uTags,
      likedAt: String(r.created_at),
    });
    commentLikesMap.set(cid, arr);
  }

  const userRows = db.prepare('SELECT id, avatar_color FROM users').all() as Array<{ id: string; avatar_color: string }>;
  const userColorsMap = new Map(userRows.map((u) => [String(u.id), String(u.avatar_color || '#4F46E5')]));

  return { collectorsMap, likesMap, readsMap, commentLikesMap, userColorsMap };
}

/* ---------- Reading Footprints & Social Likes ---------- */
export function recordPaperReading(
  userId: string,
  paperId: string,
  params: { incrementVisit?: boolean; addDwellSeconds?: number; visitId?: string; elapsedSeconds?: number }
): AcademicPaper | null {
  const exists = db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);
  if (!exists) return null;

  let incVisit = params.incrementVisit === true ? 1 : 0;
  let addDwell = Number.isFinite(params.addDwellSeconds) ? Math.max(0, Math.min(30, Math.floor(params.addDwellSeconds!))) : 0;
  if (params.visitId && /^[a-zA-Z0-9-]{8,100}$/.test(params.visitId) && Number.isFinite(params.elapsedSeconds)) {
    const session = db.prepare('SELECT * FROM reading_sessions WHERE user_id = ? AND paper_id = ? AND visit_id = ?').get(userId, paperId, params.visitId) as { elapsed_seconds: number; started_at: string } | undefined;
    const requested = Math.max(0, Math.floor(params.elapsedSeconds!));
    const maxElapsed = session ? Math.floor((Date.now() - Date.parse(session.started_at)) / 1000) + 3 : 3;
    const cumulative = Math.max(session?.elapsed_seconds || 0, Math.min(requested, maxElapsed));
    incVisit = session ? 0 : 1;
    addDwell = cumulative - (session?.elapsed_seconds || 0);
    db.prepare('INSERT INTO reading_sessions (user_id, paper_id, visit_id, elapsed_seconds, started_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, paper_id, visit_id) DO UPDATE SET elapsed_seconds = excluded.elapsed_seconds').run(userId, paperId, params.visitId, cumulative, new Date().toISOString());
  }
  if (incVisit === 0 && addDwell === 0) return getPaperById(paperId, userId);

  const now = new Date().toISOString();
  const row = db
    .prepare('SELECT visit_count, total_dwell_seconds FROM paper_reads WHERE user_id = ? AND paper_id = ?')
    .get(userId, paperId) as { visit_count: number; total_dwell_seconds: number } | undefined;

  if (row) {
    db.prepare(
      'UPDATE paper_reads SET visit_count = ?, total_dwell_seconds = ?, last_visited_at = ? WHERE user_id = ? AND paper_id = ?'
    ).run(Number(row.visit_count) + incVisit, Number(row.total_dwell_seconds) + addDwell, now, userId, paperId);
  } else {
    db.prepare(
      'INSERT INTO paper_reads (user_id, paper_id, visit_count, total_dwell_seconds, last_visited_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, paperId, Math.max(1, incVisit), addDwell, now);
  }

  return getPaperById(paperId, userId);
}

export function togglePaperLike(userId: string, paperId: string): AcademicPaper | null {
  const exists = db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);
  if (!exists) return null;

  const liked = db.prepare('SELECT 1 FROM paper_likes WHERE user_id = ? AND paper_id = ?').get(userId, paperId);
  if (liked) {
    db.prepare('DELETE FROM paper_likes WHERE user_id = ? AND paper_id = ?').run(userId, paperId);
  } else {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO paper_likes (user_id, paper_id, created_at) VALUES (?, ?, ?)').run(userId, paperId, now);

  }
  return getPaperById(paperId, userId);
}

export function toggleCommentLike(userId: string, paperId: string, commentId: string): PaperComment | null {
  const cRow = db.prepare('SELECT * FROM comments WHERE id = ? AND paper_id = ?').get(commentId, paperId) as Record<string, unknown> | undefined;
  if (!cRow) return null;

  const existing = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(userId, commentId);
  if (existing) {
    db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(userId, commentId);
  } else {
    db.prepare('INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)').run(
      userId,
      commentId,
      new Date().toISOString()
    );
  }
  const ctx = getSocialHydrationContext();
  return hydrateCommentRow(cRow, ctx, userId);
}

/* ---------- Settings ---------- */
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

/* ---------- Papers & Comments CRUD ---------- */
function hydrateCommentRow(
  r: Record<string, unknown>,
  ctx?: SocialHydrationContext,
  currentUserId?: string
): PaperComment {
  let uTags: string[] = [];
  try { uTags = JSON.parse(String(r.user_tags || '[]')); } catch {}
  const cid = String(r.id);
  const uid = r.user_id ? String(r.user_id) : undefined;
  const likes = ctx?.commentLikesMap.get(cid) || [];
  const avatarColor =
    (r.avatar_color ? String(r.avatar_color) : undefined) ||
    (uid && ctx?.userColorsMap.get(uid)) ||
    pickAvatarColor(String(r.author || 'U'));
  return {
    id: cid,
    paperId: String(r.paper_id),
    entryType: String(r.entry_type) === 'thought' ? 'thought' : 'comment',
    userId: uid,
    username: r.username ? String(r.username) : undefined,
    avatarColor,
    userTags: uTags,
    author: String(r.author),
    role: String(r.role),
    content: String(r.content),
    parentId: r.parent_id ? String(r.parent_id) : undefined,
    replyToAuthor: r.reply_to_author ? String(r.reply_to_author) : undefined,
    likes,
    likedByMe: currentUserId ? likes.some((l) => l.userId === currentUserId) : false,
    createdAt: String(r.created_at),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined,
  };
}

function hydratePaper(
  row: Record<string, unknown>,
  ctx: SocialHydrationContext,
  currentUserId?: string
): AcademicPaper {
  const base = JSON.parse(String(row.payload)) as Omit<AcademicPaper, 'comments'>;
  const pid = String(row.id);
  const rawComments = db
    .prepare('SELECT * FROM comments WHERE paper_id = ? ORDER BY created_at DESC')
    .all(pid) as Record<string, unknown>[];

  const comments = rawComments.map((rc) => hydrateCommentRow(rc, ctx, currentUserId));
  const collectors = ctx.collectorsMap.get(pid) || [];
  const likers = ctx.likesMap.get(pid) || [];
  const rawReads = ctx.readsMap.get(pid) || [];
  const myEntry = currentUserId ? collectors.find((c) => c.userId === currentUserId) : undefined;

  // Build unified traceable readers map across reads, likes, collections, and comments
  const traceMap = new Map<string, PaperReaderTrace>();
  for (const rd of rawReads) {
    traceMap.set(rd.userId, {
      userId: rd.userId,
      username: rd.username,
      displayName: rd.displayName,
      avatarColor: rd.avatarColor,
      userTags: rd.userTags,
      visitCount: rd.visitCount,
      totalDwellSeconds: rd.totalDwellSeconds,
      lastVisitedAt: rd.lastVisitedAt,
      liked: false,
      collected: false,
      commentCount: 0,
    });
  }
  for (const lk of likers) {
    const existing = traceMap.get(lk.userId);
    if (existing) {
      existing.liked = true;
    } else {
      traceMap.set(lk.userId, {
        userId: lk.userId,
        username: lk.username,
        displayName: lk.displayName,
        avatarColor: lk.avatarColor,
        userTags: lk.userTags,
        visitCount: 0,
        totalDwellSeconds: 0,
        lastVisitedAt: lk.likedAt,
        liked: true,
        collected: false,
        commentCount: 0,
      });
    }
  }
  for (const col of collectors) {
    const existing = traceMap.get(col.userId);
    if (existing) {
      existing.collected = true;
    } else {
      traceMap.set(col.userId, {
        userId: col.userId,
        username: col.username,
        displayName: col.displayName,
        avatarColor: col.avatarColor,
        userTags: col.userTags,
        visitCount: 0,
        totalDwellSeconds: 0,
        lastVisitedAt: col.addedAt,
        liked: false,
        collected: true,
        commentCount: 0,
      });
    }
  }
  for (const cm of comments) {
    if (!cm.userId) continue;
    const existing = traceMap.get(cm.userId);
    if (existing) {
      existing.commentCount += 1;
    } else {
      traceMap.set(cm.userId, {
        userId: cm.userId,
        username: cm.username || cm.author,
        displayName: cm.author,
        avatarColor: cm.avatarColor || '#4F46E5',
        userTags: cm.userTags || [],
        visitCount: 0,
        totalDwellSeconds: 0,
        lastVisitedAt: cm.createdAt,
        liked: false,
        collected: false,
        commentCount: 1,
      });
    }
  }

  const readers = Array.from(traceMap.values()).sort(
    (a, b) =>
      b.totalDwellSeconds + b.visitCount * 15 + (b.liked ? 20 : 0) + (b.collected ? 20 : 0) -
      (a.totalDwellSeconds + a.visitCount * 15 + (a.liked ? 20 : 0) + (a.collected ? 20 : 0))
  );

  const totalVisits = readers.reduce((acc, r) => acc + r.visitCount, 0);
  const totalDwellSeconds = readers.reduce((acc, r) => acc + r.totalDwellSeconds, 0);

  return {
    ...base,
    affiliations: Array.isArray(base.affiliations) ? base.affiliations : [],
    openAlexId: row.open_alex_id ? String(row.open_alex_id) : base.openAlexId,
    citedByCount: Number(row.cited_by_count ?? base.citedByCount ?? 0),
    readingStatus: (currentUserId ? (myEntry?.readingStatus || 'unread') : (row.reading_status ? String(row.reading_status) : base.readingStatus || 'unread')) as ReadingStatus,
    isBookmarked: myEntry ? true : Boolean(row.is_bookmarked),
    collectors,
    likers,
    likedByMe: currentUserId ? likers.some((l) => l.userId === currentUserId) : false,
    readers,
    totalVisits,
    totalDwellSeconds,
    inMyKb: Boolean(myEntry),
    myPersonalTags: myEntry?.personalTags || [],
    myReadingStatus: myEntry?.readingStatus,
    comments,
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
  scope?: 'pool' | 'my_kb';
  collectedByUserId?: string;
  interactedByUserId?: string;
}

export function listPapers(filters: PaperQueryFilters = {}, currentUserId?: string): AcademicPaper[] {
  const rows = db
    .prepare('SELECT * FROM papers ORDER BY published_date DESC, synced_at DESC')
    .all() as Record<string, unknown>[];

  const ctx = getSocialHydrationContext();
  let papers = rows.map((r) => hydratePaper(r, ctx, currentUserId));

  if (filters.scope === 'my_kb') {
    if (!currentUserId) return [];
    papers = papers.filter((p) => p.inMyKb);
  }
  if (filters.collectedByUserId && filters.collectedByUserId !== 'all') {
    papers = papers.filter((p) => (p.collectors || []).some((c) => c.userId === filters.collectedByUserId));
  }
  if (filters.interactedByUserId && filters.interactedByUserId !== 'all') {
    papers = papers.filter((p) => (p.readers || []).some((r) => r.userId === filters.interactedByUserId));
  }
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
    papers = papers.filter((p) => p.inMyKb || p.isBookmarked);
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
        ...(p.affiliations || []),
        ...p.tags,
        ...(p.myPersonalTags || []),
        ...(p.collectors || []).flatMap((c) => [c.displayName, ...c.userTags, ...c.personalTags]),
        p.anatomy.modelName || '',
        p.anatomy.figureCaption || '',
        p.anatomy.tableAnalysis || '',
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

export function getPaperById(id: string, currentUserId?: string): AcademicPaper | null {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? hydratePaper(row, getSocialHydrationContext(), currentUserId) : null;
}

export function isPaperSuppressed(title: string, doi?: string): boolean {
  return Boolean(db.prepare('SELECT id FROM deleted_papers WHERE lower(title) = lower(?) OR (? != ? AND lower(doi) = lower(?))').get(title.trim(), doi || '', '', doi || ''));
}

export function paperExistsByTitleOrDoi(title: string, doi?: string): boolean {
  if (doi && doi.trim()) {
    const byDoi = db.prepare('SELECT id FROM papers WHERE lower(doi) = lower(?)').get(doi.trim());
    if (byDoi) return true;
  }
  const byTitle = db.prepare('SELECT id FROM papers WHERE lower(title) = lower(?)').get(title.trim());
  return Boolean(byTitle);
}

export function upsertPaper(paper: AcademicPaper, currentUserId?: string): AcademicPaper {
  db.prepare('DELETE FROM deleted_papers WHERE lower(title) = lower(?) OR (doi != ? AND lower(doi) = lower(?))').run(paper.title, '', paper.doi || '');
  const {
    comments,
    collectors: _c,
    likers: _l,
    likedByMe: _lm,
    readers: _r,
    totalVisits: _tv,
    totalDwellSeconds: _td,
    inMyKb: _i,
    myPersonalTags: _mt,
    myReadingStatus: _ms,
    ...rest
  } = paper;
  const existing = db.prepare('SELECT id, payload FROM papers WHERE id = ?').get(paper.id) as { id: string; payload: string } | undefined;
  if (existing) {
    try {
      const prev = JSON.parse(String(existing.payload)) as Partial<AcademicPaper>;
      if ((!rest.anatomy.paperFigures || rest.anatomy.paperFigures.length === 0) && prev.anatomy?.paperFigures?.length) {
        rest.anatomy = { ...rest.anatomy, paperFigures: prev.anatomy.paperFigures };
      }
      if ((!rest.anatomy.paperTables || rest.anatomy.paperTables.length === 0) && prev.anatomy?.paperTables?.length) {
        rest.anatomy = { ...rest.anatomy, paperTables: prev.anatomy.paperTables };
      }
    } catch {
      /* ignore */
    }
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
    const insC = db.prepare(`
      INSERT OR IGNORE INTO comments (id, paper_id, entry_type, user_id, username, user_tags, author, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of comments) {
      insC.run(
        c.id,
        paper.id,
        c.entryType || 'comment',
        c.userId || null,
        c.username || null,
        JSON.stringify(c.userTags || []),
        c.author,
        c.role,
        c.content,
        c.createdAt
      );
    }
  }
  return getPaperById(paper.id, currentUserId)!;
}

export function updatePaperLibraryState(
  id: string,
  patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus },
  currentUserId?: string
): AcademicPaper | null {
  const row = db.prepare('SELECT * FROM papers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  if (currentUserId) {
    if (patch.isBookmarked === false) {
      removeUserKbItem(currentUserId, id);
    } else {
      upsertUserKbItem(currentUserId, id, { readingStatus: patch.readingStatus });
    }
  } else {
    const nextBookmarked = patch.isBookmarked !== undefined ? (patch.isBookmarked ? 1 : 0) : Number(row.is_bookmarked);
    const nextStatus = patch.readingStatus ?? String(row.reading_status || 'unread');
    db.prepare('UPDATE papers SET is_bookmarked = ?, reading_status = ? WHERE id = ?')
      .run(nextBookmarked, nextStatus, id);
  }

  return getPaperById(id, currentUserId);
}

export function deletePaper(id: string): boolean {
  const paper = db.prepare('SELECT title, doi FROM papers WHERE id = ?').get(id) as { title: string; doi: string } | undefined;
  if (!paper) return false;
  db.prepare('INSERT OR REPLACE INTO deleted_papers (id, title, doi, deleted_at) VALUES (?, ?, ?, ?)').run(id, paper.title, paper.doi, new Date().toISOString());
  db.prepare('DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE paper_id = ?)').run(id);
  db.prepare('DELETE FROM comments WHERE paper_id = ?').run(id);
  db.prepare('DELETE FROM user_kb WHERE paper_id = ?').run(id);
  db.prepare('DELETE FROM reading_sessions WHERE paper_id = ?').run(id);
  db.prepare('DELETE FROM paper_reads WHERE paper_id = ?').run(id);
  db.prepare('DELETE FROM paper_likes WHERE paper_id = ?').run(id);
  const res = db.prepare('DELETE FROM papers WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function addComment(params: {
  paperId: string;
  entryType?: EntryType;
  user?: UserProfile | null;
  author?: string;
  role?: string;
  content: string;
  parentId?: string;
  replyToAuthor?: string;
}): PaperComment | null {
  const exists = db.prepare('SELECT id FROM papers WHERE id = ?').get(params.paperId);
  if (!exists) return null;
  const parent = params.parentId ? db.prepare('SELECT id, author FROM comments WHERE id = ? AND paper_id = ?').get(params.parentId, params.paperId) as { id: string; author: string } | undefined : undefined;
  if (params.parentId && !parent) return null;
  const now = new Date().toISOString();
  const id = `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entryType: EntryType = params.entryType === 'thought' ? 'thought' : 'comment';
  const author = params.user?.displayName || params.author?.trim() || '访客学者';
  const role = params.role?.trim() || (entryType === 'thought' ? '深度思考' : '学术评论');
  const userTags = params.user?.userTags || [];
  const avatarColor = params.user?.avatarColor || pickAvatarColor(author);

  db.prepare(`
    INSERT INTO comments (id, paper_id, entry_type, user_id, username, avatar_color, user_tags, author, role, content, parent_id, reply_to_author, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.paperId,
    entryType,
    params.user?.id || null,
    params.user?.username || null,
    avatarColor,
    JSON.stringify(userTags),
    author,
    role,
    params.content.trim(),
    params.parentId || null,
    parent?.author || null,
    now
  );

  const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Record<string, unknown>;
  return hydrateCommentRow(row, getSocialHydrationContext(), params.user?.id);
}

export function updateComment(
  paperId: string,
  commentId: string,
  patch: { content: string; entryType?: EntryType },
  requestUser?: UserProfile | null
): PaperComment | null {
  const row = db.prepare('SELECT * FROM comments WHERE id = ? AND paper_id = ?').get(commentId, paperId) as Record<string, unknown> | undefined;
  if (!row) return null;

  // Permission check: owner, admin, or unowned comment
  if (!requestUser || (requestUser.role !== 'admin' && String(row.user_id || '') !== requestUser.id)) {
    throw new Error('无权修改他人发布的评论或思考');
  }

  const nextType = patch.entryType ?? String(row.entry_type || 'comment');
  const now = new Date().toISOString();
  db.prepare('UPDATE comments SET content = ?, entry_type = ?, updated_at = ? WHERE id = ? AND paper_id = ?')
    .run(patch.content.trim(), nextType, now, commentId, paperId);

  const updated = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as Record<string, unknown>;
  return hydrateCommentRow(updated, getSocialHydrationContext(), requestUser?.id);
}

export function deleteComment(paperId: string, commentId: string, requestUser?: UserProfile | null): boolean {
  const row = db.prepare('SELECT * FROM comments WHERE id = ? AND paper_id = ?').get(commentId, paperId) as Record<string, unknown> | undefined;
  if (!row) return false;
  if (!requestUser || (requestUser.role !== 'admin' && String(row.user_id || '') !== requestUser.id)) {
    throw new Error('无权删除他人的评论或思考');
  }
  db.prepare('DELETE FROM comment_likes WHERE comment_id = ?').run(commentId);
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
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const totalKbLinks = (db.prepare('SELECT COUNT(*) as c FROM user_kb').get() as { c: number }).c;
  const recentSyncs = getSyncLogs(8);
  return {
    dbPath: DB_PATH,
    sizeKB: stats ? Math.round((stats.size / 1024) * 10) / 10 : 0,
    totalPapers,
    totalComments,
    totalUsers,
    totalKbLinks,
    recentSyncs,
  };
}

export function getReadingAnalytics(userId?: string): ReadingAnalytics {
  const where = userId ? ' WHERE pr.user_id = ?' : '';
  const args = userId ? [userId] : [];
  const rows = db.prepare(`SELECT p.id, p.payload, SUM(pr.visit_count) as visits, SUM(pr.total_dwell_seconds) as seconds FROM paper_reads pr JOIN papers p ON p.id = pr.paper_id${where} GROUP BY p.id ORDER BY visits DESC, seconds DESC`).all(...args) as Array<{ id: string; payload: string; visits: number; seconds: number }>;
  const keywords = new Map<string, { keyword: string; visits: number; paperCount: number }>();
  const topics = new Map<AcademicPaper['topics'][number], { topic: AcademicPaper['topics'][number]; visits: number; seconds: number }>();
  const papers = rows.map(row => {
    const p = JSON.parse(row.payload) as AcademicPaper;
    for (const keyword of new Set([...p.tags, ...(p.anatomy.modelName ? [p.anatomy.modelName] : [])].map(t => t.trim()).filter(Boolean))) {
      const key = keyword.toLowerCase(); const prev = keywords.get(key) || { keyword, visits: 0, paperCount: 0 };
      prev.visits += Number(row.visits); prev.paperCount++; keywords.set(key, prev);
    }
    for (const topic of p.topics) {
      const prev = topics.get(topic) || { topic, visits: 0, seconds: 0 };
      prev.visits += Number(row.visits); prev.seconds += Number(row.seconds); topics.set(topic, prev);
    }
    return { id: p.id, title: p.titleZh || p.title, journal: p.journalShort, visits: Number(row.visits), seconds: Number(row.seconds), topics: p.topics };
  });
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) as c FROM ${table}${userId ? ' WHERE user_id = ?' : ''}`).get(...args) as { c: number }).c;
  const timeline = db.prepare(`SELECT substr(started_at,1,10) as date, COUNT(*) as visits, SUM(elapsed_seconds) as seconds FROM reading_sessions${userId ? ' WHERE user_id = ?' : ''} GROUP BY date ORDER BY date DESC LIMIT 30`).all(...args) as ReadingAnalytics['timeline'];
  return { scopeLabel: userId ? (db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as { display_name: string } | undefined)?.display_name || '我的阅读' : '全体成员', totalVisits: papers.reduce((s,p) => s+p.visits,0), totalSeconds: papers.reduce((s,p) => s+p.seconds,0), readPaperCount: papers.length, collectionCount: count('user_kb'), likeCount: count('paper_likes'), commentCount: count('comments'), papers, keywords: [...keywords.values()].sort((a,b)=>b.visits-a.visits).slice(0,40), topics: [...topics.values()], timeline: timeline.reverse() };
}

export function compactDatabase(): void { db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);'); }

export function listPaperIds(): string[] { return (db.prepare('SELECT id FROM papers').all() as Array<{ id: string }>).map(p => p.id); }
