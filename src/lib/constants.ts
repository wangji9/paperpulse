import type { AcademicPaper, DatasetSourceType, DomainCategory, ReadingStatus, ResearchTopic } from '../types/paper';

const TOPIC_STYLE = 'bg-indigo-50 text-indigo-700 border-indigo-100';

export const TOPIC_META: Record<ResearchTopic, { label: string; color: string; bgClass: string; textClass: string; borderClass: string }> = {
  LLM: { label: '大模型', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  KnowledgeGraph: { label: '知识图谱', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  ComputerVision: { label: '计算机视觉', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  Multimodal: { label: '多模态', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  EmbodiedAI: { label: '具身智能', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
};
export { TOPIC_STYLE };

export const DOMAIN_META: Record<DomainCategory, { label: string; badgeClass: string; color: string }> = {
  manufacturing: { label: '智能制造', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#0F766E' },
  computer_science: { label: '计算机', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#4F46E5' },
  interdisciplinary: { label: '制造与AI交叉', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#64748B' },
};

export const DATASET_SOURCE_META: Record<DatasetSourceType, { label: string; shortLabel: string; badgeClass: string }> = {
  public: { label: '公开数据集', shortLabel: '公开数据集', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  self_built: { label: '自建数据集', shortLabel: '自建数据集', badgeClass: 'bg-amber-50 text-amber-700 border-amber-100' },
  hybrid: { label: '公开与自建混合', shortLabel: '混合数据集', badgeClass: 'bg-teal-50 text-teal-700 border-teal-100' },
  unspecified: { label: '未说明', shortLabel: '未说明', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const READING_STATUS_META: Record<ReadingStatus, { label: string; cls: string }> = {
  unread: { label: '待精读', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  reading: { label: '精读中', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  mastered: { label: '已掌握', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
};

export const TRACKED_JOURNALS = [
  { short: 'JMS', full: 'Journal of Manufacturing Systems' },
  { short: 'IJPR', full: 'International Journal of Production Research' },
  { short: 'AEI', full: 'Advanced Engineering Informatics' },
  { short: 'RCIM', full: 'Robotics and Computer-Integrated Manufacturing' },
  { short: 'CVPR', full: 'CVPR' },
  { short: 'ICML', full: 'ICML' },
  { short: 'CoRL', full: 'Conference on Robot Learning' },
  { short: 'arXiv', full: 'arXiv' },
];

export function generateBibtex(paper: AcademicPaper): string {
  const firstAuthor = (paper.authors[0] || 'Author').split(' ').pop()?.toLowerCase() || 'author';
  const year = paper.publishedDate.slice(0, 4) || '2026';
  const key = `${firstAuthor}${year}${paper.journalShort.replace(/\s+/g, '').toLowerCase()}`;
  return `@article{${key},
  title={${paper.title}},
  author={${paper.authors.join(' and ')}},
  journal={${paper.journal}},
  year={${year}},
  doi={${paper.doi}}
}`;
}
