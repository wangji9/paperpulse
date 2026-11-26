import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, FileText } from 'lucide-react';
import type { AcademicPaper } from '../types/paper';

function cleanAbstractDisplay(raw?: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^(?:ARTICLE\s+INFO\s*)?(?:A\s*B\s*S\s*T\s*R\s*A\s*C\s*T|Abstract|文章信息|摘\s*要)\s*[:：.\-—]?\s*/i, '');
  const stopRe = /(?:\bKeywords?\s*[:：]|关键词\s*[:：]|关键字\s*[:：]|中图分类号\s*[:：]|收稿日期\s*[:：]|基金项目\s*[:：]|作者简介\s*[:：]|\.{5,})/i;
  const m = stopRe.exec(s);
  if (m && m.index >= 30) {
    s = s.slice(0, m.index).trim();
  }
  return s;
}

export function PaperAbstract({ paper, compact = false }: { paper: AcademicPaper; compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact);
  const [showOriginal, setShowOriginal] = useState(false);

  const cleanZh = cleanAbstractDisplay(paper.abstractZh);
  const cleanOrig = cleanAbstractDisplay(paper.abstractOriginal);
  const hasZh = Boolean(cleanZh);
  const hasOrig = Boolean(cleanOrig);
  const primaryText = hasZh ? cleanZh : hasOrig ? cleanOrig : '';
  const isOriginalSameAsPrimary = !hasZh || primaryText === cleanOrig;
  const sourceHref = paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//i, '')}` : paper.url;

  return (
    <section className="my-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-700/80 dark:bg-slate-800/45">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-[#0072BD] dark:text-sky-400" />
          <h3 className="text-xs font-bold tracking-wide text-slate-800 dark:text-slate-100">
            论文摘要 {hasZh ? '（中文译文）' : hasOrig ? '（原文摘要）' : ''}
          </h3>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          {hasOrig && !isOriginalSameAsPrimary && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="font-medium text-slate-500 hover:text-[#0072BD] dark:text-slate-400"
            >
              {showOriginal ? '隐藏英文原文' : '对照英文原文'}
            </button>
          )}
          {compact && primaryText.length > 160 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-0.5 font-medium text-[#0072BD] hover:underline dark:text-sky-400"
            >
              {expanded ? (
                <>
                  收起 <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  展开全文 <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {primaryText ? (
        <p
          className={`${
            expanded ? '' : 'line-clamp-3'
          } whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200`}
        >
          {primaryText}
        </p>
      ) : (
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
          出版商元数据暂未公开摘要正文；可上传原文 PDF 自动提取或点击「修订」手动补充摘要。
        </p>
      )}

      {showOriginal && hasOrig && !isOriginalSameAsPrimary && (
        <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-3 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
          <div className="mb-1 font-semibold text-slate-500">Original Abstract:</div>
          <p className="whitespace-pre-line">{cleanOrig}</p>
        </div>
      )}

      {sourceHref && (
        <div className="mt-2 flex items-center justify-end">
          <a
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0072BD] hover:underline dark:text-sky-400"
          >
            核对出版原文来源 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </section>
  );
}
