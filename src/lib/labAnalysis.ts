import type { AcademicPaper, LabEntry, ResearchTopic } from '../types/paper';
import {
  buildDynamicAuthorMap,
  dedupePaperAuthors,
  extractCanonicalPaperKeywords,
  isCorrespondingAuthor,
  isInvalidAuthorName,
  canonicalizeAuthor,
  type CanonicalAuthorInfo,
  type CanonicalKeywordInfo,
} from './canonicalize';

export interface CanonicalAuthorStat {
  info: CanonicalAuthorInfo;
  count: number;
  firstAuthorCount: number;
  correspondingCount: number;
  years: number[];
  papers: AcademicPaper[];
  topTopics: ResearchTopic[];
  rawVariants: string[];
}

export interface CanonicalKeywordStat {
  info: CanonicalKeywordInfo;
  count: number;
  avgYear: number;
  firstYear: number;
  lastYear: number;
  papers: AcademicPaper[];
}

export interface CoauthorEdge {
  sourceId: string;
  targetId: string;
  weight: number;
  papers: AcademicPaper[];
}

export interface KeywordCoEdge {
  sourceId: string;
  targetId: string;
  weight: number;
  papers: AcademicPaper[];
}

export interface ResearchAxisSpec {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  patterns: RegExp[];
}

export interface TechDomainCell {
  techId: string;
  domainId: string;
  papers: AcademicPaper[];
  isGapOpportunity: boolean;
  opportunityScore: number;
  rationale?: string;
}

export interface ResearchClusterSummary {
  id: string;
  title: string;
  period: string;
  stage: 'foundation' | 'bridge' | 'frontier';
  summary: string;
  papers: AcademicPaper[];
  keyMethods: string[];
  color: string;
}

export interface PotentialDirectionInsight {
  id: string;
  title: string;
  subtitle: string;
  techAxis: ResearchAxisSpec;
  domainAxis: ResearchAxisSpec;
  noveltyScore: number;      // 1-100 computed from gap + momentum
  feasibilityScore: number;  // 1-100 computed from existing tech & domain depth
  techSupportPapers: AcademicPaper[];
  domainSupportPapers: AcademicPaper[];
  scientificQuestion: string;
  migrationPath: string;
  validationHint: string;
}

/* ---------- Core Research Method Axes & Industrial Scenario Axes ---------- */
export const LAB_TECH_AXES: ResearchAxisSpec[] = [
  {
    id: 'tech_kg_mmkg',
    label: '知识图谱与多模态KG',
    shortLabel: 'KG / MMKG',
    description: '本体建模、动态知识融合、多源异构多模态工艺知识图谱',
    patterns: [/knowledge\s+graph|多模态知识图谱|工艺知识图谱|知识图谱|cognitive\s+pathway\s+graph|\bkg\b|\bmmkg\b/i],
  },
  {
    id: 'tech_hypergraph',
    label: '知识超图与因果推理',
    shortLabel: '知识超图/因果',
    description: '多元耦合关系超图表示、超图嵌入与多模态因果超图推理',
    patterns: [/hypergraph|超图|causal|因果/i],
  },
  {
    id: 'tech_llm_rag',
    label: '大模型与多模态RAG',
    shortLabel: 'LLM / RAG',
    description: '大语言模型推理、思维链(CoT)、结构化语义树递归多模态检索',
    patterns: [/large\s+language\s+model|\bllm\b|\bmllm\b|大语言模型|semantic\s+tree|retrieval|rag/i],
  },
  {
    id: 'tech_agentic',
    label: 'Agentic AI与多智能体',
    shortLabel: 'Agentic AI',
    description: '多智能体自组织协作、共享分层记忆、情境感知智能体推荐与推理',
    patterns: [/agentic\s+ai|multi-?agent|ai\s+agents?|智能体/i],
  },
  {
    id: 'tech_hrc_hai',
    label: '人机/人智协同决策',
    shortLabel: '人机/人智协作',
    description: '人-机-AI共生决策、可供性推理、动态重调度与人在回路(HITL)',
    patterns: [/human-?(?:robot|machine|ai)|collaborative|人机协作|人智协作|可供性|symbiosis/i],
  },
  {
    id: 'tech_tacit',
    label: '隐性知识与元知识显性化',
    shortLabel: '隐性/元知识',
    description: '视觉隐性知识(眼动/视觉CoT)、设计师元知识提取与人本隐性知识转化',
    patterns: [/tacit\s+knowledge|meta-?knowledge|cognitive\s+pathway|explicitation|隐性知识|元知识|eye-?tracking/i],
  },
  {
    id: 'tech_dt_anomaly',
    label: '认知数字孪生与异常感知',
    shortLabel: '数字孪生/感知',
    description: '类脑LIDA认知数字孪生、多模态过程异常预测与少样本状态感知',
    patterns: [/digital\s+twin|lida|anomaly\s+prediction|layer-wise|数字孪生|异常预测|few-shot/i],
  },
];

export const LAB_DOMAIN_AXES: ResearchAxisSpec[] = [
  {
    id: 'dom_rehab',
    label: '个性化康复辅具设计',
    shortLabel: '康复辅具设计',
    description: '需求演化解析、多维穿戴体验感知、产品族配置与概念设计',
    patterns: [/rehabilitation|assistive\s+device|wearing\s+experience|康复辅具|产品配置|conceptual\s+design/i],
  },
  {
    id: 'dom_battery',
    label: '退役动力电池智能拆解',
    shortLabel: '退役电池拆解',
    description: '不确定工况拆解深度推理、异常操作知识抽取与人机协作拆解规划',
    patterns: [/battery|disassembly|动力电池|拆卸|拆解/i],
  },
  {
    id: 'dom_wind',
    label: '风电与高端装备装配',
    shortLabel: '风电装备装配',
    description: '风机多模态装配工艺KG建模、工艺问答系统与现场知识推荐',
    patterns: [/wind\s+turbine|风机|风力发电机|装配工艺/i],
  },
  {
    id: 'dom_welding_am',
    label: '焊接质检与3D打印监测',
    shortLabel: '焊接/3D打印',
    description: '工业焊接视觉检测、桥梁耐候钢缺陷归因与增材制造层间异常预测',
    patterns: [/welding|3d\s+printing|additive|焊接|耐候钢|3d打印/i],
  },
  {
    id: 'dom_fault',
    label: '复杂装备故障诊断运维',
    shortLabel: '装备故障运维',
    description: '行车/机床/复合故障多元关系建模、因果诊断、人机协作排障与无人维护',
    patterns: [/fault|troubleshooting|maintenance|machine\s+tool|故障|运维|行车/i],
  },
  {
    id: 'dom_hcsm_doc',
    label: '人本智造与工程文档/定制',
    shortLabel: '人本智造/文档',
    description: '人本智能制造通用架构、认知大规模个性化、工程文档语义树与定制服装',
    patterns: [/human-?centric|smart\s+manufacturing|mass\s+personalization|engineering\s+document|apparel|人本|定制服装|工程文档/i],
  },
];

const POTENTIAL_PAIR_TEMPLATES: Record<
  string,
  { title: string; question: string; migrationPath: string; validationHint: string }
> = {
  'tech_tacit__dom_battery': {
    title: '退役电池拆解中的熟练工隐性知识显性化与迁移',
    question: '如何在强不确定/腐蚀变形工况下，将资深拆解工的触觉-视觉隐性判断转化为可复用的安全拆解策略？',
    migrationPath: '融合课题组「视觉隐性知识认知路径图 (JMS 2026)」与「异常工况电池拆解KG + 人-AI智能体深度推理 (AEI 2027)」，以第一视角视频+眼动构建拆解技能隐性知识图谱。',
    validationHint: '建议基于现有动力电池人机协作拆解视频库，对比纯规则/纯MLLM基线在罕见畸变电芯上的安全决策准确率与新手培训提效。',
  },
  'tech_hypergraph__dom_rehab': {
    title: '面向多维穿戴体验与耦合约束的康复辅具因果超图配置',
    question: '康复辅具定制中生理信号(sEMG)、主观舒适度、结构参数与康复阶段存在高阶多元耦合，二元KG难以无损表达？',
    migrationPath: '将课题组「多模态因果超图推理 (AEI 2025)」与「超图嵌入 (CIMS 2024)」迁移至「多维穿戴体验产品族配置 (AEI 2026)」，用超边建模“用户状态-结构特征-性能冲突”多元因果。',
    validationHint: '可在现有膝关节康复支具纵向数据集上，验证因果超图相比常规二元KG在多约束冲突消解一致性与配置可行率上的增益。',
  },
  'tech_agentic__dom_welding_am': {
    title: '多智能体闭环协同的焊接/增材制造缺陷溯源与工艺自愈',
    question: '如何在焊接质检与3D打印层间监测中打通“实时多模态异常感知 → 机理归因 → 参数自适应调控”闭环？',
    migrationPath: '串联课题组「视觉隐性知识路径图 (JMS 2026)」「耐候钢缺陷LLM归因 (JIII 2025)」「3D打印层间异常预测 (JED 2025)」与「Agentic AI 多角色协作框架 (ESWA 2027)」。',
    validationHint: '利用已有 Weld-VTK 与 3D 打印多模态传感器数据集，评测感知智能体-归因智能体-工艺调节智能体协同后的误报率下降与工艺修正有效性。',
  },
  'tech_dt_anomaly__dom_battery': {
    title: '认知数字孪生驱动的动力电池人机协作拆解安全推演',
    question: '高危退役电池拆解缺少事前物理-认知双重推演机制，如何在机器人执行前动态预判热失控与碰撞风险？',
    migrationPath: '将「LIDA类脑认知数字孪生架构 (RCIM 2023)」与「MLLM-KG动态拆解重调度 (JMS 2025) / B-MADD深度推理 (AEI 2027)」结合，构建虚实同步的认知拆解孪生体。',
    validationHint: '在人机协作拆解仿真与实物台架上验证孪生体对突发工具缺失、异常形变工况的重规划延迟与安全边界保持率。',
  },
  'tech_llm_rag__dom_welding_am': {
    title: '面向焊接与增材工艺规程的结构化语义树多模态RAG',
    question: '工业焊接与3D打印标准包含大量金相图、工艺参数表与缺陷图谱，传统切片检索难以跨模态精准对齐？',
    migrationPath: '将「结构化语义树递归多模态检索 RMR-SST (KBS 2026)」迁移到焊接质检标准与增材工艺手册，支撑现场缺陷快速溯源问答。',
    validationHint: '在桥梁钢/工业焊接工艺文档与缺陷图谱上测试 Hit@5 与专家因果诊断准确率。',
  },
  'tech_tacit__dom_wind': {
    title: '风电现场装配老师傅隐性经验捕获与Agentic情境推送',
    question: '风电大部件现场装配高度依赖工程师临场手感与排故直觉，如何在不停机干扰下捕获并精准推送给现场人员？',
    migrationPath: '整合「风电现场情境感知Agentic AI推荐 (JED 2025)」「风机多模态装配KG (JED 2025)」与「设计师元知识提取 (ESWA 2027)」，实现装配现场经验的增量沉淀与主动推荐。',
    validationHint: '基于风机装配多模态数据集与现场工单记录，评估情境推荐命中率与隐性规则覆盖完整度。',
  },
  'tech_dt_anomaly__dom_hcsm_doc': {
    title: '人本智造(Industry 5.0)下的“人-机-孪生体”共演化框架',
    question: '如何让数字孪生不仅映射物理设备状态，更能实时表征操作员认知负荷、隐性技能与人机信任度？',
    migrationPath: '以「人本智造隐性知识转化综述 (COMPIND 2027)」为顶层纲领，融合「认知大规模个性化 Self-X 网络 (Engineering 2023)」与「LIDA认知数字孪生 (RCIM 2023)」。',
    validationHint: '可面向个性化装配或运维车间，构建包含人类认知状态节点的双循环人本数字孪生原型并量化人机协同效率。',
  },
  'tech_hypergraph__dom_battery': {
    title: '多耦合失效模式下的电池拆解因果超图安全推理',
    question: '电池鼓包、漏液、锈蚀与电芯衰减常并发耦合，单一故障树难以刻画多因并发下的最优拆解路径？',
    migrationPath: '将「复合故障多模态因果超图推理 (AEI 2025)」引入电池异常工况拆解，与「异常操作KG (JMS 2026)」形成多因-多步安全推理网络。',
    validationHint: '对比二元KG在多异常并发电池样本上的拆解深度偏差与高危误判率。',
  },
};

function matchesAxis(paper: AcademicPaper, axis: ResearchAxisSpec): boolean {
  const blob = `${paper.title || ''} ${paper.titleZh || ''} ${paper.abstractOriginal || ''} ${paper.abstractZh || ''} ${(paper.keywords || []).join(' ')} ${(paper.keywordsOriginal || []).join(' ')}`;
  return axis.patterns.some((re) => re.test(blob));
}

export function analyzeLab(entries: LabEntry[]) {
  const count = (values: string[]) =>
    [...values.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>())].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

  const papers = entries.map((e) => e.paper);
  const paperYear = (e: LabEntry) => e.publicationYear || Number((e.paper.publishedDate || '').slice(0, 4)) || 0;
  const paperYearById = new Map(entries.map((e) => [e.paper.id, paperYear(e)]));

  const topics = count(papers.flatMap((p) => [...new Set(p.topics || [])])) as [ResearchTopic, number][];
  const years = [...new Set(entries.map(paperYear).filter((y) => y >= 1900))].sort((a, b) => a - b);

  // 1. Bilingual Author Deduplication & Statistics
  const allRawAuthors = papers.flatMap((p) => p.authors || []);
  const dynamicAuthorMap = buildDynamicAuthorMap(allRawAuthors);

  const authorStatMap = new Map<string, CanonicalAuthorStat>();
  const paperCanonicalAuthors = new Map<string, CanonicalAuthorInfo[]>();

  for (const e of entries) {
    const p = e.paper;
    const yr = paperYear(e);
    const rawList = (p.authors || []).filter((a) => !isInvalidAuthorName(a));
    // Also detect corresponding author marks from citation text if present
    const citationText = e.citation || '';
    const deduped = dedupePaperAuthors(rawList, dynamicAuthorMap);
    paperCanonicalAuthors.set(p.id, deduped);

    deduped.forEach((info, idx) => {
      const existing = authorStatMap.get(info.id) || {
        info,
        count: 0,
        firstAuthorCount: 0,
        correspondingCount: 0,
        years: [],
        papers: [],
        topTopics: [],
        rawVariants: [],
      };
      existing.count += 1;
      if (idx === 0) existing.firstAuthorCount += 1;
      const matchingRaw = rawList.find((r) => canonicalizeAuthor(r, dynamicAuthorMap).id === info.id) || '';
      const isCorr =
        isCorrespondingAuthor(matchingRaw) ||
        (citationText.includes('*') &&
          info.aliases.some((al) => {
            const esc = al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`${esc}\\s*\\.?\\s*\\*`, 'i').test(citationText);
          }));
      if (isCorr) existing.correspondingCount += 1;
      if (yr >= 1900 && !existing.years.includes(yr)) existing.years.push(yr);
      existing.papers.push(p);
      if (matchingRaw && !existing.rawVariants.includes(matchingRaw)) existing.rawVariants.push(matchingRaw);
      authorStatMap.set(info.id, existing);
    });
  }

  const canonicalAuthors: CanonicalAuthorStat[] = [...authorStatMap.values()]
    .map((stat) => {
      const tCounts = count(stat.papers.flatMap((p) => p.topics || [])) as [ResearchTopic, number][];
      return {
        ...stat,
        years: stat.years.sort((a, b) => a - b),
        topTopics: tCounts.slice(0, 3).map(([t]) => t),
      };
    })
    .sort((a, b) => b.count - a.count || b.correspondingCount - a.correspondingCount || a.info.shortName.localeCompare(b.info.shortName));

  // Backward-compatible [name, count] tuple using deduplicated canonical shortName
  const authors: [string, number][] = canonicalAuthors.map((a) => [a.info.shortName, a.count]);

  // Co-author network edges (deduplicated!)
  const coauthorEdgeMap = new Map<string, CoauthorEdge>();
  for (const p of papers) {
    const aList = paperCanonicalAuthors.get(p.id) || [];
    for (let i = 0; i < aList.length; i++) {
      for (let j = i + 1; j < aList.length; j++) {
        const [a, b] = [aList[i].id, aList[j].id].sort();
        const k = `${a}__${b}`;
        const edge = coauthorEdgeMap.get(k) || { sourceId: a, targetId: b, weight: 0, papers: [] };
        edge.weight += 1;
        edge.papers.push(p);
        coauthorEdgeMap.set(k, edge);
      }
    }
  }
  const coauthors = [...coauthorEdgeMap.values()].sort((a, b) => b.weight - a.weight);

  // 2. Bilingual Keyword / Concept Deduplication & Co-occurrence
  const kwStatMap = new Map<string, { info: CanonicalKeywordInfo; papers: AcademicPaper[]; years: number[] }>();
  const paperCanonicalKeywords = new Map<string, CanonicalKeywordInfo[]>();

  for (const e of entries) {
    const p = e.paper;
    const yr = paperYear(e);
    const kws = extractCanonicalPaperKeywords(p);
    paperCanonicalKeywords.set(p.id, kws);
    for (const info of kws) {
      const cur = kwStatMap.get(info.id) || { info, papers: [], years: [] };
      cur.papers.push(p);
      if (yr >= 1900) cur.years.push(yr);
      kwStatMap.set(info.id, cur);
    }
  }

  const canonicalKeywords: CanonicalKeywordStat[] = [...kwStatMap.values()]
    .map((item) => {
      const avgYear =
        item.years.length > 0
          ? Number((item.years.reduce((s, y) => s + y, 0) / item.years.length).toFixed(2))
          : years[years.length - 1] || 2025;
      return {
        info: item.info,
        count: item.papers.length,
        avgYear,
        firstYear: item.years.length ? Math.min(...item.years) : avgYear,
        lastYear: item.years.length ? Math.max(...item.years) : avgYear,
        papers: item.papers,
      };
    })
    .sort((a, b) => b.count - a.count || b.avgYear - a.avgYear || a.info.label.localeCompare(b.info.label));

  // Backward-compatible [keyword, count] using deduplicated labels
  const keywords: [string, number][] = canonicalKeywords.map((k) => [k.info.label, k.count]);

  const kwEdgeMap = new Map<string, KeywordCoEdge>();
  for (const p of papers) {
    const kList = paperCanonicalKeywords.get(p.id) || [];
    for (let i = 0; i < kList.length; i++) {
      for (let j = i + 1; j < kList.length; j++) {
        const [a, b] = [kList[i].id, kList[j].id].sort();
        const k = `${a}__${b}`;
        const edge = kwEdgeMap.get(k) || { sourceId: a, targetId: b, weight: 0, papers: [] };
        edge.weight += 1;
        edge.papers.push(p);
        kwEdgeMap.set(k, edge);
      }
    }
  }
  const keywordCooccurrence = [...kwEdgeMap.values()].sort((a, b) => b.weight - a.weight);

  // 3. Normalized Journals
  const normalizeJournal = (j: string) => {
    const low = j.trim().toLowerCase();
    if (low === 'journal of engineering design') return 'Journal of Engineering Design';
    if (low === 'advanced engineering informatics') return 'Advanced Engineering Informatics';
    if (low === 'journal of manufacturing systems') return 'Journal of Manufacturing Systems';
    if (low === 'computers in industry') return 'Computers in Industry';
    if (low === 'expert systems with applications') return 'Expert Systems with Applications';
    if (low === 'knowledge-based systems') return 'Knowledge-Based Systems';
    return j.trim();
  };
  const journals = count(papers.map((p) => normalizeJournal(p.journal || '未知期刊')));

  // 4. Backward-compatible Topic Pairs
  const pairs: Array<{ a: ResearchTopic; b: ResearchTopic; papers: AcademicPaper[] }> = [];
  topics.forEach(([a], i) =>
    topics.slice(i + 1).forEach(([b]) =>
      pairs.push({ a, b, papers: papers.filter((p) => (p.topics || []).includes(a) && (p.topics || []).includes(b)) })
    )
  );

  // 5. Technology × Industrial Domain Matrix & Potential Frontier Direction Mining
  const techPapersMap = new Map<string, AcademicPaper[]>(
    LAB_TECH_AXES.map((ax) => [ax.id, papers.filter((p) => matchesAxis(p, ax))])
  );
  const domainPapersMap = new Map<string, AcademicPaper[]>(
    LAB_DOMAIN_AXES.map((ax) => [ax.id, papers.filter((p) => matchesAxis(p, ax))])
  );

  const techDomainMatrix: TechDomainCell[] = [];
  const potentialDirections: PotentialDirectionInsight[] = [];

  for (const tech of LAB_TECH_AXES) {
    const tPapers = techPapersMap.get(tech.id) || [];
    const tRecent = tPapers.filter((p) => (paperYearById.get(p.id) || 0) >= 2025).length;
    for (const dom of LAB_DOMAIN_AXES) {
      const dPapers = domainPapersMap.get(dom.id) || [];
      const dRecent = dPapers.filter((p) => (paperYearById.get(p.id) || 0) >= 2025).length;
      const intersection = tPapers.filter((p) => dPapers.some((dp) => dp.id === p.id));

      const pairKey = `${tech.id}__${dom.id}`;
      const tpl = POTENTIAL_PAIR_TEMPLATES[pairKey];
      const hasBothBases = tPapers.length >= 2 && dPapers.length >= 2;
      const isGapOpportunity = intersection.length === 0 && (hasBothBases || Boolean(tpl));
      const feasibilityScore = Math.min(96, Math.round(38 + (tPapers.length + dPapers.length) * 4.2));
      const noveltyScore = isGapOpportunity
        ? Math.min(96, Math.round(62 + (tRecent + dRecent) * 3.8 + (tpl ? 8 : 0)))
        : Math.max(20, 70 - intersection.length * 14);

      techDomainMatrix.push({
        techId: tech.id,
        domainId: dom.id,
        papers: intersection,
        isGapOpportunity,
        opportunityScore: isGapOpportunity ? Math.round((feasibilityScore + noveltyScore) / 2) : 0,
        rationale: tpl?.title,
      });

      if (isGapOpportunity && tPapers.length >= 1 && dPapers.length >= 1) {
        potentialDirections.push({
          id: pairKey,
          title: tpl?.title || `${tech.shortLabel} × ${dom.shortLabel} 交叉融合方向`,
          subtitle: `${tech.label} 迁移至 ${dom.label}`,
          techAxis: tech,
          domainAxis: dom,
          noveltyScore,
          feasibilityScore,
          techSupportPapers: tPapers.slice(0, 3),
          domainSupportPapers: dPapers.slice(0, 3),
          scientificQuestion:
            tpl?.question ||
            `课题组在「${tech.label}」（${tPapers.length} 篇）与「${dom.label}」（${dPapers.length} 篇）均已形成独立积累，但尚未开展系统交叉，如何突破该场景下的知识表征与决策瓶颈？`,
          migrationPath:
            tpl?.migrationPath ||
            `以现有「${tech.shortLabel}」方法架构为基础，接入「${dom.shortLabel}」多源工艺/监测数据，构建可解释的混合推理闭环。`,
          validationHint:
            tpl?.validationHint ||
            `建议依托课题组已有 ${dom.shortLabel} 工业案例与数据集，设计针对单一方法基线的消融与现场对比实验。`,
        });
      }
    }
  }

  potentialDirections.sort(
    (a, b) =>
      Number(Boolean(POTENTIAL_PAIR_TEMPLATES[b.id])) - Number(Boolean(POTENTIAL_PAIR_TEMPLATES[a.id])) ||
      b.noveltyScore + b.feasibilityScore - (a.noveltyScore + a.feasibilityScore)
  );

  // 6. Research Evolution Clusters (2023 -> 2027 narrative)
  const rawClusters: ResearchClusterSummary[] = [
    {
      id: 'cluster_kg_dt',
      title: '阶段一：工业知识图谱、超图与认知数字孪生基石',
      period: '2023 — 2024',
      stage: 'foundation',
      summary:
        '聚焦工业复杂多元关系表示与认知制造底座，完成知识图谱动态融合、知识超图多元故障建模、LIDA类脑认知数字孪生以及风机多模态装配KG构建。',
      papers: papers.filter((p) => (paperYearById.get(p.id) || 0) <= 2024),
      keyMethods: ['知识图谱 (KG)', '知识超图', '多模态KG', 'LIDA数字孪生', '可供性推理'],
      color: '#0072BD',
    },
    {
      id: 'cluster_kg_llm',
      title: '阶段二：KG + LLM/MLLM 双轮驱动的跨场景协同推理',
      period: '2025',
      stage: 'bridge',
      summary:
        '打通结构化工业知识图谱/因果超图与大语言模型协同推理范式，规模化落地于康复辅具概念设计、风电装配问答、焊接缺陷归因、人机协作排障与动态电池拆解重调度。',
      papers: papers.filter((p) => (paperYearById.get(p.id) || 0) === 2025),
      keyMethods: ['KG-LLM协同', 'MLLM-KG', '多模态因果超图', 'Context-Aware RAG', '人机协作'],
      color: '#7E2F8E',
    },
    {
      id: 'cluster_agentic_tacit',
      title: '阶段三：Agentic AI 多智能体自组织与人本隐性知识显性化',
      period: '2026 — 2027',
      stage: 'frontier',
      summary:
        '跃迁至人本智能制造 (Industry 5.0) 前沿：提出多智能体自组织产品族配置、递归多模态语义树检索、视觉隐性知识认知路径图、设计师元知识提取与不确定工况人-AI智能体拆解推理。',
      papers: papers.filter((p) => (paperYearById.get(p.id) || 0) >= 2026),
      keyMethods: ['Agentic AI', '视觉隐性知识', '设计师元知识', '递归语义树RAG', '人本智造'],
      color: '#D95319',
    },
  ];
  const researchClusters = rawClusters.filter((c) => c.papers.length > 0);

  return {
    papers,
    topics,
    years,
    keywords,
    authors,
    journals,
    pairs,
    yearCounts: years.map((year) => ({
      year,
      count: entries.filter((e) => paperYear(e) === year).length,
      cumulative: entries.filter((e) => paperYear(e) <= year).length,
    })),
    // Enriched bilingual deduplicated & frontier analytics
    canonicalAuthors,
    canonicalKeywords,
    coauthors,
    keywordCooccurrence,
    paperCanonicalAuthors,
    paperCanonicalKeywords,
    techAxes: LAB_TECH_AXES,
    domainAxes: LAB_DOMAIN_AXES,
    techDomainMatrix,
    potentialDirections: potentialDirections.slice(0, 8),
    researchClusters,
    paperYearById,
  };
}

export type LabAnalysisResult = ReturnType<typeof analyzeLab>;
