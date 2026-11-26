import { localizePaper } from './localizePaper.js';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { AcademicPaper } from '../src/types/paper.js';
import { applySourceText } from './sourceText.js';
import { extractKeywords } from './keywords.js';
import { PAPER_ASSETS_DIR, resolvePaperMediaEndpoints } from './paperMediaExtractor.js';
import {
  downloadPdfToCache,
  getPaddleParserUrl,
  looksCorruptedAbstract,
  parsePdfWithBaiduService,
  sanitizeCleanAbstract,
} from './paddleParser.js';

const execFileAsync = promisify(execFile);

export async function parsePaperEvidence(paper: AcademicPaper, fullText = true): Promise<AcademicPaper> {
  const warnings: string[] = [];
  const cleanExistingAbstract = sanitizeCleanAbstract(paper.abstractOriginal || '');
  let result: AcademicPaper =
    paper.sourceOrigin !== 'curated_real' && cleanExistingAbstract
      ? applySourceText({ ...paper, abstractOriginal: cleanExistingAbstract }, cleanExistingAbstract)
      : { ...paper, abstractOriginal: cleanExistingAbstract || paper.abstractOriginal };
  let status: NonNullable<AcademicPaper['parsing']>['status'] = cleanExistingAbstract ? 'abstract' : 'metadata';
  let pages: number | undefined;
  let found: string[] = [];
  let pdfUrl = paper.pdfUrl;
  const safeDir = paper.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const paperDir = path.join(PAPER_ASSETS_DIR, safeDir);
  const urlPrefix = `/paper-assets/${safeDir}`;
  const cached = path.join(paperDir, 'source.pdf');

  if (fullText) {
    try {
      if (!fs.existsSync(cached)) pdfUrl = (await resolvePaperMediaEndpoints(paper)).pdfUrl;
      if (!fs.existsSync(cached) && pdfUrl && getPaddleParserUrl()) {
        await downloadPdfToCache(pdfUrl, cached);
      }

      // 1. Prefer Baidu PaddleOCR (PP-DocLayout_plus-L) when configured and local PDF is ready
      // Passing paperDir + urlPrefix extracts text, abstract, keywords, ALL figures & ALL tables in ONE pass!
      if (getPaddleParserUrl() && fs.existsSync(cached)) {
        const baidu = await parsePdfWithBaiduService(cached, paperDir, urlPrefix);
        if (baidu && (baidu.text.trim().length >= 120 || (baidu.sections.abstract || '').trim().length >= 40)) {
          const baiduAbs = sanitizeCleanAbstract(baidu.sections.abstract || '');
          const nextAbs =
            baiduAbs && (looksCorruptedAbstract(result.abstractOriginal) || !result.abstractOriginal.trim())
              ? baiduAbs
              : result.abstractOriginal || baiduAbs;
          const nextSections = { ...baidu.sections, ...(nextAbs ? { abstract: nextAbs } : {}) };
          result = applySourceText(
            {
              ...result,
              abstractOriginal: nextAbs,
              ...(nextAbs !== (paper.abstractOriginal || '').trim() ? { abstractZh: undefined } : {}),
              digestSummary: nextAbs ? nextAbs.slice(0, 1200) : result.digestSummary,
            },
            baidu.text,
            nextSections
          );
          status = baidu.text.trim().length >= 400 ? 'full_text' : status;
          pages = baidu.pages;
          found = Object.keys(nextSections);
          if (paper.keywordSource !== 'manual' && baidu.keywords?.length) {
            result.keywords = baidu.keywords;
            result.keywordsOriginal = baidu.keywords;
            result.keywordSource = 'author';
          }
          if (baidu.figures.length > 0) {
            result.anatomy = {
              ...result.anatomy,
              paperFigures: baidu.figures.map((f) => ({
                id: f.id,
                label: f.label,
                url: f.url,
                captionOriginal: f.captionOriginal,
                analysisZh: `${f.label} 原文图注：${f.captionOriginal}`,
                category: f.category,
                width: f.width,
                height: f.height,
              })),
            };
          }
          if (baidu.tables.length > 0) {
            result.anatomy = {
              ...result.anatomy,
              paperTables: baidu.tables.map((t) => ({
                id: t.id,
                label: t.label,
                imageUrl: t.imageUrl,
                captionOriginal: t.captionOriginal,
                analysisZh: `${t.label} 原文表注：${t.captionOriginal}`,
              })),
            };
          }
        }
      }

      // 2. Fallback when Baidu service is not configured or remote PDF download failed
      if (status !== 'full_text' && (pdfUrl || fs.existsSync(cached))) {
        const input = fs.existsSync(cached) ? cached : pdfUrl!;
        const { stdout } = await execFileAsync('python', [path.resolve('server/extract_paper_text.py'), input, cached], {
          timeout: 45000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const parsed = JSON.parse(stdout) as {
          text: string;
          sections: Record<string, string>;
          keywords?: string[];
          pages?: number;
          error?: string;
        };
        if (parsed.error || parsed.text.length < 400) warnings.push(parsed.error || 'PDF文字不足，可能为扫描件');
        else {
          if (parsed.sections?.abstract) parsed.sections.abstract = sanitizeCleanAbstract(parsed.sections.abstract);
          result = applySourceText(result, parsed.text, parsed.sections);
          status = 'full_text';
          pages = parsed.pages;
          found = Object.keys(parsed.sections);
          if (paper.keywordSource !== 'manual' && parsed.keywords?.length) {
            result.keywords = extractKeywords(paper.title, result.abstractOriginal, parsed.keywords);
            result.keywordSource = 'author';
          }
        }
      } else if (!pdfUrl && !fs.existsSync(cached)) {
        warnings.push('暂未找到可公开获取的PDF，已保留摘要或元数据');
      }
    } catch {
      warnings.push('PDF正文获取或提取暂时失败，已保留可用摘要，可稍后重试。');
    }
  }

  if (status === 'full_text' && (!result.anatomy.proposedMethod || !result.anatomy.conclusion)) {
    warnings.push('已读取PDF正文，但尚未可靠定位全部方法或结论段落；缺失项保留待补全。');
  }
  if (!result.keywords?.length) {
    result.keywords = extractKeywords(paper.title, result.abstractOriginal, paper.keywords);
    result.keywordSource = 'extracted';
  }
  return localizePaper({
    ...result,
    pdfUrl,
    localPdfUrl: fs.existsSync(cached) ? `${urlPrefix}/source.pdf` : undefined,
    parsing: {
      status,
      sourceUrl: pdfUrl || paper.htmlUrl || paper.url,
      pages,
      updatedAt: new Date().toISOString(),
      sections: found,
      warnings,
    },
  });
}
