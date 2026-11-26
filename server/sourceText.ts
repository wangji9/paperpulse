import type { AcademicPaper } from '../src/types/paper.js';
import { cleanSourceText, sourceExcerpt } from './translationQuality.js';
export function applySourceText(paper: AcademicPaper, text: string, sections: Record<string,string> = {}): AcademicPaper {
  const clean=cleanSourceText;
  const section = (pattern: RegExp) => Object.entries(sections).find(([k])=>pattern.test(k))?.[1] || '';
  const sentences = clean(sections.abstract || paper.abstractOriginal || text).match(/[^.!?。！？]+[.!?。！？]+(?:\s|$)/g) || [clean(text)];
  const gap = sentences.find(s=>/however|challenge|limitation|lack of|difficult|然而|不足|挑战/i.test(s)) || '';
  const method = sentences.filter(s=>/we (?:propose|introduce|present|develop)|this paper (?:proposes|presents)|本文|我们提出/i.test(s)).join(' ');
  const conclusion = sentences.filter(s=>/results (?:show|demonstrate|indicate)|we (?:show|find|demonstrate)|结果表明/i.test(s)).slice(-2).join(' ');
  return { ...paper, ...(sections.abstract?.trim()?{abstractOriginal:clean(sections.abstract),abstractZh:undefined}:{}), anatomy: { ...paper.anatomy,
    background: sourceExcerpt(section(/introduction|background/) || sentences.slice(0,2).join(' '),1500),
    problem: sourceExcerpt(section(/problem/) || gap,1500),
    proposedMethod: sourceExcerpt(section(/method|approach/) || method,2200),
    conclusion: sourceExcerpt(section(/conclusion/) || conclusion,1600),
    experimentalValidation: sourceExcerpt(section(/experiment|result/),1600),
    currentStatus: sourceExcerpt(section(/related work/),1200),
    architectureModules: [], figureCaption: '', feedbackLoopLabel: '', tableAnalysis: '',
    comparisonMetrics: { hasQuantitativeData:false, metricNames:[], primaryMetric:'', unit:'', rows:[], note:'数值结果以原文表格为准。' },
    ablationStudy: { hasQuantitativeData:false, metricName:'', unit:'', fullModelScore:'', items:[], summary:'' },
  }};
}
