import type { AcademicPaper } from '../src/types/paper.js';

function daysAgoDate(days: number): string {
  const d = new Date('2026-11-25T10:00:00+08:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function hoursAgoIso(hours: number): string {
  const d = new Date('2026-11-25T11:00:00+08:00');
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

export const SEED_PAPERS: AcademicPaper[] = [
  {
    id: 'paper-jms-2026-llm-kg',
    title: 'KG-MfgLLM: Retrieval-Augmented Large Language Models Grounded by Dynamic Process Knowledge Graphs for Zero-Defect CNC Machining',
    titleZh: 'KG-MfgLLM：基于动态工艺知识图谱增强检索的大语言模型用于零缺陷数控加工诊断',
    authors: ['Zhenyu Wang', 'Hao Liu', 'Markus Weber', 'Lihui Wang'],
    affiliations: ['Shanghai Jiao Tong University', 'KTH Royal Institute of Technology'],
    journal: 'Journal of Manufacturing Systems',
    journalShort: 'JMS',
    journalRank: 'SCI Q1 · IF 12.3',
    domain: 'manufacturing',
    topics: ['LLM', 'KnowledgeGraph'],
    publishedDate: daysAgoDate(0),
    syncedAt: hoursAgoIso(1),
    doi: '10.1016/j.jmsy.2026.11.004',
    url: 'https://www.sciencedirect.com/journal/journal-of-manufacturing-systems',
    sourceOrigin: 'curated',
    weiboSummary:
      '【今日重磅 · 制造顶刊JMS】针对大模型在数控加工工艺决策中的“参数幻觉”痛点，提出动态工艺知识图谱(DPKG)双向约束的KG-MfgLLM框架。在自建18万条机床故障-工艺三元组上实现96.4%根因诊断准确率，较GPT-4o+Naive RAG提升14.8%！',
    keyHighlightMetric: '根因准确率 96.4% (+14.8%) · 幻觉率降至 1.9%',
    tags: ['数控加工', '工艺知识图谱', '大模型幻觉抑制', 'RAG', '零缺陷制造'],
    likes: 184,
    isLiked: false,
    isBookmarked: true,
    reposts: 47,
    anatomy: {
      background:
        '现代航空航天与精密模具制造正全面向零缺陷（Zero-Defect Manufacturing, ZDM）演进。五轴数控机床在加工高温合金等难加工材料时，会产生多源异构的工艺日志、G代码指令、主轴负载波形与质检报告，急需具备跨模态语义理解与精准工艺推理能力的智能诊断底座。',
      problem:
        '通用大语言模型（LLM）虽具备强泛化语义理解能力，但在精密制造领域直接部署面临三大核心问题：(1) 工艺参数（如进给率、切削深度、刀具寿命）数值敏感极高，LLM易产生“数值幻觉”；(2) 车间实时传感器状态变化快，静态预训练权重无法反映动态工况；(3) 诊断推理缺乏可追溯的物理因果链，工程师难以采信。',
      currentStatus:
        '现有研究主要分为两条路线：一类是基于规则与静态本体的制造知识图谱（如OWL/Neo4j），推理严谨但泛化能力弱，无法处理非结构化运维工单；另一类是直接采用向量检索增强（Naive RAG）微调工业大模型，能够检索文本片段，但割裂了“设备-刀具-材料-缺陷”间的多跳结构化拓扑关系。',
      limitationsOfPriorWork:
        '1. 传统向量RAG仅基于余弦相似度匹配文本块，忽略了工艺参数之间的硬物理约束与图拓扑依赖；\n2. 静态知识图谱难以随在线磨损传感信号实时更新实体属性；\n3. 缺少覆盖“多轴CNC异常波形+工艺卡+维修工单”的高质量大规模基准数据集。',
      proposedMethod:
        '本文提出 KG-MfgLLM 框架：(1) 构建时序感知的动态工艺知识图谱（DPKG），将传感器滑动窗口特征实时映射为图谱动态属性节点；(2) 设计子图-文本混合检索引擎（Subgraph-Text Hybrid Retriever），通过GNN路径评分提取2-hop因果子图与工艺标准条款；(3) 引入物理约束验证器（Physics-Constraint Verifier），在LLM解码阶段利用切削力经验公式与刀具公差边界对生成参数进行logit掩码与重排序。',
      architectureModules: [
        {
          id: 'm1',
          stage: 'input',
          title: '多源车间流数据接入',
          subtitle: 'G-Code + 振动/电流 + 质检单',
          detail: '采集五轴CNC控制器MTConnect实时数据流与历史MES非结构化维修工单。',
        },
        {
          id: 'm2',
          stage: 'encoder',
          title: '动态工艺知识图谱 (DPKG)',
          subtitle: '18.4万三元组 · 时序节点更新',
          detail: '将刀具磨损状态、主轴谐振频率与材料属性编码为带时间戳的异构图节点。',
        },
        {
          id: 'm3',
          stage: 'core',
          title: '双路图-文混合检索器',
          subtitle: 'GNN路径剪枝 + 密集向量检索',
          detail: '联合召回2跳因果子图与ISO/企业工艺规范片段，消除孤立文本检索偏差。',
        },
        {
          id: 'm4',
          stage: 'fusion',
          title: '领域微调LLM + 物理约束解码',
          subtitle: 'QLoRA-14B + 公差边界校验',
          detail: '利用切削力安全域与机床运动学边界对候选工艺建议进行实时约束重排。',
        },
        {
          id: 'm5',
          stage: 'output',
          title: '可解释根因链与参数纠偏',
          subtitle: '因果路径可视化 + G代码补丁',
          detail: '输出带图谱溯源依据的故障诊断报告及可直接下发的进给倍率调整建议。',
        },
      ],
      experimentalValidation:
        '实验在两套平台上验证：(1) 工业级五轴加工中心（DMG MORI DMU 50）实际产线采集的连续6个月钛合金/高温合金叶轮加工数据；(2) 公开工业文本QA测试集。评估维度涵盖根因诊断准确率（Top-1 Acc）、工艺参数幻觉率（Hallucination Rate）、推理端到端延迟及工程师盲测可信度评分。',
      dataset: {
        sourceType: 'hybrid',
        names: ['MfgKG-CNC-180K (自建)', 'PHM Society 2010 Tool Wear (公开)', 'ISO-14649 Standard QA (公开)'],
        scale: '184,200 工艺三元组 + 12,600 故障工单 + 340 小时主轴高频采样数据',
        modalities: [
          { label: '结构化工艺知识图谱三元组', percentage: 48 },
          { label: '维修工单与工艺规程文本', percentage: 32 },
          { label: '高频振动/声发射时序切片', percentage: 20 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '多源语料清洗与对齐',
            description: '收集3家航空制造企业近5年MES维修日志与CAM工艺卡，经正则脱敏与单位标准化统一量纲。',
          },
          {
            step: '02',
            title: '半自动本体抽取与专家校验',
            description: '利用LLM初抽“材料-刀具-参数-缺陷”四元关系，再由6名高级工艺师双盲复核，一致性Kappa达0.91。',
          },
          {
            step: '03',
            title: '时序传感信号符号化挂载',
            description: '采用小波包能量熵将主轴振动突变映射为离散异常事件节点，并与工艺卡时间轴精准对齐。',
          },
          {
            step: '04',
            title: '公开基准融合增强',
            description: '并入PHM2010公开刀具磨损数据集构建跨机床迁移测试集，确保模型在不同控制器间的泛化验证。',
          },
        ],
        summary:
          '采用“自建核心产线图谱（75%）+ 公开刀具磨损/标准库（25%）”混合构建方案，既解决了真实CNC深层因果缺失问题，又保留了公开基准的横向可比性。',
      },
      comparisonMetrics: {
        metricNames: ['RootCauseAcc', 'ParamSafety', 'ExplainScore'],
        primaryMetric: 'RootCauseAcc',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'KG-MfgLLM (本文)', isProposed: true, values: { RootCauseAcc: 96.4, ParamSafety: 98.1, ExplainScore: 94.6 } },
          { method: 'GPT-4o + Naive RAG', values: { RootCauseAcc: 81.6, ParamSafety: 84.2, ExplainScore: 79.5 } },
          { method: 'Qwen2.5-14B (SFT)', values: { RootCauseAcc: 85.3, ParamSafety: 86.9, ExplainScore: 80.1 } },
          { method: 'GraphRAG (Microsoft)', values: { RootCauseAcc: 88.9, ParamSafety: 90.4, ExplainScore: 87.2 } },
          { method: 'Neo4j Rule Engine', values: { RootCauseAcc: 74.2, ParamSafety: 95.0, ExplainScore: 91.0 } },
        ],
      },
      ablationStudy: {
        metricName: 'RootCauseAcc',
        unit: '%',
        fullModelScore: 96.4,
        items: [
          {
            variant: 'w/o 动态图谱更新 (静态KG)',
            removedModule: '时序传感器节点挂载',
            score: 89.2,
            delta: -7.2,
            impactNote: '失去在线刀具磨损感知，渐进性颤振漏报明显上升。',
          },
          {
            variant: 'w/o 子图拓扑检索 (纯文本RAG)',
            removedModule: 'GNN 2-hop 子图召回',
            score: 87.5,
            delta: -8.9,
            impactNote: '跨工序耦合缺陷无法关联，准确率跌幅最大。',
          },
          {
            variant: 'w/o 物理约束验证器',
            removedModule: '切削力安全域解码校验',
            score: 93.8,
            delta: -2.6,
            impactNote: '参数幻觉率由1.9%反弹至8.4%，存在超程风险。',
          },
        ],
        summary: '子图检索模块对跨工序根因诊断贡献最大（+8.9%），物理约束验证器则是保障参数安全不超限的关键防线。',
      },
      conclusion:
        '将动态工艺知识图谱与物理约束解码深度耦合进大语言模型，可有效兼顾非结构化制造文本的语义泛化能力与精密工艺决策的确定性，使LLM真正达到产线级零缺陷辅助决策标准。',
      futureAndLimitations: {
        paperLimitations: [
          '动态图谱更新依赖边缘端特征提取，目前对毫秒级超高速碰撞响应仍有约180ms延迟；',
          '跨品牌数控系统（如Siemens 840D迁移至Fanuc 31i）仍需约500条少量微调样本对齐词表。',
        ],
        futureDirections: [
          '结合视觉-力觉多模态基础模型，实现加工表面微观形貌的闭环自优化；',
          '探索联邦知识图谱架构，在保护各制造企业工艺机密的前提下实现跨厂区协同演化。',
        ],
      },
    },
    comments: [
      {
        id: 'c1',
        paperId: 'paper-jms-2026-llm-kg',
        author: '陈工 · 精密制造实验室',
        role: '高级工艺研究员',
        content: '物理约束解码器用切削力模型做logit校验这个思路非常工程化，终于解决了大模型乱推荐转速进给的问题。',
        createdAt: hoursAgoIso(0.5),
      },
    ],
  },
  {
    id: 'paper-corl-2026-embodied-vla',
    title: 'DexVLA-Force: Tactile-Visual-Language-Action Models for Compliant Industrial Cable Harness Assembly',
    titleZh: 'DexVLA-Force：面向柔性线缆工业装配的触觉-视觉-语言-动作具身智能模型',
    authors: ['Yifan Zhang', 'Chelsea Finn', 'Shuran Song', 'Wei Xu'],
    affiliations: ['Stanford University', 'Tsinghua University IIIS'],
    journal: 'Conference on Robot Learning (CoRL)',
    journalShort: 'CoRL',
    journalRank: '具身智能顶会 · Oral',
    domain: 'interdisciplinary',
    topics: ['EmbodiedAI', 'Multimodal'],
    publishedDate: daysAgoDate(0),
    syncedAt: hoursAgoIso(2),
    doi: '10.48550/arXiv.2611.09421',
    url: 'https://arxiv.org/abs/2611.09421',
    sourceOrigin: 'curated',
    weiboSummary:
      '【今日热点 · 具身智能CoRL Oral】工业汽车线束插接一直被称为机器人装配“圣杯”。本文提出融合GelSight高密度触觉阵列与扩散动作头的DexVLA-Force，实现0.2mm公差盲插成功率93.8%，跨新线束零样本泛化提升31%！',
    keyHighlightMetric: '柔性插接成功率 93.8% · 力控超调降低 62%',
    tags: ['具身智能', 'VLA模型', '触觉多模态', '柔性装配', '扩散策略'],
    likes: 246,
    isLiked: true,
    isBookmarked: true,
    reposts: 89,
    anatomy: {
      background:
        '汽车电子、航空线束及3C精密组装中存在大量变形体（Deformable Linear Objects, DLO）插接与卡扣装配任务。当前工厂自动化仍高度依赖人工，亟需能听懂工艺指令并完成毫米级柔顺力控的具身智能机器人。',
      problem:
        '现有视觉-语言-动作（VLA）模型（如OpenVLA、RT-2）主要依赖RGB视觉观测，在工业插接场景中面临“手部自遮挡”和“微米级接触力无法从像素观测”的根本瓶颈，导致末端执行器极易发生刚性卡死或损坏脆弱接插件。',
      currentStatus:
        '学术界已尝试将六维力传感器引入模仿学习（如ACT+Force、Diffusion Policy），但多针对单任务从头训练，缺乏语言指令泛化能力，且低维六维力矩难以分辨局部滑移方向与接触点分布。',
      limitationsOfPriorWork:
        '1. 视觉VLA缺乏高频触觉-本体感知反馈，闭环频率（~5Hz）远低于精密力控要求（>50Hz）；\n2. 多模态对齐仅停留在图像-文本层面，高维触觉形变场尚未与预训练VLM语义空间对齐；\n3. 缺少真实工业级非刚性线束插接大规模双臂示教数据集。',
      proposedMethod:
        '提出层次化双频VLA架构 DexVLA-Force：(1) 慢系统（10Hz）采用多模态VLM融合双目视觉、工艺语言指令与触觉Token提取高层装配阶段语义与目标位姿；(2) 快系统（100Hz）采用触觉条件扩散策略头（Tactile-Conditioned Diffusion Action Head）生成阻抗-位置混合控制轨迹；(3) 引入非对称触觉对比预训练，将GelSight光学形变图映射到视觉语言潜空间。',
      architectureModules: [
        {
          id: 'e1',
          stage: 'input',
          title: '多模态异频传感观测',
          subtitle: '腕部RGBD (30Hz) + GelSight触觉 (100Hz)',
          detail: '同步采集全局视角图像、双指高分辨率触觉形变图及关节力矩反馈。',
        },
        {
          id: 'e2',
          stage: 'encoder',
          title: '触觉-视觉潜空间对齐器',
          subtitle: 'ViT-Tactile + 跨模态交叉注意力',
          detail: '利用对比学习将插针偏斜、卡滞滑移等触觉模态对齐至VLM语义嵌入。',
        },
        {
          id: 'e3',
          stage: 'core',
          title: '慢系统多模态推理骨干',
          subtitle: '7B VLM (10Hz) · 任务阶段规划',
          detail: '解析“将蓝色4针端子插入ECU锁紧位”等自然语言，输出阶段目标特征。',
        },
        {
          id: 'e4',
          stage: 'fusion',
          title: '快系统触觉条件扩散动作头',
          subtitle: '100Hz 柔顺阻抗-动作分块生成',
          detail: '根据实时触觉反馈高频去噪生成6-DoF位姿增量与期望刚度矩阵。',
        },
        {
          id: 'e5',
          stage: 'output',
          title: '双臂协同柔顺控制执行',
          subtitle: '亚毫米插接 + 自适应力限制',
          detail: '实现带锁扣“咔哒”声学/触觉判停的零损伤精密装配。',
        },
      ],
      experimentalValidation:
        '在真实双臂协作机器人平台（Franka Research 3 双臂 + GelSight Mini 指尖）上测试了12种工业接插件（含Molex、Deutsch防水接头、FPC排线）以及未知新接头泛化测试，对比单视觉VLA、六维力Diffusion Policy及传统导纳控制。',
      dataset: {
        sourceType: 'self_built',
        names: ['IndusHarness-40K (本文自建)'],
        scale: '42,500 条真实双臂遥操作装配轨迹（覆盖18类线束与24种插座，总计680小时）',
        modalities: [
          { label: '多视角RGB-D视频帧', percentage: 40 },
          { label: '100Hz GelSight触觉形变图', percentage: 35 },
          { label: '机器人本体关节状态与阻抗参数', percentage: 15 },
          { label: '精细阶段语言标注指令', percentage: 10 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: 'ALOHA式力反馈遥操作采集',
            description: '搭建主从同构力反馈遥操作台，让操作员在真实接触力感知下完成插接示教，避免盲操损坏样本。',
          },
          {
            step: '02',
            title: '扰动注入与失败恢复采集',
            description: '刻意在线缆初始姿态与插座位置注入±15mm随机偏差及纠偏恢复轨迹，增强策略鲁棒性。',
          },
          {
            step: '03',
            title: '接触阶段半自动语义切分',
            description: '基于触觉压力峰值自动切分“抓取-对齐-微调搜孔-插紧锁扣”四阶段并绑定文本描述。',
          },
        ],
        summary:
          '完全自建（Self-Built）的真实工业接触密集型具身数据集，重点填补了当前开源数据集（如OXE）普遍缺乏高频光学触觉模态的空白。',
      },
      comparisonMetrics: {
        metricNames: ['SeenSuccess', 'UnseenSuccess', 'PeakForceControl'],
        primaryMetric: 'SeenSuccess',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'DexVLA-Force (本文)', isProposed: true, values: { SeenSuccess: 93.8, UnseenSuccess: 81.5, PeakForceControl: 95.2 } },
          { method: 'OpenVLA (Fine-tuned)', values: { SeenSuccess: 61.2, UnseenSuccess: 49.8, PeakForceControl: 54.0 } },
          { method: 'Diffusion Policy + F/T', values: { SeenSuccess: 84.5, UnseenSuccess: 42.1, PeakForceControl: 86.7 } },
          { method: 'ACT (Vision Only)', values: { SeenSuccess: 58.0, UnseenSuccess: 31.4, PeakForceControl: 48.5 } },
          { method: 'π0-Base (Zero-Shot/FT)', values: { SeenSuccess: 76.4, UnseenSuccess: 63.2, PeakForceControl: 71.0 } },
        ],
      },
      ablationStudy: {
        metricName: 'SeenSuccess',
        unit: '%',
        fullModelScore: 93.8,
        items: [
          {
            variant: 'w/o 高频触觉编码 (仅视觉)',
            removedModule: 'GelSight触觉分支',
            score: 64.5,
            delta: -29.3,
            impactNote: '遮挡下搜孔失败率激增，且极易压弯插针。',
          },
          {
            variant: 'w/o 快慢双频解耦 (统一10Hz)',
            removedModule: '100Hz快系统扩散头',
            score: 79.1,
            delta: -14.7,
            impactNote: '力控响应滞后引发接触震荡与过载保护停机。',
          },
          {
            variant: 'w/o 动态刚度输出',
            removedModule: '自适应阻抗矩阵预测',
            score: 86.4,
            delta: -7.4,
            impactNote: '固定高刚度下小角度偏斜即卡死，无法柔顺顺应。',
          },
        ],
        summary: '触觉模态贡献高达+29.3%的成功率提升，证明密集型工业装配中触觉是不可或缺的核心感知源；双频解耦设计则直接决定动态稳定性。',
      },
      conclusion:
        '通过“慢速语义VLM规划 + 快速高频触觉扩散柔顺控制”的层次化具身框架，机器人首次在毫米级工业柔性线束插接上超越93%的产线实用阈值，并展现出显著的跨部件泛化能力。',
      futureAndLimitations: {
        paperLimitations: [
          'GelSight硅胶弹性体在连续高摩擦金属装配约1200次后会出现表面磨损，需要标定补偿；',
          '极细0.3mm间距FPC排线的单目/触觉辨识仍受指尖尺寸物理限制。',
        ],
        futureDirections: [
          '引入视-触-声（插接锁扣声学信号）三模态协同判停；',
          '探索仿真到现实（Sim2Real）高保真柔性体与光学触觉渲染，降低真机遥操作采集成本。',
        ],
      },
    },
    comments: [
      {
        id: 'c2',
        paperId: 'paper-corl-2026-embodied-vla',
        author: '林博士 · 机器人控制组',
        role: '具身智能研究员',
        content: '双频解耦设计太精准了，10Hz跑大模型语义+100Hz跑触觉扩散力控，正好卡在工业级实时性的甜点区。',
        createdAt: hoursAgoIso(1.2),
      },
    ],
  },
  {
    id: 'paper-cvpr-2026-cv-defect',
    title: 'DiffInspect: Physics-Guided Diffusion Foundation Model for Few-Shot Multimodal Surface Defect Segmentation in Wafer & Metal Manufacturing',
    titleZh: 'DiffInspect：物理先验引导的多模态扩散基础模型用于晶圆与金属制造少样本表面缺陷分割',
    authors: ['Jianing Chen', 'Ming-Hsuan Yang', 'Kaiming He', 'Bo Zhang'],
    affiliations: ['UC Merced', 'MIT CSAIL', 'Zhejiang University'],
    journal: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)',
    journalShort: 'CVPR',
    journalRank: '计算机视觉顶会 · CCF-A',
    domain: 'computer_science',
    topics: ['ComputerVision', 'Multimodal'],
    publishedDate: daysAgoDate(1),
    syncedAt: hoursAgoIso(14),
    doi: '10.1109/CVPR.2026.04812',
    url: 'https://openaccess.thecvf.com/',
    sourceOrigin: 'curated',
    weiboSummary:
      '【计算机视觉顶会 · CVPR 2026】针对工业金属反光与晶圆微米划痕“强反光干扰、样本极度稀疏”难题，将光度立体反射物理方程嵌入扩散特征空间，实现仅1-shot条件下94.7% Pixel-AUROC，同时支持跨材质零样本迁移！',
    keyHighlightMetric: '1-Shot Pixel-AUROC 94.7% · 推理 28 FPS',
    tags: ['工业视觉检测', '扩散模型', '少样本异常分割', '物理先验', '表面缺陷'],
    likes: 163,
    isLiked: false,
    isBookmarked: false,
    reposts: 39,
    anatomy: {
      background:
        '晶圆光刻与高精度金属锻压表面缺陷检测是计算机视觉赋能高端制造的核心落地场景。工业产线产品换型极快，新工艺上线往往仅有1~5张缺陷样本（甚至零样本），要求视觉检测模型具备极强的少样本泛化与高反光抗干扰能力。',
      problem:
        '金属与镜面晶圆表面存在强烈的镜面高光与照明方向依赖性，通用视觉基础模型（如SAM、DINOv2、CLIP）在工业迁移时常将正常金属拉丝纹理与光斑误判为裂纹或凹坑，且纯像素重建方法容易“过度泛化”而把真实细微划痕也完美重建出来。',
      currentStatus:
        '现有工业异常检测方法包括：(1) 基于记忆库的PatchCore/WinCLIP，依赖单一RGB特征，受光照变化影响剧烈；(2) 基于扩散重建的AnoDDPM，推理迭代步数多、速度慢，且缺乏缺陷物理成像规律引导。',
      limitationsOfPriorWork:
        '1. 忽略了表面法向与双向反射分布函数（BRDF）物理先验，难以区分真实几何凹陷与伪光斑；\n2. 文本提示词模板对专业冶金/半导体缺陷术语敏感度低，跨材质泛化不足；\n3. 高分辨率4K晶圆图像直接切片检测易丢失全局结构异常。',
      proposedMethod:
        '提出物理先验引导的少样本多模态异常分割模型 DiffInspect：(1) 利用单步潜在扩散反演（One-Step Latent Inversion）提取抗光照干扰的几何本征特征与反照率解耦表征；(2) 设计物理一致性残差模块（BRDF-Residual Gate），过滤镜面高光伪影；(3) 融合多模态缺陷描述词图谱提示（Defect Prompt Bank），在1-shot条件下精准定位微米级划痕与腐蚀坑。',
      architectureModules: [
        {
          id: 'c1',
          stage: 'input',
          title: '高分辨率工业视觉与提示输入',
          subtitle: '4K工业相机图像 + 工艺缺陷描述',
          detail: '接收多角度照明图像或单帧高反光图像及领域缺陷语义描述。',
        },
        {
          id: 'c2',
          stage: 'encoder',
          title: '潜在物理反照率解耦器',
          subtitle: '内蕴本征分解 · 剥离镜面高光',
          detail: '将图像解耦为表面几何法向/反照率与光照反射分量，抑制反光噪声。',
        },
        {
          id: 'c3',
          stage: 'core',
          title: '单步扩散特征对比骨干',
          subtitle: 'Frozen SD-UNet + LoRA适配器',
          detail: '单步前向重建正常流形特征，避免多步采样高延迟并防止缺陷过重建。',
        },
        {
          id: 'c4',
          stage: 'fusion',
          title: '跨模态缺陷提示对齐',
          subtitle: 'Vision-Language 多尺度交叉融合',
          detail: '将“微裂纹/氧化斑/焊渣”语义先验注入多尺度特征残差图进行精细加权。',
        },
        {
          id: 'c5',
          stage: 'output',
          title: '亚像素级缺陷掩膜与分类',
          subtitle: '28 FPS 实时分割输出',
          detail: '生成像素级热力图、分割掩膜与可解释缺陷类别置信度。',
        },
      ],
      experimentalValidation:
        '在MVTec-AD、VisA、Real-IAD三大公开工业异常检测基准及自建晶圆-高反光金属基准（WaferSpec-8K）上进行1-shot、4-shot及Zero-shot实验，评估指标涵盖Image-AUROC、Pixel-AUROC、PRO（Per-Region Overlap）及单帧推理FPS。',
      dataset: {
        sourceType: 'hybrid',
        names: ['MVTec-AD (公开)', 'VisA (公开)', 'Real-IAD (公开)', 'WaferSpec-8K (自建)'],
        scale: '15,000+ 公开样本 + 8,400 张高反光晶圆与航空铝材实拍图像',
        modalities: [
          { label: '公开标准工业RGB基准', percentage: 64 },
          { label: '自建多角度照明高反光晶圆图', percentage: 26 },
          { label: '工艺缺陷术语文本提示库', percentage: 10 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '多光源线阵相机采集',
            description: '在暗场、明场与同轴光3种光源角度下采集晶圆与CNC铝合金高反光表面样本。',
          },
          {
            step: '02',
            title: '亚像素激光共聚焦真值标定',
            description: '利用白光干涉仪获取真实微米级物理形貌作为像素级分割Ground Truth，避免人工框选误差。',
          },
          {
            step: '03',
            title: '公开基准统一协议对齐',
            description: '将MVTec-AD、VisA与自建WaferSpec按统一1-shot/4-shot划分标准构建跨材质评测集。',
          },
        ],
        summary:
          '以三大权威公开数据集为基础底座，叠加自建高反光晶圆物理真值数据集，全面检验模型在强镜面反射干扰下的真实工业鲁棒性。',
      },
      comparisonMetrics: {
        metricNames: ['PixelAUROC', 'ImageAUROC', 'PROScore'],
        primaryMetric: 'PixelAUROC',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'DiffInspect (本文)', isProposed: true, values: { PixelAUROC: 94.7, ImageAUROC: 96.8, PROScore: 91.2 } },
          { method: 'WinCLIP (1-shot)', values: { PixelAUROC: 85.1, ImageAUROC: 91.4, PROScore: 79.8 } },
          { method: 'AnomalyGPT', values: { PixelAUROC: 89.6, ImageAUROC: 93.2, PROScore: 84.5 } },
          { method: 'PatchCore (1-shot)', values: { PixelAUROC: 83.4, ImageAUROC: 87.9, PROScore: 76.2 } },
          { method: 'PromptAD', values: { PixelAUROC: 91.2, ImageAUROC: 94.1, PROScore: 87.0 } },
        ],
      },
      ablationStudy: {
        metricName: 'PixelAUROC',
        unit: '%',
        fullModelScore: 94.7,
        items: [
          {
            variant: 'w/o 物理反照率解耦模块',
            removedModule: 'BRDF-Residual Gate',
            score: 88.9,
            delta: -5.8,
            impactNote: '高反光金属表面假阳性告警激增，PRO指标同步下滑7.9%。',
          },
          {
            variant: 'w/o 领域缺陷词库注入',
            removedModule: 'Defect Prompt Bank',
            score: 91.4,
            delta: -3.3,
            impactNote: '微米级浅划痕语义召回变弱，容易漏检低对比度缺陷。',
          },
          {
            variant: '多步DDIM反演替代单步',
            removedModule: 'One-Step Inversion',
            score: 94.9,
            delta: 0.2,
            impactNote: '精度仅差0.2%但FPS从28骤降至3.1，无法满足在线节拍。',
          },
        ],
        summary: '物理反照率解耦对高反光材质效果立竿见影（+5.8%），单步反演设计则在几乎无精度损失下换来9倍推理加速。',
      },
      conclusion:
        '在扩散视觉基础模型中引入光学反射物理分解机制，能以极少量样本克服工业镜面反光干扰，达到28 FPS的在线实时分割性能。',
      futureAndLimitations: {
        paperLimitations: [
          '对于透明玻璃盖板内部多层气泡造成的重影，单视图反照率分解仍有边界模糊现象；',
          '显存占用约9.4GB，尚未在纯低功耗嵌入式NPU工控机上完成INT8量化部署。',
        ],
        futureDirections: [
          '将光学偏振成像（Polarization）融入输入层，彻底攻克透明与高反光混合材质检测；',
          '面向端侧边缘盒子探索单步蒸馏极轻量级Tiny-DiffInspect架构。',
        ],
      },
    },
    comments: [],
  },
  {
    id: 'paper-rcim-2026-kg-scheduling',
    title: 'DynHG-Scheduler: Heterogeneous Graph Neural Networks and LLM Co-Evolution for Dynamic Flexible Job-Shop Scheduling',
    titleZh: 'DynHG-Scheduler：异构图神经网络与大语言模型协同演化的动态柔性作业车间调度',
    authors: ['Xiaoming Li', 'Liang Gao', 'Xinye Cai', 'Dymitr Ruta'],
    affiliations: ['Huazhong University of Science and Technology', 'Khalifa University'],
    journal: 'Robotics and Computer-Integrated Manufacturing',
    journalShort: 'RCIM',
    journalRank: 'SCI Q1 · IF 9.1',
    domain: 'manufacturing',
    topics: ['KnowledgeGraph', 'LLM'],
    publishedDate: daysAgoDate(1),
    syncedAt: hoursAgoIso(18),
    doi: '10.1016/j.rcim.2026.102845',
    url: 'https://www.sciencedirect.com/journal/robotics-and-computer-integrated-manufacturing',
    sourceOrigin: 'curated',
    weiboSummary:
      '【智能制造顶刊 RCIM】面向急单插单、机器突发宕机等动态车间重调度难题，结合LLM自动进化启发式调度规则与异构图神经网络（HGNN）实时估值，在100×20超大规模车间上将最大完工时间（Makespan）缩短11.4%，响应时间仅0.38秒！',
    keyHighlightMetric: 'Makespan 缩短 11.4% · 重调度耗时 0.38s',
    tags: ['车间调度', '异构图神经网络', 'LLM进化启发式', 'FJSP', '数字孪生'],
    likes: 129,
    isLiked: false,
    isBookmarked: true,
    reposts: 31,
    anatomy: {
      background:
        '多品种、小批量柔性制造模式下，车间频繁出现紧急插单、AGV拥堵、机床突发故障与工人缺勤等扰动事件。传统静态排产方案往往在投产2小时内即失效，实时高精度动态重调度是智能工厂MES的核心大脑。',
      problem:
        '传统精确求解器（CPLEX/Gurobi）在超50工件规模下计算超时；常规深度强化学习（DRL）虽推理快，但泛化性差，当产线机器数变化或新增工艺约束（如换模时间、能耗上限）时必须耗时重训。',
      currentStatus:
        '近年研究开始采用图神经网络建模析取图（Disjunctive Graph）以适应变长工件/机器规模，同时出现利用LLM自动生成启发式代码（如FunSearch范式）的探索，但两者割裂，尚无将拓扑实时感知与LLM语义规则进化融合的闭环方案。',
      limitationsOfPriorWork:
        '1. 传统析取图难以表达“夹具占用-能耗峰值-物料缓冲”等多维异构资源约束；\n2. 纯LLM生成调度规则缺乏毫秒级全局状态图感知，面对高度拥堵瓶颈机器表现不稳定；\n3. 学术测试多停留在小规模标准算例，缺乏真实汽车零部件混流车间验证。',
      proposedMethod:
        '提出 DynHG-Scheduler：(1) 构建包含“工序-设备-AGV-夹具”四类节点的动态制造异构知识图谱，利用异构注意力网络（HAN）编码实时瓶颈状态；(2) 建立LLM规则演化池（LLM Heuristic Evolver），根据当前生产扰动类型自动合成与交叉变异复合派工规则；(3) 采用图神经网络驱动的上下文选择策略，在0.4秒内为每个空闲工位动态匹配最优规则组合。',
      architectureModules: [
        {
          id: 'r1',
          stage: 'input',
          title: '数字孪生车间实时事件流',
          subtitle: '急单到达 · 设备告警 · AGV位置',
          detail: '捕获MES突发事件与在制品队列状态，触发毫秒级增量图更新。',
        },
        {
          id: 'r2',
          stage: 'encoder',
          title: '制造资源异构图 (HG)',
          subtitle: '工序/机床/夹具/AGV 四元图谱',
          detail: '显式编码换模代价、加工能耗及前序工序紧前关系边权重。',
        },
        {
          id: 'r3',
          stage: 'core',
          title: 'HGNN 瓶颈感知编码器',
          subtitle: '异构图注意力网络提取负荷表征',
          detail: '捕获跨机器竞争关系与关键路径阻塞风险度。',
        },
        {
          id: 'r4',
          stage: 'fusion',
          title: 'LLM 协同演化规则库',
          subtitle: '离线进化算子 + 在线规则选择',
          detail: 'LLM持续进化适配“低能耗/高准时率”的多目标复合调度启发式函数。',
        },
        {
          id: 'r5',
          stage: 'output',
          title: '毫秒级甘特重排与下发',
          subtitle: '0.38s 求解 · 多目标帕累托优化',
          detail: '输出无冲突甘特图并同步更新车间看板与AGV配送序列。',
        },
      ],
      experimentalValidation:
        '在经典Brandimarte、Hurink公开FJSP算例、大规模100×20合成算例以及某新能源变速箱壳体混流车间30天真实排产日志上进行系统对比，对比MILP精确求解、遗传算法（NSGA-II）、纯DRL（HGNN-PPO）及纯LLM调度（EoH）。',
      dataset: {
        sourceType: 'hybrid',
        names: ['Brandimarte & Hurink FJSP (公开)', 'Gearbox-DynFJSP-30D (自建)'],
        scale: '60组公开标准算例 + 30天真实新能源汽车壳体车间动态事件日志（含2,400次随机扰动）',
        modalities: [
          { label: '真实车间MES工单与扰动日志', percentage: 55 },
          { label: '公开FJSP学术基准算例', percentage: 30 },
          { label: '设备功耗与换模工艺矩阵', percentage: 15 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '历史MES排产事件抽取',
            description: '脱敏提取某新能源动力总成车间连续30天工单到达、返修及设备停机时间戳。',
          },
          {
            step: '02',
            title: '真实换模与能耗矩阵标定',
            description: '结合实测智能电表数据建立不同加工特征间的序列相关换模时间与能耗表。',
          },
          {
            step: '03',
            title: '动态扰动压力测试集生成',
            description: '按泊松分布构建低/中/高三档插单与设备宕机压力基准，与公开算例并轨测试。',
          },
        ],
        summary: '结合公开FJSP经典基准验证最优性下界，并以自建真实动态车间日志考核工业落地抗扰动能力。',
      },
      comparisonMetrics: {
        metricNames: ['OptGapReduction', 'TardinessRate', 'ThroughputGain'],
        primaryMetric: 'OptGapReduction',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'DynHG-Scheduler (本文)', isProposed: true, values: { OptGapReduction: 92.6, TardinessRate: 95.8, ThroughputGain: 18.4 } },
          { method: 'HGNN-PPO (纯DRL)', values: { OptGapReduction: 81.2, TardinessRate: 83.4, ThroughputGain: 11.2 } },
          { method: 'EoH (纯LLM启发式进化)', values: { OptGapReduction: 78.5, TardinessRate: 80.1, ThroughputGain: 9.6 } },
          { method: 'NSGA-II (重调度元启发式)', values: { OptGapReduction: 85.4, TardinessRate: 86.2, ThroughputGain: 13.0 } },
          { method: 'SPT + FIFO 工业默认规则', values: { OptGapReduction: 64.0, TardinessRate: 61.5, ThroughputGain: 0.0 } },
        ],
      },
      ablationStudy: {
        metricName: 'OptGapReduction',
        unit: '%',
        fullModelScore: 92.6,
        items: [
          {
            variant: 'w/o LLM规则演化 (固定人工规则库)',
            removedModule: 'LLM Heuristic Evolver',
            score: 84.3,
            delta: -8.3,
            impactNote: '面对复合能耗与交期冲突约束时适应力显著下降。',
          },
          {
            variant: 'w/o 异构资源边 (降级为同构析取图)',
            removedModule: '夹具/AGV异构节点建模',
            score: 86.1,
            delta: -6.5,
            impactNote: '现场出现隐性AGV堵车与换模死锁，实际可执行率降低。',
          },
          {
            variant: 'w/o 在线上下文切换 (单一最优进化规则)',
            removedModule: 'HGNN动态规则选择器',
            score: 88.9,
            delta: -3.7,
            impactNote: '高负载与低负载时段无法自动切换保守/激进策略。',
          },
        ],
        summary: 'LLM进化出人类难以手工设计的非线性复合规则（+8.3%），而异构图建模确保了调度方案在物理产线上的真可执行性。',
      },
      conclusion:
        '异构图状态感知与大语言模型规则进化形成了“神经直觉+符号规则”双驱动范式，既保有毫秒级重调度速度，又具备跨场景规则迁移能力。',
      futureAndLimitations: {
        paperLimitations: [
          'LLM离线规则进化过程需要约40分钟API/本地推理计算代价，暂不适于在无预热情况下毫秒级从零进化；',
          '尚未纳入人机协作工位中操作员技能疲劳度的随机波动模型。',
        ],
        futureDirections: [
          '结合车间多模态视觉监控，利用VLM实时识别产线在制品拥堵状态直接触发预警重排；',
          '拓展至跨工厂供应链-车间协同级联调度。',
        ],
      },
    },
    comments: [],
  },
  {
    id: 'paper-tpami-2026-mllm-3d',
    title: 'PointMLLM-Inspect: Native 3D Point-Cloud and Multi-View Multimodal LLM for Zero-Shot CAD Metrology and Assembly Verification',
    titleZh: 'PointMLLM-Inspect：原生三维点云与多视角多模态大模型用于零样本CAD尺寸测量与装配验证',
    authors: ['Ruiyang Zhou', 'Qiang Wang', 'Leonidas Guibas'],
    affiliations: ['Stanford University', 'Shanghai AI Lab'],
    journal: 'IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI)',
    journalShort: 'TPAMI',
    journalRank: '计算机顶刊 · SCI Q1 IF 20.8',
    domain: 'computer_science',
    topics: ['Multimodal', 'ComputerVision', 'LLM'],
    publishedDate: daysAgoDate(2),
    syncedAt: hoursAgoIso(30),
    doi: '10.1109/TPAMI.2026.3389012',
    url: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=34',
    sourceOrigin: 'curated',
    weiboSummary:
      '【计算机顶刊 IEEE TPAMI】多模态大模型通常只懂2D像素不懂真实三维公差！本文打通高精度激光扫描点云、多视角图像与B-Rep CAD工程图语义，实现零样本装配错漏装检测与形位公差推理，F1达到92.4%！',
    keyHighlightMetric: '零样本装配错检 F1 92.4% · 尺度误差 < 0.08mm',
    tags: ['3D点云大模型', '多模态LLM', 'CAD检验', '计算机视觉', '智能质检'],
    likes: 211,
    isLiked: false,
    isBookmarked: false,
    reposts: 54,
    anatomy: {
      background:
        '航空发动机管路、精密变速箱与风电齿轮箱装配后，需对比实测三维激光扫描点云与原始三维CAD模型以排查漏装垫片、螺栓错位、形位超差等缺陷。传统人工三坐标测量耗时极长。',
      problem:
        '现有2D多模态大模型（GPT-4V、Qwen2-VL）缺乏真实公制尺度感（Metric Scale）和三维遮挡空间推理能力；而纯3D点云网络（如PointNet++）缺乏工程语义理解，无法读懂“基准面A平行度要求0.05mm”等复杂图纸语言指令。',
      currentStatus:
        '现有PointLLM、ShapeLLM等3D多模态模型主要面向日常家具（ShapeNet/Objaverse）做粗粒度分类或问答，点云采样仅1024~8192点，完全丢失工业紧固件与倒角特征所需的亚毫米几何细节。',
      limitationsOfPriorWork:
        '1. 稀疏点云下采样抹除了小尺寸螺钉、卡簧等关键装配特征；\n2. 缺乏CAD B-Rep拓扑特征与实测扫描点云的跨模态精细对齐；\n3. 无法同时输出“自然语言诊断结论 + 3D空间误差热力定位框”。',
      proposedMethod:
        '提出 PointMLLM-Inspect：(1) 设计层级尺度感知点云分词器（Scale-Aware Hierarchical Point Tokenizer），保留真实毫米级坐标尺度编码并支持百万级局部高密点云裁剪聚焦；(2) 构建CAD-Scan双向交叉注意力对齐层；(3) 训练多任务指令微调头，联合输出装配完整性判断、3D边界框定位与GD&T公差合规分析。',
      architectureModules: [
        {
          id: 'p1',
          stage: 'input',
          title: '百万级扫描点云 + CAD + 工艺单',
          subtitle: 'RGB多视角 + 高密点云 + STEP拓扑',
          detail: '同步输入实测点云、多视角高清照以及对应零件标准CAD参照信息。',
        },
        {
          id: 'p2',
          stage: 'encoder',
          title: '尺度感知层级点云编码器',
          subtitle: '绝对毫米坐标嵌入 + 局部自适应加密',
          detail: '摒弃归一化缩放破坏真实尺寸的做法，保留真实公制绝对空间尺度。',
        },
        {
          id: 'p3',
          stage: 'core',
          title: '2D-3D-CAD 跨模态融合桥',
          subtitle: 'Q-Former 几何投影与误差场感知',
          detail: '对齐实测几何与标准CAD拓扑差异，突出错装/缺件异常区域Token。',
        },
        {
          id: 'p4',
          stage: 'fusion',
          title: '工程语义指令大模型',
          subtitle: 'Llama-3.1-8B + 3D定位预测头',
          detail: '协同推理GD&T形位公差规范与局部异常语义解释。',
        },
        {
          id: 'p5',
          stage: 'output',
          title: '3D异常定位与合规质检报告',
          subtitle: '3D BBox + 公差偏差数值分析',
          detail: '精准高亮缺失/错位零件并生成结构化质检放行意见。',
        },
      ],
      experimentalValidation:
        '在ABC-CAD扩展子集、MVTec 3D-AD公开基准以及自建工业复杂装配体数据集（MechAssm-3D）上进行验证，对比GPT-4o多视角拼接、PointLLM、3D-LLM及传统ICP+几何阈值法。',
      dataset: {
        sourceType: 'hybrid',
        names: ['MVTec 3D-AD (公开)', 'ABC-CAD Subset (公开)', 'MechAssm-3D (自建)'],
        scale: '50,000+ 工业CAD-点云配对样本（含320类装配体，覆盖18种典型错漏装模式）',
        modalities: [
          { label: '高精度三维点云与CAD网面', percentage: 50 },
          { label: '多视角同步RGB图像', percentage: 25 },
          { label: '质检问答与GD&T指令对', percentage: 25 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '工业级CAD装配体扰动合成',
            description: '基于公开ABC与工业零件库，程序化注入螺栓漏装、垫片反装、间隙超差等物理合理缺陷并渲染真实传感器噪声点云。',
          },
          {
            step: '02',
            title: '实机蓝光三维扫描采集',
            description: '使用工业蓝光扫描仪（精度0.02mm）实拍120组减速器与阀体装配样本用于真实域检验。',
          },
          {
            step: '03',
            title: '图纸公差指令自动标注',
            description: '从STEP PMI标注中自动解析孔距、同轴度要求，构造百万字规模工程质检QA对。',
          },
        ],
        summary: '结合公开3D工业基准与蓝光实测扫描+程序化CAD扰动构建，兼具大规模多模态预训练覆盖度与真实公制精度。',
      },
      comparisonMetrics: {
        metricNames: ['AssemblyF1', 'ZeroShotAcc', 'GroundingIoU'],
        primaryMetric: 'AssemblyF1',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'PointMLLM-Inspect (本文)', isProposed: true, values: { AssemblyF1: 92.4, ZeroShotAcc: 86.7, GroundingIoU: 78.5 } },
          { method: 'PointLLM-13B', values: { AssemblyF1: 68.3, ZeroShotAcc: 54.2, GroundingIoU: 41.0 } },
          { method: 'GPT-4o (8-View Prompt)', values: { AssemblyF1: 74.1, ZeroShotAcc: 66.8, GroundingIoU: 48.2 } },
          { method: 'ShapeLLM + ICP', values: { AssemblyF1: 79.5, ZeroShotAcc: 69.0, GroundingIoU: 58.6 } },
          { method: 'Classic ICP + Threshold', values: { AssemblyF1: 77.2, ZeroShotAcc: 71.5, GroundingIoU: 64.3 } },
        ],
      },
      ablationStudy: {
        metricName: 'AssemblyF1',
        unit: '%',
        fullModelScore: 92.4,
        items: [
          {
            variant: 'w/o 绝对尺度编码 (单位球归一化)',
            removedModule: 'Scale-Aware Tokenizer',
            score: 80.1,
            delta: -12.3,
            impactNote: '失去真实毫米尺寸概念，无法分辨M6与M8螺栓误装。',
          },
          {
            variant: 'w/o 多视角2D纹理特征',
            removedModule: 'RGB Multi-View Branch',
            score: 87.2,
            delta: -5.2,
            impactNote: '表面标签丝印、色环极性及微弱锈蚀无法仅靠几何点云识别。',
          },
          {
            variant: 'w/o 局部高密聚焦裁剪',
            removedModule: 'Adaptive ROI Refiner',
            score: 85.6,
            delta: -6.8,
            impactNote: '小尺寸卡簧与细牙螺纹特征在全局采样中丢失。',
          },
        ],
        summary: '保留真实公制尺度编码是工业3D大模型区别于通用娱乐3D模型的核心分水岭（+12.3% F1）。',
      },
      conclusion:
        '通过公制尺度保留、高密局部聚焦与2D-3D-CAD三元对齐，多模态大模型首次具备了可靠的工业装配体零样本精检与尺寸推理能力。',
      futureAndLimitations: {
        paperLimitations: [
          '当扫描点云与CAD模型之间缺少粗配准（Rough Registration）初值时，大角度姿态差异会导致特征对比失效；',
          '高反光黑色碳纤维部件的光学点云缺失区域仍依赖2D图像补全推理。',
        ],
        futureDirections: [
          '引入端到端可微SE(3)点云配准头，实现完全无夹具任意摆放质检；',
          '与机器人手眼扫描路径规划联动，主动补扫遮挡死角。',
        ],
      },
    },
    comments: [],
  },
  {
    id: 'paper-tii-2026-cirp-llm-twin',
    title: 'TwinMind: Multimodal Digital Twin Agents Powered by Vision-Language Models for Autonomous Predictive Maintenance',
    titleZh: 'TwinMind：视觉-语言模型驱动的多模态数字孪生智能体用于自主预测性维护',
    authors: ['Lukas Meyer', 'Jing Wang', 'Andrew Kusiak'],
    affiliations: ['RWTH Aachen', 'University of Iowa'],
    journal: 'IEEE Transactions on Industrial Informatics',
    journalShort: 'IEEE TII',
    journalRank: 'SCI Q1 · IF 11.7',
    domain: 'manufacturing',
    topics: ['Multimodal', 'LLM', 'EmbodiedAI'],
    publishedDate: daysAgoDate(2),
    syncedAt: hoursAgoIso(36),
    doi: '10.1109/TII.2026.3410923',
    url: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=9424',
    sourceOrigin: 'curated',
    weiboSummary:
      '【工业信息顶刊 IEEE TII】将工业红外热像、声学时频谱与数字孪生3D仿真体接入多模态Agent，构建闭环自主预测性维护系统TwinMind，在风电齿轮箱与SMT贴片机产线将非计划停机时间降低41.3%！',
    keyHighlightMetric: '非计划停机降低 41.3% · 误报率下降 58%',
    tags: ['数字孪生', '多模态智能体', '预测性维护', '热成像视觉', '工业大模型'],
    likes: 142,
    isLiked: false,
    isBookmarked: false,
    reposts: 28,
    anatomy: {
      background:
        '复杂连续产线（如新能源电池极片涂布、SMT高速贴片、风电传动系统）的运维依赖分散的SCADA波形告警、巡检红外热像和维修经验，告警风暴频发且缺乏自主排障规划能力。',
      problem:
        '传统基于单一振动信号的剩余寿命预测（RUL）模型缺乏上下文语义理解，无法区分“真实轴承剥落”与“周边重型行车经过导致的瞬时共振”；同时，维护决策仍需人工翻阅海量图纸与备件库，响应周期长。',
      currentStatus:
        '现有数字孪生平台多停留在三维可视化与物理仿真，与大模型Agent之间缺少标准化的“物理仿真推演接口”，Agent无法通过调用数字孪生沙盒验证自己的维护策略是否可行。',
      limitationsOfPriorWork:
        '1. 缺少融合红外热像、高频声学梅尔谱与数字孪生状态的多模态联合推理；\n2. 传统Agent直接执行维护指令缺乏虚拟仿真“事前推演校验”；\n3. 缺少长周期真实产线停机记录评估验证。',
      proposedMethod:
        '提出 TwinMind 多模态孪生智能体系统：(1) 多模态传感器编码器将红外热像、CWT时频图及SCADA趋势统一对齐至VLM输入；(2) 构建“数字孪生沙盒工具链（Twin-Sandbox Tools）”，允许LLM Agent在虚拟孪生体上推演降载运行或停机检修的生产代价；(3) 多智能体协作生成最优检修窗口与备件调度单。',
      architectureModules: [
        {
          id: 't1',
          stage: 'input',
          title: '跨模态产线感知矩阵',
          subtitle: '红外热像 + 声振时频图 + SCADA',
          detail: '将非视觉时序信号转化为小波时频图像，与热像视觉流并行输入。',
        },
        {
          id: 't2',
          stage: 'encoder',
          title: '多模态异常感知VLM',
          subtitle: '时空融合注意 · 虚假告警过滤',
          detail: '联合环境上下文区分环境干扰与真实机电退化特征。',
        },
        {
          id: 't3',
          stage: 'core',
          title: '数字孪生沙盒推演引擎',
          subtitle: 'Tool-Calling 调用物理降级仿真',
          detail: 'Agent主动调用仿真API预测未来72小时载荷-温度-寿命演化曲线。',
        },
        {
          id: 't4',
          stage: 'fusion',
          title: '维护决策规划Agent',
          subtitle: '成本-风险双目标动态权衡',
          detail: '结合订单交期与备件库存制定最优检修时段与降速保产方案。',
        },
        {
          id: 't5',
          stage: 'output',
          title: '闭环工单与交互式孪生看板',
          subtitle: 'ERP备件锁定 + AR巡检指引',
          detail: '自动生成维修SOP并通过交互界面向值班工程师推送验证报告。',
        },
      ],
      experimentalValidation:
        '在公开CWRU/XJTU-SY轴承数据集、自建SMT产线多模态巡检数据集以及某海上风电集群6个月历史运维日志上进行对比实验，验证故障确诊率、误报抑制率、RUL预测RMSE以及停机经济损失缩减率。',
      dataset: {
        sourceType: 'hybrid',
        names: ['XJTU-SY Bearing (公开)', 'SMT-MultiModal-Maint (自建)'],
        scale: '15组公开全寿命周期轴承 + 18,900组自建热像/声振/工单多模态运维事件',
        modalities: [
          { label: '小波时频图与振动声学波形', percentage: 45 },
          { label: '工业巡检红外热成像', percentage: 30 },
          { label: 'ERP工单与数字孪生状态日志', percentage: 25 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '多物理场传感器时间同步',
            description: '通过IEEE 1588 PTP协议对产线红外相机、声学阵列与PLC信号进行亚毫秒对齐。',
          },
          {
            step: '02',
            title: '物理退化反演标注',
            description: '将事后拆解确认的零件损伤等级反向标注至前序72小时监控窗口。',
          },
        ],
        summary: '结合标准轴承公开集与真实产线红外+声学+工单多模态实测集，验证跨工况与真实业务闭环收益。',
      },
      comparisonMetrics: {
        metricNames: ['DiagAccuracy', 'FalseAlarmSuppression', 'DowntimeReduction'],
        primaryMetric: 'DiagAccuracy',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'TwinMind (本文)', isProposed: true, values: { DiagAccuracy: 95.3, FalseAlarmSuppression: 94.1, DowntimeReduction: 41.3 } },
          { method: 'Multimodal Transformer', values: { DiagAccuracy: 88.7, FalseAlarmSuppression: 81.2, DowntimeReduction: 24.5 } },
          { method: 'LLM-Agent (无孪生沙盒)', values: { DiagAccuracy: 85.9, FalseAlarmSuppression: 76.4, DowntimeReduction: 21.0 } },
          { method: 'ResNet-LSTM (单振动)', values: { DiagAccuracy: 83.2, FalseAlarmSuppression: 68.5, DowntimeReduction: 16.8 } },
        ],
      },
      ablationStudy: {
        metricName: 'DowntimeReduction',
        unit: '%',
        fullModelScore: 41.3,
        items: [
          {
            variant: 'w/o 数字孪生沙盒推演',
            removedModule: 'Twin-Sandbox Tool-Calling',
            score: 26.8,
            delta: -14.5,
            impactNote: 'Agent倾向于保守立即停机，无法量化降载保产安全窗口。',
          },
          {
            variant: 'w/o 红外热像模态',
            removedModule: 'Thermal Vision Encoder',
            score: 33.4,
            delta: -7.9,
            impactNote: '早期润滑失效与电气接触过热识别滞后约18小时。',
          },
        ],
        summary: '数字孪生仿真沙盒赋予大模型物理反事实推演能力，是大幅降低非计划停机的核心机制（+14.5%收益）。',
      },
      conclusion:
        '“多模态VLM感知 + 数字孪生工具调用”打通了工业运维从感知告警到经济最优决策的最后一公里。',
      futureAndLimitations: {
        paperLimitations: [
          '数字孪生高保真有限元热仿真单次调用需约12秒，高频紧急保护仍需下沉至PLC硬件连锁；',
          '老旧机台缺乏数字孪生几何模型时构建前置成本较高。',
        ],
        futureDirections: [
          '引入神经算子（Physics-Informed Neural Operator）替代传统有限元加速沙盒推演至毫秒级；',
          '联动具身巡检机器狗实现自主抵近复核与应急开关操作。',
        ],
      },
    },
    comments: [],
  },
  {
    id: 'paper-neurips-2026-kg-rag',
    title: 'NeuroGraph-Reasoner: End-to-End Differentiable Subgraph Planning for Multi-Hop Knowledge Graph Reasoning with LLMs',
    titleZh: 'NeuroGraph-Reasoner：面向大模型多跳知识图谱推理的端到端可微子图规划',
    authors: ['Jure Leskovec', 'Shirui Pan', 'Haoyu Wang'],
    affiliations: ['Stanford University', 'Griffith University'],
    journal: 'Advances in Neural Information Processing Systems (NeurIPS)',
    journalShort: 'NeurIPS',
    journalRank: '人工智能顶会 · CCF-A Spotlight',
    domain: 'computer_science',
    topics: ['KnowledgeGraph', 'LLM'],
    publishedDate: daysAgoDate(3),
    syncedAt: hoursAgoIso(52),
    doi: '10.48550/arXiv.2611.03108',
    url: 'https://neurips.cc/',
    sourceOrigin: 'curated',
    weiboSummary:
      '【AI顶会 NeurIPS Spotlight】解决大模型+知识图谱多跳推理中“BFS路径爆炸、Token开销巨大”的共性难题！提出可微子图路径规划器，在WebQSP与工业材料KGQA上Hit@1达91.8%，推理Token消耗直降73%！',
    keyHighlightMetric: '多跳Hit@1 91.8% · Token消耗降 73%',
    tags: ['知识图谱推理', 'Neuro-Symbolic', '可微图规划', 'LLM', 'NeurIPS'],
    likes: 198,
    isLiked: false,
    isBookmarked: false,
    reposts: 62,
    anatomy: {
      background:
        '将结构化知识图谱（KG）与大语言模型结合已成为高可靠科学发现、医疗诊断与智能制造决策的主流技术范式。然而真实工业与科学知识图谱常包含千万级三元组，如何从中高效筛选相关多跳推理路径是核心挑战。',
      problem:
        '现有LLM+KG推理方法（如ToG、RoG）依赖大模型在每一跳逐一调用API做离散分支选择，导致：(1) 3跳以上搜索呈指数级Token开销爆炸；(2) 早期一步剪枝错误无法梯度回传修正，长程多跳准确率急剧下滑。',
      currentStatus:
        'GNN与LLM结合主要处于“松耦合”阶段：先用固定GNN跑出候选实体再喂给LLM总结，GNN的检索目标与LLM最终答案生成目标存在严重的优化脱节。',
      limitationsOfPriorWork:
        '1. 离散路径搜索不可微，难以端到端联合优化；\n2. 长尾稀疏关系上LLM容易偏航，生成图谱中不存在的伪路径；\n3. 缺少在超大规模科学/工程图谱下的延迟与显存基准评测。',
      proposedMethod:
        '提出 NeuroGraph-Reasoner：(1) 构建连续松弛的端到端可微子图规划器（Differentiable Subgraph Planner），利用Gumbel-Softmax与GNN消息传递并行计算3~5跳路径概率分布；(2) 通过软剪枝桥接层将高置信推理链压缩为紧凑结构化Token；(3) 使用LLM答案交叉熵梯度反向联合微调子图规划网络。',
      architectureModules: [
        {
          id: 'n1',
          stage: 'input',
          title: '复杂多跳自然语言问题',
          subtitle: '问题实体链接 + 关系意图解析',
          detail: '定位图谱初始锚点实体并编码问题语义向量。',
        },
        {
          id: 'n2',
          stage: 'encoder',
          title: '可微多跳子图扩散器',
          subtitle: 'NBFNet变体 + Gumbel-Softmax路由',
          detail: '一次前向传播并行探索4跳邻域，输出路径置信度权重。',
        },
        {
          id: 'n3',
          stage: 'core',
          title: '稀疏拓扑路径剪枝器',
          subtitle: 'Top-K 紧凑因果子图提取',
          detail: '过滤92%冗余邻居节点，仅保留最高信息熵的结构化推理链。',
        },
        {
          id: 'n4',
          stage: 'fusion',
          title: '神经-符号联合梯度微调',
          subtitle: 'LLM生成损失反传优化图检索',
          detail: '端到端打通“图检索-语言推理”双模块梯度流。',
        },
        {
          id: 'n5',
          stage: 'output',
          title: '可验证多跳答案与路径链',
          subtitle: '低Token开销 + 100%可溯源',
          detail: '输出最终实体答案并附带严格的图谱跳数证明路径。',
        },
      ],
      experimentalValidation:
        '在WebQSP、CWQ、MetaQA三大经典KGQA公开基准及材料科学领域图谱MatKG-MultiHop上评测，同时对比ToG、RoG、G-Retriever及直接长上下文GPT-4o的准确率、延迟与Token成本。',
      dataset: {
        sourceType: 'public',
        names: ['WebQSP (公开)', 'ComplexWebQuestions / CWQ (公开)', 'MatKG-Benchmark (公开)'],
        scale: '4,737 (WebQSP) + 34,689 (CWQ) + 12,000 材料多跳问答对（依托Freebase与MatKG千万级三元组底座）',
        modalities: [
          { label: '千万级大规模图谱三元组', percentage: 70 },
          { label: '多跳复杂逻辑问答对', percentage: 30 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '公开图谱统一CSR索引构建',
            description: '将Freebase子图与MatKG转换为压缩稀疏行格式以支持GPU毫秒级邻域扩散。',
          },
          {
            step: '02',
            title: '3~5跳长程测试集分层抽样',
            description: '从CWQ与MatKG中专门筛选需3跳以上联合交并集推理的难题，检验防坍缩能力。',
          },
        ],
        summary: '完全基于国际权威公开KGQA基准（WebQSP、CWQ、MatKG）评估，确保与社区最新SOTA方法绝对公平对比。',
      },
      comparisonMetrics: {
        metricNames: ['WebQSP_Hit1', 'CWQ_Hit1', 'TokenEfficiency'],
        primaryMetric: 'WebQSP_Hit1',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'NeuroGraph-Reasoner (本文)', isProposed: true, values: { WebQSP_Hit1: 91.8, CWQ_Hit1: 76.4, TokenEfficiency: 93.5 } },
          { method: 'RoG (ICLR 2024)', values: { WebQSP_Hit1: 85.7, CWQ_Hit1: 62.6, TokenEfficiency: 71.0 } },
          { method: 'ToG (Think-on-Graph)', values: { WebQSP_Hit1: 82.6, CWQ_Hit1: 68.9, TokenEfficiency: 42.5 } },
          { method: 'G-Retriever (NeurIPS 2024)', values: { WebQSP_Hit1: 86.4, CWQ_Hit1: 65.1, TokenEfficiency: 78.2 } },
        ],
      },
      ablationStudy: {
        metricName: 'CWQ_Hit1',
        unit: '%',
        fullModelScore: 76.4,
        items: [
          {
            variant: 'w/o 端到端梯度联合反传',
            removedModule: 'LLM-to-GNN Gradient Bridge',
            score: 69.1,
            delta: -7.3,
            impactNote: '图检索与大模型语言偏好脱节，复杂约束问题容易漏召回。',
          },
          {
            variant: 'w/o 拓扑路径压缩 (直接平铺三元组)',
            removedModule: 'Structured Path Linearizer',
            score: 72.5,
            delta: -3.9,
            impactNote: 'Token长度膨胀3.8倍且大模型注意力受中间无关边分散。',
          },
        ],
        summary: '端到端联合微调是突破复杂多跳（CWQ +7.3%）瓶颈的核心，同时大幅削减推理成本。',
      },
      conclusion:
        '通过连续可微子图规划替代大模型昂贵的离散逐步试错搜索，在大幅提升多跳推理精度的同时降低了73%的Token消耗。',
      futureAndLimitations: {
        paperLimitations: [
          '千万级节点图谱的端到端GNN训练仍需单卡80GB显存进行整图或大子图批采样；',
          '对于带有时序演化区间（如“2020年至2024年间生效的工艺标准”）的动态时态图尚需扩展时间编码。',
        ],
        futureDirections: [
          '探索与制造工艺知识图谱结合，支持动态配方与材料工艺路线逆向设计；',
          '研究百万级流式增量图谱下的免重训在线适应机制。',
        ],
      },
    },
    comments: [],
  },
  {
    id: 'paper-ijmtm-2026-cv-laser',
    title: 'MeltVision-3D: High-Speed Event-Camera and Multimodal Physics-Informed Vision for Laser Powder Bed Fusion Porosity Prediction',
    titleZh: 'MeltVision-3D：高速事件相机与物理信息多模态视觉用于激光选区熔化增材制造孔隙率在线预测',
    authors: ['Tianyu Zhao', 'Kun Zhou', 'Yong Huang'],
    affiliations: ['Nanyang Technological University', 'University of Florida'],
    journal: 'International Journal of Machine Tools and Manufacture',
    journalShort: 'IJMTM',
    journalRank: '制造领域顶刊 · SCI Q1 IF 14.0',
    domain: 'manufacturing',
    topics: ['ComputerVision', 'Multimodal'],
    publishedDate: daysAgoDate(3),
    syncedAt: hoursAgoIso(60),
    doi: '10.1016/j.ijmachtools.2026.104192',
    url: 'https://www.sciencedirect.com/journal/international-journal-of-machine-tools-and-manufacture',
    sourceOrigin: 'curated',
    weiboSummary:
      '【制造权威 IJMTM】金属3D打印（LPBF）熔池飞溅和匙孔坍塌发生在微秒级，普通工业相机直接运动模糊！本文首次将神经拟态事件相机（Event Camera）+红外同轴视觉+热传导PDE约束融入时空Vision Transformer，层间微孔隙定位AUC达97.1%！',
    keyHighlightMetric: '微孔隙预测 AUC 97.1% · 微秒级飞溅追踪',
    tags: ['金属增材制造', '事件相机', '计算机视觉', '熔池监控', 'PINN'],
    likes: 156,
    isLiked: false,
    isBookmarked: true,
    reposts: 41,
    anatomy: {
      background:
        '激光粉末床熔融（LPBF）是航空发动机空心涡轮叶片等复杂构件的核心制造技术，但加工过程中匙孔（Keyhole）失稳极易在零件内部留下微米级气孔，严重削弱疲劳寿命，传统事后CT无损检测成本高昂且无法层间干预。',
      problem:
        '传统高速CMOS相机在10kHz以上采样时数据带宽爆炸且极易受激光等离子体羽辉过曝致盲；而低帧率相机（<1kHz）完全无法捕捉激光扫描速度（1~2 m/s）下的微秒级熔池飞溅与匙孔震荡动力学特征。',
      currentStatus:
        '现有熔池监控多基于光电二极管（单点光强，无空间形态）或传统高速相机CNN分类，特征提取纯靠数据驱动，跨激光功率/扫描速度工艺窗口迁移时性能断崖式下降。',
      limitationsOfPriorWork:
        '1. 高动态范围（HDR）不足，强激光羽辉淹没熔池边缘几何细节；\n2. 纯视觉CNN缺乏激光能量密度与热扩散物理偏微分方程约束；\n3. 缺少“微秒事件流-同轴红外-微米CT真值”像素级空间配准数据集。',
      proposedMethod:
        '提出 MeltVision-3D：(1) 引入120dB高动态范围神经拟态事件相机与同轴近红外相机组成异构双目视觉系统，异步捕捉微秒级飞溅粒子轨迹与熔池稳态轮廓；(2) 构建时空脉冲-帧融合Vision Transformer（Spike-Frame ViT）；(3) 在潜特征层嵌入Rosenthal热传导物理损失函数（PINN-Loss），预测每一层体素的微孔隙生成概率。',
      architectureModules: [
        {
          id: 'l1',
          stage: 'input',
          title: '神经拟态事件流 + 同轴红外',
          subtitle: '1μs分辨率事件流 + 2kHz近红外帧',
          detail: '事件相机抗强光过曝捕捉高速飞溅，同轴相机记录熔池温度场分布。',
        },
        {
          id: 'l2',
          stage: 'encoder',
          title: '时空体素编码与帧对齐器',
          subtitle: 'Event-VoxelNet + 振镜坐标投影',
          detail: '将异步事件脉冲与激光振镜实时坐标映射至零件三维CAD层间坐标系。',
        },
        {
          id: 'l3',
          stage: 'core',
          title: '跨模态脉冲-视觉Transformer',
          subtitle: 'Cross-Attention 动态羽辉抑制',
          detail: '分离飞溅干扰与真实熔池匙孔剧烈波动特征。',
        },
        {
          id: 'l4',
          stage: 'fusion',
          title: '物理信息热力学约束头',
          subtitle: 'Rosenthal传热方程正则化',
          detail: '强制特征演化符合局部能量密度与凝固冷却速率物理定律。',
        },
        {
          id: 'l5',
          stage: 'output',
          title: '三维体素级孔隙图谱重构',
          subtitle: '层间实时缺陷预警 + 重熔指令',
          detail: '在下一层铺粉前150ms内定位潜在气孔坐标并触发激光局域重熔修复。',
        },
      ],
      experimentalValidation:
        '在EOS M290金属增材装备上打印Ti-6Al-4V与Inconel 718多组变工艺参数试样，打印后全部送检工业Micro-CT（体素分辨率8μm）获取三维真实孔隙分布作为真值，验证跨材料、跨工艺窗口的体素级预测AUC与IoU。',
      dataset: {
        sourceType: 'self_built',
        names: ['LPBF-EventCT-3D (本文自建)'],
        scale: '28个金属试样 × 450层完整过程流（1.8 TB事件-红外同步流 + 对应8μm Micro-CT三维真值）',
        modalities: [
          { label: '异步神经拟态事件流', percentage: 45 },
          { label: '同轴近红外热辐射图像', percentage: 30 },
          { label: 'Micro-CT三维体素分割真值', percentage: 25 },
        ],
        constructionSteps: [
          {
            step: '01',
            title: '多工艺窗口阶梯试样打印',
            description: '设计涵盖未熔合（低能量密度）与匙孔气孔（高能量密度）的16组正交激光参数块。',
          },
          {
            step: '02',
            title: '事件-振镜-光学标定同步',
            description: '利用FPGA硬件触发将振镜XY坐标、事件时间戳与红外相机帧精准锁定在±2μs内。',
          },
          {
            step: '03',
            title: '基于基准孔特征的CT三维配准',
            description: '在试样边缘打印特定几何标记孔，实现打印过程二维监测层与事后三维CT体素的亚像素刚性配准。',
          },
        ],
        summary: '高难度硬核自建多模态制造视觉数据集，首次打通“微秒级事件相机监测”与“8μm Micro-CT三维物理真值”的逐体素对齐。',
      },
      comparisonMetrics: {
        metricNames: ['VoxelAUC', 'CrossAlloyF1', 'InferenceSpeedFPS'],
        primaryMetric: 'VoxelAUC',
        unit: '%',
        higherIsBetter: true,
        rows: [
          { method: 'MeltVision-3D (本文)', isProposed: true, values: { VoxelAUC: 97.1, CrossAlloyF1: 91.4, InferenceSpeedFPS: 88.0 } },
          { method: 'High-Speed CMOS ViT', values: { VoxelAUC: 88.4, CrossAlloyF1: 74.2, InferenceSpeedFPS: 42.0 } },
          { method: 'Photodiode + 1D-ResNet', values: { VoxelAUC: 82.1, CrossAlloyF1: 68.5, InferenceSpeedFPS: 95.0 } },
          { method: 'Event-Only SpikingCNN', values: { VoxelAUC: 90.3, CrossAlloyF1: 81.9, InferenceSpeedFPS: 92.0 } },
        ],
      },
      ablationStudy: {
        metricName: 'CrossAlloyF1',
        unit: '%',
        fullModelScore: 91.4,
        items: [
          {
            variant: 'w/o 物理热传导PINN约束',
            removedModule: 'Rosenthal Physics Loss',
            score: 81.2,
            delta: -10.2,
            impactNote: '从Ti64迁移至Inconel 718高温合金时过拟合，泛化率暴跌。',
          },
          {
            variant: 'w/o 神经拟态事件相机流',
            removedModule: 'Event-Voxel Branch',
            score: 83.7,
            delta: -7.7,
            impactNote: '强羽辉下高能匙孔边缘丢失，飞溅与真孔隙难以区分。',
          },
        ],
        summary: '物理信息约束（PINN-Loss）直接支撑了跨合金材质泛化（+10.2%），事件相机则攻克了高反强光过曝难题。',
      },
      conclusion:
        '神经拟态事件视觉与热力学物理约束的结合，使金属3D打印在线无损质量监控迈入微秒级实时体素闭环时代。',
      futureAndLimitations: {
        paperLimitations: [
          '目前多激光（4光束/8光束）同时扫描时的事件流交叉重叠解析尚未验证；',
          '事件相机侧视安装角度对大型基板远端区域存在轻微透视遮挡。',
        ],
        futureDirections: [
          '扩展至多激光协同增材装备的同轴分光事件监测架构；',
          '结合强化学习实现逐层逐区域的激光功率闭环动态重熔修复。',
        ],
      },
    },
    comments: [],
  },
];
