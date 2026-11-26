/**
 * Chinese & English Author / Keyword / Concept Deduplication & Canonicalization Engine
 * Merges bilingual variants (e.g., "Li, X.*", "Xinyu Li", "Xin-Yu Li", "李心雨")
 * and domain concept synonyms (e.g., "Knowledge graph", "KG", "知识图谱") into unified entities.
 */

export interface CanonicalAuthorInfo {
  id: string;
  displayName: string;   // e.g. "李心雨 (Xinyu Li)"
  shortName: string;     // e.g. "李心雨"
  englishName?: string;  // e.g. "Xinyu Li"
  chineseName?: string;  // e.g. "李心雨"
  aliases: string[];
}

export interface CanonicalKeywordInfo {
  id: string;
  label: string;         // e.g. "大语言模型 (LLM)"
  shortLabel: string;    // e.g. "大语言模型"
  category: 'method' | 'domain' | 'paradigm' | 'general';
}

const KNOWN_AUTHORS: Array<{
  id: string;
  zh: string;
  en: string;
  aliases: string[];
}> = [
  { id: 'li_xinyu', zh: '李心雨', en: 'Xinyu Li', aliases: ['李心雨', 'xinyu li', 'xin-yu li', 'li xinyu', 'li x', 'x li'] },
  { id: 'bao_jinsong', zh: '鲍劲松', en: 'Jinsong Bao', aliases: ['鲍劲松', 'jinsong bao', 'jin-song bao', 'bao jinsong', 'bao j', 'j bao'] },
  { id: 'wang_ji', zh: '王骥', en: 'Ji Wang', aliases: ['王骥', 'ji wang', 'wang ji', 'wang j', 'j wang'] },
  { id: 'zhuang_weibin', zh: '庄伟彬', en: 'Weibin Zhuang', aliases: ['庄伟彬', 'weibin zhuang', 'wei-bin zhuang', 'zhuang weibin', 'zhuang w', 'w zhuang'] },
  { id: 'yao_jie', zh: '姚杰', en: 'Jie Yao', aliases: ['姚杰', 'jie yao', 'yao jie', 'yao j', 'j yao'] },
  { id: 'jiang_cong', zh: '姜聪', en: 'Cong Jiang', aliases: ['姜聪', 'cong jiang', 'jiang cong', 'jiang c', 'c jiang'] },
  { id: 'xiao_wenjie', zh: '肖文杰', en: 'Wenjie Xiao', aliases: ['肖文杰', 'wenjie xiao', 'wen-jie xiao', 'xiao wenjie', 'xiao w', 'w xiao'] },
  { id: 'chen_congmao', zh: '陈聪茂', en: 'Congmao Chen', aliases: ['陈聪茂', 'congmao chen', 'cong-mao chen', 'chen congmao', 'chen c', 'c chen'] },
  { id: 'wu_xing', zh: '吴兴', en: 'Xing Wu', aliases: ['吴兴', 'xing wu', 'wu xing', 'wu x', 'x wu'] },
  { id: 'lv_xingchen', zh: '吕星辰', en: 'Xingchen Lv', aliases: ['吕星辰', 'xingchen lv', 'xing-chen lv', 'xingchen lu', 'lv xingchen', 'lv x', 'x lv'] },
  { id: 'pan_xinyu', zh: '潘鑫瑜', en: 'Xinyu Pan', aliases: ['潘鑫瑜', 'xinyu pan', 'xin-yu pan', 'pan xinyu', 'pan x', 'x pan'] },
  { id: 'wen_sijie', zh: '文思捷', en: 'Sijie Wen', aliases: ['文思捷', 'sijie wen', 'si-jie wen', 'wen sijie', 'wen s', 's wen'] },
  { id: 'yu_weigang', zh: '喻惟刚', en: 'Weigang Yu', aliases: ['喻惟刚', 'weigang yu', 'wei-gang yu', 'yu weigang', 'yu w', 'w yu'] },
  { id: 'hu_zhiqiang', zh: '胡志强', en: 'Zhiqiang Hu', aliases: ['胡志强', 'zhiqiang hu', 'zhi-qiang hu', 'hu zhiqiang', 'hu z', 'z hu'] },
  { id: 'zhang_fei', zh: '张飞', en: 'Fei Zhang', aliases: ['张飞', 'fei zhang', 'zhang fei', 'zhang f', 'f zhang'] },
  { id: 'li_qi', zh: '李琦', en: 'Qi Li', aliases: ['李琦', 'qi li', 'li qi', 'li q', 'q li'] },
  { id: 'zhou_bin', zh: '周彬', en: 'Bin Zhou', aliases: ['周彬', 'bin zhou', 'zhou bin', 'zhou b', 'b zhou'] },
  { id: 'li_feng', zh: '李峰', en: 'Feng Li', aliases: ['李峰', 'feng li', 'li feng', 'li f', 'f li'] },
  { id: 'lv_jie', zh: '吕捷', en: 'Jie Lv', aliases: ['吕捷', 'jie lv', 'jie lu', 'lv jie', 'lv j', 'j lv'] },
  { id: 'shen_xin', zh: '沈鑫', en: 'Xin Shen', aliases: ['沈鑫', 'xin shen', 'shen xin', 'shen x', 'x shen'] },
  { id: 'zheng_pai', zh: '郑湃', en: 'Pai Zheng', aliases: ['郑湃', 'pai zheng', 'zheng pai', 'zheng p', 'p zheng'] },
  { id: 'gao_liang', zh: '高亮', en: 'Liang Gao', aliases: ['高亮', 'liang gao', 'gao liang', 'gao l', 'l gao'] },
  { id: 'xu_xun', zh: '徐洵', en: 'Xun Xu', aliases: ['徐洵', 'xun xu', 'xu xun', 'xu x', 'x xu'] },
  { id: 'deng_wei', zh: '邓伟', en: 'Wei Deng', aliases: ['邓伟', 'wei deng', 'deng wei', 'deng w', 'w deng'] },
  { id: 'liu_tao', zh: '刘涛', en: 'Tao Liu', aliases: ['刘涛', 'tao liu', 'liu tao', 'liu t', 't liu'] },
  { id: 'liu_mingfei', zh: '刘鸣飞', en: 'Mingfei Liu', aliases: ['刘鸣飞', 'mingfei liu', 'liu mingfei'] },
  { id: 'li_jianjun', zh: '李建军', en: 'Jianjun Li', aliases: ['李建军', 'jianjun li', 'li jianjun'] },
  { id: 'sun_y', zh: '孙宇', en: 'Yu Sun', aliases: ['sun y', 'y sun', 'yu sun', 'sun yu'] },
  { id: 'zheng_y', zh: '郑宇', en: 'Yu Zheng', aliases: ['zheng y', 'y zheng', 'yu zheng', 'zheng yu'] },
  { id: 'jiang_y', zh: '姜宇', en: 'Yu Jiang', aliases: ['jiang y', 'y jiang', 'yu jiang', 'jiang yu'] },
];

const AUTHOR_LOOKUP = new Map<string, (typeof KNOWN_AUTHORS)[number]>();
for (const entry of KNOWN_AUTHORS) {
  for (const al of entry.aliases) {
    AUTHOR_LOOKUP.set(normalizeAuthorKey(al), entry);
  }
}

export function normalizeAuthorKey(raw: string): string {
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\*\u2020\u2021†‡#]/g, '')
    .replace(/\(.*?\)|（.*?）/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (/[\u3400-\u9fff]/.test(cleaned)) {
    return cleaned.replace(/\s+/g, '');
  }
  // Convert "Last, First" -> "first last"
  let s = cleaned;
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) s = `${parts[1]} ${parts[0]}`;
  }
  return s
    .toLowerCase()
    .replace(/[.,\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInvalidAuthorName(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^(et\s*al\.?|未知|unknown|\.\.\.|…|等)$/i.test(s)) return true;
  if (/未知|\.\.\.|…/.test(s)) return true;
  return false;
}

export function isCorrespondingAuthor(raw: string): boolean {
  return /\*|通讯/.test(raw);
}

/**
 * Canonicalize a single author name (merges Chinese/English & "Last, F." vs "First Last").
 * Optional `knownFullNames` map allows dynamically merging unknown "J. Doe" into "John Doe".
 */
export function canonicalizeAuthor(
  raw: string,
  dynamicInitialMap?: Map<string, CanonicalAuthorInfo>
): CanonicalAuthorInfo {
  const key = normalizeAuthorKey(raw);
  const hit = AUTHOR_LOOKUP.get(key);
  if (hit) {
    return {
      id: hit.id,
      displayName: `${hit.zh} (${hit.en})`,
      shortName: hit.zh,
      chineseName: hit.zh,
      englishName: hit.en,
      aliases: hit.aliases,
    };
  }
  // Also try reversed order for English "li xinyu" vs "xinyu li"
  const parts = key.split(' ').filter(Boolean);
  if (parts.length === 2) {
    const revHit = AUTHOR_LOOKUP.get(`${parts[1]} ${parts[0]}`);
    if (revHit) {
      return {
        id: revHit.id,
        displayName: `${revHit.zh} (${revHit.en})`,
        shortName: revHit.zh,
        chineseName: revHit.zh,
        englishName: revHit.en,
        aliases: revHit.aliases,
      };
    }
    if (dynamicInitialMap) {
      const initKey = `${parts[0][0]} ${parts[1]}`;
      const dyn = dynamicInitialMap.get(initKey);
      if (dyn) return dyn;
    }
  }
  const cleanDisplay = raw
    .normalize('NFKC')
    .replace(/[\*\u2020\u2021†‡]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
  const nice = /[\u3400-\u9fff]/.test(cleanDisplay)
    ? cleanDisplay.replace(/\s+/g, '')
    : parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || cleanDisplay;
  return {
    id: `author_${key.replace(/\s+/g, '_')}`,
    displayName: nice,
    shortName: nice,
    chineseName: /[\u3400-\u9fff]/.test(nice) ? nice : undefined,
    englishName: /[\u3400-\u9fff]/.test(nice) ? undefined : nice,
    aliases: [cleanDisplay],
  };
}

/**
 * Build dynamic initial-to-fullname map across a corpus of raw author names
 * so even non-dictionary authors like "Smith, J." and "John Smith" merge if unambiguous.
 */
export function buildDynamicAuthorMap(allRawAuthors: string[]): Map<string, CanonicalAuthorInfo> {
  const fullByInitial = new Map<string, CanonicalAuthorInfo[]>();
  const seenIds = new Set<string>();
  for (const raw of allRawAuthors) {
    if (isInvalidAuthorName(raw)) continue;
    const key = normalizeAuthorKey(raw);
    if (AUTHOR_LOOKUP.has(key)) continue;
    const parts = key.split(' ').filter(Boolean);
    if (parts.length === 2 && parts[0].length > 1 && parts[1].length > 1 && !/[\u3400-\u9fff]/.test(key)) {
      const info = canonicalizeAuthor(raw);
      if (seenIds.has(info.id)) continue;
      seenIds.add(info.id);
      const initKey = `${parts[0][0]} ${parts[1]}`;
      const list = fullByInitial.get(initKey) || [];
      list.push(info);
      fullByInitial.set(initKey, list);
    }
  }
  const uniqueMap = new Map<string, CanonicalAuthorInfo>();
  for (const [k, list] of fullByInitial.entries()) {
    if (list.length === 1) uniqueMap.set(k, list[0]);
  }
  return uniqueMap;
}

/**
 * Deduplicate & canonicalize an author list for one paper
 */
export function dedupePaperAuthors(
  authors: string[],
  dynamicMap?: Map<string, CanonicalAuthorInfo>
): CanonicalAuthorInfo[] {
  const seen = new Map<string, CanonicalAuthorInfo>();
  for (const raw of authors) {
    if (isInvalidAuthorName(raw)) continue;
    const info = canonicalizeAuthor(raw, dynamicMap);
    if (!seen.has(info.id)) seen.set(info.id, info);
  }
  return [...seen.values()];
}

/* ============================================================================
 * Bilingual Keyword & Concept Deduplication / Canonicalization
 * ============================================================================ */

interface ConceptRule {
  id: string;
  label: string;
  shortLabel: string;
  category: CanonicalKeywordInfo['category'];
  patterns: RegExp[];
}

const CONCEPT_RULES: ConceptRule[] = [
  {
    id: 'kw_llm',
    label: '大语言模型 (LLM)',
    shortLabel: '大语言模型',
    category: 'method',
    patterns: [
      /^llms?$/i,
      /large\s+language\s+models?/i,
      /^大语言模型$|^大模型$|大语言模型.*llm|llm.*大语言模型/i,
    ],
  },
  {
    id: 'kw_mllm',
    label: '多模态大模型 (MLLM)',
    shortLabel: '多模态大模型',
    category: 'method',
    patterns: [
      /^mllms?$/i,
      /multimodal\s+large\s+language\s+models?/i,
      /multi-modal\s+large\s+language\s+models?/i,
      /多模态大(?:语言)?模型/,
    ],
  },
  {
    id: 'kw_mmkg',
    label: '多模态知识图谱 (MMKG)',
    shortLabel: '多模态知识图谱',
    category: 'method',
    patterns: [
      /^mmkgs?$/i,
      /multi-?modal\s+knowledge\s+graphs?/i,
      /多模态(?:装配工艺)?知识图谱/,
    ],
  },
  {
    id: 'kw_hypergraph',
    label: '知识超图与因果推理',
    shortLabel: '知识超图',
    category: 'method',
    patterns: [
      /knowledge\s+hypergraphs?/i,
      /causal\s+hypergraphs?/i,
      /hypergraph\s+embedding/i,
      /^hypergraphs?$/i,
      /知识超图|超图嵌入|因果超图|多元关系/,
    ],
  },
  {
    id: 'kw_kg',
    label: '知识图谱 (KG)',
    shortLabel: '知识图谱',
    category: 'method',
    patterns: [
      /^kgs?$/i,
      /^(?:industrial\s+)?knowledge\s+graphs?$/i,
      /knowledge\s+graph\s+(?:modeling|fusion|embedding|reasoning)/i,
      /^(?:工业|制造|工艺)?知识图谱$/,
      /认知路径图|cognitive\s+pathway\s+graph/i,
    ],
  },
  {
    id: 'kw_agentic',
    label: '智能体AI与多智能体 (Agentic AI)',
    shortLabel: 'Agentic AI / 多智能体',
    category: 'method',
    patterns: [
      /agentic\s+ai/i,
      /multi-?agent(?:\s+systems?|\s+self-?organis(?:ed|ed)|\s+collaboration)?/i,
      /ai\s+agents?/i,
      /多智能体|智能体\s*ai|自主智能体|智能体协作/i,
    ],
  },
  {
    id: 'kw_rag',
    label: '多模态检索增强 (RAG)',
    shortLabel: '多模态RAG',
    category: 'method',
    patterns: [
      /^rag$/i,
      /retrieval-?augmented/i,
      /recursive\s+multi-?modal\s+retrieval/i,
      /structured\s+semantic\s+trees?/i,
      /检索增强|语义树|多模态检索/,
    ],
  },
  {
    id: 'kw_tacit',
    label: '隐性知识与元知识显性化',
    shortLabel: '隐性知识转化',
    category: 'paradigm',
    patterns: [
      /(?:visual\s+)?tacit\s+knowledge/i,
      /meta-?knowledge/i,
      /knowledge\s+(?:explicitation|externalization|transformation)/i,
      /隐性知识|元知识|知识显性化|知识转化/,
    ],
  },
  {
    id: 'kw_hrc',
    label: '人机/人智协作 (HRC/HAI)',
    shortLabel: '人机/人智协作',
    category: 'paradigm',
    patterns: [
      /human-?(?:robot|machine|ai)\s+(?:collaboration|teaming|symbiosis|interaction)/i,
      /人机协作|人智协作|人机协同|人-ai/i,
    ],
  },
  {
    id: 'kw_hcsm',
    label: '人本智能制造 (Industry 5.0)',
    shortLabel: '人本智造 / 工业5.0',
    category: 'paradigm',
    patterns: [
      /human-?centric\s+smart\s+manufacturing/i,
      /industry\s*5\.0/i,
      /cognitive\s+manufacturing/i,
      /cognitive\s+mass\s+personalization/i,
      /人本(?:智能)?制造|工业5\.0|认知制造/,
    ],
  },
  {
    id: 'kw_dt',
    label: '认知数字孪生 (Cognitive DT)',
    shortLabel: '认知数字孪生',
    category: 'method',
    patterns: [
      /(?:cognitive\s+)?digital\s+twins?/i,
      /\blida\b/i,
      /数字孪生/,
    ],
  },
  {
    id: 'kw_rehab',
    label: '个性化康复辅具设计',
    shortLabel: '康复辅具设计',
    category: 'domain',
    patterns: [
      /rehabilitation\s+assistive\s+devices?/i,
      /wearing\s+experience/i,
      /康复辅具|下肢康复|穿戴体验/,
    ],
  },
  {
    id: 'kw_battery',
    label: '退役动力电池智能拆解',
    shortLabel: '退役电池拆解',
    category: 'domain',
    patterns: [
      /(?:end-?of-?life\s+)?(?:automotive\s+)?battery\s+disassembly/i,
      /disassembly\s+(?:depth|sequence|planning|scenarios?)/i,
      /动力电池拆卸|退役电池|拆卸序列|拆解深度|可供性推理/,
    ],
  },
  {
    id: 'kw_wind',
    label: '风电装备装配与问答',
    shortLabel: '风机装配运维',
    category: 'domain',
    patterns: [
      /wind\s+turbines?(?:\s+assembly)?/i,
      /风机(?:多模态)?装配|风力发电机|装配工艺问答/,
    ],
  },
  {
    id: 'kw_welding',
    label: '工业焊接质检与缺陷分析',
    shortLabel: '焊接检测与缺陷',
    category: 'domain',
    patterns: [
      /welding\s+(?:inspection|defects?)/i,
      /eye-?tracking/i,
      /焊接检测|焊接缺陷|桥梁耐候钢|眼动/,
    ],
  },
  {
    id: 'kw_fault',
    label: '复杂装备故障诊断与运维',
    shortLabel: '工业故障诊断',
    category: 'domain',
    patterns: [
      /(?:equipment\s+|composite\s+)?fault\s+diagnosis/i,
      /troubleshooting/i,
      /unmanned\s+maintenance/i,
      /故障诊断|故障排查|行车故障|无人运维/,
    ],
  },
  {
    id: 'kw_design_config',
    label: '个性化产品配置与概念设计',
    shortLabel: '产品配置与设计',
    category: 'domain',
    patterns: [
      /product(?:\s+family)?\s+configuration/i,
      /conceptual\s+design/i,
      /personalized\s+product\s+design/i,
      /evolving\s+requirements?|user\s+requirements?/i,
      /产品配置|概念设计|个性化产品|需求演化|需求解析/,
    ],
  },
  {
    id: 'kw_3dprint',
    label: '增材制造/3D打印异常预测',
    shortLabel: '3D打印异常监测',
    category: 'domain',
    patterns: [
      /3d\s+printing/i,
      /anomaly\s+prediction/i,
      /additive\s+manufacturing/i,
      /3d打印|增材制造|异常预测/,
    ],
  },
  {
    id: 'kw_multimodal',
    label: '多模态融合与感知',
    shortLabel: '多模态融合',
    category: 'method',
    patterns: [
      /^multi-?modal(?:\s+data|\s+fusion|\s+alignment)?$/i,
      /多源异构|多模态数据|多模态融合|跨模态/,
    ],
  },
  {
    id: 'kw_km',
    label: '工程知识建模与推荐',
    shortLabel: '工程知识管理',
    category: 'general',
    patterns: [
      /knowledge\s+(?:management|modeling|fusion|recommendation|representation|extraction)/i,
      /engineering\s+(?:knowledge|documents?|design)/i,
      /知识建模|知识表示|知识融合|知识推荐|知识管理|工程知识|工程文档/,
    ],
  },
];

const NOISY_KEYWORDS = new Set([
  'case study',
  'approach',
  'method',
  'system',
  'study',
  'analysis',
  'framework',
  'model',
  'paper',
  'research',
  '基于',
  '方法',
  '研究',
  '系统',
  '模型',
]);

export function canonicalizeKeyword(raw: string): CanonicalKeywordInfo | null {
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\u00a0\t\r\n]+/g, ' ')
    .replace(/^[#•·\-\s]+|[\s.,;；。]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  const low = cleaned.toLowerCase();
  if (NOISY_KEYWORDS.has(low)) return null;

  for (const rule of CONCEPT_RULES) {
    if (rule.patterns.some((re) => re.test(cleaned))) {
      return {
        id: rule.id,
        label: rule.label,
        shortLabel: rule.shortLabel,
        category: rule.category,
      };
    }
  }

  // Normalize generic English/Chinese keyword to prevent case/plural duplicates
  const isZh = /[\u3400-\u9fff]/.test(cleaned);
  const normKey = isZh
    ? cleaned.replace(/\s+/g, '')
    : low.replace(/s\b/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!normKey || normKey.length < 2) return null;

  const niceLabel = isZh
    ? cleaned
    : cleaned
        .split(/\s+/)
        .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(' ');

  return {
    id: `kw_custom_${normKey}`,
    label: niceLabel,
    shortLabel: niceLabel.length > 14 ? `${niceLabel.slice(0, 13)}…` : niceLabel,
    category: 'general',
  };
}

/**
 * Extract canonical deduplicated keywords from a paper's keywords + title + abstract
 */
export function extractCanonicalPaperKeywords(paper: {
  title?: string;
  titleZh?: string;
  abstractOriginal?: string;
  abstractZh?: string;
  keywords?: string[];
  keywordsOriginal?: string[];
}): CanonicalKeywordInfo[] {
  const seen = new Map<string, CanonicalKeywordInfo>();
  const rawList = [...(paper.keywordsOriginal || []), ...(paper.keywords || [])];

  for (const raw of rawList) {
    const info = canonicalizeKeyword(raw);
    if (info && !seen.has(info.id)) seen.set(info.id, info);
  }

  // Also scan title & abstract against core bilingual CONCEPT_RULES so every paper gets rich, consistent canonical tags
  const text = `${paper.title || ''} ${paper.titleZh || ''} ${paper.abstractOriginal || ''} ${paper.abstractZh || ''}`;
  for (const rule of CONCEPT_RULES) {
    if (seen.has(rule.id)) continue;
    // Only match title+abstract for multi-word / specific patterns (avoid matching short standalone regexes)
    const matched = rule.patterns.some((re) => {
      const src = re.source;
      if (src.startsWith('^') && src.endsWith('$')) return false;
      return re.test(text);
    });
    if (matched) {
      seen.set(rule.id, {
        id: rule.id,
        label: rule.label,
        shortLabel: rule.shortLabel,
        category: rule.category,
      });
    }
  }

  return [...seen.values()];
}
