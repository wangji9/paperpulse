import type {
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

const UA = { 'User-Agent': 'PaperPulse-Library/4.0' };

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

/* ---------- Classification & Auto Content Extraction ---------- */
function detectTopics(text: string): ResearchTopic[] {
  const lower = text.toLowerCase();
  const topics: ResearchTopic[] = [];
  if (/(large language model|llm|gpt|llama|qwen|instruction tuning|rag|language model)/.test(lower)) topics.push('LLM');
  if (/(multi-agent|multiagent|agentic|human-agent|human-ai collaboration|human-in-the-loop|human-robot collaboration|agent team|agent collaboration|autonomous agent)/.test(lower)) {
    topics.push('AgentCollaboration');
  }
  if (/(knowledge graph|ontology|triple|heterogeneous graph|graph neural|kgqa|causal graph)/.test(lower)) topics.push('KnowledgeGraph');
  if (/(computer vision|segmentation|detection|defect|point cloud|image|visual|diffusion|yolo|vit|3d|video)/.test(lower)) topics.push('ComputerVision');
  if (/(multimodal|vision-language|vlm|cross-modal|tactile|rgb-d|thermal|audio-visual|embedding)/.test(lower)) topics.push('Multimodal');
  if (/(embodied|robot|manipulation|assembly|vla|policy|gripper|dexterous|navigation|cobot)/.test(lower)) topics.push('EmbodiedAI');
  if (topics.length === 0) topics.push('LLM');
  return Array.from(new Set(topics));
}

function detectDomain(text: string, journal: string): DomainCategory {
  const combined = `${text} ${journal}`.toLowerCase();
  const isMfg = /(manufactur|machining|cnc|industrial|factory|assembly|wafer|weld|additive|scheduling|fault|prognostic|maintenance|shop-floor|cirp|rcim|jms)/.test(combined);
  const isCS = /(cvpr|iccv|neurips|icml|iclr|tpami|acl|corl|arxiv|chi|computer vision|transformer|foundation model|deep learning|robotics|multimodal|multi-agent)/.test(combined);
  if (isMfg && isCS) return 'interdisciplinary';
  if (isMfg) return 'manufacturing';
  return 'computer_science';
}

function detectDataset(abstract: string): { type: DatasetSourceType; names: string[]; summary: string } {
  const lower = abstract.toLowerCase();
  const knownPublic: Array<[RegExp, string]> = [
    [/mvtec\s*3d-ad/i, 'MVTec 3D-AD'],
    [/mvtec/i, 'MVTec-AD'],
    [/\bvisa\b/i, 'VisA'],
    [/open\s*x-embodiment|\boxe\b/i, 'Open X-Embodiment'],
    [/imagenet/i, 'ImageNet'],
    [/ms-?coco|\bcoco\b/i, 'MS-COCO'],
    [/webqsp/i, 'WebQSP'],
    [/humaneval/i, 'HumanEval'],
    [/mbpp/i, 'MBPP'],
    [/scannet/i, 'ScanNet'],
  ];
  const names: string[] = [];
  for (const [re, label] of knownPublic) {
    if (re.test(abstract) && !names.includes(label)) names.push(label);
  }
  const hasPublic = names.length > 0 || /(benchmark|public dataset|open-source dataset|publicly available)/.test(lower);
  const hasSelf = /(we collect|we construct|our dataset|self-built|real-world data|teleoperation|self-constructed|new dataset|industrial scenario)/.test(lower);

  if (hasPublic && hasSelf) {
    return {
      type: 'hybrid',
      names: [...names, '研究团队构建/采集数据'],
      summary: '结合公开评测基准与作者构建的实验或场景数据完成验证。',
    };
  }
  if (hasSelf) {
    return {
      type: 'self_built',
      names: names.length ? names : ['作者构建实验数据集'],
      summary: '原文表明构建或采集了专门的实验数据集进行验证。',
    };
  }
  if (hasPublic) {
    return {
      type: 'public',
      names: names.length ? names : ['公开评测基准集'],
      summary: '基于领域公开标准基准数据集开展实验评估。',
    };
  }
  return { type: 'unspecified', names: [], summary: '' };
}

function extractReportedMetrics(originalEn: string, zhSource: string): ComparisonMetricRow[] {
  const pctMatches = Array.from(originalEn.matchAll(/(\d{2,3}(?:\.\d+)?)\s*%/g)).map((m) => `${m[1]}%`);
  if (pctMatches.length === 0) return [];
  const uniquePcts = Array.from(new Set(pctMatches)).slice(0, 3);
  const expSentence =
    zhSource
      .split(/(?<=[。！？.!?])\s*/)
      .find((s) => /%|实验|基准|优于|提升|准确/.test(s)) || '详见原文实验报告';
  return [
    {
      method: '本文提出方法',
      isProposed: true,
      values: {
        摘要披露数值: uniquePcts.join(' / '),
        实验结论摘录: expSentence.slice(0, 56),
      },
    },
  ];
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
  const topicZh: Record<ResearchTopic, string> = {
    LLM: '大模型',
    AgentCollaboration: '多智能体与人智协作',
    KnowledgeGraph: '知识图谱',
    ComputerVision: '计算机视觉',
    Multimodal: '多模态',
    EmbodiedAI: '具身智能',
  };

  const source = (zhAbstract || raw.abstract).replace(/\s+/g, ' ').trim();
  const sentences = source.split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim().length > 2);
  const n = sentences.length;

  // Heuristic semantic sentence bucketing
  const gapIdx = sentences.findIndex((s, i) => i >= 1 && /(然而|但是|但|尽管|局限|挑战|不足|缺乏|难以|however|although|limitation|challenge|lack|struggle)/i.test(s));
  const methodIdx = sentences.findIndex((s, i) => i >= 1 && /(本文|我们提出|为此|引入|设计|构建|框架|we propose|we present|we introduce|this paper|framework)/i.test(s));
  const expIdx = sentences.findIndex((s, i) => i >= 2 && /(实验|评估|基准|结果表明|验证|优于|experiments|evaluation|benchmark|demonstrate|outperform)/i.test(s));

  const background = sentences[0] || source;
  const problem = gapIdx > 0 ? sentences[gapIdx] : (sentences[1] || '');
  const currentStatus = gapIdx > 1 ? sentences.slice(1, gapIdx).join('') : '';
  const limitationsOfPriorWork = gapIdx > 0 ? sentences[gapIdx] : '';

  let proposedMethod = '';
  if (methodIdx >= 0) {
    const endM = expIdx > methodIdx ? expIdx : Math.min(n, methodIdx + 2);
    proposedMethod = sentences.slice(methodIdx, endM).join('');
  } else if (n >= 3) {
    proposedMethod = sentences.slice(2, Math.max(3, n - 1)).join('');
  }

  const experimentalValidation = expIdx >= 0 ? sentences.slice(expIdx).join('') : (n >= 5 ? sentences.slice(n - 2).join('') : '');
  const conclusion = n >= 4 ? sentences[n - 1] : (proposedMethod || background);

  const topicLabels = topics.map((t) => topicZh[t]);
  const modules: ArchitectureModule[] = proposedMethod
    ? [
        { id: 'ap-1', stage: 'input', title: '任务场景与多源输入', subtitle: topicLabels[0], detail: background.slice(0, 80) },
        { id: 'ap-2', stage: 'encoder', title: '问题约束与特征建模', subtitle: topicLabels.join(' · '), detail: (problem || background).slice(0, 80) },
        { id: 'ap-3', stage: 'core', title: '本文核心方法机制', subtitle: '方法主干', detail: proposedMethod.slice(0, 100) },
        { id: 'ap-4', stage: 'output', title: '实验验证与性能输出', subtitle: raw.journalShort, detail: (experimentalValidation || conclusion).slice(0, 90) },
      ]
    : [];

  const metricRows = extractReportedMetrics(raw.abstract, source);

  const anatomy: PaperAnatomy = {
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
    comparisonMetrics: {
      hasQuantitativeData: false,
      metricNames: metricRows.length > 0 ? ['摘要披露数值', '实验结论摘录'] : [],
      primaryMetric: metricRows.length > 0 ? '摘要披露数值' : '',
      unit: '',
      rows: metricRows,
    },
    ablationStudy: { hasQuantitativeData: false, metricName: '', unit: '', fullModelScore: '', items: [], summary: '' },
    conclusion,
    futureAndLimitations: { paperLimitations: [], futureDirections: [] },
  };

  return {
    domain,
    topics,
    digestSummary: sentences.slice(0, 2).join(''),
    tags: topicLabels,
    anatomy,
  };
}

/* ---------- Affiliation Enrichment (OpenAlex + Crossref + arXiv XML) ---------- */
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

  // Enrich from OpenAlex if DOI or Title matches
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
    /[\u4e00-\u9fa5]/.test(paper.titleZh) && paper.titleZh !== paper.title ? Promise.resolve(paper.titleZh) : translateToZh(paper.title, 300),
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

  return {
    ...paper,
    openAlexId,
    titleZh: titleZh || paper.titleZh,
    affiliations,
    citedByCount,
    citations,
    topics: Array.from(new Set([...paper.topics, ...parsed.topics])),
    digestSummary: paper.sourceOrigin === 'curated_real' ? paper.digestSummary : (parsed.digestSummary || paper.digestSummary),
    anatomy: paper.sourceOrigin === 'curated_real' ? paper.anatomy : parsed.anatomy,
  };
}

/* ---------- Relevance ---------- */
export function isRelevant(text: string): boolean {
  const t = text.toLowerCase();
  const domain = /(manufactur|industr|robot|embodied|assembly|defect|digital twin|fault diagnos|machining|supply chain|shop-floor|multi-agent|multiagent|human-agent|human-ai)/.test(t);
  const tech = /(large language model|llm|multimodal|vision-language|knowledge graph|computer vision|foundation model|vision-language-action|point cloud|diffusion|deep learning|multi-agent|multiagent|agentic|human-agent)/.test(t);
  const off = /(autonomous driving|self-driving|autonomous vehicle|clinical|medical|humanities|patient)/.test(t);
  return domain && tech && !off;
}

/* ---------- OpenAlex & arXiv ---------- */
function reconstructAbstract(inv?: Record<string, number[]>): string {
  if (!inv) return '';
  const words: string[] = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) words[p] = w;
  return words.filter(Boolean).join(' ');
}

function shortName(name: string): string {
  if (/^arxiv/i.test(name)) return 'arXiv';
  return (
    name
      .split(/\s+/)
      .filter((w) => w.length > 2 && /^[A-Z]/.test(w))
      .map((w) => w[0])
      .join('')
      .slice(0, 6) || name.slice(0, 8)
  );
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
      const r = await fetch(`https://api.openalex.org/works?filter=ids.openalex:${ids.join('|')}`, { headers: UA });
      if (r.ok) ((await r.json()) as { results?: Array<Record<string, unknown>> }).results?.forEach((x) => nodes.push(toNode(x, 'references')));
    }
    const c = await fetch(`https://api.openalex.org/works?filter=cites:${shortId}&sort=cited_by_count:desc&per-page=3`, { headers: UA });
    if (c.ok) ((await c.json()) as { results?: Array<Record<string, unknown>> }).results?.forEach((x) => nodes.push(toNode(x, 'cited_by')));
  } catch {
    /* ignore */
  }
  return nodes.filter((n) => n.title);
}

async function openAlexItemToRaw(item: Record<string, unknown>): Promise<RawExternalPaper> {
  const src = (item.primary_location as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined;
  const journal = String(src?.display_name || 'arXiv');
  const auth = (item.authorships as Array<Record<string, unknown>> | undefined) ?? [];
  const openAlexId = String(item.id || '');
  const doi = String(item.doi || '').replace('https://doi.org/', '');
  const affiliations = Array.from(
    new Set(
      auth
        .slice(0, 5)
        .flatMap((a) => [
          ...(((a.institutions as Array<Record<string, unknown>> | undefined) ?? []).map((i) => String(i.display_name || ''))),
          ...(((a.raw_affiliation_strings as string[] | undefined) ?? []).map((s) => s.trim())),
        ])
    )
  ).filter(Boolean).slice(0, 5);

  return {
    openAlexId,
    title: String(item.title),
    abstract: reconstructAbstract(item.abstract_inverted_index as Record<string, number[]> | undefined),
    authors: auth.slice(0, 5).map((a) => String((a.author as Record<string, unknown> | undefined)?.display_name || '')).filter(Boolean),
    affiliations,
    journal,
    journalShort: shortName(journal),
    publishedDate: String(item.publication_date || new Date().toISOString().slice(0, 10)),
    doi: doi || openAlexId.split('/').pop() || '',
    url: String(item.doi || item.id || 'https://openalex.org'),
    citedByCount: Number(item.cited_by_count || 0),
    citations: await resolveOpenAlexCitations(openAlexId, (item.referenced_works as string[] | undefined) ?? []),
    sourceOrigin: 'openalex_live',
  };
}

function dateWindow(daysBack: number) {
  const now = new Date();
  return { from: new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export async function fetchYesterdayTodayFromOpenAlex(daysBack = 1, customQuery?: string): Promise<RawExternalPaper[]> {
  const topicFilter = customQuery?.trim()
    ? `title_and_abstract.search:${customQuery.trim()}`
    : 'title_and_abstract.search:((manufacturing OR industrial OR robot OR "digital twin" OR "multi-agent" OR "human-agent") AND ("large language model" OR multimodal OR embodied OR "computer vision" OR "knowledge graph" OR "multi-agent"))';
  let results: Array<Record<string, unknown>> = [];
  for (const days of [daysBack, 7]) {
    const w = dateWindow(days);
    const filter = `${topicFilter},from_publication_date:${w.from},to_publication_date:${w.to},has_abstract:true`;
    try {
      const res = await fetch(`https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=12`, {
        headers: UA,
        signal: AbortSignal.timeout(9000),
      });
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
}

export async function fetchYesterdayTodayFromArxiv(daysBack = 1): Promise<RawExternalPaper[]> {
  const w = dateWindow(daysBack);
  const query =
    '(cat:cs.CV OR cat:cs.RO OR cat:cs.CL OR cat:cs.AI OR cat:cs.MA OR cat:cs.HC) AND (manufacturing OR industrial OR "knowledge graph" OR "vision-language" OR embodied OR defect OR "multi-agent" OR "human-agent")';
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
      const xmlAffs = Array.from(entry.matchAll(/<arxiv:affiliation[^>]*>([\s\S]*?)<\/arxiv:affiliation>/g)).map((m) => m[1].replace(/\s+/g, ' ').trim());
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
    const r = await fetch(`https://api.openalex.org/works/${oaId[1].toUpperCase()}`, { headers: UA });
    if (r.ok) return openAlexItemToRaw((await r.json()) as Record<string, unknown>);
  }
  const arxiv = clean.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (arxiv || clean.toLowerCase().includes('arxiv')) {
    const id = arxiv ? arxiv[1] : clean;
    try {
      const xml = await (await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(9000) })).text();
      const e = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
      const title = (e?.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      if (e && title) {
        const summary = (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
        const published = (e.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '').slice(0, 10);
        const authors = Array.from(e.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => m[1].trim());
        let affiliations = Array.from(new Set(Array.from(e.matchAll(/<arxiv:affiliation[^>]*>([\s\S]*?)<\/arxiv:affiliation>/g)).map((m) => m[1].replace(/\s+/g, ' ').trim()))).filter(Boolean);
        let openAlexId: string | undefined;
        let citedByCount = 0;
        let citations: CitationRefNode[] = [];
        try {
          const oa = await fetch(`https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${id}`, { headers: UA });
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
