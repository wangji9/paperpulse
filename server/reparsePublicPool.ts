import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getPaperById, upsertPaper } from './db.js';
import { PAPER_ASSETS_DIR, resolvePaperMediaEndpoints } from './paperMediaExtractor.js';
import {
  downloadPdfToCache,
  getPaddleParserUrl,
  looksCorruptedAbstract,
  parsePdfWithBaiduService,
  sanitizeCleanAbstract,
} from './paddleParser.js';
import { applySourceText } from './sourceText.js';
import { localizePaper } from './localizePaper.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

async function waitForPaddleReady(timeoutMs = 180_000): Promise<boolean> {
  const base = getPaddleParserUrl();
  if (!base) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
      if (r.ok && ((await r.json()) as { ok?: boolean }).ok) return true;
    } catch {
      /* waiting */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  const ready = await waitForPaddleReady();
  if (!ready) {
    console.error('Baidu PaddleOCR service is not ready.');
    process.exit(1);
  }

  const db = new DatabaseSync(path.join(DATA_DIR, 'paperpulse.db'));
  const labIds = new Set(
    (db.prepare('SELECT paper_id FROM lab_papers').all() as Array<{ paper_id: string }>).map((r) => r.paper_id)
  );
  const allRows = db
    .prepare('SELECT id FROM papers ORDER BY published_date DESC, synced_at DESC')
    .all() as Array<{ id: string }>;
  db.close();

  const poolIds = allRows.map((r) => r.id).filter((id) => !labIds.has(id));
  const downloadMissingOa = process.env.DOWNLOAD_MISSING_OA !== '0';
  const maxPapers = Number(process.env.MAX_POOL_PAPERS || '80');

  console.log(`[pool-reparse] Scanning ${poolIds.length} public pool papers (Baidu PP-DocLayout_plus-L)...`);

  let sanitizedOnly = 0;
  let baiduParsed = 0;
  let skippedAlreadyBaidu = 0;

  for (const id of poolIds) {
    const paper = getPaperById(id);
    if (!paper) continue;

    // 1. Always clean any corrupted abstract or leaked trailing keywords immediately
    const origCorrupt = looksCorruptedAbstract(paper.abstractOriginal);
    const zhCorrupt = looksCorruptedAbstract(paper.abstractZh);
    if (origCorrupt || zhCorrupt) {
      const cleanOrig = sanitizeCleanAbstract(paper.abstractOriginal || '');
      const cleanZh = paper.abstractZh ? sanitizeCleanAbstract(paper.abstractZh) : undefined;
      upsertPaper({
        ...paper,
        abstractOriginal: cleanOrig || paper.abstractOriginal,
        abstractZh: cleanZh,
      });
      sanitizedOnly++;
    }

    // 2. Skip if already parsed by Baidu PP-DocLayout_plus-L
    const alreadyBaidu =
      (paper.anatomy?.paperFigures || []).some((f) => /baidu_fig_/.test(f.url || '')) ||
      (paper.anatomy?.paperTables || []).some((t) => /baidu_tbl_/.test(t.imageUrl || ''));
    if (alreadyBaidu) {
      skippedAlreadyBaidu++;
      continue;
    }

    if (baiduParsed >= maxPapers) continue;

    const safeDir = paper.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const paperDir = path.join(PAPER_ASSETS_DIR, safeDir);
    const pdfPath = path.join(paperDir, 'source.pdf');
    const urlPrefix = `/paper-assets/${safeDir}`;

    if (!fs.existsSync(pdfPath) && downloadMissingOa) {
      try {
        const { pdfUrl } = await resolvePaperMediaEndpoints(paper);
        if (pdfUrl) {
          await downloadPdfToCache(pdfUrl, pdfPath);
        }
      } catch {
        /* non-OA or unreachable */
      }
    }

    if (!fs.existsSync(pdfPath)) continue;

    try {
      const baidu = await parsePdfWithBaiduService(pdfPath, paperDir, urlPrefix);
      if (!baidu) continue;

      const prevFigByLabel = new Map((paper.anatomy?.paperFigures || []).map((f) => [f.label.toLowerCase(), f]));
      const prevTblByLabel = new Map((paper.anatomy?.paperTables || []).map((t) => [t.label.toLowerCase(), t]));

      const mergedFigs = baidu.figures.map((f) => {
        const prev = prevFigByLabel.get(f.label.toLowerCase());
        return {
          id: f.id,
          label: f.label,
          url: f.url,
          captionOriginal: f.captionOriginal,
          captionZh: prev?.captionZh,
          analysisZh: prev?.analysisZh || `${f.label} 原文图注：${f.captionOriginal}`,
          category: f.category,
          width: f.width,
          height: f.height,
        };
      });

      const mergedTbls = baidu.tables.map((t) => {
        const prev = prevTblByLabel.get(t.label.toLowerCase());
        return {
          id: t.id,
          label: t.label,
          imageUrl: t.imageUrl,
          captionOriginal: t.captionOriginal,
          captionZh: prev?.captionZh,
          analysisZh: prev?.analysisZh || `${t.label} 原文表注：${t.captionOriginal}`,
        };
      });

      const baiduAbs = sanitizeCleanAbstract(baidu.sections.abstract || '');
      let finalAbstract = sanitizeCleanAbstract(paper.abstractOriginal || '');
      let finalAbstractZh = paper.abstractZh ? sanitizeCleanAbstract(paper.abstractZh) : undefined;
      let needRetranslate = false;

      if (baiduAbs && (looksCorruptedAbstract(paper.abstractOriginal) || !finalAbstract.trim())) {
        finalAbstract = baiduAbs;
        if (!finalAbstractZh || finalAbstractZh.length < 60 || looksCorruptedAbstract(paper.abstractZh)) {
          finalAbstractZh = undefined;
          needRetranslate = true;
        }
      }

      const mergedKeywords =
        baidu.keywords.length >= 2
          ? baidu.keywords
          : paper.keywordsOriginal?.length
            ? paper.keywordsOriginal
            : paper.keywords;

      let nextPaper = applySourceText(
        {
          ...paper,
          localPdfUrl: `${urlPrefix}/source.pdf`,
          abstractOriginal: finalAbstract || paper.abstractOriginal,
          abstractZh: finalAbstractZh,
          digestSummary: finalAbstract ? finalAbstract.slice(0, 1200) : paper.digestSummary,
          ...(mergedKeywords?.length
            ? { keywords: mergedKeywords, keywordsOriginal: mergedKeywords, keywordSource: 'author' as const }
            : {}),
        },
        baidu.text,
        baidu.sections
      );

      nextPaper.anatomy = {
        ...nextPaper.anatomy,
        ...(mergedFigs.length > 0 ? { paperFigures: mergedFigs } : {}),
        ...(mergedTbls.length > 0 ? { paperTables: mergedTbls } : {}),
      };
      nextPaper.parsing = {
        status: baidu.text.trim().length >= 100 ? 'full_text' : 'metadata',
        updatedAt: new Date().toISOString(),
        sourceUrl: `${urlPrefix}/source.pdf`,
        pages: baidu.pages,
        sections: Object.keys(baidu.sections),
        warnings: [],
      };

      if (needRetranslate && finalAbstract) {
        try {
          nextPaper = await localizePaper(nextPaper);
        } catch (err) {
          console.error('[pool-reparse localize]', paper.id, err);
        }
      }

      upsertPaper(nextPaper);
      baiduParsed++;
      console.log(
        JSON.stringify({
          engine: baidu.engine,
          id: paper.id,
          title: (paper.titleZh || paper.title).slice(0, 28),
          figures: mergedFigs.length,
          tables: mergedTbls.length,
          absLen: finalAbstract.length,
          ms: baidu.elapsedMs,
        })
      );
    } catch (err) {
      console.error('[pool-reparse] Failed for', paper.id, err);
    }
  }

  console.log(
    `[pool-reparse] Complete! baiduParsed=${baiduParsed}, skippedAlreadyBaidu=${skippedAlreadyBaidu}, sanitizedAbstracts=${sanitizedOnly}`
  );
}

void main();
