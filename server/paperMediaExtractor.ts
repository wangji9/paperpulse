import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AcademicPaper, OriginalPaperFigure, OriginalPaperTable } from '../src/types/paper.js';
import { load } from 'cheerio';
import { sanitizePaperTableHtml } from './tableSafety.js';
export { sanitizePaperTableHtml } from './tableSafety.js';
import { translateToZh } from './liveFetcher.js';
import { parsePdfWithBaiduService } from './paddleParser.js';

const execFileAsync = promisify(execFile);

export const PAPER_ASSETS_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'paper-assets');
if (!fs.existsSync(PAPER_ASSETS_DIR)) {
  fs.mkdirSync(PAPER_ASSETS_DIR, { recursive: true });
}

const UA_BROWSER = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

function safeDirName(paperId: string): string {
  return paperId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function stripTags(html: string): string {
  return html
    .replace(/<annotation[\s\S]*?<\/annotation>/gi, '')
    .replace(/<annotation-xml[\s\S]*?<\/annotation-xml>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}


async function downloadImageToAssets(imgUrl: string, paperDir: string, urlPrefix: string, baseName: string): Promise<string | null> {
  try {
    const res = await fetch(imgUrl, {
      headers: UA_BROWSER,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype.includes('text/html')) return null;
    let buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return null;
    // Skip tiny icons / badges (< 3.5 KB)
    if (buf.length < 3500) return null;

    let ext = '.png';
    if (ctype.includes('jpeg') || ctype.includes('jpg') || /\.jpe?g(\?|$)/i.test(imgUrl)) ext = '.jpg';
    else if (ctype.includes('webp') || /\.webp(\?|$)/i.test(imgUrl)) ext = '.webp';
    else if (ctype.includes('svg') || /\.svg(\?|$)/i.test(imgUrl)) {
      const $ = load(buf.toString('utf8'), { xmlMode: true });
      if (!$('svg').length) return null;
      $('script,foreignObject,iframe,object,embed').remove();
      $('*').each((_,el) => { for(const key of Object.keys($(el).attr() || {})) { const value=$(el).attr(key)||''; if(/^on/i.test(key) || ((key==='href'||key==='xlink:href') && !value.startsWith('#') && !/^data:image\/(png|jpeg);base64,/i.test(value))) $(el).removeAttr(key); } });
      buf=Buffer.from($.xml()); ext='.svg';
    } else if (!ctype.startsWith('image/')) return null;

    fs.mkdirSync(paperDir, { recursive: true });
    const filename = `${baseName}${ext}`;
    fs.writeFileSync(path.join(paperDir, filename), buf);
    return `${urlPrefix}/${filename}`;
  } catch {
    return null;
  }
}

function resolveHtmlAssetUrl(src: string, htmlUrl: string, htmlText: string): string {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  const baseTag = htmlText.match(/<base[^>]+href=["']([^"']+)["']/i)?.[1];
  if (baseTag) {
    try {
      return new URL(src, new URL(baseTag, htmlUrl).toString()).toString();
    } catch {
      /* fallback */
    }
  }
  // Handle arxiv.org/html/<id> where relative paths start with "<id>v1/..."
  if (/arxiv\.org\/html\//i.test(htmlUrl) && /^\d{4}\.\d{4,5}v\d+\//.test(src)) {
    return `https://arxiv.org/html/${src}`;
  }
  try {
    const base = htmlUrl.endsWith('/') ? htmlUrl : `${htmlUrl}/`;
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

async function prepareNativeTable(html: string, pageUrl: string, pageHtml: string, paperDir: string, urlPrefix: string, index: number): Promise<string> {
  const $ = load(html, {}, false);
  const assets = $('object[data],embed[src],img[src]').toArray().slice(0,12);
  for (let i=0;i<assets.length;i++) {
    const el=$(assets[i]); const src=el.attr('data')||el.attr('src')||'';
    const url=resolveHtmlAssetUrl(src,pageUrl,pageHtml);
    const local=/^https:\/\//.test(url)?await downloadImageToAssets(url,paperDir,urlPrefix,`table_${index}_asset_${i}`):null;
    if(local) el.replaceWith($('<img>').attr('src',local).attr('alt',el.attr('alt')||'原文表格配图')); else el.remove();
  }
  return sanitizePaperTableHtml($.html());
}

function extractTopLevelFigures(html: string): Array<{ attrs: string; inner: string }> {
  const out: Array<{ attrs: string; inner: string }> = [];
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < html.length) {
    const start = lower.indexOf('<figure', pos);
    if (start === -1) break;
    const tagEnd = html.indexOf('>', start);
    if (tagEnd === -1) break;
    const attrs = html.slice(start + 7, tagEnd);
    let depth = 0;
    let cur = tagEnd;
    while (cur < html.length) {
      const nextOpen = lower.indexOf('<figure', cur + 1);
      const nextClose = lower.indexOf('</figure>', cur + 1);
      if (nextClose === -1) {
        cur = html.length;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cur = nextOpen;
      } else {
        if (depth === 0) {
          out.push({ attrs, inner: html.slice(tagEnd + 1, nextClose) });
          pos = nextClose + 9;
          break;
        }
        depth--;
        cur = nextClose;
      }
    }
    if (cur >= html.length) break;
  }
  return out;
}

function extractBalancedTables(html: string): string[] {
  const out: string[] = [];
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < html.length) {
    const start = lower.indexOf('<table', pos);
    if (start === -1) break;
    let depth = 0;
    let cur = start;
    while (cur < html.length) {
      const nextOpen = lower.indexOf('<table', cur + 1);
      const nextClose = lower.indexOf('</table>', cur + 1);
      if (nextClose === -1) {
        cur = html.length;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cur = nextOpen;
      } else {
        if (depth === 0) {
          out.push(html.slice(start, nextClose + 8));
          pos = nextClose + 8;
          break;
        }
        depth--;
        cur = nextClose;
      }
    }
    if (cur >= html.length) break;
  }
  return out;
}

async function buildCaptionAnalysisZh(
  label: string,
  captionEn: string,
  kind: 'method' | 'experiment' | 'table',
  paperMethodOrExpZh: string
): Promise<string> {
  const cleanCap = captionEn.replace(/^(?:Figure|Fig\.?|Table|TABLE)\s*\d+\s*[:.-]?\s*/i, '').trim();
  const zhCap = process.env.PAPERPULSE_TRANSLATE_CAPTIONS==='0' ? null : cleanCap ? await translateToZh(cleanCap, 420) : null;
  return zhCap ? `${label} 原文图注译文：${zhCap}` : cleanCap ? `${label} 原文图注：${cleanCap}` : `${label} 原文图表；图注暂不可用，请查看公开PDF。`;
}

/**
 * Extract native original figures & HTML tables from arXiv HTML5 or ar5iv
 */
async function extractFromArxivHtml(
  arxivId: string,
  paperDir: string,
  urlPrefix: string,
  methodContextZh: string,
  expContextZh: string
): Promise<{ figures: OriginalPaperFigure[]; tables: OriginalPaperTable[] }> {
  const cleanId = arxivId.replace(/^arXiv:/i, '').replace(/v\d+$/i, '').trim();
  const urlsToTry = [
    `https://arxiv.org/html/${cleanId}`,
    `https://ar5iv.labs.arxiv.org/html/${cleanId}`,
  ];

  let html = '';
  let finalUrl = '';
  for (const u of urlsToTry) {
    try {
      const r = await fetch(u, { headers: UA_BROWSER, redirect: 'follow', signal: AbortSignal.timeout(11000) });
      if (r.ok) {
        const txt = await r.text();
        if (txt.includes('<figure') || txt.includes('ltx_figure') || txt.includes('ltx_table')) {
          html = txt;
          finalUrl = r.url || u;
          break;
        }
      }
    } catch {
      /* next */
    }
  }
  if (!html) return { figures: [], tables: [] };

  const figures: OriginalPaperFigure[] = [];
  const tables: OriginalPaperTable[] = [];

  // Match top-level <figure> blocks properly (including nested subfigures)
  const figBlocks = extractTopLevelFigures(html);

  // 1. Candidate Figures with real <img>
  const candFigs: Array<{ idx: number; imgSrc: string; cap: string; score: number; cat: 'method' | 'experiment' }> = [];
  for (let i = 0; i < figBlocks.length; i++) {
    const attrs = figBlocks[i].attrs || '';
    const inner = figBlocks[i].inner || '';
    if (/ltx_table/i.test(attrs) || (/<table/i.test(inner) && !/<(?:img|object|embed)/i.test(inner))) continue;

    const imgMatches = Array.from(inner.matchAll(/<(?:img|object|embed)[^>]+(?:src|data)=["']([^"']+)["'][^>]*>/gi))
      .map((m) => m[1])
      .filter((s) => !/icon|logo|orcid|badge|cc-by|x1\.png$/i.test(s));
    if (imgMatches.length === 0) continue;

    const capRaw =
      inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ||
      inner.match(/class=["'][^"']*ltx_caption[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i)?.[1] ||
      '';
    const cap = stripTags(capRaw);
    if (cap.length < 8 && i > 4) continue;

    const low = cap.toLowerCase();
    const isMethodKw = /(overview|architecture|framework|pipeline|proposed|workflow|system|model|schematic|diagram|protocol|illustration)/i.test(low);
    const isExpKw = /(result|comparison|ablation|evaluation|performance|accuracy|benchmark|qualitative|quantitative)/i.test(low);

    let score = i === 0 ? 12 : i <= 3 ? 9 : i <= 7 ? 5 : 2;
    if (isMethodKw) score += 8;
    if (isExpKw) score += 4;
    if (/^(?:Figure|Fig\.?)\s*[A-Z]\d+/i.test(cap) || /\b(?:supplementary|appendix)\b/i.test(low)) {
      score -= 12;
    }

    const cat: 'method' | 'experiment' = isMethodKw || (candFigs.length === 0 && !isExpKw) ? 'method' : isExpKw ? 'experiment' : 'method';
    candFigs.push({ idx: i + 1, imgSrc: imgMatches[0], cap, score, cat });
  }

  // Pick up to 2 best method figures + 1 experiment figure
  candFigs.sort((a, b) => b.score - a.score);
  const pickedFigs = candFigs.slice(0, 3).sort((a, b) => a.idx - b.idx);

  for (let k = 0; k < pickedFigs.length; k++) {
    const cf = pickedFigs[k];
    const absImgUrl = resolveHtmlAssetUrl(cf.imgSrc, finalUrl, html);
    const localUrl = await downloadImageToAssets(absImgUrl, paperDir, urlPrefix, `arx_fig_${k + 1}`);
    if (!localUrl) continue;
    const labelMatch = cf.cap.match(/^(Figure\s*\d+|Fig\.?\s*\d+)/i);
    const label = labelMatch ? labelMatch[1].replace(/\s+/g, ' ') : `Figure ${k + 1}`;
    const analysisZh = await buildCaptionAnalysisZh(
      label,
      cf.cap,
      cf.cat,
      cf.cat === 'method' ? methodContextZh : expContextZh
    );
    figures.push({
      id: `fig-${k + 1}`,
      label,
      url: localUrl,
      captionOriginal: cf.cap,
      analysisZh,
      category: cf.cat,
    });
  }

  // 2. Candidate Experimental / Ablation Tables (<figure class="ltx_table">)
  const candTables: Array<{ idx: number; tblHtml: string; cap: string; score: number }> = [];
  for (let i = 0; i < figBlocks.length; i++) {
    const attrs = figBlocks[i].attrs || '';
    const inner = figBlocks[i].inner || '';
    if (!/ltx_table/i.test(attrs) && !/<table/i.test(inner)) continue;
    const extracted = extractBalancedTables(inner);
    if (extracted.length === 0) continue;
    const tbl = extracted[0];
    const trCount = (tbl.match(/<tr\b/gi) || []).length;
    if (trCount < 3 || trCount > 40) continue;

    const capRaw = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '';
    const cap = stripTags(capRaw);
    const low = cap.toLowerCase();
    let score = 5;
    if (/(result|comparison|main|performance|benchmark|evaluation|accuracy|sota)/i.test(low)) score += 10;
    if (/(ablation|component|variant|module)/i.test(low)) score += 8;

    if (/^(?:Figure|Fig\.?)[ .:]*\d/i.test(cap)) continue;
    candTables.push({ idx: i + 1, tblHtml: await prepareNativeTable(tbl, finalUrl, html, paperDir, urlPrefix, i), cap, score });
  }

  candTables.sort((a, b) => b.score - a.score);
  const pickedTables = candTables.slice(0, 2).sort((a, b) => a.idx - b.idx);
  for (let k = 0; k < pickedTables.length; k++) {
    const ct = pickedTables[k];
    const labelMatch = ct.cap.match(/^(Table\s*\d+|TABLE\s*[IVX\d]+)/i);
    const label = labelMatch ? labelMatch[1].replace(/\s+/g, ' ') : `Table ${k + 1}`;
    const analysisZh = await buildCaptionAnalysisZh(label, ct.cap, 'table', expContextZh);
    tables.push({
      id: `tbl-${k + 1}`,
      label,
      html: ct.tblHtml,
      captionOriginal: ct.cap,
      analysisZh,
    });
  }

  return { figures, tables };
}

/**
 * Extract native high-res figures & HTML tables from Springer Open Access (e.g. JIM 10.1007/...)
 */
async function extractFromSpringerHtml(
  doi: string,
  paperDir: string,
  urlPrefix: string,
  methodContextZh: string,
  expContextZh: string
): Promise<{ figures: OriginalPaperFigure[]; tables: OriginalPaperTable[] }> {
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
  if (!cleanDoi.startsWith('10.1007/')) return { figures: [], tables: [] };

  const figures: OriginalPaperFigure[] = [];
  const tables: OriginalPaperTable[] = [];
  try {
    const r = await fetch(`https://link.springer.com/article/${cleanDoi}`, {
      headers: UA_BROWSER,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { figures: [], tables: [] };
    const html = await r.text();

    // Extract figure URLs & captions
    const figUrlSet = new Set<string>();
    for (const m of html.matchAll(/https:\/\/media\.springernature\.com\/(?:lw1200|full|m685)\/springer-static\/image\/[^"'\s>]+Fig(\d+)_HTML\.(?:png|jpg|webp)/gi)) {
      const hiRes = m[0].replace('/m685/', '/lw1200/');
      figUrlSet.add(hiRes);
    }

    const figUrls = Array.from(figUrlSet).slice(0, 3);
    for (let i = 0; i < figUrls.length; i++) {
      const localUrl = await downloadImageToAssets(figUrls[i], paperDir, urlPrefix, `sp_fig_${i + 1}`);
      if (!localUrl) continue;
      const figNum = figUrls[i].match(/Fig(\d+)_HTML/i)?.[1] || String(i + 1);
      // Try finding caption near id="Fig1"
      const capRe = new RegExp(`id=["']Fig${figNum}["'][\\s\\S]{0,1200}?c-article-section__figure-description[^>]*>([\\s\\S]*?)<\\/div>`, 'i');
      const cap = stripTags(html.match(capRe)?.[1] || `Figure ${figNum} from ${cleanDoi}`);
      const cat: 'method' | 'experiment' = i === 0 ? 'method' : /result|comparison|performance/i.test(cap) ? 'experiment' : 'method';
      figures.push({
        id: `fig-${i + 1}`,
        label: `Figure ${figNum}`,
        url: localUrl,
        captionOriginal: cap,
        analysisZh: await buildCaptionAnalysisZh(`Figure ${figNum}`, cap, cat, cat === 'method' ? methodContextZh : expContextZh),
        category: cat,
      });
    }

    // Extract Springer /tables/1 and /tables/2
    for (const tNum of [1, 2]) {
      try {
        const tr = await fetch(`https://link.springer.com/article/${cleanDoi}/tables/${tNum}`, {
          headers: UA_BROWSER,
          signal: AbortSignal.timeout(7000),
        });
        if (!tr.ok) continue;
        const thtml = await tr.text();
        const tbls = extractBalancedTables(thtml);
        if (tbls.length === 0) continue;
        const cap = stripTags(thtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || `Table ${tNum}`);
        tables.push({
          id: `tbl-${tNum}`,
          label: `Table ${tNum}`,
          html: await prepareNativeTable(tbls[0], tr.url, thtml, paperDir, urlPrefix, tNum),
          captionOriginal: cap,
          analysisZh: await buildCaptionAnalysisZh(`Table ${tNum}`, cap, 'table', expContextZh),
        });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return { figures, tables };
}

/**
 * Fallback/Complement: Run PyMuPDF (extract_pdf_figures.py) on any accessible Open-Access PDF
 */
async function extractFromPdfUrl(
  pdfUrl: string,
  paperDir: string,
  urlPrefix: string,
  methodContextZh: string,
  expContextZh: string,
  uploaded=false
): Promise<{ figures: OriginalPaperFigure[]; tables: OriginalPaperTable[] }> {
  // 1. Prefer Baidu PaddleOCR (PP-DocLayout_plus-L) neural layout detection for ALL figures & tables
  if (!/^https?:\/\//i.test(pdfUrl) && fs.existsSync(pdfUrl)) {
    const baidu = await parsePdfWithBaiduService(pdfUrl, paperDir, urlPrefix);
    if (baidu && (baidu.figures.length > 0 || baidu.tables.length > 0)) {
      const figures: OriginalPaperFigure[] = [];
      for (const f of baidu.figures) {
        figures.push({
          id: f.id,
          label: f.label,
          url: f.url,
          captionOriginal: f.captionOriginal,
          category: f.category,
          width: f.width,
          height: f.height,
          analysisZh: await buildCaptionAnalysisZh(
            f.label,
            f.captionOriginal,
            f.category,
            f.category === 'method' ? methodContextZh : expContextZh
          ),
        });
      }
      const tables: OriginalPaperTable[] = [];
      for (const t of baidu.tables) {
        tables.push({
          id: t.id,
          label: t.label,
          imageUrl: t.imageUrl,
          captionOriginal: t.captionOriginal,
          analysisZh: await buildCaptionAnalysisZh(t.label, t.captionOriginal, 'table', expContextZh),
        });
      }
      return { figures, tables };
    }
  }

  // 2. Fallback when Baidu parser service is unavailable (e.g. offline local unit tests)
  try {
    const scriptPath = path.resolve(process.cwd(), 'server', 'extract_pdf_figures.py');
    const { stdout } = await execFileAsync('python', [scriptPath, pdfUrl, paperDir, urlPrefix, ...(uploaded ? ['32', '12'] : ['24', '8'])], {
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim()) as {
      figures?: Array<{ id: string; label: string; url: string; captionOriginal: string; category: 'method' | 'experiment'; width?: number; height?: number }>;
      tables?: Array<{ id: string; label: string; imageUrl: string; captionOriginal: string }>;
    };

    const figures: OriginalPaperFigure[] = [];
    for (const f of parsed.figures || []) {
      figures.push({
        ...f,
        analysisZh: await buildCaptionAnalysisZh(
          f.label,
          f.captionOriginal,
          f.category,
          f.category === 'method' ? methodContextZh : expContextZh
        ),
      });
    }

    const tables: OriginalPaperTable[] = [];
    for (const t of parsed.tables || []) {
      tables.push({
        ...t,
        analysisZh: await buildCaptionAnalysisZh(t.label, t.captionOriginal, 'table', expContextZh),
      });
    }
    return { figures, tables };
  } catch {
    return { figures: [], tables: [] };
  }
}

/**
 * Resolve arXiv ID or Open-Access PDF URL via OpenAlex / arXiv search for any paper
 */
export async function resolvePaperMediaEndpoints(paper: {
  doi?: string;
  url?: string;
  openAlexId?: string;
  title: string;
  pdfUrl?: string; htmlUrl?: string;
}): Promise<{ arxivId?: string; pdfUrl?: string }> {
  const combined = `${paper.doi || ''} ${paper.url || ''} ${paper.pdfUrl || ''}`;
  const directArx = combined.match(/arxiv[./](?:abs\/|pdf\/|html\/)?(\d{4}\.\d{4,5})/i)?.[1];
  if (directArx) {
    return { arxivId: directArx, pdfUrl: `https://arxiv.org/pdf/${directArx}.pdf` };
  }

  if (paper.pdfUrl && /^https:\/\//i.test(paper.pdfUrl)) return { pdfUrl: paper.pdfUrl };
  if (paper.url && /^https:\/\//i.test(paper.url) && /\.pdf(?:\?|$)/i.test(paper.url)) return { pdfUrl: paper.url };

  // Check OpenAlex locations
  try {
    const oaQuery = paper.openAlexId
      ? `https://api.openalex.org/works/${paper.openAlexId.split('/').pop()}`
      : paper.doi && paper.doi.startsWith('10.')
        ? `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(paper.doi)}`
        : '';
    if (oaQuery) {
      const r = await fetch(oaQuery, { headers: { 'User-Agent': 'PaperPulse/5.0' }, signal: AbortSignal.timeout(6500) });
      if (r.ok) {
        const oa = (await r.json()) as {
          locations?: Array<{ landing_page_url?: string; pdf_url?: string }>;
          best_oa_location?: { pdf_url?: string; landing_page_url?: string };
          open_access?: { oa_url?: string };
        };
        const locs = oa.locations || [];
        for (const l of locs) {
          const m = `${l.landing_page_url || ''} ${l.pdf_url || ''}`.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i);
          if (m) return { arxivId: m[1], pdfUrl: `https://arxiv.org/pdf/${m[1]}.pdf` };
        }
        const pdfLoc =
          locs.map((l) => l.pdf_url).find((u) => u && /\.pdf(\?|$)/i.test(u)) ||
          oa.best_oa_location?.pdf_url ||
          (oa.open_access?.oa_url && /\.pdf(\?|$)/i.test(oa.open_access.oa_url) ? oa.open_access.oa_url : undefined);
        if (pdfLoc) return { pdfUrl: pdfLoc };
      }
    }
  } catch {
    /* ignore */
  }

  return {};
}

/**
 * Master extractor: extracts REAL original paper figures & REAL experimental tables
 * and attaches them to paper.anatomy.paperFigures & paper.anatomy.paperTables
 */
export async function extractOriginalPaperMedia(paper: AcademicPaper): Promise<{
  paperFigures: OriginalPaperFigure[];
  paperTables: OriginalPaperTable[];
}> {
  const dirName = safeDirName(paper.id);
  const paperDir = path.join(PAPER_ASSETS_DIR, dirName);
  const urlPrefix = `/paper-assets/${dirName}`;
  const methodCtx = paper.anatomy.proposedMethod || paper.digestSummary;
  const expCtx = paper.anatomy.experimentalValidation || paper.anatomy.conclusion;

  const cachedPdf=path.join(paperDir,'source.pdf');
  if(fs.existsSync(cachedPdf)) {
    const cachedMedia=await extractFromPdfUrl(cachedPdf,paperDir,urlPrefix,methodCtx,expCtx,Boolean(paper.upload));
    if(paper.upload || (cachedMedia.figures.length && cachedMedia.tables.length))return {paperFigures:cachedMedia.figures,paperTables:cachedMedia.tables};
  }
  const { arxivId, pdfUrl } = await resolvePaperMediaEndpoints(paper);

  let figures: OriginalPaperFigure[] = [];
  let tables: OriginalPaperTable[] = [];

  // 1. Try arXiv HTML5 / ar5iv
  if (arxivId) {
    const arxRes = await extractFromArxivHtml(arxivId, paperDir, urlPrefix, methodCtx, expCtx);
    figures = arxRes.figures;
    tables = arxRes.tables;
  }

  // 2. Try Springer Open Access HTML
  if (figures.length === 0 && paper.doi?.includes('10.1007/')) {
    const spRes = await extractFromSpringerHtml(paper.doi, paperDir, urlPrefix, methodCtx, expCtx);
    figures = spRes.figures;
    tables = spRes.tables;
  }

  // 3. Fallback / Fill missing via PyMuPDF on PDF URL
  if ((figures.length === 0 || tables.length === 0) && (pdfUrl || fs.existsSync(cachedPdf))) {
    const cached=path.join(paperDir,'source.pdf');
    const pdfRes = await extractFromPdfUrl(fs.existsSync(cached)?cached:pdfUrl!, paperDir, urlPrefix, methodCtx, expCtx);
    if (figures.length === 0 && pdfRes.figures.length > 0) figures = pdfRes.figures;
    if (tables.length === 0 && pdfRes.tables.length > 0) tables = pdfRes.tables;
  }

  return { paperFigures: figures, paperTables: tables };
}
