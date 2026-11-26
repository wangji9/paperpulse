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
  cohort?: string;       // e.g. "2023级 博士" / "2025届 学硕" / "课题组导师"
  honors?: string;       // e.g. "获国家奖学金"
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
  cohort?: string;
  honors?: string;
  aliases: string[];
}> = [
  // 课题组导师
  { id: 'li_xinyu', zh: '李心雨', en: 'Xinyu Li', cohort: '课题组导师', aliases: ['李心雨', 'xinyu li', 'xin-yu li', 'li xinyu', 'li x', 'x li'] },
  { id: 'bao_jinsong', zh: '鲍劲松', en: 'Jinsong Bao', cohort: '课题组导师', aliases: ['鲍劲松', 'jinsong bao', 'jin-song bao', 'bao jinsong', 'bao j', 'j bao'] },

  // 在读研究生（2023级 — 2026级）
  { id: 'zhuang_weibin', zh: '庄炜斌', en: 'Weibin Zhuang', cohort: '2023级 博士', aliases: ['庄炜斌', '庄伟彬', 'weibin zhuang', 'wei-bin zhuang', 'zhuang weibin', 'zhuang w', 'w zhuang'] },
  { id: 'wang_ji', zh: '王骥', en: 'Ji Wang', cohort: '2024级 博士', aliases: ['王骥', 'ji wang', 'wang ji', 'wang j', 'j wang'] },
  { id: 'xiao_wenjie', zh: '肖文杰', en: 'Wenjie Xiao', cohort: '2024级 学硕', aliases: ['肖文杰', 'wenjie xiao', 'wen-jie xiao', 'xiao wenjie', 'xiao w', 'w xiao'] },
  { id: 'yao_jie', zh: '姚杰', en: 'Jie Yao', cohort: '2024级 专硕', honors: '获国家奖学金', aliases: ['姚杰', 'jie yao', 'yao jie', 'yao j', 'j yao'] },
  { id: 'jiang_cong', zh: '蒋聪', en: 'Cong Jiang', cohort: '2024级 专硕', honors: '获国家奖学金', aliases: ['蒋聪', '姜聪', 'cong jiang', 'jiang cong', 'jiang c', 'c jiang'] },
  { id: 'lv_xingchen', zh: '吕星辰', en: 'Xingchen Lv', cohort: '2025级 硕博连读', aliases: ['吕星辰', 'xingchen lv', 'xing-chen lv', 'xingchen lu', 'lv xingchen', 'lv x', 'x lv'] },
  { id: 'yi_hongji', zh: '伊宏基', en: 'Hongji Yi', cohort: '2026级 博士', aliases: ['伊宏基', 'hongji yi', 'hong-ji yi', 'yi hongji', 'yi h', 'h yi'] },
  { id: 'yu_xiaoqian', zh: '喻晓倩', en: 'Xiaoqian Yu', cohort: '2026级 学硕', aliases: ['喻晓倩', 'xiaoqian yu', 'xiao-qian yu', 'yu xiaoqian', 'yu x', 'x yu'] },
  { id: 'qiu_shiyi', zh: '邱实益', en: 'Shiyi Qiu', cohort: '2026级 学硕', aliases: ['邱实益', 'shiyi qiu', 'shi-yi qiu', 'qiu shiyi', 'qiu s', 's qiu'] },
  { id: 'feng_yu', zh: '冯瑜', en: 'Yu Feng', cohort: '2026级 专硕', aliases: ['冯瑜', 'yu feng', 'feng yu', 'feng y', 'y feng'] },
  { id: 'liu_haojie', zh: '刘豪杰', en: 'Haojie Liu', cohort: '2026级 专硕', aliases: ['刘豪杰', 'haojie liu', 'hao-jie liu', 'liu haojie', 'liu h', 'h liu'] },
  { id: 'zhang_xinyu', zh: '张欣雨', en: 'Xinyu Zhang', cohort: '2026级 专硕', aliases: ['张欣雨', 'xinyu zhang', 'xin-yu zhang', 'zhang xinyu', 'zhang x', 'x zhang'] },

  // 毕业研究生（2023届 — 2026届）
  { id: 'wu_xing', zh: '吴兴', en: 'Xing Wu', cohort: '2026届 学硕', honors: '获国家奖学金、校优秀学生', aliases: ['吴兴', 'xing wu', 'wu xing', 'wu x', 'x wu'] },
  { id: 'chen_congmao', zh: '陈丛茂', en: 'Congmao Chen', cohort: '2026届 学硕', aliases: ['陈丛茂', '陈聪茂', 'congmao chen', 'cong-mao chen', 'chen congmao', 'chen c', 'c chen'] },
  { id: 'pan_xinyu', zh: '潘鑫瑜', en: 'Xinyu Pan', cohort: '2025届 学硕', honors: '获国家奖学金、校优秀毕业生、校优秀研究生学位论文', aliases: ['潘鑫瑜', 'xinyu pan', 'xin-yu pan', 'pan xinyu', 'pan x', 'x pan'] },
  { id: 'yu_weigang', zh: '喻惟刚', en: 'Weigang Yu', cohort: '2025届 学硕', aliases: ['喻惟刚', 'weigang yu', 'wei-gang yu', 'yu weigang', 'yu w', 'w yu'] },
  { id: 'wen_sijie', zh: '文思捷', en: 'Sijie Wen', cohort: '2025届 专硕', aliases: ['文思捷', 'sijie wen', 'si-jie wen', 'wen sijie', 'wen s', 's wen'] },
  { id: 'hu_zhiqiang', zh: '胡志强', en: 'Zhiqiang Hu', cohort: '2024届 学硕', aliases: ['胡志强', 'zhiqiang hu', 'zhi-qiang hu', 'hu zhiqiang', 'hu z', 'z hu'] },
  { id: 'zhang_fei', zh: '张飞', en: 'Fei Zhang', cohort: '2023届 专硕', aliases: ['张飞', 'fei zhang', 'zhang fei', 'zhang f', 'f zhang'] },
  { id: 'li_qi', zh: '李琦', en: 'Qi Li', cohort: '2023届 专硕', aliases: ['李琦', 'qi li', 'li qi', 'li q', 'q li'] },
  { id: 'chen_tao', zh: '陈涛', en: 'Tao Chen', cohort: '2023届 专硕', aliases: ['陈涛', 'tao chen', 'chen tao', 'chen t', 't chen'] },

  // 其他合作学者
  { id: 'zhou_bin', zh: '周彬', en: 'Bin Zhou', aliases: ['周彬', 'bin zhou', 'zhou bin', 'zhou b', 'b zhou'] },
  { id: 'li_feng', zh: '李峰', en: 'Feng Li', aliases: ['李峰', 'feng li', 'li feng', 'li f', 'f li'] },
  { id: 'lv_jie', zh: '吕捷', en: 'Jie Lv', aliases: ['吕捷', 'jie lv', 'jie lu', 'lv jie', 'lv j', 'j lv'] },
  { id: 'shen_xin', zh: '沈鑫', en: 'Xin Shen', aliases: ['沈鑫', 'xin shen', 'shen xin', 'shen x', 'x shen'] },
  { id: 'zheng_pai', zh: '郑湃', en: 'Pai Zheng', aliases: ['郑湃', 'pai zheng', 'zheng pai', 'zheng p', 'p zheng'] },
  { id: 'gao_liang', zh: '高亮', en: 'Liang Gao', aliases: ['高亮', 'liang gao', 'gao liang', 'gao l', 'l gao'] },
  { id: 'xu_xun', zh: '徐洵', en: 'Xun Xu', aliases: ['徐洵', 'xun xu', 'xu xun', 'xu x', 'x xu'] },
  { id: 'deng_weijia', zh: '邓伟嘉', en: 'Weijia Deng', aliases: ['邓伟嘉', '邓伟', 'weijia deng', 'wei deng', 'deng weijia', 'deng w', 'w deng'] },
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
      cohort: hit.cohort,
      honors: hit.honors,
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
        cohort: revHit.cohort,
        honors: revHit.honors,
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
      /^大(?:型)?语言模型$|^大模型$|大(?:型)?语言模型.*llm|llm.*大(?:型)?语言模型/i,
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
    label: '智能体与多智能体协作',
    shortLabel: '多智能体',
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
    label: '多模态检索增强',
    shortLabel: '多模态检索',
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
    label: '隐性知识',
    shortLabel: '隐性知识',
    category: 'paradigm',
    patterns: [
      /(?:visual\s+)?tacit\s+knowledge/i,
      /隐性知识/,
    ],
  },
  {
    id: 'kw_knowledge_transform',
    label: '知识转化与外化',
    shortLabel: '知识转化与外化',
    category: 'paradigm',
    patterns: [
      /knowledge\s+(?:explicitation|externalization|transformation|lifecycle)/i,
      /meta-?knowledge/i,
      /元知识|知识显性化|知识转化|知识外化|知识生命周期/,
    ],
  },
  {
    id: 'kw_hrc',
    label: '人机协作与共生',
    shortLabel: '人机协作',
    category: 'paradigm',
    patterns: [
      /human-?(?:robot|machine|ai)\s+(?:collaboration|teaming|interaction)/i,
      /人机协作|人智协作|人机协同|人-ai/i,
    ],
  },
  {
    id: 'kw_symbiosis',
    label: '人机共生',
    shortLabel: '人机共生',
    category: 'paradigm',
    patterns: [
      /human-?(?:machine|ai|robot)\s+symbiosis/i,
      /人机共生/,
    ],
  },
  {
    id: 'kw_hcsm',
    label: '以人为本智能制造',
    shortLabel: '以人为本智能制造',
    category: 'paradigm',
    patterns: [
      /human-?centric\s+smart\s+manufacturing/i,
      /cognitive\s+manufacturing/i,
      /cognitive\s+mass\s+personalization/i,
      /人本(?:智能)?制造|以人为(?:本|中心)的?智能制造|人在回路智能制造|认知制造/,
    ],
  },
  {
    id: 'kw_ind5',
    label: '工业5.0',
    shortLabel: '工业5.0',
    category: 'paradigm',
    patterns: [
      /industry\s*5\.0/i,
      /工业\s*5\.0/,
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
  'based',
  'using',
  'design',
  'large',
  'language',
  'large language',
  'personalised',
  'personalized',
  'collaborative',
  'collaboratively',
  'depth',
  'reasoning',
  'end-of-life',
  'ai-enabled',
  'ai-empowered',
  'designers',
  'rehabilitation',
  'assistive',
  'devices',
  'products',
  'product',
  'tacit',
  'transformation',
  'human-centric',
  'disassembly',
  'configuration',
  'extraction',
  'extracting',
  'parsing',
  'prioritizing',
  'evolving',
  'requirements',
  'multi-faceted',
  'operating',
  'conditions',
  'uncertain',
  'abnormal',
  'industrial',
  'engineering',
  'documents',
  'process',
  'self-organised',
  'self-organized',
  'manner',
  'empowered',
  'enabled',
  'systematic',
  'review',
  'challenges',
  'directions',
  'technologies',
  'future',
  'complex',
  'equipment',
  'scenarios',
  'dynamic',
  'leveraging',
  'context-aware',
  'structured',
  'recursive',
  'enhancing',
  'based on',
  'knowledge',
  'agentic',
  'rehabilitatio',
  '基于',
  '方法',
  '研究',
  '系统',
  '模型',
  '设计',
  '技术',
  '分析',
  '知识',
  '康复',
  '配置',
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

const EN_ZH_PHRASE_MAP: Array<[RegExp, string]> = [
  [/smart\s+manufacturing|intelligent\s+manufacturing/i, '智能制造'],
  [/human-?in-?the-?loop/i, '人在回路'],
  [/knowledge\s+lifecycle/i, '知识生命周期'],
  [/knowledge\s+externali[sz]ation/i, '知识外化'],
  [/knowledge\s+transformation/i, '知识转化'],
  [/knowledge\s+acquisition/i, '知识获取'],
  [/knowledge\s+representation/i, '知识表示'],
  [/knowledge\s+transfer/i, '知识传递'],
  [/knowledge\s+utilization/i, '知识利用'],
  [/cognitive\s+pathway/i, '认知路径图'],
  [/custom\s+apparel|apparel\s+production/i, '定制服装制造'],
  [/question\s+answering|qa\s+system/i, '智能问答系统'],
  [/embodied\s+ai|embodied\s+intelligence/i, '具身智能'],
  [/computer\s+vision|visual\s+inspection/i, '计算机视觉'],
  [/reinforcement\s+learning/i, '强化学习'],
  [/transfer\s+learning/i, '迁移学习'],
  [/deep\s+learning/i, '深度学习'],
  [/machine\s+learning/i, '机器学习'],
  [/graph\s+neural\s+network|gnn\b/i, '图神经网络'],
  [/vision-?language\s+model|vlm\b/i, '视觉语言模型'],
  [/diffusion\s+model/i, '扩散模型'],
  [/generative\s+(?:ai|design)/i, '生成式设计'],
  [/topology\s+optimization/i, '拓扑优化'],
  [/design\s+optimization/i, '设计优化'],
  [/product\s+design/i, '产品设计'],
  [/industrial\s+design/i, '工业设计'],
  [/interaction\s+design|ux\s+design/i, '交互设计'],
  [/sustainable\s+(?:design|manufacturing)/i, '可持续制造'],
  [/human-?robot\s+interaction/i, '人机交互'],
  [/robot(?:ic)?\s+manipulation/i, '机器人操作'],
  [/task\s+(?:planning|scheduling|rescheduling)/i, '任务规划调度'],
  [/defect\s+detection|quality\s+inspection/i, '缺陷质检'],
  [/predictive\s+maintenance|prognostics/i, '预测性维护'],
  [/ontology/i, '本体建模'],
  [/semantic\s+retrieval|information\s+retrieval/i, '语义检索'],
  [/causal\s+reasoning|causal\s+inference/i, '因果推理'],
  [/explainable\s+ai|xai\b/i, '可解释人工智能'],
  [/edge\s+computing|industrial\s+iot|iiot\b/i, '工业物联网'],
  [/robotics|autonomous\s+robot/i, '智能机器人'],
  [/3d\s+reconstruction|point\s+cloud/i, '三维视觉'],
  [/ergonomics|human\s+factors/i, '人因工程'],
  [/supply\s+chain/i, '智能供应链'],
  [/assembly\s+process/i, '装配工艺'],
  [/disassembly\s+planning|remanufacturing/i, '智能拆解与再制造'],
  [/machine\s+tools?/i, '智能机床运维'],
  [/bridge\s+weathering\s+steel|weathering\s+steel/i, '桥梁耐候钢'],
];

const TOPIC_ZH_FALLBACK: Record<string, string> = {
  LLM: '大语言模型',
  KnowledgeGraph: '知识图谱',
  ComputerVision: '计算机视觉',
  Multimodal: '多模态融合',
  EmbodiedAI: '具身智能',
  AgentCollaboration: '多智能体协作',
  HumanAICollaboration: '人机协作',
  ProductDesign: '产品设计',
  DesignOptimization: '设计优化',
  InteractionDesign: '交互设计',
  SustainableDesign: '可持续设计',
};

/**
 * Convert a single raw keyword into a clean Chinese tag (returns null for noisy/untranslated English fragments).
 */
export function toChineseKeywordTag(raw: string): string | null {
  const info = canonicalizeKeyword(raw);
  if (info && /[\u3400-\u9fff]/.test(info.shortLabel)) {
    return info.shortLabel;
  }
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\u00a0\t\r\n]+/g, ' ')
    .replace(/^[#•·\-\s]+|[\s.,;；。]+$/g, '')
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (NOISY_KEYWORDS.has(cleaned.toLowerCase())) return null;

  for (const [re, zh] of EN_ZH_PHRASE_MAP) {
    if (re.test(cleaned)) return zh;
  }

  // Keep already-Chinese tags (clean away stray English parentheticals)
  if (/[\u3400-\u9fff]/.test(cleaned)) {
    const pureZh = cleaned.replace(/\s*\([A-Za-z0-9\s/-]{2,24}\)\s*/g, '').trim();
    if (pureZh.length >= 2 && pureZh.length <= 18 && !NOISY_KEYWORDS.has(pureZh.toLowerCase())) {
      return pureZh;
    }
  }
  return null;
}

/**
 * Return clean, deduplicated, 100% Chinese keyword tags for any paper.
 */
export function extractChineseKeywordTags(
  paper: {
    title?: string;
    titleZh?: string;
    abstractOriginal?: string;
    abstractZh?: string;
    keywords?: string[];
    keywordsOriginal?: string[];
    topics?: string[];
  },
  maxCount = 8
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (zh: string | null) => {
    if (!zh) return;
    const norm = zh.replace(/\s+/g, '').toLowerCase();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(zh);
  };

  for (const raw of [...(paper.keywordsOriginal || []), ...(paper.keywords || [])]) {
    push(toChineseKeywordTag(raw));
  }
  for (const info of extractCanonicalPaperKeywords(paper)) {
    if (/[\u3400-\u9fff]/.test(info.shortLabel)) {
      push(info.shortLabel);
    }
  }
  if (out.length < 3 && Array.isArray(paper.topics)) {
    for (const t of paper.topics) {
      push(TOPIC_ZH_FALLBACK[t] || null);
    }
  }

  return out.slice(0, maxCount);
}
