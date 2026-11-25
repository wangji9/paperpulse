import type { AcademicPaper, DatasetSourceType, DomainCategory, ResearchTopic } from '../types/paper';

export const TOPIC_META: Record<
  ResearchTopic,
  { label: string; labelEn: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  LLM: {
    label: '大模型',
    labelEn: 'LLM',
    color: '#4F46E5',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
  },
  KnowledgeGraph: {
    label: '知识图谱',
    labelEn: 'Knowledge Graph',
    color: '#0891B2',
    bgClass: 'bg-cyan-50',
    textClass: 'text-cyan-700',
    borderClass: 'border-cyan-200',
  },
  ComputerVision: {
    label: '计算机视觉',
    labelEn: 'Computer Vision',
    color: '#2563EB',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
    borderClass: 'border-blue-200',
  },
  Multimodal: {
    label: '多模态',
    labelEn: 'Multimodal',
    color: '#7C3AED',
    bgClass: 'bg-violet-50',
    textClass: 'text-violet-700',
    borderClass: 'border-violet-200',
  },
  EmbodiedAI: {
    label: '具身智能',
    labelEn: 'Embodied AI',
    color: '#059669',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
};

export const DOMAIN_META: Record<DomainCategory, { label: string; badgeClass: string }> = {
  manufacturing: {
    label: '智能制造期刊',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  computer_science: {
    label: '计算机顶刊顶会',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  interdisciplinary: {
    label: '制造 × AI 交叉',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
};

export const DATASET_SOURCE_META: Record<
  DatasetSourceType,
  { label: string; shortLabel: string; badgeClass: string; desc: string }
> = {
  public: {
    label: '公开基准数据集',
    shortLabel: '公开数据集',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: '基于国际公开标准基准集评测',
  },
  self_built: {
    label: '研究团队自建数据集',
    shortLabel: '自建数据集',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    desc: '来自真实产线/实机平台全新采集标注',
  },
  hybrid: {
    label: '公开 + 自建混合验证',
    shortLabel: '混合数据集',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    desc: '兼顾公开基准横向对比与自建工业真实域验证',
  },
};

export const TRACKED_JOURNALS = [
  { short: 'JMS', full: 'Journal of Manufacturing Systems', domain: '制造顶刊 · SCI Q1' },
  { short: 'RCIM', full: 'Robotics and Computer-Integrated Manufacturing', domain: '制造顶刊 · SCI Q1' },
  { short: 'IJMTM', full: 'Intl. J. Machine Tools & Manufacture', domain: '制造权威 · SCI Q1' },
  { short: 'IEEE TII', full: 'IEEE Trans. Industrial Informatics', domain: '工业信息 · SCI Q1' },
  { short: 'TPAMI', full: 'IEEE Trans. Pattern Analysis & Machine Intelligence', domain: '视觉顶刊 · SCI Q1' },
  { short: 'CVPR', full: 'IEEE/CVF CVPR', domain: '视觉顶会 · CCF-A' },
  { short: 'NeurIPS', full: 'NeurIPS', domain: 'AI顶会 · CCF-A' },
  { short: 'CoRL', full: 'Conference on Robot Learning', domain: '具身智能 · 顶会' },
];

export function formatRelativeTime(isoString: string): string {
  const target = new Date(isoString).getTime();
  const ref = new Date('2026-11-25T11:20:00+08:00').getTime();
  const now = Math.max(Date.now(), ref);
  const diffMin = Math.max(1, Math.floor((now - target) / 60000));
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} 天前`;
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
