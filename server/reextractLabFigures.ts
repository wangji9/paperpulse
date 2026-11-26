import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getPaperById, upsertPaper } from './db.js';
import { extractOriginalPaperMedia, PAPER_ASSETS_DIR } from './paperMediaExtractor.js';
import {
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
      if (r.ok) {
        const j = (await r.json()) as { ok?: boolean; engine?: string };
        if (j.ok) {
          console.log(`[reparse] Baidu parser ready: ${j.engine}`);
          return true;
        }
      }
    } catch {
      /* waiting */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  const paddleReady = await waitForPaddleReady();
  console.log(`Baidu PaddleOCR parser ready: ${paddleReady}`);

  const db = new DatabaseSync(path.join(DATA_DIR, 'paperpulse.db'));
  const rows = db
    .prepare('SELECT paper_id, metadata FROM lab_papers ORDER BY publication_year DESC')
    .all() as Array<{ paper_id: string; metadata: string }>;

  console.log(`Re-parsing ${rows.length} lab papers (ALL figures, ALL tables, clean abstracts & sections)...`);
  let updatedCount = 0;

  for (const row of rows) {
    const paper = getPaperById(row.paper_id);
    if (!paper) continue;
    const safeDir = paper.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const paperDir = path.join(PAPER_ASSETS_DIR, safeDir);
    const pdfPath = path.join(paperDir, 'source.pdf');
    const urlPrefix = `/paper-assets/${safeDir}`;

    // Also sanitize any corrupted lab_papers metadata override (abstractOriginal / abstractZh)
    let metaChanged = false;
    const labMeta = JSON.parse(row.metadata || '{}') as Record<string, unknown>;
    if (typeof labMeta.abstractOriginal === 'string' && looksCorruptedAbstract(labMeta.abstractOriginal)) {
      labMeta.abstractOriginal = sanitizeCleanAbstract(labMeta.abstractOriginal);
      metaChanged = true;
    }
    if (typeof labMeta.abstractZh === 'string' && looksCorruptedAbstract(labMeta.abstractZh)) {
      delete labMeta.abstractZh;
      metaChanged = true;
    }

    if (!fs.existsSync(pdfPath)) {
      // Still sanitize corrupted abstracts on non-PDF papers if any
      if (looksCorruptedAbstract(paper.abstractOriginal) || looksCorruptedAbstract(paper.abstractZh)) {
        const cleanOrig = sanitizeCleanAbstract(paper.abstractOriginal || '');
        const cleanZh = looksCorruptedAbstract(paper.abstractZh)
          ? sanitizeCleanAbstract(paper.abstractZh || '')
          : paper.abstractZh;
        upsertPaper({ ...paper, abstractOriginal: cleanOrig, abstractZh: cleanZh });
      }
      if (metaChanged) {
        db.prepare('UPDATE lab_papers SET metadata = ? WHERE paper_id = ?').run(JSON.stringify(labMeta), row.paper_id);
      }
      continue;
    }

    const prevFigByLabel = new Map((paper.anatomy?.paperFigures || []).map((f) => [f.label.toLowerCase(), f]));
    const prevTblByLabel = new Map((paper.anatomy?.paperTables || []).map((t) => [t.label.toLowerCase(), t]));

    try {
      let nextPaper = { ...paper };
      let needRetranslate = false;

      if (paddleReady) {
        const baidu = await parsePdfWithBaiduService(pdfPath, paperDir, urlPrefix);
        if (baidu) {
          // 1. Update ALL figures & ALL tables from Baidu PP-DocLayout_plus-L
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

          // 2. Clean & exact abstract + sections from Baidu neural layout
          const baiduAbs = sanitizeCleanAbstract(baidu.sections.abstract || '');
          const oldAbsCorrupt = looksCorruptedAbstract(paper.abstractOriginal);
          const oldZhCorrupt = looksCorruptedAbstract(paper.abstractZh);

          let finalAbstract = paper.abstractOriginal || '';
          if (baiduAbs && (oldAbsCorrupt || !finalAbstract.trim())) {
            finalAbstract = baiduAbs;
            needRetranslate = true;
          } else if (oldAbsCorrupt) {
            finalAbstract = sanitizeCleanAbstract(finalAbstract);
            needRetranslate = true;
          } else if (oldZhCorrupt) {
            needRetranslate = true;
          }

          if (baiduAbs && metaChanged) {
            labMeta.abstractOriginal = baiduAbs;
          }

          nextPaper = applySourceText(
            {
              ...nextPaper,
              abstractOriginal: finalAbstract,
              ...(needRetranslate ? { abstractZh: undefined } : {}),
              digestSummary: finalAbstract ? finalAbstract.slice(0, 1200) : nextPaper.digestSummary,
              ...(baidu.keywords.length >= 2 ? { keywords: baidu.keywords, keywordSource: 'author' as const } : {}),
            },
            baidu.text,
            baidu.sections
          );

          nextPaper.anatomy = {
            ...nextPaper.anatomy,
            paperFigures: mergedFigs,
            paperTables: mergedTbls,
          };
          nextPaper.parsing = {
            status: baidu.text.trim().length >= 100 ? 'full_text' : 'metadata',
            updatedAt: new Date().toISOString(),
            sourceUrl: paper.localPdfUrl || `${urlPrefix}/source.pdf`,
            pages: baidu.pages,
            sections: Object.keys(baidu.sections),
            warnings: [],
          };

          if (needRetranslate && finalAbstract) {
            try {
              nextPaper = await localizePaper(nextPaper);
            } catch (e) {
              console.error('[reparse localize]', paper.id, e);
            }
          }

          upsertPaper(nextPaper);
          if (metaChanged) {
            db.prepare('UPDATE lab_papers SET metadata = ? WHERE paper_id = ?').run(JSON.stringify(labMeta), row.paper_id);
          }
          updatedCount++;
          console.log(
            JSON.stringify({
              engine: baidu.engine,
              id: paper.id,
              title: (paper.titleZh || paper.title).slice(0, 28),
              figures: mergedFigs.length,
              tables: mergedTbls.length,
              absLen: finalAbstract.length,
              retranslated: needRetranslate,
              ms: baidu.elapsedMs,
            })
          );
          continue;
        }
      }

      // Non-Baidu fallback
      const media = await extractOriginalPaperMedia(paper);
      if (media.paperFigures.length || media.paperTables.length) {
        upsertPaper({
          ...paper,
          anatomy: {
            ...paper.anatomy,
            ...(media.paperFigures.length ? { paperFigures: media.paperFigures } : {}),
            ...(media.paperTables.length ? { paperTables: media.paperTables } : {}),
          },
        });
        updatedCount++;
      }
    } catch (err) {
      console.error('Failed to re-parse lab paper:', paper.id, err);
    }
  }

  db.close();
  console.log(`Done! Re-parsed ${updatedCount} lab papers with Baidu PP-DocLayout_plus-L.`);
}

void main();
