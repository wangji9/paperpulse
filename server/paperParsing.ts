import { localizePaper } from './localizePaper.js';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { AcademicPaper } from '../src/types/paper.js';
import { applySourceText } from './sourceText.js';
import { extractKeywords } from './keywords.js';
import { PAPER_ASSETS_DIR, resolvePaperMediaEndpoints } from './paperMediaExtractor.js';

const execFileAsync = promisify(execFile);
export async function parsePaperEvidence(paper: AcademicPaper, fullText = true): Promise<AcademicPaper> {
  const warnings: string[] = [];
  let result = paper.sourceOrigin !== 'curated_real' && paper.abstractOriginal.trim() ? applySourceText(paper, paper.abstractOriginal) : paper;
  let status: NonNullable<AcademicPaper['parsing']>['status'] = paper.abstractOriginal.trim() ? 'abstract' : 'metadata';
  let pages: number | undefined;
  let found: string[] = [];
  let pdfUrl = paper.pdfUrl;
  const cached=path.join(PAPER_ASSETS_DIR,paper.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),'source.pdf');
  if (fullText) {
    try {
      if(!fs.existsSync(cached))pdfUrl = (await resolvePaperMediaEndpoints(paper)).pdfUrl;
      if (pdfUrl || fs.existsSync(cached)) {
        const input=fs.existsSync(cached)?cached:pdfUrl!;
        const {stdout} = await execFileAsync('python', [path.resolve('server/extract_paper_text.py'), input, cached], {timeout:45000,maxBuffer:2*1024*1024});
        const parsed = JSON.parse(stdout) as { text:string; sections:Record<string,string>; keywords?:string[]; pages?:number; error?:string };
        if (parsed.error || parsed.text.length<400) warnings.push(parsed.error || 'PDF文字不足，可能为扫描件');
        else {
          result=applySourceText(result, parsed.text,parsed.sections); status='full_text'; pages=parsed.pages; found=Object.keys(parsed.sections);
          if(paper.keywordSource !== 'manual' && parsed.keywords?.length) { result.keywords=extractKeywords(paper.title,paper.abstractOriginal,parsed.keywords); result.keywordSource='author'; }
        }
      } else warnings.push('暂未找到可公开获取的PDF，已保留摘要或元数据');
    } catch (e) { warnings.push('PDF正文获取或提取暂时失败，已保留可用摘要，可稍后重试。'); }
  }
  if(status==='full_text' && (!result.anatomy.proposedMethod || !result.anatomy.conclusion))warnings.push('已读取PDF正文，但尚未可靠定位全部方法或结论段落；缺失项保留待补全。');
  if (!result.keywords?.length) { result.keywords=extractKeywords(paper.title,paper.abstractOriginal,paper.keywords); result.keywordSource='extracted'; }
  return localizePaper({ ...result, pdfUrl, localPdfUrl:fs.existsSync(cached)?`/paper-assets/${paper.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64)}/source.pdf`:undefined, parsing: { status, sourceUrl:pdfUrl || paper.htmlUrl || paper.url, pages, updatedAt:new Date().toISOString(), sections:found, warnings } });
}
