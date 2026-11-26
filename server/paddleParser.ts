import fs from 'node:fs';

export interface BaiduParsedFigure {
  id: string;
  label: string;
  url: string;
  captionOriginal: string;
  category: 'method' | 'experiment';
  width?: number;
  height?: number;
  page?: number;
  score?: number;
}

export interface BaiduParsedTable {
  id: string;
  label: string;
  imageUrl: string;
  captionOriginal: string;
  width?: number;
  height?: number;
  page?: number;
  score?: number;
}

export interface BaiduPdfParseResult {
  engine: string;
  pages: number;
  text: string;
  sections: Record<string, string>;
  keywords: string[];
  warnings: string[];
  metadata: {
    title: string;
    authors: string[];
    doi: string;
    arxivId: string;
    publishedDate: string;
  };
  figures: BaiduParsedFigure[];
  tables: BaiduParsedTable[];
  elapsedMs?: number;
}

const cache = new Map<string, { at: number; data: BaiduPdfParseResult }>();

export function getPaddleParserUrl(): string {
  return (process.env.PADDLE_PARSER_URL || '').trim().replace(/\/+$/, '');
}

/**
 * Call the Baidu PaddleOCR (PP-DocLayout_plus-L) microservice over internal Docker HTTP.
 * Shares /app/data volume with paperpulse so zero binary transfer overhead occurs.
 */
export async function parsePdfWithBaiduService(
  pdfPath: string,
  outDir?: string,
  urlPrefix?: string
): Promise<BaiduPdfParseResult | null> {
  const baseUrl = getPaddleParserUrl();
  if (!baseUrl || !fs.existsSync(pdfPath)) return null;

  const stat = fs.statSync(pdfPath);
  const cacheKey = `${pdfPath}|${stat.mtimeMs}|${outDir || ''}|${urlPrefix || ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 90_000) {
    return hit.data;
  }

  // Also check if a full media+text parse for the exact same PDF already ran moments ago when caller only needs text
  if (!outDir) {
    for (const [k, v] of cache.entries()) {
      if (k.startsWith(`${pdfPath}|${stat.mtimeMs}|`) && Date.now() - v.at < 90_000) {
        return v.data;
      }
    }
  }

  try {
    const res = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_path: pdfPath,
        out_dir: outDir || undefined,
        url_prefix: urlPrefix || undefined,
      }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[Baidu PaddleOCR] HTTP ${res.status}: ${txt.slice(0, 300)}`);
      return null;
    }
    const parsed = (await res.json()) as BaiduPdfParseResult;
    cache.set(cacheKey, { at: Date.now(), data: parsed });
    // Evict old entries
    if (cache.size > 24) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return parsed;
  } catch (err) {
    console.error('[Baidu PaddleOCR] request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Strict abstract sanitizer: removes leading "Abstract/ARTICLE INFO" and cuts off any leaked
 * Keywords, Table of Contents dot leaders, receipt/fund/author-bio metadata, or Section 1 intro.
 */
export function sanitizeCleanAbstract(raw: string): string {
  let s = String(raw || '')
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  s = s.replace(
    /^(?:ARTICLE\s+INFO\s*)?(?:A\s*B\s*S\s*T\s*R\s*A\s*C\s*T|Abstract|文章信息|摘\s*要)\s*[:：.\-—]?\s*/i,
    ''
  );

  const stopRe =
    /(?:\bKeywords?\s*[:：]|关键词\s*[:：]|中图分类号\s*[:：]|收稿日期\s*[:：]|修回日期\s*[:：]|基金项目\s*[:：]|作者简介\s*[:：]|通信作者\s*[:：]|\bARTICLE\s+INFO\b|\bContents\b\s+1\.|\b1\.\s+Introduction\b|(?:\.{5,}))/i;
  const m = stopRe.exec(s);
  if (m && m.index >= 40) {
    s = s.slice(0, m.index).trim();
  }
  if (s.includes('.....')) {
    s = s.split('.....')[0].trim();
  }
  return s.slice(0, 4500).trim();
}

export function looksCorruptedAbstract(raw?: string): boolean {
  if (!raw || !raw.trim()) return true;
  if (raw.includes('....') || raw.includes('……')) return true;
  if (/(?:收稿日期|基金项目|作者简介|中图分类号|Contents\s+1\.|1\.\s*引言|2\.\s*系统性综述)/.test(raw)) return true;
  if (raw.length > 2600 && /(?:关键词|Keywords|1\s+风力|1\.\s+Introduction)/i.test(raw)) return true;
  return false;
}
