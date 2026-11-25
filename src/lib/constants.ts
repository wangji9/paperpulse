import type { AcademicPaper, DatasetSourceType, DomainCategory, ReadingStatus, ResearchTopic } from '../types/paper';

const TOPIC_STYLE = 'bg-indigo-50 text-indigo-700 border-indigo-100';

export const TOPIC_META: Record<
  ResearchTopic,
  { label: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  LLM: { label: '大模型 (LLM)', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  AgentCollaboration: {
    label: '多智能体协作',
    color: '#4F46E5',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-100',
  },
  HumanAICollaboration: { label: '人智协作', color: '#0f766e', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  ProductDesign: { label: '产品设计与设计认知', color: '#be185d', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  DesignOptimization: { label: '生成式设计与设计优化', color: '#7c3aed', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  InteractionDesign: { label: '交互设计与用户体验', color: '#0369a1', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  SustainableDesign: { label: '可持续与循环设计', color: '#15803d', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  KnowledgeGraph: { label: '知识图谱 (KG)', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  ComputerVision: { label: '计算机视觉 (CV)', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  Multimodal: { label: '多模态 (Multimodal)', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
  EmbodiedAI: { label: '具身智能 (Embodied AI)', color: '#4F46E5', bgClass: 'bg-indigo-50', textClass: 'text-indigo-700', borderClass: 'border-indigo-100' },
};
export { TOPIC_STYLE };

export const DOMAIN_META: Record<DomainCategory, { label: string; badgeClass: string; color: string }> = {
  manufacturing: { label: '智能制造与工业工程', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#0F766E' },
  computer_science: { label: '计算机与人工智能', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#4F46E5' },
  interdisciplinary: { label: '制造与AI交叉', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', color: '#64748B' },
};

export const DATASET_SOURCE_META: Record<DatasetSourceType, { label: string; shortLabel: string; badgeClass: string }> = {
  public: { label: '公开基准数据集', shortLabel: '公开数据集', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  self_built: { label: '研究团队自建数据集', shortLabel: '自建数据集', badgeClass: 'bg-amber-50 text-amber-700 border-amber-100' },
  hybrid: { label: '公开与自建混合验证', shortLabel: '混合数据集', badgeClass: 'bg-teal-50 text-teal-700 border-teal-100' },
  unspecified: { label: '未披露数据集细节', shortLabel: '未说明', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const READING_STATUS_META: Record<ReadingStatus, { label: string; cls: string }> = {
  unread: { label: '待精读', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  reading: { label: '精读中', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  mastered: { label: '已掌握', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
};

/**
 * 16 Core Manufacturing, Industrial Informatics & Engineering AI Journals requested by the user
 */
export const CORE_MFG_AI_JOURNALS = [
  { short: 'IJMTM', full: 'International Journal of Machine Tools and Manufacture' },
  { short: 'JMS', full: 'Journal of Manufacturing Systems' },
  { short: 'RCIM', full: 'Robotics and Computer-Integrated Manufacturing' },
  { short: 'JIM', full: 'Journal of Intelligent Manufacturing' },
  { short: 'IEEE TII', full: 'IEEE Transactions on Industrial Informatics' },
  { short: 'IEEE TASE', full: 'IEEE Transactions on Automation Science and Engineering' },
  { short: 'AEI', full: 'Advanced Engineering Informatics' },
  { short: 'COMPIND', full: 'Computers in Industry' },
  { short: 'ESWA', full: 'Expert Systems with Applications' },
  { short: 'CIRP', full: 'CIRP Annals - Manufacturing Technology' },
  { short: 'IEEE TIE', full: 'IEEE Transactions on Industrial Electronics' },
  { short: 'JIII', full: 'Journal of Industrial Information Integration' },
  { short: 'KBS', full: 'Knowledge-Based Systems' },
  { short: 'INS', full: 'Information Sciences' },
  { short: 'ASOC', full: 'Applied Soft Computing' },
  { short: 'EAAI', full: 'Engineering Applications of Artificial Intelligence' },
];

/**
 * Top Computer Science, Robotics & Human-Agent Collaboration Conferences / Journals
 */
export const CS_TOP_VENUES = [
  { short: 'TPAMI', full: 'IEEE Transactions on Pattern Analysis and Machine Intelligence' },
  { short: 'INFFUS', full: 'Information Fusion' },
  { short: 'JAS', full: 'IEEE/CAA Journal of Automatica Sinica' },
  { short: 'CVPR', full: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition' },
  { short: 'ICML', full: 'International Conference on Machine Learning' },
  { short: 'ICLR', full: 'International Conference on Learning Representations' },
  { short: 'ACL', full: 'Annual Meeting of the Association for Computational Linguistics' },
  { short: 'NeurIPS', full: 'Neural Information Processing Systems' },
  { short: 'ECCV', full: 'European Conference on Computer Vision' },
  { short: 'EMNLP', full: 'Conference on Empirical Methods in Natural Language Processing' },
  { short: 'CHI', full: 'ACM CHI Conference on Human Factors in Computing Systems' },
  { short: 'JAIR', full: 'Journal of Artificial Intelligence Research' },
  { short: 'NHB', full: 'Nature Human Behaviour' },
  { short: 'CoRL', full: 'Conference on Robot Learning' },
  { short: 'RSS', full: 'Robotics: Science and Systems' },
  { short: 'ICRA', full: 'IEEE International Conference on Robotics and Automation' },
  { short: 'arXiv', full: 'arXiv Preprints' },
];

export const DESIGN_JOURNALS = [
  { short: 'JMD', full: 'Journal of Mechanical Design' },
  { short: 'DS', full: 'Design Studies' },
  { short: 'RED', full: 'Research in Engineering Design' },
  { short: 'CAD', full: 'Computer-Aided Design' },
  { short: 'AI EDAM', full: 'Artificial Intelligence for Engineering Design, Analysis and Manufacturing' },
  { short: 'Design Science', full: 'Design Science' },
  { short: 'IJPR', full: 'International Journal of Production Research' },
];
export const TRACKED_JOURNALS = [...CORE_MFG_AI_JOURNALS, ...DESIGN_JOURNALS, ...CS_TOP_VENUES];

export function resolveDoiUrl(doi?: string, fallbackUrl?: string): string {
  const clean = (doi || '').trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  if (clean.startsWith('10.')) return `https://doi.org/${clean}`;
  if (fallbackUrl && fallbackUrl !== '#') return fallbackUrl;
  return '';
}

export function resolvePaperOriginalUrl(paper: { doi?: string; url?: string; openAlexId?: string }): string {
  if (paper.url && paper.url !== '#' && paper.url.startsWith('http')) return paper.url;
  const doiUrl = resolveDoiUrl(paper.doi);
  if (doiUrl) return doiUrl;
  if (paper.openAlexId && paper.openAlexId.startsWith('http')) return paper.openAlexId;
  return '';
}

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
