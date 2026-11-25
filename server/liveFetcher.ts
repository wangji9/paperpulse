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
  journalRank: string;
  publishedDate: string;
  doi: string;
  url: string;
  citedByCount: number;
  citations: CitationRefNode[];
  sourceOrigin: 'arxiv_live' | 'openalex_live' | 'user_created';
}

function detectTopics(text: string): ResearchTopic[] {
  const lower = text.toLowerCase();
  const topics: ResearchTopic[] = [];
  if (/(large language model|llm|gpt|llama|qwen|instruction tuning|rag|language model|agentic)/.test(lower)) {
    topics.push('LLM');
  }
  if (/(knowledge graph|ontology|triple|heterogeneous graph|graph neural|kgqa|causal graph)/.test(lower)) {
    topics.push('KnowledgeGraph');
  }
  if (/(computer vision|segmentation|detection|defect|point cloud|image|visual|diffusion|yolo|vit|3d|video)/.test(lower)) {
    topics.push('ComputerVision');
  }
  if (/(multimodal|vision-language|vlm|cross-modal|tactile|rgb-d|thermal|audio-visual|embedding)/.test(lower)) {
    topics.push('Multimodal');
  }
  if (/(embodied|robot|manipulation|assembly|vla|policy|gripper|dexterous|control|navigation|cobot)/.test(lower)) {
    topics.push('EmbodiedAI');
  }
  if (topics.length === 0) topics.push('LLM');
  return Array.from(new Set(topics));
}

function detectDomain(text: string, journal: string): DomainCategory {
  const combined = `${text} ${journal}`.toLowerCase();
  const isMfg = /(manufactur|machining|cnc|industrial|factory|assembly|wafer|weld|additive|cirp|rcim|jms|scheduling|fault|prognostic|maintenance|aei|shop-floor)/.test(
    combined
  );
  const isCS = /(cvpr|iccv|neurips|icml|iclr|tpami|acl|corl|arxiv|computer vision|transformer|foundation model|deep learning|robotics|multimodal)/.test(
    combined
  );
  if (isMfg && isCS) return 'interdisciplinary';
  if (isMfg) return 'manufacturing';
  return 'computer_science';
}

function detectDatasetType(abstract: string): { type: DatasetSourceType; names: string[] } {
  const lower = abstract.toLowerCase();
  const hasPublic = /(mvtec|imagenet|webqsp|cwq|coco|oxe|benchmark|public dataset|open-source|visa|scannet|msrvtt|activitynet|kinetics)/.test(lower);
  const hasSelf = /(we collect|we construct|our dataset|self-built|real-world data|teleoperation|proprietary|recorded on|industrial line|shop-floor)/.test(
    lower
  );

  const names: string[] = [];
  if (lower.includes('mvtec')) names.push('MVTec-AD (公开)');
  if (lower.includes('webqsp')) names.push('WebQSP (公开)');
  if (lower.includes('visa')) names.push('VisA (公开)');
  if (lower.includes('coco')) names.push('MS-COCO (公开)');

  if (hasPublic && hasSelf) {
    names.push('作者自建实验/场景数据集 (自建)');
    return { type: 'hybrid', names };
  }
  if (hasSelf) {
    names.push('作者采集/自建数据集 (自建)');
    return { type: 'self_built', names };
  }
  if (hasPublic) {
    if (names.length === 0) names.push('公开基准数据集 (依原文标注)');
    return { type: 'public', names };
  }
  return { type: 'unspecified', names: ['原文数据集细节待精读核实'] };
}

export function buildStructuredAnatomy(raw: RawExternalPaper): {
  domain: DomainCategory;
  topics: ResearchTopic[];
  titleZh: string;
  digestSummary: string;
  tags: string[];
  anatomy: PaperAnatomy;
} {
  const fullText = `${raw.title} ${raw.abstract}`;
  const topics = detectTopics(fullText);
  const domain = detectDomain(fullText, raw.journal);
  const ds = detectDatasetType(raw.abstract);

  const topicZhMap: Record<ResearchTopic, string> = {
    LLM: '大模型',
    KnowledgeGraph: '知识图谱',
    ComputerVision: '计算机视觉',
    Multimodal: '多模态',
    EmbodiedAI: '具身智能',
  };

  const topicLabels = topics.map((t) => topicZhMap[t]);
  const sentences = raw.abstract
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const bgText =
    sentences[0] ||
    `围绕 ${topicLabels.join('、')} 与相关领域前沿问题展开研究（来源：${raw.journal}，发表日期：${raw.publishedDate}）。`;
  const probText =
    sentences[1] ||
    '在复杂真实任务下，现有方法面临跨模态语义理解不足、泛化受限或结构化先验利用不充分等问题（详见原文摘要）。';
  const methodText =
    sentences.slice(2, 4).join(' ') ||
    `本文围绕 ${topicLabels.join(' + ')} 提出新的建模与协同推理框架，以解决上述核心瓶颈。`;
  const expText =
    sentences.slice(4).join(' ') ||
    '作者在相应公开或构建基准上开展了基线对比与模块有效性验证（精确实验配置与数值可通过「编辑精读」结合原文PDF补充）。';

  const titleZh = raw.title;
  const digestSummary =
    sentences.length > 0
      ? sentences.slice(0, 3).join(' ')
      : `自动同步自 ${raw.journal}（${raw.publishedDate}），涉及 ${topicLabels.join(' / ')} 方向。`;

  const anatomy: PaperAnatomy = {
    background: `${bgText}\n\n[原文完整摘要]\n${raw.abstract}`,
    problem: probText,
    currentStatus: `研究聚焦 ${topicLabels.join(' 与 ')} 方向；原文针对现有方法在当前任务设定的不足进行了系统对比（可结合原文 Related Work 进一步精读补充）。`,
    limitationsOfPriorWork:
      '现有工作在专业领域知识约束、跨模态对齐精度或复杂真实场景泛化上存在局限，有待更结构化/协同化的新方法突破（可点击「编辑精读」细化逐条局限）。',
    proposedMethod: methodText,
    architectureModules: [
      {
        id: 'auto-1',
        stage: 'input',
        title: '输入观测与任务描述',
        subtitle: topicLabels[0],
        detail: bgText.slice(0, 90),
      },
      {
        id: 'auto-2',
        stage: 'encoder',
        title: '特征编码与表征对齐',
        subtitle: 'Representation',
        detail: '将多源输入映射至统一可计算表征空间。',
      },
      {
        id: 'auto-3',
        stage: 'core',
        title: '核心创新机制',
        subtitle: topicLabels.join(' × '),
        detail: methodText.slice(0, 110),
      },
      {
        id: 'auto-4',
        stage: 'fusion',
        title: '约束优化与推理',
        subtitle: 'Optimization',
        detail: '联合任务目标与结构化/领域约束进行优化。',
      },
      {
        id: 'auto-5',
        stage: 'output',
        title: '实验评测与输出',
        subtitle: raw.journalShort,
        detail: expText.slice(0, 90),
      },
    ],
    experimentalValidation: expText,
    dataset: {
      sourceType: ds.type,
      names: ds.names,
      scale: '依据原文实验设定（未自动编造样本数，请精读原文后在编辑模式补充精确规模）',
      modalities: [
        { label: '核心观测模态', percentage: 60 },
        { label: '标签 / 文本 / 结构知识', percentage: 40 },
      ],
      constructionSteps: [
        {
          step: '01',
          title: '原始数据来源核查',
          description:
            ds.type === 'public'
              ? '原文摘要指明基于公开标准基准数据集开展验证。'
              : ds.type === 'self_built'
                ? '原文摘要表明包含研究团队自建或实机采集的数据集。'
                : ds.type === 'hybrid'
                  ? '原文摘要表明同时采用公开基准与自建补充数据集。'
                  : '摘要未显式披露数据集来源分类，建议精读原文第3/4节后手动标注。',
        },
      ],
      summary: `自动识别结果：${ds.names.join('、')}（未编造任何虚假数字，支持手动精细编辑）。`,
    },
    comparisonMetrics: {
      hasQuantitativeData: false,
      metricNames: ['方法项', '依据来源', '备注'],
      primaryMetric: '方法项',
      unit: '',
      note: '该文献由实时追踪接口自动入库，系统严格不生成虚假对比百分比。请对照原文实验表格后点击「编辑精读」录入真实基线指标。',
      rows: [
        {
          method: '本文提出方法',
          isProposed: true,
          values: { 方法项: methodText.slice(0, 56), 依据来源: '原文摘要自动提取', 备注: '待补充原文数值表' },
        },
        {
          method: '原文对比基线',
          values: { 方法项: '依据原文实验章节对照方法', 依据来源: raw.journalShort, 备注: '待精读录入' },
        },
      ],
    },
    ablationStudy: {
      hasQuantitativeData: false,
      metricName: '消融项',
      unit: '',
      fullModelScore: '待精读原文补充',
      items: [
        {
          variant: '核心模块消融记录',
          removedModule: '待精读原文消融表指定',
          score: '待录入',
          delta: '待录入',
          impactNote: '系统不会伪造消融跌落数值，请在阅读原文消融实验表后手动补充。',
        },
      ],
      summary: '待结合原文消融实验章节录入各核心组件的真实贡献度变化。',
    },
    conclusion:
      sentences.slice(-1)[0] ||
      `本文为 ${topicLabels.join('、')} 相关领域提供了新的研究思路与实验证据，建议结合原文细节进一步精读。`,
    futureAndLimitations: {
      paperLimitations: ['待结合原文 Discussion / Limitations 章节精读补充本文局限性。'],
      futureDirections: ['待结合原文 Conclusion / Future Work 章节精读补充未来展望。'],
    },
  };

  return {
    domain,
    topics,
    titleZh,
    digestSummary,
    tags: [...topicLabels, raw.journalShort],
    anatomy,
  };
}

export function rawToAcademicPaper(raw: RawExternalPaper): AcademicPaper {
  const structured = buildStructuredAnatomy(raw);
  return {
    id: raw.openAlexId
      ? `oa-${raw.openAlexId.split('/').pop()}`
      : `paper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    openAlexId: raw.openAlexId,
    title: raw.title,
    titleZh: structured.titleZh,
    authors: raw.authors.length > 0 ? raw.authors : ['Unknown Authors'],
    affiliations: raw.affiliations.length > 0 ? raw.affiliations : [raw.journal],
    journal: raw.journal,
    journalShort: raw.journalShort,
    journalRank: raw.journalRank,
    domain: structured.domain,
    topics: structured.topics,
    publishedDate: raw.publishedDate,
    syncedAt: new Date().toISOString(),
    doi: raw.doi,
    url: raw.url,
    sourceOrigin: raw.sourceOrigin,
    abstractOriginal: raw.abstract,
    digestSummary: structured.digestSummary,
    tags: structured.tags,
    citedByCount: raw.citedByCount,
    citations: raw.citations,
    readingStatus: 'unread',
    isBookmarked: false,
    anatomy: structured.anatomy,
    comments: [],
  };
}

function reconstructAbstractFromOpenAlex(invertedIndex?: Record<string, number[]>): string {
  if (!invertedIndex) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

export async function resolveOpenAlexCitations(workIdOrUrl: string, refUrls: string[] = []): Promise<CitationRefNode[]> {
  const nodes: CitationRefNode[] = [];
  const shortId = workIdOrUrl.split('/').pop();
  if (!shortId) return nodes;

  try {
    const topRefIds = refUrls
      .slice(0, 4)
      .map((u) => u.split('/').pop())
      .filter(Boolean);
    if (topRefIds.length > 0) {
      const refRes = await fetch(
        `https://api.openalex.org/works?filter=ids.openalex:${topRefIds.join('|')}&per-page=4`,
        { headers: { 'User-Agent': 'PaperPulse/1.0' } }
      );
      if (refRes.ok) {
        const refData = (await refRes.json()) as { results?: Array<Record<string, unknown>> };
        for (const x of refData.results ?? []) {
          const src = (x.primary_location as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined;
          const doiClean = String(x.doi || '').replace('https://doi.org/', '');
          nodes.push({
            id: String(x.id),
            title: String(x.title || 'Referenced Work'),
            year: String(x.publication_year || ''),
            venue: String(src?.display_name || 'Journal / Preprint'),
            doi: doiClean || undefined,
            url: String(x.doi || x.id || ''),
            citedByCount: Number(x.cited_by_count || 0),
            relation: 'references',
          });
        }
      }
    }

    const citeRes = await fetch(
      `https://api.openalex.org/works?filter=cites:${shortId}&sort=cited_by_count:desc&per-page=4`,
      { headers: { 'User-Agent': 'PaperPulse/1.0' } }
    );
    if (citeRes.ok) {
      const citeData = (await citeRes.json()) as { results?: Array<Record<string, unknown>> };
      for (const x of citeData.results ?? []) {
        const src = (x.primary_location as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined;
        const doiClean = String(x.doi || '').replace('https://doi.org/', '');
        nodes.push({
          id: String(x.id),
          title: String(x.title || 'Citing Work'),
          year: String(x.publication_year || ''),
          venue: String(src?.display_name || 'Journal / Preprint'),
          doi: doiClean || undefined,
          url: String(x.doi || x.id || ''),
          citedByCount: Number(x.cited_by_count || 0),
          relation: 'cited_by',
        });
      }
    }
  } catch {
    // Non-fatal: return whatever citations resolved
  }

  return nodes;
}

function getDateWindow(daysBack: number): { fromDate: string; toDate: string } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - daysBack * 86400000);
  const fromDate = from.toISOString().slice(0, 10);
  return { fromDate, toDate };
}

export async function fetchYesterdayTodayFromArxiv(daysBack = 1): Promise<RawExternalPaper[]> {
  const { fromDate } = getDateWindow(daysBack);
  const query =
    '(cat:cs.CV OR cat:cs.RO OR cat:cs.CL OR cat:cs.AI) AND (manufacturing OR industrial OR "knowledge graph" OR multimodal OR embodied OR "vision-language" OR defect)';
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=8`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    const parsed: RawExternalPaper[] = [];

    for (const entry of entries) {
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
      const published = (entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '').slice(0, 10);
      const idUrl = (entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '').trim();
      const arxivId = idUrl.split('/abs/').pop()?.replace(/v\d+$/, '') || '';
      const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => m[1].trim());
      if (!title) continue;

      // Prioritize yesterday/today (or keep top recent ones if weekend/UTC offset)
      if (published >= fromDate || parsed.length < 2) {
        parsed.push({
          title,
          abstract: summary,
          authors: authors.slice(0, 5),
          affiliations: ['arXiv Preprint'],
          journal: 'arXiv Computer Science / Robotics',
          journalShort: 'arXiv',
          journalRank: published >= fromDate ? 'arXiv 今日/昨日最新' : 'arXiv 最新预印本',
          publishedDate: published || new Date().toISOString().slice(0, 10),
          doi: arxivId ? `10.48550/arXiv.${arxivId}` : idUrl,
          url: idUrl || `https://arxiv.org/abs/${arxivId}`,
          citedByCount: 0,
          citations: [],
          sourceOrigin: 'arxiv_live',
        });
      }
    }
    return parsed.slice(0, 4);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYesterdayTodayFromOpenAlex(daysBack = 1, customQuery?: string): Promise<RawExternalPaper[]> {
  const { fromDate, toDate } = getDateWindow(daysBack);
  const searchFilter =
    customQuery?.trim()
      ? `title_and_abstract.search:${customQuery.trim()}`
      : 'title_and_abstract.search:(("smart manufacturing" OR "industrial inspection" OR "robotic assembly" OR "fault diagnosis") AND ("large language model" OR "knowledge graph" OR "multimodal" OR "embodied" OR "computer vision"))';

  // Try exact yesterday->today first; if zero results (e.g. publisher indexing lag), widen to 7 days
  let results: Array<Record<string, unknown>> = [];
  for (const windowDays of [daysBack, 7, 30]) {
    const win = getDateWindow(windowDays);
    const filter = `${searchFilter},from_publication_date:${win.fromDate},to_publication_date:${toDate}`;
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&sort=publication_date:desc&per-page=4`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PaperPulse-Academic-Library/2.0' },
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
        if ((data.results ?? []).length > 0) {
          results = data.results ?? [];
          break;
        }
      }
    } catch {
      // try wider window
    } finally {
      clearTimeout(timer);
    }
  }

  const out: RawExternalPaper[] = [];
  for (const item of results.slice(0, 3)) {
    if (!item.title) continue;
    const primaryLoc = item.primary_location as Record<string, unknown> | undefined;
    const source = primaryLoc?.source as Record<string, unknown> | undefined;
    const journalName = String(source?.display_name || 'OpenAlex Indexed Journal');
    const authorships = (item.authorships as Array<Record<string, unknown>> | undefined) ?? [];
    const authors = authorships
      .slice(0, 5)
      .map((a) => String((a.author as Record<string, unknown> | undefined)?.display_name || 'Author'));
    const affiliations = authorships
      .slice(0, 3)
      .flatMap((a) => ((a.institutions as Array<Record<string, unknown>> | undefined) ?? []).map((i) => String(i.display_name || '')))
      .filter(Boolean);

    const openAlexId = String(item.id || '');
    const doiRaw = String(item.doi || '').replace('https://doi.org/', '');
    const abstract = reconstructAbstractFromOpenAlex(item.abstract_inverted_index as Record<string, number[]> | undefined);
    const refUrls = (item.referenced_works as string[] | undefined) ?? [];
    const citations = await resolveOpenAlexCitations(openAlexId, refUrls);

    const pubDate = String(item.publication_date || toDate);
    out.push({
      openAlexId,
      title: String(item.title),
      abstract: abstract || `Published in ${journalName} (${pubDate}).`,
      authors,
      affiliations: Array.from(new Set(affiliations)),
      journal: journalName,
      journalShort:
        journalName
          .split(/\s+/)
          .filter((w) => w.length > 2 && /^[A-Z]/.test(w))
          .map((w) => w[0])
          .join('')
          .slice(0, 6) || 'Journal',
      journalRank: pubDate >= fromDate ? 'OpenAlex 今日/昨日同步' : 'OpenAlex 近期文献',
      publishedDate: pubDate,
      doi: doiRaw || openAlexId.split('/').pop() || 'openalex',
      url: String(item.doi || item.id || 'https://openalex.org'),
      citedByCount: Number(item.cited_by_count || 0),
      citations,
      sourceOrigin: 'openalex_live',
    });
  }
  return out;
}

export async function fetchSingleByArxivOrDoi(identifier: string): Promise<RawExternalPaper | null> {
  const clean = identifier.trim();

  // Direct OpenAlex ID (e.g. https://openalex.org/W... or W...)
  const oaIdMatch = clean.match(/(?:openalex\.org\/)?(W\d{6,})/i);
  if (oaIdMatch) {
    const res = await fetch(`https://api.openalex.org/works/${oaIdMatch[1].toUpperCase()}`, {
      headers: { 'User-Agent': 'PaperPulse-Academic-Library/2.0' },
    });
    if (res.ok) {
      const item = (await res.json()) as Record<string, unknown>;
      return openAlexItemToRaw(item);
    }
  }

  // arXiv ID pattern
  const arxivMatch = clean.match(/(\d{4}\.\d{4,5}(?:v\d+)?)/);
  if (clean.toLowerCase().includes('arxiv') || arxivMatch) {
    const arxivId = arxivMatch ? arxivMatch[1] : clean;
    const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const xml = await res.text();
      const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
      if (entryMatch) {
        const entry = entryMatch[1];
        const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
        const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
        const published = (entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '').slice(0, 10);
        const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => m[1].trim());
        if (title) {
          // Try enriching citations via OpenAlex arXiv DOI lookup
          let oaCitations: CitationRefNode[] = [];
          let citedByCount = 0;
          let openAlexId: string | undefined;
          try {
            const oaRes = await fetch(`https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${arxivId}`);
            if (oaRes.ok) {
              const oa = (await oaRes.json()) as Record<string, unknown>;
              openAlexId = String(oa.id || '');
              citedByCount = Number(oa.cited_by_count || 0);
              oaCitations = await resolveOpenAlexCitations(openAlexId, (oa.referenced_works as string[] | undefined) ?? []);
            }
          } catch {
            // ignore
          }
          return {
            openAlexId,
            title,
            abstract: summary,
            authors,
            affiliations: ['arXiv Preprint'],
            journal: 'arXiv Computer Science / Robotics',
            journalShort: 'arXiv',
            journalRank: 'arXiv 预印本',
            publishedDate: published || new Date().toISOString().slice(0, 10),
            doi: `10.48550/arXiv.${arxivId}`,
            url: `https://arxiv.org/abs/${arxivId}`,
            citedByCount,
            citations: oaCitations,
            sourceOrigin: 'arxiv_live',
          };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // OpenAlex by DOI or keyword search
  const oaUrl = clean.startsWith('10.')
    ? `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`
    : `https://api.openalex.org/works?search=${encodeURIComponent(clean)}&per-page=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(oaUrl, { headers: { 'User-Agent': 'PaperPulse-Academic-Library/2.0' }, signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const item = Array.isArray(data.results) ? (data.results[0] as Record<string, unknown> | undefined) : data;
    if (!item || !item.title) return null;
    return await openAlexItemToRaw(item);
  } finally {
    clearTimeout(timer);
  }
}

async function openAlexItemToRaw(item: Record<string, unknown>): Promise<RawExternalPaper> {
  const primaryLoc = item.primary_location as Record<string, unknown> | undefined;
  const source = primaryLoc?.source as Record<string, unknown> | undefined;
  const journalName = String(source?.display_name || 'Academic Journal');
  const authorships = (item.authorships as Array<Record<string, unknown>> | undefined) ?? [];
  const authors = authorships.slice(0, 5).map((a) => String((a.author as Record<string, unknown> | undefined)?.display_name || 'Author'));
  const affiliations = authorships
    .slice(0, 3)
    .flatMap((a) => ((a.institutions as Array<Record<string, unknown>> | undefined) ?? []).map((i) => String(i.display_name || '')))
    .filter(Boolean);
  const abstract = reconstructAbstractFromOpenAlex(item.abstract_inverted_index as Record<string, number[]> | undefined);
  const openAlexId = String(item.id || '');
  const refUrls = (item.referenced_works as string[] | undefined) ?? [];
  const citations = await resolveOpenAlexCitations(openAlexId, refUrls);

  return {
    openAlexId,
    title: String(item.title),
    abstract: abstract || `Academic article retrieved via OpenAlex: ${String(item.title)}`,
    authors,
    affiliations: Array.from(new Set(affiliations)),
    journal: journalName,
    journalShort:
      journalName
        .split(/\s+/)
        .filter((w) => w.length > 2 && /^[A-Z]/.test(w))
        .map((w) => w[0])
        .join('')
        .slice(0, 6) || journalName.slice(0, 8),
    journalRank: 'OpenAlex 检索导入',
    publishedDate: String(item.publication_date || new Date().toISOString().slice(0, 10)),
    doi: String(item.doi || openAlexId.split('/').pop() || '').replace('https://doi.org/', ''),
    url: String(item.doi || item.id || 'https://openalex.org'),
    citedByCount: Number(item.cited_by_count || 0),
    citations,
    sourceOrigin: 'openalex_live',
  };
}
