export type DomainCategory = 'manufacturing' | 'computer_science' | 'interdisciplinary';

export type ResearchTopic =
  | 'LLM'
  | 'KnowledgeGraph'
  | 'ComputerVision'
  | 'Multimodal'
  | 'EmbodiedAI';

export type DatasetSourceType = 'public' | 'self_built' | 'hybrid';

export interface ArchitectureModule {
  id: string;
  stage: 'input' | 'encoder' | 'core' | 'fusion' | 'output';
  title: string;
  subtitle: string;
  detail: string;
}

export interface DatasetDetail {
  sourceType: DatasetSourceType;
  names: string[];
  scale: string;
  modalities: { label: string; percentage: number }[];
  constructionSteps: { step: string; title: string; description: string }[];
  summary: string;
}

export interface ComparisonMetricRow {
  method: string;
  isProposed?: boolean;
  values: Record<string, number>;
}

export interface AblationItem {
  variant: string;
  removedModule: string;
  score: number;
  delta: number;
  impactNote: string;
}

export interface PaperAnatomy {
  background: string;
  problem: string;
  currentStatus: string;
  limitationsOfPriorWork: string;
  proposedMethod: string;
  architectureModules: ArchitectureModule[];
  experimentalValidation: string;
  dataset: DatasetDetail;
  comparisonMetrics: {
    metricNames: string[];
    primaryMetric: string;
    unit: string;
    higherIsBetter: boolean;
    rows: ComparisonMetricRow[];
  };
  ablationStudy: {
    metricName: string;
    unit: string;
    fullModelScore: number;
    items: AblationItem[];
    summary: string;
  };
  conclusion: string;
  futureAndLimitations: {
    paperLimitations: string[];
    futureDirections: string[];
  };
}

export interface PaperComment {
  id: string;
  paperId: string;
  author: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface AcademicPaper {
  id: string;
  title: string;
  titleZh: string;
  authors: string[];
  affiliations: string[];
  journal: string;
  journalShort: string;
  journalRank: string; // e.g., "SCI Q1 · IF 12.3" or "CCF-A · 顶会"
  domain: DomainCategory;
  topics: ResearchTopic[];
  publishedDate: string; // YYYY-MM-DD
  syncedAt: string; // ISO timestamp for Weibo-like feed ordering
  doi: string;
  url: string;
  sourceOrigin: 'curated' | 'arxiv_live' | 'openalex_live' | 'user_created';
  weiboSummary: string; // 2-3 sentence dynamic feed hook
  keyHighlightMetric: string; // e.g., "+6.4% mAP / 98.2% 准确率"
  tags: string[];
  likes: number;
  isLiked: boolean;
  isBookmarked: boolean;
  reposts: number;
  anatomy: PaperAnatomy;
  comments: PaperComment[];
}

export interface SyncStatus {
  lastSyncAt: string;
  totalPapers: number;
  todayAdded: number;
  sources: { name: string; status: 'online' | 'syncing'; count: number }[];
}
