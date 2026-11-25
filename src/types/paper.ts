export type DomainCategory = 'manufacturing' | 'computer_science' | 'interdisciplinary';

export type ResearchTopic =
  | 'LLM'
  | 'KnowledgeGraph'
  | 'ComputerVision'
  | 'Multimodal'
  | 'EmbodiedAI'
  | 'AgentCollaboration';

export type DatasetSourceType = 'public' | 'self_built' | 'hybrid' | 'unspecified';

export type ReadingStatus = 'unread' | 'reading' | 'mastered';

export type EntryType = 'comment' | 'thought';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarColor: string;
  userTags: string[];
  kbCount?: number;
  createdAt: string;
}

export interface PaperCollectorBadge {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  userTags: string[];
  personalTags: string[];
  readingStatus: ReadingStatus;
  addedAt: string;
}

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
  values: Record<string, string | number>;
}

export interface AblationItem {
  variant: string;
  removedModule: string;
  score: string;
  delta: string;
  impactNote: string;
}

export interface CitationRefNode {
  id: string;
  title: string;
  year: string;
  venue: string;
  authors?: string;
  doi?: string;
  url?: string;
  citedByCount?: number;
  relation: 'references' | 'cited_by' | 'related';
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
    hasQuantitativeData: boolean;
    metricNames: string[];
    primaryMetric: string;
    unit: string;
    rows: ComparisonMetricRow[];
    note?: string;
  };
  ablationStudy: {
    hasQuantitativeData: boolean;
    metricName: string;
    unit: string;
    fullModelScore: string;
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
  entryType: EntryType;
  userId?: string;
  username?: string;
  author: string;
  userTags?: string[];
  role: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AcademicPaper {
  id: string;
  openAlexId?: string;
  title: string;
  titleZh: string;
  authors: string[];
  affiliations: string[];
  journal: string;
  journalShort: string;
  journalRank: string;
  domain: DomainCategory;
  topics: ResearchTopic[];
  publishedDate: string;
  syncedAt: string;
  doi: string;
  url: string;
  sourceOrigin: 'curated_real' | 'arxiv_live' | 'openalex_live' | 'user_created';
  abstractOriginal: string;
  digestSummary: string;
  tags: string[];
  citedByCount: number;
  citations: CitationRefNode[];
  readingStatus: ReadingStatus;
  isBookmarked: boolean;
  collectors?: PaperCollectorBadge[];
  inMyKb?: boolean;
  myPersonalTags?: string[];
  myReadingStatus?: ReadingStatus;
  anatomy: PaperAnatomy;
  comments: PaperComment[];
}

export interface AutoSyncConfig {
  enabled: boolean;
  intervalHours: number;
  targetWindow: 'yesterday_today' | 'last_3_days';
  trackedTopics: ResearchTopic[];
  trackedJournals: string[];
  lastAutoSyncAt: string | null;
  nextAutoSyncAt: string | null;
}
