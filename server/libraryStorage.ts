import fs from 'node:fs';
import path from 'node:path';
import { PAPER_ASSETS_DIR } from './paperMediaExtractor.js';
import { getAutoSyncConfig, getDatabaseStats, listPaperIds, listPapers } from './db.js';
import type { LibraryInventory } from '../src/types/paper.js';

function assetDirectory(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const dir = path.resolve(PAPER_ASSETS_DIR, safe);
  if (!safe || !dir.startsWith(path.resolve(PAPER_ASSETS_DIR) + path.sep)) throw new Error('无效的文献资源路径');
  return dir;
}
export function directoryBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(dir).reduce((n, name) => n + directoryBytes(path.join(dir, name)), 0);
}
export function removePaperAssets(id: string): void {
  const dir = assetDirectory(id);
  // Keep a directory if another paper references it through the same sanitized ID.
  if (listPaperIds().some(id => assetDirectory(id) === dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}
export function getLibraryInventory(): LibraryInventory {
  const stats = getDatabaseStats();
  const databaseBytes = ['', '-wal', '-shm'].reduce((n, suffix) => {
    const file = stats.dbPath + suffix;
    return n + (fs.existsSync(file) ? fs.statSync(file).size : 0);
  }, 0);
  const papers = listPapers().map(p => {
    const assetBytes = directoryBytes(assetDirectory(p.id));
    return { id: p.id, title: p.titleZh || p.title, journal: p.journalShort, publishedDate: p.publishedDate, syncedAt: p.syncedAt, bytes: Buffer.byteLength(JSON.stringify(p)) + assetBytes, assetBytes, visits: p.totalVisits || 0, collectors: p.collectors?.length || 0 };
  });
  return { totalPapers: papers.length, databaseBytes, assetBytes: directoryBytes(PAPER_ASSETS_DIR), maxStoredPapers: getAutoSyncConfig().maxStoredPapers || 1000, papers };
}
