import type {
  AcademicPaper,
  CitationRefNode,
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

const UA = { 'User-Agent': 'PaperPulse-Library/3.0' };

/* ---------- Translation (MyMemory public API, with graceful fallback) ---------- */
function cutAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const parts = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const p of parts) {
    if ((out + ' ' + p).length > maxChars) break;
    out += (out ? ' ' : '') + p;
  }
  return out || text.slice(0, maxChars);
}

export async function translateToZh(text: string, maxChars = 480): Promise<string | null> {
  const chunk = cutAtSentence(text.replace(/\s+/g, ' ').trim(), maxChars);
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

/* ---------- Classification helpers ---------- */
function detectTopics(text: string): ResearchTopic[] {
  const lower = text.toLowerCase();
  const topics: ResearchTopic[] = [];
  if (/(large language model|llm|gpt|llama|qwen|instruction tuning|rag|language model|agentic)/.test(lower)) topics.push('LLM');
  if (/(knowledge graph|ontology|triple|heterogeneous graph|graph neural|kgqa|causal graph)/.test(lower)) topics.push('KnowledgeGraph');
  if (/(computer vision|segmentation|detection|defect|point cloud|image|visual|diffusion|yolo|vit|3d|video)/.test(lower)) topics.push('ComputerVision');
  if (/(multimodal|vision-language|vlm|cross-modal|tactile|rgb-d|thermal|audio-visual|embedding)/.test(lower)) topics.push('Multimodal');
  if (/(embodied|robot|manipulation|assembly|vla|policy|gripper|dexterous|navigation|cobot)/.test(lower)) topics.push('EmbodiedAI');
  if (topics.length === 0) topics.push('LLM');
  return Array.from(new Set(topics));
}

function detectDomain(text: string, journal: string): DomainCategory {
  const combined = `${text} ${journal}`.toLowerCase();
  const isMfg = /(manufactur|machining|cnc|industrial|factory|assembly|wafer|weld|additive|scheduling|fault|prognostic|maintenance|shop-floor)/.test(combined);
  const isCS = /(cvpr|iccv|neurips|icml|iclr|tpami|acl|corl|arxiv|computer vision|transformer|foundation model|deep learning|robotics|multimodal)/.test(combined);
  if (isMfg && isCS) return 'interdisciplinary';
  if (isMfg) return 'manufacturing';
  return 'computer_science';
}

function detectDataset(abstract: string): { type: DatasetSourceType; names: string[] } {
  const lower = abstract.toLowerCase();
  const hasPublic = /(mvtec|imagenet|webqsp|cwq|coco|open x-embodiment|benchmark|public dataset|open-source|visa|kinetics)/.test(lower);
  const hasSelf = /(we collect|we construct|our dataset|self-built|real-world data|teleoperation|proprietary|self-constructed)/.test(lower);
  const names: string[] = [];
  if (lower.includes('mvtec')) names.push('MVTec 系列');
  if (lower.includes('coco')) names.push('MS-COCO');
  if (hasPublic && hasSelf) return { type: 'hybrid', names: [...names, '自建数据'] };
  if (hasSelf) return { type: 'self_built', names: ['自建数据集'] };
  if (hasPublic) return { type: 'public', names: names.length ? names : ['公开基准数据集'] };
  return { type: 'unspecified', names: [] };
}

function emptyAnatomy(): PaperAnatomy {
  return {
    background: '',
    problem: '',
    currentStatus: '',
    limitationsOfPriorWork: '',
    proposedMethod: '',
    architectureModules: [],
    experimentalValidation: '',
    dataset: { sourceType: 'unspecified', names: [], scale: '', modalities: [], constructionSteps: [], summary: '' },
    comparisonMetrics: { hasQuantitativeData: false, metricNames: [], primaryMetric: '', unit: '', rows: [] },
    ablationStudy: { hasQuantitativeData: false, metricName: '', unit: '', fullModelScore: '', items: [], summary: '' },
    conclusion: '',
    futureAndLimitations: { paperLimitations: [], futureDirections: [] },
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
  const topicZh: Record<ResearchTopic, string> = {
    LLM: '大模型',
    KnowledgeGraph: '知识图谱',
    ComputerVision: '计算机视觉',
    Multimodal: '多模态',
    EmbodiedAI: '具身智能',
  };

  const source = zhAbstract || raw.abstract;
  const sentences = source
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？.!?])\s*/)
    .filter((s) => s.trim().length > 1);
  const n = sentences.length;

  const anatomy = emptyAnatomy();
  if (n >= 6) {
    anatomy.background = sentences[0];
    anatomy.problem = sentences[1];
    anatomy.proposedMethod = sentences.slice(2, 4).join('');
    anatomy.experimentalValidation = sentences.slice(4, n - 1).join('');
    anatomy.conclusion = sentences[n - 1];
  } else if (n >= 3) {
    anatomy.background = sentences[0];
    anatomy.problem = sentences[1];
    anatomy.proposedMethod = sentences.slice(2).join('');
  } else {
    anatomy.background = source;
  }
  anatomy.dataset = { ...anatomy.dataset, sourceType: ds.type, names: ds.names };

  return {
    domain,
    topics,
    digestSummary: sentences.slice(0, 2).join(''),
    tags: [...topics.map((t) => topicZh[t])],
    anatomy,
  };
}

export async function rawToAcademicPaper(raw: RawExternalPaper): Promise<AcademicPaper> {
  const [titleZh, abstractZh] = await Promise.all([translateToZh(raw.title, 300), translateToZh(raw.abstract, 480)]);
  const s = buildStructuredAnatomy(raw, abstractZh);
  return {
    id: raw.openAlexId ? `oa-${raw.openAlexId.split('/').pop()}` : `paper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    openAlexId: raw.openAlexId,
    title: raw.title,
    titleZh: titleZh || raw.title,
    authors: raw.authors.length ? raw.authors : ['未知作者'],
    affiliations: raw.affiliations,
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

/* ---------- Relevance ---------- */
export function isRelevant(text: string): boolean {
  const t = text.toLowerCase();
  const domain = /(manufactur|industr|robot|embodied|assembly|defect|digital twin|fault diagnos|machining|supply chain|shop-floor)/.test(t);
  const tech = /(large language model|llm|multimodal|vision-language|knowledge graph|computer vision|foundation model|vision-language-action|point cloud|diffusion|deep learning)/.test(t);
  const off = /(autonomous driving|self-driving|autonomous vehicle|clinical|medical|humanities|patient)/.test(t);
  return domain && tech && !off;
}

/* ---------- OpenAlex ---------- */
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
  return {
    openAlexId,
    title: String(item.title),
    abstract: reconstructAbstract(item.abstract_inverted_index as Record<string, number[]> | undefined),
    authors: auth.slice(0, 5).map((a) => String((a.author as Record<string, unknown> | undefined)?.display_name || '')).filter(Boolean),
    affiliations: Array.from(
      new Set(auth.slice(0, 3).flatMap((a) => ((a.institutions as Array<Record<string, unknown>> | undefined) ?? []).map((i) => String(i.display_name || ''))))
    ).filter(Boolean),
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
    : 'title_and_abstract.search:((manufacturing OR industrial OR robot OR "digital twin") AND ("large language model" OR multimodal OR embodied OR "computer vision" OR "knowledge graph"))';
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
    '(cat:cs.CV OR cat:cs.RO OR cat:cs.CL OR cat:cs.AI) AND (manufacturing OR industrial OR "knowledge graph" OR "vision-language" OR embodied OR defect)';
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
      if (!title || !isRelevant(`${title} ${summary}`) || (published < w.from && parsed.length >= 2)) continue;
      parsed.push({
        title,
        abstract: summary,
        authors: authors.slice(0, 5),
        affiliations: [],
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
        let openAlexId: string | undefined;
        let citedByCount = 0;
        let citations: CitationRefNode[] = [];
        try {
          const oa = await fetch(`https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${id}`, { headers: UA });
          if (oa.ok) {
            const j = (await oa.json()) as Record<string, unknown>;
            openAlexId = String(j.id || '');
            citedByCount = Number(j.cited_by_count || 0);
            citations = await resolveOpenAlexCitations(openAlexId, (j.referenced_works as string[] | undefined) ?? []);
          }
        } catch {
          /* ignore */
        }
        return {
          openAlexId,
          title,
          abstract: summary,
          authors,
          affiliations: [],
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
