import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getPaperById, upsertPaper } from './db.js';
import { extractOriginalPaperMedia, PAPER_ASSETS_DIR } from './paperMediaExtractor.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

async function main() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'paperpulse.db'));
  const rows = db.prepare('SELECT paper_id FROM lab_papers ORDER BY publication_year DESC').all() as Array<{ paper_id: string }>;
  db.close();

  console.log(`Checking ${rows.length} lab papers for full-figure whitespace-trimmed re-extraction...`);
  let updatedCount = 0;

  for (const { paper_id } of rows) {
    const paper = getPaperById(paper_id);
    if (!paper) continue;
    const safeDir = paper.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfPath = path.join(PAPER_ASSETS_DIR, safeDir, 'source.pdf');
    if (!fs.existsSync(pdfPath)) continue;

    // Preserve previous captions/translations by label if new caption translation is disabled or unavailable
    const prevByLabel = new Map(
      (paper.anatomy?.paperFigures || []).map((f) => [f.label.toLowerCase(), f])
    );

    // Force uploaded=true path so extractor pulls ALL figures (up to 32)
    const paperForExtract = paper.upload
      ? paper
      : {
          ...paper,
          upload: {
            userId: 'system',
            username: 'system',
            displayName: 'System',
            fileName: 'source.pdf',
            uploadedAt: new Date().toISOString(),
            sha256: '',
          },
        };

    try {
      const media = await extractOriginalPaperMedia(paperForExtract);
      if (media.paperFigures.length > 0) {
        const mergedFigs = media.paperFigures.map((f) => {
          const prev = prevByLabel.get(f.label.toLowerCase());
          return {
            ...f,
            captionZh: f.captionZh || prev?.captionZh,
            analysisZh: f.analysisZh || prev?.analysisZh || f.captionOriginal,
          };
        });
        const nextPaper = {
          ...paper,
          anatomy: {
            ...paper.anatomy,
            paperFigures: mergedFigs,
            ...(media.paperTables.length > (paper.anatomy?.paperTables?.length || 0)
              ? { paperTables: media.paperTables }
              : {}),
          },
        };
        upsertPaper(nextPaper);
        updatedCount++;
        console.log(
          JSON.stringify({
            id: paper.id,
            title: (paper.titleZh || paper.title).slice(0, 32),
            figures: mergedFigs.length,
            dims: mergedFigs.slice(0, 5).map((f) => `${f.label}:${f.width}x${f.height}`),
          })
        );
      }
    } catch (err) {
      console.error('Failed to re-extract media for', paper.id, err);
    }
  }

  console.log(`Done! Re-extracted & tightly trimmed figures for ${updatedCount} lab papers.`);
}

void main();
