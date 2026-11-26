import type {
  AcademicPaper,
  ReadingAnalytics,
  LibraryInventory,
  AutoSyncConfig,
  EntryType,
  PaperComment,
  ReadingStatus,
  UserProfile,
  PdfImportJob,
  LabEntry,
} from '../types/paper';

const TOKEN_KEY = 'paperpulse_auth_token';
export async function labRequest(method='GET',id='',body?:unknown):Promise<LabEntry[]> {
  const res=await apiFetch('/api/lab'+(id?'/'+encodeURIComponent(id):''),{method,headers:authHeaders({'Content-Type':'application/json'}),...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'课题组文献操作失败');return data.entries;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && !String(input).includes('/api/auth/login')) {
    setAuthToken(null);
    window.dispatchEvent(new Event('paperpulse-auth-required'));
  }
  return response;
}

export interface PaperFilters {
  q?: string;
  domain?: string;
  topic?: string;
  journal?: string;
  datasetType?: string;
  bookmarked?: boolean;
  readingStatus?: string;
  year?: string; month?: string; dateBasis?: 'published'|'synced';
  recentOnly?: boolean;
  date?: string;
  scope?: 'pool' | 'my_kb';
  collectedBy?: string;
  interactedBy?: string;
}

export interface StorageStats {
  dbPath: string;
  sizeKB: number;
  totalPapers: number;
  totalComments: number;
  totalUsers?: number;
  totalKbLinks?: number;
  recentSyncs: Array<{ id: number; syncedAt: string; source: string; addedCount: number; notes: string }>;
}

/* ---------- Auth & Users ---------- */
export async function registerAccount(payload: {
  username: string;
  password: string;
  displayName?: string;
  userTags?: string[];
}): Promise<{ user: UserProfile; token: string }> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '注册失败');
  setAuthToken(data.token);
  return data;
}

export async function loginAccount(username: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '登录失败');
  setAuthToken(data.token);
  return data;
}

export async function logoutAccount(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
  setAuthToken(null);
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  if (!getAuthToken()) return null;
  const res = await apiFetch('/api/auth/me', { headers: authHeaders() });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: UserProfile | null };
  return data.user;
}

export async function fetchUsersList(): Promise<UserProfile[]> {
  const res = await apiFetch('/api/users', { headers: authHeaders() });
  if (!res.ok) return [];
  const data = (await res.json()) as { users: UserProfile[] };
  return data.users;
}

export async function createManagedUser(payload: {
  username: string;
  password: string;
  displayName?: string;
  userTags?: string[];
  role?: 'admin' | 'member';
}): Promise<UserProfile> {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '创建用户失败');
  return data.user;
}

export async function updateUserAccount(
  id: string,
  patch: { username?: string; displayName?: string; userTags?: string[]; role?: 'admin' | 'member'; newPassword?: string }
): Promise<UserProfile> {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '更新用户失败');
  return data.user;
}

export async function deleteUserAccount(id: string): Promise<void> {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '删除用户失败');
  }
}

/* ---------- Personal Knowledge Base ---------- */
export async function upsertMyKbPaper(
  paperId: string,
  payload: { personalTags?: string[]; readingStatus?: ReadingStatus } = {}
): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/kb/${encodeURIComponent(paperId)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '加入个人知识库失败');
  return data.paper;
}

export async function removeMyKbPaper(paperId: string): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/kb/${encodeURIComponent(paperId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '移出知识库失败');
  return data.paper;
}

/* ---------- Papers ---------- */
export async function fetchPapers(filters: PaperFilters = {}): Promise<AcademicPaper[]> {
  const params = new URLSearchParams();
  if(filters.year && filters.year!=='all')params.set('year',filters.year);
  if(filters.month && filters.month!=='all')params.set('month',filters.month);
  if(filters.dateBasis)params.set('dateBasis',filters.dateBasis);
  if (filters.q) params.set('q', filters.q);
  if (filters.domain && filters.domain !== 'all') params.set('domain', filters.domain);
  if (filters.topic && filters.topic !== 'all') params.set('topic', filters.topic);
  if (filters.journal && filters.journal !== 'all') params.set('journal', filters.journal);
  if (filters.datasetType && filters.datasetType !== 'all') params.set('datasetType', filters.datasetType);
  if (filters.bookmarked) params.set('bookmarked', 'true');
  if (filters.readingStatus && filters.readingStatus !== 'all') params.set('readingStatus', filters.readingStatus);
  if (filters.recentOnly) params.set('recentOnly', 'true');
  if (filters.date) params.set('date', filters.date);
  if (filters.scope) params.set('scope', filters.scope);
  if (filters.collectedBy && filters.collectedBy !== 'all') params.set('collectedBy', filters.collectedBy);
  if (filters.interactedBy && filters.interactedBy !== 'all') params.set('interactedBy', filters.interactedBy);

  const res = await apiFetch(`/api/papers?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取文献列表失败');
  const data = (await res.json()) as { papers: AcademicPaper[] };
  return data.papers;
}

export async function createPaper(
  payload: Partial<AcademicPaper> & { quickAbstract?: string; addToMyKb?: boolean; personalTags?: string[] }
): Promise<AcademicPaper> {
  const res = await apiFetch('/api/papers', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || '创建文献失败');
  }
  const data = (await res.json()) as { paper: AcademicPaper };
  return data.paper;
}

export async function importPaperByIdentifier(
  identifier: string,
  options: { addToMyKb?: boolean; personalTags?: string[] } = {}
): Promise<{ paper: AcademicPaper; alreadyExists: boolean }> {
  const res = await apiFetch('/api/papers/import', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ identifier, ...options }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || '导入文献失败');
  }
  return (await res.json()) as { paper: AcademicPaper; alreadyExists: boolean };
}

export async function reparsePaper(id: string): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(id)}/reparse`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '自动解析失败');
  return data.paper;
}

export async function uploadPdfPaper(file:File,addToMyKb=true,destination:'pool'|'lab'='pool'):Promise<PdfImportJob> {
  const res=await apiFetch('/api/papers/upload-pdf',{method:'POST',headers:authHeaders({'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name),'X-Add-To-Kb':addToMyKb?'1':'0','X-Library-Destination':destination}),body:file});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'PDF上传失败');
  return data.job;
}
export async function fetchPdfImportJobs():Promise<PdfImportJob[]> {
  const res=await apiFetch('/api/pdf-imports',{headers:authHeaders()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'无法获取解析任务');return data.jobs;
}
export async function fetchPaperDetail(id:string):Promise<AcademicPaper> {
  const res=await apiFetch(`/api/papers/${encodeURIComponent(id)}`,{headers:authHeaders()});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'无法打开文献');return data.paper;
}

export async function uploadPaperMedia(
  id: string,
  payload: {
    kind: 'method_figure' | 'experiment_figure' | 'table_image';
    dataUrl: string;
    label?: string;
    captionOriginal?: string;
    analysisZh?: string;
  }
): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(id)}/media`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传原文图表失败');
  return data.paper;
}

export async function updatePaper(id: string, payload: Partial<AcademicPaper>): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
  const res = await apiFetch(`/api/papers/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('状态更新失败');
  const data = (await res.json()) as { paper: AcademicPaper };
  return data.paper;
}

export async function removePaper(id: string): Promise<void> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除失败');
}

/* ---------- Social Reading Footprints, Likes & Comments CRUD ---------- */
export async function recordPaperRead(
  paperId: string,
  payload: { incrementVisit?: boolean; addDwellSeconds?: number; visitId?: string; elapsedSeconds?: number }
): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/read`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    keepalive: true,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '记录浏览时长失败');
  return data.paper;
}

export async function toggleLikePaper(paperId: string): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/like`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '点赞操作失败');
  return data.paper;
}

export async function repostPaperApi(paperId: string, note = ''): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/repost`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ note }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '转发失败');
  return data.paper;
}

export async function unrepostPaperApi(paperId: string): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/repost`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '取消转发失败');
  return data.paper;
}

export async function toggleLikeComment(paperId: string, commentId: string): Promise<PaperComment> {
  const res = await apiFetch(
    `/api/papers/${encodeURIComponent(paperId)}/comments/${encodeURIComponent(commentId)}/like`,
    {
      method: 'POST',
      headers: authHeaders(),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '评论点赞失败');
  return data.comment;
}

export async function postComment(
  paperId: string,
  payload: {
    content: string;
    entryType?: EntryType;
    author?: string;
    role?: string;
    parentId?: string;
    replyToAuthor?: string;
  }
): Promise<PaperComment> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/comments`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '发布失败');
  return data.comment;
}

export async function editComment(
  paperId: string,
  commentId: string,
  payload: { content: string; entryType?: EntryType }
): Promise<PaperComment> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '更新失败');
  return data.comment;
}

export async function removeComment(paperId: string, commentId: string): Promise<void> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '删除失败');
  }
}

/* ---------- Sync ---------- */
export async function syncLiveFeed(query?: string): Promise<{
  syncedAt: string;
  addedCount: number;
  addedPapers: AcademicPaper[];
  source: string;
}> {
  const res = await apiFetch('/api/sync', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
  const res = await apiFetch('/api/auto-sync/config', { headers: authHeaders() });
  if (!res.ok) throw new Error('获取自动追踪配置失败');
  return (await res.json()) as { config: AutoSyncConfig; storage: StorageStats };
}

export async function updateAutoSyncConfig(patch: Partial<AutoSyncConfig>): Promise<AutoSyncConfig> {
  const res = await apiFetch('/api/auto-sync/config', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('更新配置失败');
  const data = (await res.json()) as { config: AutoSyncConfig };
  return data.config;
}

export async function fetchReadingAnalytics(userId?: string): Promise<ReadingAnalytics> {
  const res = await apiFetch('/api/analytics' + (userId ? '?userId=' + encodeURIComponent(userId) : ''), { headers: authHeaders() });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || '读取统计失败'); return data.analytics;
}
export async function fetchLibraryInventory(): Promise<LibraryInventory> {
  const res = await apiFetch('/api/admin/library', { headers: authHeaders() });
  if (!res.ok) throw new Error('读取文献存储失败'); return res.json();
}
export async function deleteLibraryPapers(ids: string[]): Promise<LibraryInventory> {
  const res = await apiFetch('/api/admin/library/delete', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ids }) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || '删除失败'); return data.inventory;
}
export async function compactLibrary(): Promise<LibraryInventory> {
  const res = await apiFetch('/api/admin/library/compact', { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error('压缩数据库失败'); return res.json();
}
export async function uploadLabPaperPdf(paperId: string, file: File): Promise<{ entries: LabEntry[]; paper: AcademicPaper }> {
  const res = await apiFetch(`/api/lab/${encodeURIComponent(paperId)}/pdf`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(file.name),
    }),
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'PDF 上传与解析失败');
  return data as { entries: LabEntry[]; paper: AcademicPaper };
}

export async function uploadAndParsePaperPdf(paperId: string, file: File): Promise<AcademicPaper> {
  const res = await apiFetch(`/api/papers/${encodeURIComponent(paperId)}/pdf`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(file.name),
    }),
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'PDF 上传与解析失败');
  return data.paper as AcademicPaper;
}
