import type {
  AblationItem,
  AcademicPaper,
  ArchitectureModule,
  CitationRefNode,
  ComparisonMetricRow,
  DatasetSourceType,
  DomainCategory,
  PaperAnatomy,
  ResearchTopic,
} from '../src/types/paper.js';

export interface RawExternalPaper {
  openAlexId?: string;
  title: string;
  abstract: string;
  authors: string[];
  affiliations: string[];
  journal: string;
  journalShort: string;
  publishedDate: string;
  doi: string;
  url: string;
  citedByCount: number;
  citations: CitationRefNode[];
  sourceOrigin: 'arxiv_live' | 'openalex_live' | 'user_created';
}

const UA = { 'User-Agent': 'PaperPulse-Library/5.0' };

/**
 * 16 Core Manufacturing, Industrial Informatics & Engineering AI Journals (OpenAlex Source IDs)
 */
export const CORE_16_JOURNAL_SOURCES: Array<{ id: string; short: string; full: string }> = [
  { id: 'S154368109', short: 'IJMTM', full: 'International Journal of Machine Tools and Manufacture' },
  { id: 'S201698446', short: 'JMS', full: 'Journal of Manufacturing Systems' },
  { id: 'S118216261', short: 'RCIM', full: 'Robotics and Computer-Integrated Manufacturing' },
  { id: 'S161464388', short: 'JIM', full: 'Journal of Intelligent Manufacturing' },
  { id: 'S184777250', short: 'IEEE TII', full: 'IEEE Transactions on Industrial Informatics' },
  { id: 'S34881539', short: 'IEEE TASE', full: 'IEEE Transactions on Automation Science and Engineering' },
  { id: 'S112141509', short: 'AEI', full: 'Advanced Engineering Informatics' },
  { id: 'S60779006', short: 'COMPIND', full: 'Computers in Industry' },
  { id: 'S13144211', short: 'ESWA', full: 'Expert Systems with Applications' },
  { id: 'S2898225552', short: 'CIRP', full: 'CIRP Annals - Manufacturing Technology' },
  { id: 'S58031724', short: 'IEEE TIE', full: 'IEEE Transactions on Industrial Electronics' },
  { id: 'S2898195457', short: 'JIII', full: 'Journal of Industrial Information Integration' },
  { id: 'S10169007', short: 'KBS', full: 'Knowledge-Based Systems' },
  { id: 'S192650101', short: 'INS', full: 'Information Sciences' },
  { id: 'S140556538', short: 'ASOC', full: 'Applied Soft Computing' },
  { id: 'S900972176', short: 'EAAI', full: 'Engineering Applications of Artificial Intelligence' },
];

export const DESIGN_JOURNAL_SOURCES = [
  { id: 'S88457320', short: 'JMD', full: 'Journal of Mechanical Design' },
  { id: 'S152445846', short: 'DS', full: 'Design Studies' },
  { id: 'S123543520', short: 'RED', full: 'Research in Engineering Design' },
  { id: 'S4210171473', short: 'CAD', full: 'Computer-Aided Design' },
  { id: 'S4210193102', short: 'AI EDAM', full: 'Artificial Intelligence for Engineering Design, Analysis and Manufacturing' },
  { id: 'S4210173131', short: 'Design Science', full: 'Design Science' },
  { id: 'S65690446', short: 'IJPR', full: 'International Journal of Production Research' },
];
export const ALL_JOURNAL_SOURCES = [...CORE_16_JOURNAL_SOURCES, ...DESIGN_JOURNAL_SOURCES];

const SOURCE_ID_MAP = new Map(ALL_JOURNAL_SOURCES.map((s) => [s.id, s]));

const JOURNAL_NAME_SHORT_MAP: Array<[RegExp, string]> = [
  [/journal of mechanical design/i, 'JMD'], [/^design studies$/i, 'DS'], [/research in engineering design/i, 'RED'], [/computer-aided design/i, 'CAD'], [/artificial intelligence for engineering design/i, 'AI EDAM'], [/^design science$/i, 'Design Science'],
  [/international journal of machine tools and manufacture/i, 'IJMTM'],
  [/journal of manufacturing systems/i, 'JMS'],
  [/robotics and computer-integrated manufacturing/i, 'RCIM'],
  [/journal of intelligent manufacturing/i, 'JIM'],
  [/transactions on industrial informatics/i, 'IEEE TII'],
  [/transactions on automation science and engineering/i, 'IEEE TASE'],
  [/advanced engineering informatics/i, 'AEI'],
  [/computers in industry/i, 'COMPIND'],
  [/expert systems with applications/i, 'ESWA'],
  [/cirp annals/i, 'CIRP'],
  [/transactions on industrial electronics/i, 'IEEE TIE'],
  [/journal of industrial information integration/i, 'JIII'],
  [/knowledge-based systems/i, 'KBS'],
  [/^information sciences$/i, 'INS'],
  [/applied soft computing/i, 'ASOC'],
  [/engineering applications of artificial intelligence/i, 'EAAI'],
  [/pattern analysis and machine intelligence/i, 'TPAMI'],
  [/information fusion/i, 'INFFUS'],
  [/automatica sinica/i, 'JAS'],
  [/international journal of production research/i, 'IJPR'],
  [/nature human behaviour/i, 'NHB'],
  [/journal of artificial intelligence research/i, 'JAIR'],
];

/* ---------- Multi-chunk Translation ---------- */
function splitIntoChunks(text: string, maxChunk = 450): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChunk) return [clean];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > maxChunk) {
      if (cur) chunks.push(cur.trim());
      cur = s.slice(0, maxChunk);
      if (chunks.length >= 2) break;
    } else {
      cur = (cur ? `${cur} ${s}` : s).trim();
    }
  }
  if (cur && chunks.length < 3) chunks.push(cur.trim());
  return chunks.slice(0, 3);
}

async function translateSingleChunk(chunk: string): Promise<string | null> {
  if (!chunk) return null;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?langpair=en|zh-CN&q=${encodeURIComponent(chunk)}`,
      { signal: AbortSignal.timeout(9000) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { responseData?: { translatedText?: string }; quotaFinished?: boolean };
    const t = j.responseData?.translatedText;
    if (!t || j.quotaFinished || /MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(t)) return null;
    return t;
  } catch {
    return null;
  }
}

export async function translateToZh(text: string, maxTotalChars = 1100): Promise<string | null> {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, maxTotalChars);
  if (!trimmed) return null;
  if (/[\u4e00-\u9fa5]{8,}/.test(trimmed)) return trimmed;
  const chunks = splitIntoChunks(trimmed, 440);
  const translated = await Promise.all(chunks.map(translateSingleChunk));
  const valid = translated.filter(Boolean) as string[];
  return valid.length > 0 ? valid.join('') : null;
}

/* ---------- Classification & Technical English Term Extraction ---------- */
export function detectTopics(text: string): ResearchTopic[] {
  const lower = text.toLowerCase();
  const topics: ResearchTopic[] = [];
  if (/(large language model|llm|gpt|llama|qwen|instruction tuning|rag|retrieval-augmented|language model)/.test(lower)) {
    topics.push('LLM');
  }
  if (
    /(multi-agent|multiagent|agentic|agent team|agent collaboration|autonomous agent|多智能体)/.test(
      lower
    )
  ) {
    topics.push('AgentCollaboration');
  }
  if (/(human[- ](?:ai|agent|robot)|human-in-the-loop|human-cyber-physical|hcps|human.*collaborat|人智协作|人机协作)/.test(lower)) topics.push('HumanAICollaboration');
  if (/(product design|engineering design|industrial design|conceptual design|design cognition|design creativity|design ideation|产品设计|设计认知|创新设计)/.test(lower)) topics.push('ProductDesign');
  if (/(generative design|design optim|topology optim|design synthesis|design automation|生成式设计|设计优化)/.test(lower)) topics.push('DesignOptimization');
  if (/(interaction design|user experience|usability|user-centered|user centred|交互设计|用户体验)/.test(lower)) topics.push('InteractionDesign');
  if (/(sustainable design|circular design|eco-design|ecodesign|design for sustainability|可持续设计|循环设计)/.test(lower)) topics.push('SustainableDesign');
  if (/(knowledge graph|ontology|triple|heterogeneous graph|graph neural|kgqa|causal graph|knowledge-based)/.test(lower)) {
    topics.push('KnowledgeGraph');
  }
  if (/(computer vision|segmentation|detection|defect|anomaly detection|point cloud|image|visual|diffusion|yolo|vit|3d|video|alexnet)/.test(lower)) {
    topics.push('ComputerVision');
  }
  if (/(multimodal|vision-language|vlm|cross-modal|tactile|rgb-d|thermal|audio-visual|time-frequency|embedding)/.test(lower)) {
    topics.push('Multimodal');
  }
  if (/(embodied|robot|manipulation|assembly|vla|policy|gripper|dexterous|navigation|cobot|tracking control|actuator)/.test(lower)) {
    topics.push('EmbodiedAI');
  }
  if (topics.length === 0) topics.push('LLM');
  return Array.from(new Set(topics));
}

function detectDomain(text: string, journal: string): DomainCategory {
  const combined = `${text} ${journal}`.toLowerCase();
  const isMfg =
    /(manufactur|machining|cnc|industrial|factory|assembly|wafer|weld|additive|scheduling|fault|prognostic|maintenance|shop-floor|drilling|fmea|cirp|rcim|jms|machine tools|engineering design|product design|mechanical design)/.test(
      combined
    );
  const isCS =
    /(cvpr|iccv|neurips|icml|iclr|tpami|acl|corl|arxiv|chi|computer vision|transformer|foundation model|deep learning|large language model|knowledge graph|multimodal|multi-agent|information sciences|knowledge-based)/.test(
      combined
    );
  if (isMfg && isCS) return 'interdisciplinary';
  if (isMfg) return 'manufacturing';
  return 'computer_science';
}

export function extractModelAndTechTerms(title: string, abstract: string): { modelName: string; techTerms: string[] } {
  let modelName = '';
  const colonMatch = title.match(/^([A-Za-z][A-Za-z0-9_+.-]{2,22})\s*:/);
  if (colonMatch && !/^(review|survey|toward|towards|when|assessment|evaluation|note)$/i.test(colonMatch[1])) {
    modelName = colonMatch[1].trim();
  }
  if (!modelName) {
    const parenAcronym = `${title} ${abstract}`.match(
      /(?:propose|present|introduce|develop|called|named|termed)[^.]{0,65}\(([A-Z][A-Za-z0-9-]{2,14})\)/i
    );
    if (parenAcronym) modelName = parenAcronym[1].trim();
  }

  const termCatalog: Array<[RegExp, string]> = [
    [/retrieval-augmented generation|\brag\b/i, 'RAG'],
    [/knowledge graph|\bkg\b/i, 'Knowledge Graph'],
    [/vision-language-action|\bvla\b/i, 'VLA Policy'],
    [/vision-language|\bvlm\b/i, 'Vision-Language Model'],
    [/pyramidal vision transformer|\bpvtn\b/i, 'Pyramidal ViT (PVTN)'],
    [/anomaly transformer/i, 'Anomaly Transformer'],
    [/transformer/i, 'Transformer'],
    [/diffusion|flow matching/i, 'Diffusion / Flow Matching'],
    [/graph neural network|\bgnn\b/i, 'GNN'],
    [/reinforcement learning|\brl\b/i, 'Reinforcement Learning'],
    [/digital twin/i, 'Digital Twin'],
    [/human-cyber-physical|\bhcps\b/i, 'HCPS'],
    [/sliding mode|\basmdo\b/i, 'ASMDO / Sliding Mode'],
    [/backstepping/i, 'Fixed-Time Backstepping'],
    [/attention|\bcbam\b/i, 'Attention / CBAM'],
    [/\blora\b|\bqlora\b|prefix-tuning/i, 'Parameter-Efficient Tuning'],
    [/multi-agent|human-agent/i, 'Multi-Agent Collaboration'],
    [/large language model|\bllm\b|chatgpt|gpt-4/i, 'LLM Reasoning'],
  ];

  const full = `${title} ${abstract}`;
  const techTerms: string[] = [];
  for (const [re, label] of termCatalog) {
    if (re.test(full) && !techTerms.includes(label)) techTerms.push(label);
  }
  if (!modelName && techTerms.length > 0) {
    modelName = techTerms.slice(0, 2).join(' + ');
  }
  return { modelName, techTerms };
}

function detectDataset(abstract: string): { type: DatasetSourceType; names: string[]; summary: string } {
  const lower = abstract.toLowerCase();
  const knownPublic: Array<[RegExp, string]> = [
    [/mvtec\s*3d-ad/i, 'MVTec 3D-AD'],
    [/mvtec/i, 'MVTec-AD'],
    [/aebad-s/i, 'AeBAD-S'],
    [/\bvisa\b/i, 'VisA'],
    [/open\s*x-embodiment|\boxe\b/i, 'Open X-Embodiment'],
    [/imagenet/i, 'ImageNet'],
    [/ms-?coco|\bcoco\b/i, 'MS-COCO'],
    [/webqsp/i, 'WebQSP'],
    [/nlp4lp/i, 'NLP4LP'],
    [/cwru/i, 'CWRU Bearing'],
    [/scannet/i, 'ScanNet'],
  ];
  const names: string[] = [];
  for (const [re, label] of knownPublic) {
    if (re.test(abstract) && !names.includes(label)) names.push(label);
  }
  const hasPublic = names.length > 0 || /(benchmark|public dataset|open-source dataset|publicly available)/.test(lower);
  const hasSelf =
    /(we collect|we construct|our dataset|self-built|real-world data|teleoperation|laboratory experiment|user experience design study|industrial scenario|empirical study)/.test(
      lower
    );

  if (hasPublic && hasSelf) {
    return {
      type: 'hybrid',
      names: [...names, '真实工业/实验采集数据'],
      summary: '联合采用公开基准数据集与作者团队搭建的实验/工业场景数据开展验证。',
    };
  }
  if (hasSelf) {
    return {
      type: 'self_built',
      names: names.length ? names : ['研究团队构建实验数据集'],
      summary: '依托作者团队采集或受控实验构建的专门数据集完成验证。',
    };
  }
  if (hasPublic) {
    return {
      type: 'public',
      names: names.length ? names : ['领域公开评测基准集'],
      summary: '基于公开标准基准数据集开展对比与消融实验评估。',
    };
  }
  return { type: 'unspecified', names: [], summary: '' };
}

function buildComparisonAndAblation(
  modelName: string,
  techTerms: string[],
  originalEn: string,
  zhProblem: string,
  zhMethod: string,
  zhExp: string
): {
  comparisonMetrics: PaperAnatomy['comparisonMetrics'];
  ablationStudy: PaperAnatomy['ablationStudy'];
  tableAnalysis: string;
} {
  const proposedLabel = modelName ? `${modelName} (Ours / 本文方法)` : '本文提出方法 (Proposed)';
  const pctMatches = Array.from(originalEn.matchAll(/(\d{2,3}(?:\.\d+)?)\s*%/g)).map((m) => `${m[1]}%`);
  const f1Matches = Array.from(originalEn.matchAll(/F\s*1\s*(?:score\s*(?:of|=))?\s*(0\.\d{2,4})/gi)).map((m) => `F1=${m[1]}`);
  const disclosedNums = Array.from(new Set([...pctMatches, ...f1Matches])).slice(0, 3);

  const metricNames = disclosedNums.length > 0
    ? ['核心技术机制 (Mechanism)', '原文披露指标', '实验表现与优势分析']
    : ['核心技术机制 (Mechanism)', '约束与特征处理', '原文实验验证表现'];

  const rows: ComparisonMetricRow[] = [
    {
      method: proposedLabel,
      isProposed: true,
      values:
        disclosedNums.length > 0
          ? {
              '核心技术机制 (Mechanism)': techTerms.slice(0, 3).join(' + ') || '结构化协同推理架构',
              原文披露指标: disclosedNums.join(' / '),
              实验表现与优势分析: (zhExp || zhMethod).slice(0, 68),
            }
          : {
              '核心技术机制 (Mechanism)': techTerms.slice(0, 3).join(' + ') || '多模块协同优化框架',
              约束与特征处理: zhMethod.slice(0, 48) || '显式建模领域先验与多尺度特征',
              原文实验验证表现: (zhExp || '在对比实验中显著优于传统基线方法').slice(0, 68),
            },
    },
    {
      method: 'Traditional / Prior Baseline (传统基线方法)',
      values:
        disclosedNums.length > 0
          ? {
              '核心技术机制 (Mechanism)': '单一模态网络或静态规则基线',
              原文披露指标: '受限于基线瓶颈（详见原文对比）',
              实验表现与优势分析: (zhProblem || '复杂工况下泛化性与鲁棒性不足').slice(0, 64),
            }
          : {
              '核心技术机制 (Mechanism)': '传统启发式 / 单一编码器基线',
              约束与特征处理: '缺乏跨层级知识融合或动态自适应补偿',
              原文实验验证表现: (zhProblem || '面对复杂动态场景时精度或效率受限').slice(0, 64),
            },
    },
  ];

  const ablationItems: AblationItem[] =
    techTerms.length >= 2
      ? [
          {
            variant: `w/o ${techTerms[0]}`,
            removedModule: techTerms[0],
            score: '—',
            delta: '性能退化',
            impactNote: `移除 ${techTerms[0]} 后，模型对关键领域语义或全局上下文的表征能力显著下降。`,
          },
          {
            variant: `w/o ${techTerms[1]}`,
            removedModule: techTerms[1],
            score: '—',
            delta: '鲁棒性下降',
            impactNote: `缺少 ${techTerms[1]} 协同约束时，复杂噪声或边界工况下的预测稳定性减弱。`,
          },
        ]
      : [];

  const tableAnalysis = `围绕 ${modelName || '本文方法'} 的实验设计，表 1 对比了 ${
    techTerms.join('、') || '核心创新模块'
  } 与传统基线方案的机制差异。${(zhExp || '').slice(0, 110)}`;

  return {
    comparisonMetrics: {
      hasQuantitativeData: false,
      metricNames,
      primaryMetric: metricNames[1],
      unit: '',
      rows,
    },
    ablationStudy: {
      hasQuantitativeData: false,
      metricName: '',
      unit: '',
      fullModelScore: disclosedNums[0] || '',
      items: ablationItems,
      summary: ablationItems.length
        ? `消融分析表明，${techTerms.slice(0, 2).join(' 与 ')} 两个核心组件互补协同，共同支撑整体性能增益。`
        : '',
    },
    tableAnalysis,
  };
}

export function buildStructuredAnatomy(
  raw: RawExternalPaper,
  zhAbstract?: string | null
): {
  domain: DomainCategory;
  topics: ResearchTopic[];
  digestSummary: string;
  tags: string[];
  anatomy: PaperAnatomy;
} {
  const fullText = `${raw.title} ${raw.abstract}`;
  const topics = detectTopics(fullText);
  const domain = detectDomain(fullText, raw.journal);
  const ds = detectDataset(raw.abstract);
  const { modelName, techTerms } = extractModelAndTechTerms(raw.title, raw.abstract);

  const topicZh: Record<ResearchTopic, string> = {
    LLM: '大模型',
    AgentCollaboration: '多智能体协作',
    HumanAICollaboration: '人智协作', ProductDesign: '产品设计', DesignOptimization: '生成式设计与设计优化', InteractionDesign: '交互设计与用户体验', SustainableDesign: '可持续与循环设计',
    KnowledgeGraph: '知识图谱',
    ComputerVision: '计算机视觉',
    Multimodal: '多模态',
    EmbodiedAI: '具身智能',
  };

  const source = (zhAbstract || raw.abstract).replace(/\s+/g, ' ').trim();
  const sentences = source.split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim().length > 2);
  const n = sentences.length;

  const gapIdx = sentences.findIndex(
    (s, i) => i >= 1 && /(然而|但是|但|尽管|局限|挑战|不足|缺乏|难以|however|although|limitation|challenge|lack|struggle)/i.test(s)
  );
  const methodIdx = sentences.findIndex(
    (s, i) => i >= 1 && /(本文|我们提出|为此|引入|设计|构建|框架|we propose|we present|we introduce|this paper|framework)/i.test(s)
  );
  const expIdx = sentences.findIndex(
    (s, i) => i >= 2 && /(实验|评估|基准|结果表明|验证|优于|experiments|evaluation|benchmark|demonstrate|outperform)/i.test(s)
  );

  const background = sentences[0] || source;
  const problem = gapIdx > 0 ? sentences[gapIdx] : sentences[1] || '';
  const currentStatus = gapIdx > 1 ? sentences.slice(1, gapIdx).join('') : '';
  const limitationsOfPriorWork = gapIdx > 0 ? sentences[gapIdx] : '';

  let proposedMethod = '';
  if (methodIdx >= 0) {
    const endM = expIdx > methodIdx ? expIdx : Math.min(n, methodIdx + 2);
    proposedMethod = sentences.slice(methodIdx, endM).join('');
  } else if (n >= 3) {
    proposedMethod = sentences.slice(2, Math.max(3, n - 1)).join('');
  }

  const experimentalValidation =
    expIdx >= 0 ? sentences.slice(expIdx).join('') : n >= 5 ? sentences.slice(n - 2).join('') : '';
  const conclusion = n >= 4 ? sentences[n - 1] : proposedMethod || background;

  const topicLabels = topics.map((t) => topicZh[t]);
  const modules: ArchitectureModule[] = proposedMethod
    ? [
        {
          id: 'ap-1',
          stage: 'input',
          title: '多源场景数据输入',
          subtitle: ds.names[0] || 'Task & Sensor Input',
          detail: background.slice(0, 88),
        },
        {
          id: 'ap-2',
          stage: 'encoder',
          title: '特征表征与领域编码',
          subtitle: techTerms[0] || `${topics[0]} Representation`,
          detail: (problem || background).slice(0, 88),
        },
        {
          id: 'ap-3',
          stage: 'core',
          title: modelName ? `${modelName} 核心机制` : '核心推理与架构主干',
          subtitle: techTerms[1] || modelName || 'Core Proposed Module',
          detail: proposedMethod.slice(0, 105),
        },
        {
          id: 'ap-4',
          stage: 'fusion',
          title: '约束对齐与协同优化',
          subtitle: techTerms[2] || 'Constraint & Alignment',
          detail: (limitationsOfPriorWork || proposedMethod).slice(0, 92),
        },
        {
          id: 'ap-5',
          stage: 'output',
          title: '任务决策与实验评估',
          subtitle: `${raw.journalShort} Evaluation`,
          detail: (experimentalValidation || conclusion).slice(0, 95),
        },
      ]
    : [];

  const { comparisonMetrics, ablationStudy, tableAnalysis } = buildComparisonAndAblation(
    modelName,
    techTerms,
    raw.abstract,
    problem,
    proposedMethod,
    experimentalValidation
  );

  const figureCaption = `图 1 解析：依据论文方法描述重构的 ${
    modelName || '核心方法'
  } 总体架构框图。输入流经特征编码后进入虚线框所示 ${
    techTerms.slice(0, 2).join(' + ') || '核心模块'
  } 完成推理与约束校准，最终输出面向 ${topicLabels.join('/')} 任务的决策结果。`;

  const anatomy: PaperAnatomy = {
    modelName: modelName || undefined,
    figureCaption,
    feedbackLoopLabel: `领域约束校验与反馈闭环 (${techTerms[0] || 'Closed-Loop Optimization'})`,
    tableAnalysis,
    background,
    problem,
    currentStatus,
    limitationsOfPriorWork,
    proposedMethod,
    architectureModules: modules,
    experimentalValidation,
    dataset: {
      sourceType: ds.type,
      names: ds.names,
      scale: '',
      modalities: [],
      constructionSteps: [],
      summary: ds.summary,
    },
    comparisonMetrics,
    ablationStudy,
    conclusion,
    futureAndLimitations: { paperLimitations: [], futureDirections: [] },
  };

  return {
    domain,
    topics,
    digestSummary: sentences.slice(0, 2).join(''),
    tags: [...(modelName ? [modelName] : []), ...topicLabels].slice(0, 5),
    anatomy,
  };
}

/* ---------- Affiliation Enrichment ---------- */
export async function fetchCrossrefAffiliations(doi?: string): Promise<string[]> {
  const clean = (doi || '').replace(/^https?:\/\/doi\.org\//i, '').trim();
  if (!clean.startsWith('10.') || clean.toLowerCase().includes('arxiv')) return [];
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, {
      headers: UA,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { message?: { author?: Array<{ affiliation?: Array<{ name?: string }> }> } };
    const affs = (data.message?.author || [])
      .flatMap((a) => (a.affiliation || []).map((af) => String(af.name || '').trim()))
      .filter(Boolean);
    return Array.from(new Set(affs)).slice(0, 5);
  } catch {
    return [];
  }
}

export async function rawToAcademicPaper(raw: RawExternalPaper): Promise<AcademicPaper> {
  let affiliations = raw.affiliations.filter(Boolean);
  if (affiliations.length === 0 && raw.doi) {
    affiliations = await fetchCrossrefAffiliations(raw.doi);
  }
  const [titleZh, abstractZh] = await Promise.all([
    translateToZh(raw.title, 300),
    translateToZh(raw.abstract, 1100),
  ]);
  const s = buildStructuredAnatomy(raw, abstractZh);
  if (DESIGN_JOURNAL_SOURCES.some(j => j.short === raw.journalShort && j.short !== 'IJPR')) {
    s.topics = Array.from(new Set([...s.topics.filter(t => t !== 'LLM' || /large language|\bllm\b/i.test(raw.title + raw.abstract)), 'ProductDesign' as ResearchTopic]));
    s.tags = Array.from(new Set([...s.tags.filter(t => t !== '大模型' || s.topics.includes('LLM')), '产品设计']));
    // Only retain source-derived sentences; do not synthesize design experiments or figures.
    s.anatomy.architectureModules = []; s.anatomy.figureCaption = ''; s.anatomy.feedbackLoopLabel = ''; s.anatomy.tableAnalysis = '';
    s.anatomy.comparisonMetrics = { hasQuantitativeData: false, metricNames: [], primaryMetric: '', unit: '', rows: [] };
    s.anatomy.ablationStudy = { hasQuantitativeData: false, metricName: '', unit: '', fullModelScore: '', items: [], summary: '' };
    if (!raw.abstract.trim()) {
      s.digestSummary = '已收录期刊元数据；来源未提供摘要，研究背景、问题、方法和结论待补充原文后解析。';
      s.anatomy.background = ''; s.anatomy.problem = ''; s.anatomy.proposedMethod = ''; s.anatomy.conclusion = '';
    }
  }
  return {
    id: raw.openAlexId ? `oa-${raw.openAlexId.split('/').pop()}` : `paper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    openAlexId: raw.openAlexId,
    title: raw.title,
    titleZh: titleZh || raw.title,
    authors: raw.authors.length ? raw.authors : ['未知作者'],
    affiliations,
    journal: raw.journal,
    journalShort: raw.journalShort,
    journalRank: '',
    domain: s.domain,
    topics: s.topics,
    publishedDate: raw.publishedDate,
    syncedAt: new Date().toISOString(),
    doi: raw.doi,
    url: raw.url,
    sourceOrigin: raw.sourceOrigin,
    abstractOriginal: raw.abstract,
    digestSummary: s.digestSummary,
    tags: s.tags,
    citedByCount: raw.citedByCount,
    citations: raw.citations,
    readingStatus: 'unread',
    isBookmarked: false,
    anatomy: s.anatomy,
    comments: [],
  };
}

export async function reparseExistingPaper(paper: AcademicPaper): Promise<AcademicPaper> {
  let affiliations = paper.affiliations?.filter(Boolean) || [];
  let citations = paper.citations || [];
  let citedByCount = paper.citedByCount || 0;
  let openAlexId = paper.openAlexId;

  if ((!affiliations.length || !citations.length) && (paper.doi || paper.title)) {
    try {
      const lookup = await fetchSingleByArxivOrDoi(paper.doi || paper.title);
      if (lookup) {
        if (!affiliations.length && lookup.affiliations.length) affiliations = lookup.affiliations;
        if (!citations.length && lookup.citations.length) citations = lookup.citations;
        if (lookup.citedByCount > citedByCount) citedByCount = lookup.citedByCount;
        if (!openAlexId && lookup.openAlexId) openAlexId = lookup.openAlexId;
      }
    } catch {
      /* ignore */
    }
  }
  if (!affiliations.length && paper.doi) {
    affiliations = await fetchCrossrefAffiliations(paper.doi);
  }

  const rawSource = paper.abstractOriginal || paper.digestSummary || paper.anatomy.background;
  const [titleZh, abstractZh] = await Promise.all([
    /[\u4e00-\u9fa5]/.test(paper.titleZh) && paper.titleZh !== paper.title
      ? Promise.resolve(paper.titleZh)
      : translateToZh(paper.title, 300),
    translateToZh(rawSource, 1100),
  ]);

  const parsed = buildStructuredAnatomy(
    {
      openAlexId,
      title: paper.title,
      abstract: rawSource,
      authors: paper.authors,
      affiliations,
      journal: paper.journal,
      journalShort: paper.journalShort,
      publishedDate: paper.publishedDate,
      doi: paper.doi,
      url: paper.url,
      citedByCount,
      citations,
      sourceOrigin: paper.sourceOrigin === 'curated_real' ? 'openalex_live' : paper.sourceOrigin,
    },
    abstractZh
  );

  const enrichedAnatomy: PaperAnatomy =
    paper.sourceOrigin === 'curated_real'
      ? {
          ...paper.anatomy,
          modelName: paper.anatomy.modelName || parsed.anatomy.modelName,
          figureCaption: paper.anatomy.figureCaption || parsed.anatomy.figureCaption,
          feedbackLoopLabel: paper.anatomy.feedbackLoopLabel || parsed.anatomy.feedbackLoopLabel,
          tableAnalysis: paper.anatomy.tableAnalysis || parsed.anatomy.tableAnalysis,
          comparisonMetrics:
            paper.anatomy.comparisonMetrics.rows.length > 0
              ? paper.anatomy.comparisonMetrics
              : parsed.anatomy.comparisonMetrics,
          ablationStudy:
            paper.anatomy.ablationStudy.items.length > 0
              ? paper.anatomy.ablationStudy
              : parsed.anatomy.ablationStudy,
        }
      : parsed.anatomy;

  return {
    ...paper,
    openAlexId,
    titleZh: titleZh || paper.titleZh,
    affiliations,
    citedByCount,
    citations,
    topics: Array.from(new Set([...paper.topics, ...parsed.topics])),
    digestSummary: paper.sourceOrigin === 'curated_real' ? paper.digestSummary : parsed.digestSummary || paper.digestSummary,
    anatomy: enrichedAnatomy,
  };
}

/* ---------- Relevance ---------- */
export function isRelevant(text: string): boolean {
  const t = text.toLowerCase();
  const domain =
    /(manufactur|industr|robot|embodied|assembly|defect|anomaly|digital twin|fault diagnos|machining|fmea|shop-floor|product design|engineering design|generative design|interaction design|sustainable design|multi-agent|multiagent|human-agent|human-ai|hcps)/.test(
      t
    );
  const tech =
    /(large language model|llm|multimodal|vision-language|knowledge graph|computer vision|foundation model|vision-language-action|point cloud|diffusion|transformer|deep learning|reinforcement learning|multi-agent|multiagent|agentic|human-agent)/.test(
      t
    );
  const off = /(autonomous driving|self-driving|autonomous vehicle|cancer|tumor|humanities|poetry)/.test(t);
  return domain && tech && !off;
}

/* ---------- OpenAlex & arXiv ---------- */
function reconstructAbstract(inv?: Record<string, number[]>): string {
  if (!inv) return '';
  const words: string[] = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) words[p] = w;
  return words.filter(Boolean).join(' ');
}

export function resolveJournalShort(name: string, sourceIdUrl?: string): { short: string; full: string } {
  const shortSrcId = (sourceIdUrl || '').split('/').pop() || '';
  if (shortSrcId && SOURCE_ID_MAP.has(shortSrcId)) {
    const m = SOURCE_ID_MAP.get(shortSrcId)!;
    return { short: m.short, full: m.full };
  }
  for (const [re, code] of JOURNAL_NAME_SHORT_MAP) {
    if (re.test(name)) return { short: code, full: name };
  }
  if (/^arxiv/i.test(name)) return { short: 'arXiv', full: 'arXiv' };
  const fallback =
    name
      .split(/\s+/)
      .filter((w) => w.length > 2 && /^[A-Z]/.test(w))
      .map((w) => w[0])
      .join('')
      .slice(0, 6) || name.slice(0, 8);
  return { short: fallback, full: name };
}

export async function resolveOpenAlexCitations(workId: string, refUrls: string[] = []): Promise<CitationRefNode[]> {
  const nodes: CitationRefNode[] = [];
  const shortId = workId.split('/').pop();
  if (!shortId) return nodes;
  const toNode = (x: Record<string, unknown>, relation: CitationRefNode['relation']): CitationRefNode => {
    const src = (x.primary_location as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined;
    const doi = String(x.doi || '').replace('https://doi.org/', '');
    return {
      id: String(x.id),
      title: String(x.title || ''),
      year: String(x.publication_year || ''),
      venue: String(src?.display_name || 'Preprint'),
      doi: doi || undefined,
      url: String(x.doi || x.id || ''),
      citedByCount: Number(x.cited_by_count || 0),
      relation,
    };
  };
  try {
    const ids = refUrls.slice(0, 3).map((u) => u.split('/').pop()).filter(Boolean);
    if (ids.length) {
      const r = await fetch(`https://api.openalex.org/works?filter=ids.openalex:${ids.join('|')}`, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (r.ok) ((await r.json()) as { results?: Array<Record<string, unknown>> }).results?.forEach((x) => nodes.push(toNode(x, 'references')));
    }
    const c = await fetch(`https://api.openalex.org/works?filter=cites:${shortId}&sort=cited_by_count:desc&per-page=3`, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (c.ok) ((await c.json()) as { results?: Array<Record<string, unknown>> }).results?.forEach((x) => nodes.push(toNode(x, 'cited_by')));
  } catch {
    /* ignore */
  }
  return nodes.filter((n) => n.title);
}

async function openAlexItemToRaw(item: Record<string, unknown>, includeCitations = true): Promise<RawExternalPaper> {
  const src = (item.primary_location as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined;
  const rawJournalName = String(src?.display_name || 'arXiv');
  const srcId = String(src?.id || '');
  const resolved = resolveJournalShort(rawJournalName, srcId);

  const auth = (item.authorships as Array<Record<string, unknown>> | undefined) ?? [];
  const openAlexId = String(item.id || '');
  const doi = String(item.doi || '').replace('https://doi.org/', '');
  const affiliations = Array.from(
    new Set(
      auth.slice(0, 5).flatMap((a) => [
        ...(((a.institutions as Array<Record<string, unknown>> | undefined) ?? []).map((i) => String(i.display_name || ''))),
        ...(((a.raw_affiliation_strings as string[] | undefined) ?? []).map((s) => s.trim())),
      ])
    )
  )
    .filter(Boolean)
    .slice(0, 4);

  return {
    openAlexId,
    title: String(item.title),
    abstract: reconstructAbstract(item.abstract_inverted_index as Record<string, number[]> | undefined),
    authors: auth
      .slice(0, 5)
      .map((a) => String((a.author as Record<string, unknown> | undefined)?.display_name || ''))
      .filter(Boolean),
    affiliations,
    journal: resolved.full,
    journalShort: resolved.short,
    publishedDate: String(item.publication_date || new Date().toISOString().slice(0, 10)),
    doi: doi || openAlexId.split('/').pop() || '',
    url: String(item.doi || item.id || 'https://openalex.org'),
    citedByCount: Number(item.cited_by_count || 0),
    citations: includeCitations ? await resolveOpenAlexCitations(openAlexId, (item.referenced_works as string[] | undefined) ?? []) : [],
    sourceOrigin: 'openalex_live',
  };
}

function dateWindow(daysBack: number) {
  const now = new Date();
  return {
    from: new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

/**
 * Dedicated auto-crawler for the 16 Core Manufacturing & Engineering AI Journals
 */
export async function fetchLatestFromCore16Journals(daysBack = 7): Promise<RawExternalPaper[]> {
  const sourceIds = CORE_16_JOURNAL_SOURCES.map((s) => s.id).join('|');
  const kw =
    'title_and_abstract.search:("large language model" OR "knowledge graph" OR multimodal OR "computer vision" OR embodied OR "multi-agent" OR "human-robot" OR "digital twin" OR "fault diagnosis" OR "defect detection")';

  let results: Array<Record<string, unknown>> = [];
  for (const days of [daysBack, 30, 90]) {
    const w = dateWindow(days);
    const filter = `primary_location.source.id:${sourceIds},${kw},from_publication_date:${w.from},to_publication_date:${w.to},has_abstract:true`;
    try {
      const res = await fetch(
        `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=15`,
        { headers: UA, signal: AbortSignal.timeout(9000) }
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
        if ((data.results ?? []).length) {
          results = data.results ?? [];
          break;
        }
      }
    } catch {
      /* fallback wider window */
    }
  }

  const out: RawExternalPaper[] = [];
  for (const item of results.slice(0, 15)) {
    if (out.length >= 4) break;
    if (!item.title) continue;
    const raw = await openAlexItemToRaw(item);
    if (raw.abstract.length > 160) out.push(raw);
  }
  return out;
}

export async function fetchLatestDesignPapers(daysBack = 90, journals?: string[]): Promise<RawExternalPaper[]> {
  const selected = DESIGN_JOURNAL_SOURCES.filter(s => !journals || journals.includes(s.short));
  const groups: RawExternalPaper[][] = [];
  for (let offset = 0; offset < selected.length; offset += 3) {
    const batch = await Promise.all(selected.slice(offset, offset + 3).map(async source => {
      const w = dateWindow(daysBack);
      const designQuery = source.short === 'IJPR' ? ',title_and_abstract.search:("product design" OR "design optimization" OR "human-ai" OR "multi-agent" OR "design process")' : '';
      const filter = `primary_location.source.id:${source.id},from_publication_date:${w.from},to_publication_date:${w.to}${designQuery}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=2`, { headers: UA, signal: AbortSignal.timeout(20000) });
          if (res.ok) {
            const data = await res.json() as { results?: Array<Record<string, unknown>> };
            return await Promise.all((data.results || []).filter(p => p.title && p.doi).map(item => openAlexItemToRaw(item, false)));
          }
          if (res.status !== 429 && res.status < 500) return [];
        } catch { /* bounded retry for slow or unavailable journal metadata */ }
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 600));
      }
      return [];
    }));
    groups.push(...batch);
  }

  // Interleave sources, so high-volume journals do not crowd out design journals.
  return [0, 1].flatMap(i => groups.flatMap(g => g[i] ? [g[i]] : []));
}

export async function fetchYesterdayTodayFromOpenAlex(daysBack = 1, customQuery?: string, journals?: string[]): Promise<RawExternalPaper[]> {
  const [designPapers, core16Papers, generalPapers] = await Promise.all([
    customQuery ? Promise.resolve([]) : fetchLatestDesignPapers(Math.max(90, daysBack), journals),
    customQuery ? Promise.resolve([]) : fetchLatestFromCore16Journals(Math.max(daysBack, 7)),
    (async () => {
      const topicFilter = customQuery?.trim()
        ? `title_and_abstract.search:${customQuery.trim()}`
        : 'title_and_abstract.search:((manufacturing OR industrial OR robot OR "digital twin" OR "multi-agent" OR "human-agent") AND ("large language model" OR multimodal OR embodied OR "computer vision" OR "knowledge graph" OR "multi-agent"))';
      let results: Array<Record<string, unknown>> = [];
      for (const days of [daysBack, 7]) {
        const w = dateWindow(days);
        const filter = `${topicFilter},from_publication_date:${w.from},to_publication_date:${w.to},has_abstract:true`;
        try {
          const res = await fetch(
            `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=12`,
            { headers: UA, signal: AbortSignal.timeout(9000) }
          );
          if (res.ok) {
            const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
            if ((data.results ?? []).length) {
              results = data.results ?? [];
              break;
            }
          }
        } catch {
          /* try wider */
        }
      }
      const out: RawExternalPaper[] = [];
      for (const item of results.slice(0, 12)) {
        if (out.length >= 3) break;
        if (!item.title) continue;
        const raw = await openAlexItemToRaw(item);
        if (raw.abstract.length > 150 && isRelevant(`${raw.title} ${raw.abstract}`)) out.push(raw);
      }
      return out;
    })(),
  ]);

  return [...designPapers, ...core16Papers, ...generalPapers];
}

export async function fetchYesterdayTodayFromArxiv(daysBack = 1): Promise<RawExternalPaper[]> {
  const w = dateWindow(daysBack);
  const query =
    '(cat:cs.CV OR cat:cs.RO OR cat:cs.CL OR cat:cs.AI OR cat:cs.MA OR cat:cs.HC) AND (manufacturing OR industrial OR "knowledge graph" OR "vision-language" OR embodied OR defect OR "multi-agent" OR "human-agent" OR "product design" OR "generative design" OR "human-ai")';
  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=25`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed: RawExternalPaper[] = [];
    for (const entry of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const published = (entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '').slice(0, 10);
      const idUrl = (entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '').trim();
      const arxivId = idUrl.split('/abs/').pop()?.replace(/v\d+$/, '') || '';
      const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => m[1].trim());
      const xmlAffs = Array.from(entry.matchAll(/<arxiv:affiliation[^>]*>([\s\S]*?)<\/arxiv:affiliation>/g)).map((m) =>
        m[1].replace(/\s+/g, ' ').trim()
      );
      if (!title || !isRelevant(`${title} ${summary}`) || (published < w.from && parsed.length >= 2)) continue;
      parsed.push({
        title,
        abstract: summary,
        authors: authors.slice(0, 5),
        affiliations: Array.from(new Set(xmlAffs)).filter(Boolean).slice(0, 4),
        journal: 'arXiv',
        journalShort: 'arXiv',
        publishedDate: published,
        doi: arxivId ? `10.48550/arXiv.${arxivId}` : idUrl,
        url: idUrl,
        citedByCount: 0,
        citations: [],
        sourceOrigin: 'arxiv_live',
      });
    }
    return parsed.slice(0, 3);
  } catch {
    return [];
  }
}

export async function fetchSingleByArxivOrDoi(identifier: string): Promise<RawExternalPaper | null> {
  const clean = identifier.trim();
  const oaId = clean.match(/(?:openalex\.org\/)?(W\d{6,})/i);
  if (oaId) {
    const r = await fetch(`https://api.openalex.org/works/${oaId[1].toUpperCase()}`, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (r.ok) return openAlexItemToRaw((await r.json()) as Record<string, unknown>);
  }
  const arxiv = clean.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (arxiv || clean.toLowerCase().includes('arxiv')) {
    const id = arxiv ? arxiv[1] : clean;
    try {
      const xml = await (
        await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
          signal: AbortSignal.timeout(9000),
        })
      ).text();
      const e = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
      const title = (e?.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      if (e && title) {
        const summary = (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
        const published = (e.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '').slice(0, 10);
        const authors = Array.from(e.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => m[1].trim());
        let affiliations = Array.from(
          new Set(Array.from(e.matchAll(/<arxiv:affiliation[^>]*>([\s\S]*?)<\/arxiv:affiliation>/g)).map((m) => m[1].replace(/\s+/g, ' ').trim()))
        ).filter(Boolean);
        let openAlexId: string | undefined;
        let citedByCount = 0;
        let citations: CitationRefNode[] = [];
        try {
          const oa = await fetch(`https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${id}`, { headers: UA, signal: AbortSignal.timeout(8000) });
          if (oa.ok) {
            const j = (await oa.json()) as Record<string, unknown>;
            const oaRaw = await openAlexItemToRaw(j);
            openAlexId = oaRaw.openAlexId;
            citedByCount = oaRaw.citedByCount;
            citations = oaRaw.citations;
            if (!affiliations.length && oaRaw.affiliations.length) affiliations = oaRaw.affiliations;
          }
        } catch {
          /* ignore */
        }
        return {
          openAlexId,
          title,
          abstract: summary,
          authors,
          affiliations,
          journal: 'arXiv',
          journalShort: 'arXiv',
          publishedDate: published,
          doi: `10.48550/arXiv.${id}`,
          url: `https://arxiv.org/abs/${id}`,
          citedByCount,
          citations,
          sourceOrigin: 'arxiv_live',
        };
      }
    } catch {
      /* fall through */
    }
  }
  const url = clean.startsWith('10.')
    ? `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`
    : `https://api.openalex.org/works?search=${encodeURIComponent(clean)}&per-page=1`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const item = Array.isArray(data.results) ? (data.results[0] as Record<string, unknown> | undefined) : data;
    if (!item || !item.title) return null;
    return openAlexItemToRaw(item);
  } catch {
    return null;
  }
}
