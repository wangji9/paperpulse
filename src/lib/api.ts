import type { AcademicPaper, AutoSyncConfig, PaperComment, ReadingStatus } from '../types/paper';

export interface PaperFilters {
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

export interface StorageStats {
  dbPath: string;
  sizeKB: number;
  totalPapers: number;
  totalComments: number;
  recentSyncs: Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }>;
}

export async function fetchPapers(filters: PaperFilters = {}): Promise<AcademicPaper[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.domain && filters.domain !== 'all') params.set('domain', filters.domain);
  if (filters.topic && filters.topic !== 'all') params.set('topic', filters.topic);
  if (filters.journal && filters.journal !== 'all') params.set('journal', filters.journal);
  if (filters.datasetType && filters.datasetType !== 'all') params.set('datasetType', filters.datasetType);
  if (filters.bookmarked) params.set('bookmarked', 'true');
  if (filters.readingStatus && filters.readingStatus !== 'all') params.set('readingStatus', filters.readingStatus);
  if (filters.recentOnly) params.set('recentOnly', 'true');
  if (filters.date) params.set('date', filters.date);

  const res = await fetch(`/api/papers?${params.toString()}`);
  if (!res.ok) throw new Error('获取文献列表失败');
  const data = (await res.json()) as { papers: AcademicPaper[] };
  return data.papers;
}

export async function createPaper(payload: Partial<AcademicPaper> & { quickAbstract?: string }): Promise<AcademicPaper> {
  const res = await fetch('/api/papers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || '创建文献失败');
  }
  const data = (await res.json()) as { paper: AcademicPaper };
  return data.paper;
}

export async function importPaperByIdentifier(identifier: string): Promise<{ paper: AcademicPaper; alreadyExists: boolean }> {
  const res = await fetch('/api/papers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || '导入文献失败');
  }
  return (await res.json()) as { paper: AcademicPaper; alreadyExists: boolean };
}

export async function updatePaper(id: string, payload: Partial<AcademicPaper>): Promise<AcademicPaper> {
  const res = await fetch(`/api/papers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('更新文献失败');
  const data = (await res.json()) as { paper: AcademicPaper };
  return data.paper;
}

export async function updatePaperLibraryState(
  id: string,
  patch: { isBookmarked?: boolean; readingStatus?: ReadingStatus }
): Promise<AcademicPaper> {
  const res = await fetch(`/api/papers/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('状态更新失败');
  const data = (await res.json()) as { paper: AcademicPaper };
  return data.paper;
}

export async function removePaper(id: string): Promise<void> {
  const res = await fetch(`/api/papers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除失败');
}

export async function postComment(paperId: string, author: string, role: string, content: string): Promise<PaperComment> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, role, content }),
  });
  if (!res.ok) throw new Error('笔记保存失败');
  const data = (await res.json()) as { comment: PaperComment };
  return data.comment;
}

export async function removeComment(paperId: string, commentId: string): Promise<void> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除笔记失败');
}

export async function syncLiveFeed(query?: string): Promise<{
  syncedAt: string;
  addedCount: number;
  addedPapers: AcademicPaper[];
  source: string;
}> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || '实时同步失败');
  }
  return (await res.json()) as {
    syncedAt: string;
    addedCount: number;
    addedPapers: AcademicPaper[];
    source: string;
  };
}

export async function fetchAutoSyncStatus(): Promise<{ config: AutoSyncConfig; storage: StorageStats }> {
  const res = await fetch('/api/auto-sync/config');
  if (!res.ok) throw new Error('获取自动追踪配置失败');
  return (await res.json()) as { config: AutoSyncConfig; storage: StorageStats };
}

export async function updateAutoSyncConfig(patch: Partial<AutoSyncConfig>): Promise<AutoSyncConfig> {
  const res = await fetch('/api/auto-sync/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('更新配置失败');
  const data = (await res.json()) as { config: AutoSyncConfig };
  return data.config;
}
