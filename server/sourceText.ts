import type { AcademicPaper } from '../src/types/paper.js';
export function applySourceText(paper: AcademicPaper, text: string, sections: Record<string,string> = {}): AcademicPaper {
  const clean = (s: string) => s.replace(/-\n(?=[a-z])/g,'').replace(/\s+/g,' ').trim();
  const section = (pattern: RegExp) => Object.entries(sections).find(([k])=>pattern.test(k))?.[1] || '';
  const sentences = clean(sections.abstract || paper.abstractOriginal || text).match(/[^.!?。！？]+[.!?。！？]+(?:\s|$)/g) || [clean(text)];
  const gap = sentences.find(s=>/however|challenge|limitation|lack of|difficult|然而|不足|挑战/i.test(s)) || '';
  const method = sentences.filter(s=>/we (?:propose|introduce|present|develop)|this paper (?:proposes|presents)|本文|我们提出/i.test(s)).join(' ');
  const conclusion = sentences.filter(s=>/results (?:show|demonstrate|indicate)|we (?:show|find|demonstrate)|结果表明/i.test(s)).slice(-2).join(' ');
  return { ...paper, anatomy: { ...paper.anatomy,
    background: clean(section(/introduction|background/) || sentences.slice(0,2).join(' ')).slice(0,1500),
    problem: clean(section(/problem/) || gap).slice(0,1500),
    proposedMethod: clean(section(/method|approach/) || method).slice(0,2200),
    conclusion: clean(section(/conclusion/) || conclusion).slice(0,1600),
    experimentalValidation: clean(section(/experiment|result/)).slice(0,1600),
    currentStatus: clean(section(/related work/)).slice(0,1200),
    architectureModules: [], figureCaption: '', feedbackLoopLabel: '', tableAnalysis: '',
    comparisonMetrics: { hasQuantitativeData:false, metricNames:[], primaryMetric:'', unit:'', rows:[], note:'数值结果以原文表格为准。' },
    ablationStudy: { hasQuantitativeData:false, metricName:'', unit:'', fullModelScore:'', items:[], summary:'' },
  }};
}
