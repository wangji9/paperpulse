import { extractChineseKeywordTags } from '../lib/canonicalize';
import type { AcademicPaper } from '../types/paper';

const LABELS = {
  metadata: '仅元数据',
  abstract: '摘要已解析',
  full_text: '全文已解析',
  unavailable: '暂无法获取原文',
};

export function PaperKeywords({ paper }: { paper: AcademicPaper }) {
  const tags = extractChineseKeywordTags(paper, 8);

  return (
    <div className="my-2 space-y-1.5 rounded-xl border border-indigo-100/90 bg-indigo-50/30 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-indigo-700 dark:text-indigo-300">关键词：</span>
        {tags.length > 0 ? (
          tags.map((k) => (
            <span
              key={k}
              className="rounded-full border border-indigo-100 bg-white px-2.5 py-0.5 font-medium text-indigo-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"
            >
              #{k}#
            </span>
          ))
        ) : (
          <span className="text-slate-400">待提取</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-slate-500">
          {paper.parsing && (
            <span className="rounded-md bg-white px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {LABELS[paper.parsing.status]}
              {paper.parsing.pages ? ` · ${paper.parsing.pages}页` : ''}
            </span>
          )}
          {(paper.localPdfUrl || paper.pdfUrl) && (
            <a
              href={paper.localPdfUrl || paper.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {paper.localPdfUrl ? '站内PDF ↗' : '开放PDF ↗'}
            </a>
          )}
          {paper.codeUrl && (
            <a href={paper.codeUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-600 hover:underline">
              代码 ↗
            </a>
          )}
        </div>
      </div>

      {paper.upload && (
        <p className="text-slate-500">
          PDF上传者：{paper.upload.displayName}（{paper.upload.username}） · {paper.upload.uploadedAt.slice(0, 10)} · {paper.upload.fileName}
        </p>
      )}
    </div>
  );
}
