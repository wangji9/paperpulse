export type DomainCategory = 'manufacturing' | 'computer_science' | 'interdisciplinary';

export type ResearchTopic =
  | 'LLM'
  | 'KnowledgeGraph'
  | 'ComputerVision'
  | 'Multimodal'
  | 'EmbodiedAI'
  | 'AgentCollaboration'
  | 'HumanAICollaboration'
  | 'ProductDesign'
  | 'DesignOptimization'
  | 'InteractionDesign'
  | 'SustainableDesign';

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
  readPaperCount?: number;
  totalReadSeconds?: number;
  likeCount?: number;
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

export interface PaperLikerBadge {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  userTags: string[];
  likedAt: string;
}

export interface PaperReaderTrace {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  userTags: string[];
  visitCount: number;
  totalDwellSeconds: number;
  lastVisitedAt: string;
  liked: boolean;
  collected: boolean;
  commentCount: number;
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

export interface OriginalPaperFigure {
  id: string;
  label: string;
  url: string;
  captionOriginal: string;
  captionZh?: string;
  analysisZh: string;
  category: 'method' | 'experiment';
}

export interface OriginalPaperTable {
  id: string;
  label: string;
  html?: string;
  imageUrl?: string;
  captionOriginal: string;
  captionZh?: string;
  analysisZh: string;
}

export interface PaperAnatomy {
  modelName?: string;
  figureUrl?: string;
  figureCaption?: string;
  feedbackLoopLabel?: string;
  tableAnalysis?: string;
  paperFigures?: OriginalPaperFigure[];
  paperTables?: OriginalPaperTable[];
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
  avatarColor?: string;
  userTags?: string[];
  role: string;
  content: string;
  parentId?: string;
  replyToAuthor?: string;
  likes?: PaperLikerBadge[];
  likedByMe?: boolean;
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
  sourceOrigin: 'curated_real' | 'arxiv_live' | 'openalex_live' | 'conference_live' | 'user_created';
  upload?: { userId:string; username:string; displayName:string; fileName:string; uploadedAt:string; sha256:string; titleFromFileName?:boolean };
  localization?: {
    version:string; status:'complete'|'partial'; updatedAt:string;
    fields:Record<string,{source:string;translated:string}>; warnings:string[];
  };
  keywords?: string[];
  keywordsOriginal?: string[];
  keywordSource?: 'author' | 'extracted' | 'manual';
  pdfUrl?: string;
  codeUrl?: string;
  localPdfUrl?: string;
  htmlUrl?: string;
  parsing?: { status: 'metadata' | 'abstract' | 'full_text' | 'unavailable'; sourceUrl?: string; updatedAt: string; pages?: number; sections: string[]; warnings: string[] };
  abstractOriginal: string;
  digestSummary: string;
  tags: string[];
  citedByCount: number;
  citations: CitationRefNode[];
  readingStatus: ReadingStatus;
  isBookmarked: boolean;
  collectors?: PaperCollectorBadge[];
  likers?: PaperLikerBadge[];
  likedByMe?: boolean;
  readers?: PaperReaderTrace[];
  totalVisits?: number;
  totalDwellSeconds?: number;
  inMyKb?: boolean;
  myPersonalTags?: string[];
  myReadingStatus?: ReadingStatus;
  anatomy: PaperAnatomy;
  comments: PaperComment[];
}

export interface PdfImportJob {
  id:string; fileName:string; status:'queued'|'processing'|'completed'|'failed';
  phase:string; createdAt:string; updatedAt:string; paperId?:string; alreadyExists?:boolean; error?:string;
}

export interface AutoSyncConfig {
  maxStoredPapers?: number;
  enabled: boolean;
  intervalHours: number;
  targetWindow: 'yesterday_today' | 'last_3_days' | 'current_year';
  trackedTopics: ResearchTopic[];
  trackedJournals: string[];
  lastAutoSyncAt: string | null;
  nextAutoSyncAt: string | null;
}

export interface ReadingAnalytics {
  scopeLabel: string;
  totalVisits: number;
  totalSeconds: number;
  readPaperCount: number;
  collectionCount: number;
  likeCount: number;
  commentCount: number;
  papers: Array<{ id: string; title: string; journal: string; visits: number; seconds: number; topics: ResearchTopic[] }>;
  keywords: Array<{ keyword: string; visits: number; paperCount: number }>;
  topics: Array<{ topic: ResearchTopic; visits: number; seconds: number }>;
  timeline: Array<{ date: string; visits: number; seconds: number }>;
}
export interface LibraryInventory {
  totalPapers: number; databaseBytes: number; assetBytes: number; maxStoredPapers: number;
  papers: Array<{ id: string; title: string; journal: string; publishedDate: string; syncedAt: string; bytes: number; assetBytes: number; visits: number; collectors: number }>;
}
