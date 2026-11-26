import React, { useMemo, useState } from 'react';
import { BookOpenCheck, Compass, Flame, GitBranch, Network, Share2, Users } from 'lucide-react';
import type { AcademicPaper, ResearchTopic } from '../types/paper';
import { TOPIC_META } from '../lib/constants';
import type { LabAnalysisResult } from '../lib/labAnalysis';
import { DynamicKnowledgeGraph, type KnowledgeGraphLink, type KnowledgeGraphNode, type GraphLegendItem } from './DynamicKnowledgeGraph';
import { MATLAB_COLORS, parulaColor } from './MatlabCharts';

type LabGraphMode = 'heterogeneous' | 'coauthor' | 'social_clusters' | 'keywords' | 'frontier';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export const LabTopicGraph: React.FC<{
  analysis: LabAnalysisResult;
  darkMode: boolean;
  onOpen: (p: AcademicPaper) => void;
  onFilterByAuthor?: (author: string) => void;
  onFilterByKeyword?: (kw: string) => void;
  onFilterByTopic?: (topic: ResearchTopic) => void;
}> = ({ analysis, darkMode, onOpen, onFilterByAuthor, onFilterByKeyword, onFilterByTopic }) => {
  const [mode, setMode] = useState<LabGraphMode>('heterogeneous');

  const minYear = Math.min(...analysis.years, 2023);
  const maxYear = Math.max(...analysis.years, 2027);
  const spanYear = Math.max(1, maxYear - minYear);

  const graphData = useMemo(() => {
    const nodes: KnowledgeGraphNode[] = [];
    const links: KnowledgeGraphLink[] = [];
    let legend: GraphLegendItem[] = [];
    let title = '';
    let subtitle = '';

    if (mode === 'heterogeneous') {
      title = '课题组全景知识图谱';
      subtitle = '研究方向 — 成果论文 — 核心热词动态力导向关联';
      legend = [
        { group: 'topic', label: '研究方向枢纽', color: MATLAB_COLORS[3], shape: 'hex' },
        { group: 'paper_new', label: '2026-2027 前沿成果', color: MATLAB_COLORS[1], shape: 'circle' },
        { group: 'paper_mid', label: '2025 核心成果', color: MATLAB_COLORS[0], shape: 'circle' },
        { group: 'paper_base', label: '2023-2024 基石成果', color: MATLAB_COLORS[4], shape: 'circle' },
        { group: 'keyword', label: '高频合并热词', color: MATLAB_COLORS[2], shape: 'diamond' },
      ];

      // Top Topics
      const topTopics = analysis.topics.slice(0, 8);
      topTopics.forEach(([t, cnt]) => {
        nodes.push({
          id: `t:${t}`,
          label: (TOPIC_META[t]?.label || t).replace(/\s*\(.*?\)/, ''),
          subLabel: `${cnt} 篇课题组论文`,
          group: 'topic',
          color: MATLAB_COLORS[3],
          radius: 19 + Math.min(10, Math.sqrt(cnt) * 3.5),
          shape: 'hex',
          badge: String(cnt),
          meta: { kind: 'topic', topic: t, count: cnt },
        });
      });

      // Papers
      analysis.papers.forEach((p, idx) => {
        const yr = analysis.paperYearById.get(p.id) || Number((p.publishedDate || '').slice(0, 4)) || 2025;
        const color = yr >= 2026 ? MATLAB_COLORS[1] : yr === 2025 ? MATLAB_COLORS[0] : MATLAB_COLORS[4];
        nodes.push({
          id: `p:${p.id}`,
          label: cut(p.titleZh || p.title, 12),
          subLabel: `${yr} · ${p.journalShort}`,
          group: yr >= 2026 ? 'paper_new' : yr === 2025 ? 'paper_mid' : 'paper_base',
          color,
          radius: 14,
          shape: 'circle',
          badge: String(idx + 1),
          meta: { kind: 'paper', paper: p, year: yr },
        });
        for (const [t] of topTopics) {
          if ((p.topics || []).includes(t)) {
            links.push({
              id: `pt:${p.id}->${t}`,
              source: `p:${p.id}`,
              target: `t:${t}`,
              weight: 1.5,
              color: MATLAB_COLORS[3],
            });
          }
        }
      });

      // Top 12 Deduplicated Bilingual Keywords
      const topKws = analysis.canonicalKeywords.slice(0, 12);
      topKws.forEach((kw) => {
        nodes.push({
          id: `k:${kw.info.id}`,
          label: kw.info.shortLabel,
          subLabel: `${kw.info.label} · ${kw.count} 篇`,
          group: 'keyword',
          color: MATLAB_COLORS[2],
          radius: 13 + Math.min(7, kw.count),
          shape: 'diamond',
          meta: { kind: 'keyword', kw },
        });
        for (const p of kw.papers) {
          links.push({
            id: `pk:${p.id}->${kw.info.id}`,
            source: `p:${p.id}`,
            target: `k:${kw.info.id}`,
            weight: 1.1,
            color: MATLAB_COLORS[2],
            dashed: true,
          });
        }
      });
    } else if (mode === 'coauthor') {
      title = '作者协作力导向网络';
      subtitle = '共同署名合作强度与核心学术枢纽';
      legend = [
        { group: 'pi', label: '课题组核心导师 / 通讯枢纽', color: MATLAB_COLORS[1], shape: 'hex' },
        { group: 'lead', label: '主力一作研究者', color: MATLAB_COLORS[0], shape: 'circle' },
        { group: 'member', label: '合作成员与外部合作者', color: MATLAB_COLORS[4], shape: 'circle' },
      ];

      const topAuthors = analysis.canonicalAuthors.slice(0, 22);
      const idSet = new Set(topAuthors.map((a) => a.info.id));

      topAuthors.forEach((a) => {
        const isPi = a.correspondingCount >= 3 || a.count >= 12;
        const isLead = !isPi && (a.firstAuthorCount >= 1 || a.count >= 4);
        nodes.push({
          id: `a:${a.info.id}`,
          label: a.info.shortName,
          subLabel: `${a.info.displayName} · ${a.count} 篇`,
          group: isPi ? 'pi' : isLead ? 'lead' : 'member',
          color: isPi ? MATLAB_COLORS[1] : isLead ? MATLAB_COLORS[0] : MATLAB_COLORS[4],
          radius: 14 + Math.sqrt(a.count) * 4.2,
          shape: isPi ? 'hex' : 'circle',
          badge: String(a.count),
          meta: { kind: 'author', stat: a },
        });
      });

      analysis.coauthors.forEach((e) => {
        if (!idSet.has(e.sourceId) || !idSet.has(e.targetId)) return;
        links.push({
          id: `ca:${e.sourceId}-${e.targetId}`,
          source: `a:${e.sourceId}`,
          target: `a:${e.targetId}`,
          weight: e.weight,
          label: `合作 ${e.weight} 篇`,
          color: e.weight >= 4 ? MATLAB_COLORS[1] : MATLAB_COLORS[0],
          animated: e.weight >= 6,
        });
      });
    } else if (mode === 'social_clusters') {
      title = '作者社交属性与研发子群图谱';
      subtitle = '按主攻工业场景聚类，展示枢纽导师、跨方向桥梁与子团队分工关联';
      const domColorMap = new Map<string, string>(
        analysis.domainAxes.map((ax, i) => [ax.id, MATLAB_COLORS[i % MATLAB_COLORS.length]])
      );
      legend = analysis.domainAxes.map((ax) => ({
        group: ax.id,
        label: ax.shortLabel,
        color: domColorMap.get(ax.id) || MATLAB_COLORS[0],
        shape: 'circle',
      }));

      const topAuthors = analysis.canonicalAuthors.slice(0, 22);
      const idSet = new Set(topAuthors.map((a) => a.info.id));

      // Domain cluster anchors in a clean ring
      const domAnchors = new Map<string, { x: number; y: number }>();
      analysis.domainAxes.forEach((ax, i) => {
        const ang = (i / Math.max(analysis.domainAxes.length, 1)) * Math.PI * 2 - Math.PI / 2;
        domAnchors.set(ax.id, { x: 490 + Math.cos(ang) * 245, y: 270 + Math.sin(ang) * 155 });
      });

      topAuthors.forEach((a) => {
        const anchor = domAnchors.get(a.primaryDomainId) || { x: 490, y: 270 };
        const isHub = a.socialRole === '枢纽导师';
        const isBridge = a.socialRole === '跨方向桥梁';
        nodes.push({
          id: `a:${a.info.id}`,
          label: a.info.shortName,
          subLabel: `${a.socialRole} · 合作${a.coauthorDegree}人 · 发文${a.count}篇`,
          group: a.primaryDomainId,
          color: domColorMap.get(a.primaryDomainId) || MATLAB_COLORS[0],
          radius: 14 + Math.sqrt(a.coauthorDegree + a.count) * 3.1,
          shape: isHub ? 'hex' : isBridge ? 'diamond' : 'circle',
          badge: String(a.coauthorDegree),
          targetX: isHub ? 490 : anchor.x,
          targetY: isHub ? 270 : anchor.y,
          meta: { kind: 'author', stat: a },
        });
      });

      analysis.coauthors.forEach((e) => {
        if (!idSet.has(e.sourceId) || !idSet.has(e.targetId)) return;
        const sa = topAuthors.find((x) => x.info.id === e.sourceId);
        const ta = topAuthors.find((x) => x.info.id === e.targetId);
        const crossCluster = sa && ta && sa.primaryDomainId !== ta.primaryDomainId;
        links.push({
          id: `sc:${e.sourceId}-${e.targetId}`,
          source: `a:${e.sourceId}`,
          target: `a:${e.targetId}`,
          weight: e.weight,
          label: crossCluster ? `跨群合作 ${e.weight} 篇` : `组内合作 ${e.weight} 篇`,
          color: crossCluster ? MATLAB_COLORS[1] : domColorMap.get(sa?.primaryDomainId || '') || MATLAB_COLORS[0],
          dashed: Boolean(crossCluster),
          animated: Boolean(crossCluster && e.weight >= 3),
        });
      });
    } else if (mode === 'keywords') {
      title = '热词共现与演进图谱';
      subtitle = '节点大小对应频次，Parula色带映射活跃年份（2023→2027）';
      legend = [
        { group: 'y23', label: '2023-2024 早期基石概念', color: parulaColor(0.12), shape: 'circle' },
        { group: 'y25', label: '2025 融合演进概念', color: parulaColor(0.52), shape: 'circle' },
        { group: 'y27', label: '2026-2027 最新前沿热词', color: parulaColor(0.92), shape: 'circle' },
      ];

      const topKws = analysis.canonicalKeywords.slice(0, 24);
      const idSet = new Set(topKws.map((k) => k.info.id));

      topKws.forEach((kw) => {
        const t = (kw.avgYear - minYear) / spanYear;
        nodes.push({
          id: `k:${kw.info.id}`,
          label: kw.info.shortLabel,
          subLabel: `${kw.info.label} · 均年 ${kw.avgYear.toFixed(1)}`,
          group: t < 0.35 ? 'y23' : t < 0.7 ? 'y25' : 'y27',
          color: parulaColor(t),
          radius: 15 + Math.sqrt(kw.count) * 4,
          shape: kw.info.category === 'paradigm' ? 'hex' : 'circle',
          badge: String(kw.count),
          meta: { kind: 'keyword', kw },
        });
      });

      analysis.keywordCooccurrence.forEach((e) => {
        if (!idSet.has(e.sourceId) || !idSet.has(e.targetId)) return;
        if (e.weight < 2 && links.length > 48) return;
        links.push({
          id: `kc:${e.sourceId}-${e.targetId}`,
          source: `k:${e.sourceId}`,
          target: `k:${e.targetId}`,
          weight: e.weight,
          label: `共现 ${e.weight} 篇`,
          color: MATLAB_COLORS[0],
        });
      });
    } else {
      title = '研究脉络演进与潜在前沿方向拓扑图（2023 → 2027 → 未来潜在空白）';
      subtitle = '左侧为课题组核心技术基石，中间为已落地工业场景，右侧脉冲节点为基于空白矩阵挖掘的高潜力交叉方向';
      legend = [
        { group: 'tech', label: '核心技术方法轴', color: MATLAB_COLORS[0], shape: 'hex' },
        { group: 'domain', label: '工业应用场景轴', color: MATLAB_COLORS[4], shape: 'circle' },
        { group: 'frontier', label: '潜在高价值空白方向', color: MATLAB_COLORS[1], shape: 'pill' },
      ];

      analysis.techAxes.forEach((ax, i) => {
        const cnt = analysis.techDomainMatrix
          .filter((c) => c.techId === ax.id)
          .reduce((s, c) => s + c.papers.length, 0);
        nodes.push({
          id: `ax:${ax.id}`,
          label: ax.shortLabel,
          subLabel: ax.label,
          group: 'tech',
          color: MATLAB_COLORS[0],
          radius: 21,
          shape: 'hex',
          badge: String(cnt),
          targetX: 190,
          targetY: 75 + i * 65,
          meta: { kind: 'axis', axis: ax },
        });
      });

      analysis.domainAxes.forEach((ax, i) => {
        const cnt = analysis.techDomainMatrix
          .filter((c) => c.domainId === ax.id)
          .reduce((s, c) => s + c.papers.length, 0);
        nodes.push({
          id: `ax:${ax.id}`,
          label: ax.shortLabel,
          subLabel: ax.label,
          group: 'domain',
          color: MATLAB_COLORS[4],
          radius: 21,
          shape: 'circle',
          badge: String(cnt),
          targetX: 495,
          targetY: 90 + i * 74,
          meta: { kind: 'axis', axis: ax },
        });
      });

      // Solid links for existing accumulated intersections
      analysis.techDomainMatrix
        .filter((c) => c.papers.length > 0)
        .forEach((c) => {
          links.push({
            id: `td:${c.techId}->${c.domainId}`,
            source: `ax:${c.techId}`,
            target: `ax:${c.domainId}`,
            weight: c.papers.length,
            label: `已有 ${c.papers.length} 篇`,
            color: MATLAB_COLORS[0],
          });
        });

      // Right-hand pulsing potential frontier nodes
      analysis.potentialDirections.slice(0, 6).forEach((opp, i) => {
        const fid = `opp:${opp.id}`;
        nodes.push({
          id: fid,
          label: `P${i + 1}: ${cut(opp.title, 12)}`,
          subLabel: `创新 ${opp.noveltyScore} · 可行 ${opp.feasibilityScore}`,
          group: 'frontier',
          color: MATLAB_COLORS[1],
          radius: 22,
          shape: 'pill',
          targetX: 805,
          targetY: 86 + i * 74,
          meta: { kind: 'opportunity', opp },
        });
        links.push({
          id: `of1:${opp.techAxis.id}->${fid}`,
          source: `ax:${opp.techAxis.id}`,
          target: fid,
          weight: 2.2,
          label: '技术迁移',
          color: MATLAB_COLORS[1],
          dashed: true,
          animated: true,
        });
        links.push({
          id: `of2:${opp.domainAxis.id}->${fid}`,
          source: `ax:${opp.domainAxis.id}`,
          target: fid,
          weight: 2.2,
          label: '场景牵引',
          color: MATLAB_COLORS[2],
          dashed: true,
          animated: true,
        });
      });
    }

    return { nodes, links, legend, title, subtitle };
  }, [mode, analysis, minYear, spanYear]);

  const modeButtons: Array<{ id: LabGraphMode; label: string; icon: React.ReactNode }> = [
    { id: 'heterogeneous', label: '全景知识图谱', icon: <Network className="h-3.5 w-3.5" /> },
    { id: 'coauthor', label: '作者协作网络', icon: <Users className="h-3.5 w-3.5" /> },
    { id: 'social_clusters', label: '作者社交群落', icon: <Share2 className="h-3.5 w-3.5" /> },
    { id: 'keywords', label: '热词共现演进', icon: <Flame className="h-3.5 w-3.5" /> },
    { id: 'frontier', label: '脉络与潜在前沿', icon: <Compass className="h-3.5 w-3.5" /> },
  ];

  return (
    <DynamicKnowledgeGraph
      title={graphData.title}
      subtitle={graphData.subtitle}
      nodes={graphData.nodes}
      links={graphData.links}
      legend={graphData.legend}
      darkMode={darkMode}
      height={540}
      exportFilename={`paperpulse-lab-graph-${mode}`}
      topControls={
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {modeButtons.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setMode(b.id)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                mode === b.id
                  ? 'bg-[#0072BD] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
      }
      onDoubleClickNode={(n) => {
        if (n.meta?.kind === 'paper' && n.meta.paper) onOpen(n.meta.paper as AcademicPaper);
      }}
      renderInspector={(node) => {
        if (!node || !node.meta) {
          return (
            <div className="space-y-3 text-xs leading-6 text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <GitBranch className="h-4 w-4 text-[#0072BD]" />
                交互式图谱探针
              </div>
              <p>点击或悬停左侧任意节点，实时高亮其一阶关联子图，并在此查看：</p>
              <ul className="list-disc space-y-1 pl-4">
                <li><strong>论文节点</strong>：完整中英文标题、摘要片段及一键打开精读弹窗（双击直达）。</li>
                <li><strong>作者节点</strong>：已合并的中英文署名变体清单、一作/通讯统计与全部参与论文。</li>
                <li><strong>热词节点</strong>：合并后的中英文概念、平均活跃年份与关联论文列表。</li>
                <li><strong>潜在前沿节点</strong>：待解科学问题、技术迁移路径与双侧支撑论文。</li>
              </ul>
            </div>
          );
        }

        const kind = String(node.meta.kind);
        if (kind === 'paper') {
          const p = node.meta.paper as AcademicPaper;
          return (
            <div className="space-y-2.5">
              <span className="inline-block rounded bg-[#0072BD] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                {String(node.meta.year)} · {p.journalShort}
              </span>
              <h4 className="text-sm font-bold leading-snug text-slate-900 dark:text-white">
                {p.titleZh || p.title}
              </h4>
              <p className="text-xs text-slate-500">
                作者：{(analysis.paperCanonicalAuthors.get(p.id) || []).map((a) => a.shortName).join('、')}
              </p>
              <p className="line-clamp-6 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {p.abstractZh || p.abstractOriginal || '点击下方打开精读与完整元数据'}
              </p>
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0072BD] px-3 py-2 text-xs font-semibold text-white hover:bg-[#005a96]"
              >
                <BookOpenCheck className="h-3.5 w-3.5" /> 打开精读与关联图谱
              </button>
            </div>
          );
        }

        if (kind === 'author') {
          const stat = node.meta.stat as LabAnalysisResult['canonicalAuthors'][number];
          return (
            <div className="space-y-3">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">{stat.info.displayName}</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  已合并署名变体：{stat.rawVariants.join(' / ') || stat.info.displayName}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="font-mono text-base font-bold text-[#0072BD]">{stat.count}</div>
                  <div className="text-[10px] text-slate-500">总发文</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="font-mono text-base font-bold text-[#D95319]">{stat.firstAuthorCount}</div>
                  <div className="text-[10px] text-slate-500">第一作者</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="font-mono text-base font-bold text-[#7E2F8E]">{stat.correspondingCount}</div>
                  <div className="text-[10px] text-slate-500">通讯作者</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">代表成果 ({stat.papers.length} 篇)：</div>
                {stat.papers.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    className="block w-full text-left text-xs leading-5 text-[#0072BD] hover:underline dark:text-sky-400"
                  >
                    • [{analysis.paperYearById.get(p.id) || ''}] {p.titleZh || p.title}
                  </button>
                ))}
              </div>
              {onFilterByAuthor && (
                <button
                  type="button"
                  onClick={() => onFilterByAuthor(stat.info.shortName)}
                  className="w-full rounded-xl border border-[#0072BD] px-3 py-1.5 text-xs font-semibold text-[#0072BD] hover:bg-sky-50 dark:text-sky-300"
                >
                  在目录中筛选该作者全部文献
                </button>
              )}
            </div>
          );
        }

        if (kind === 'keyword') {
          const kw = node.meta.kw as LabAnalysisResult['canonicalKeywords'][number];
          return (
            <div className="space-y-3">
              <div>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  已合并中英文概念
                </span>
                <h4 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">{kw.info.label}</h4>
                <p className="text-xs text-slate-500">
                  覆盖 {kw.count} 篇成果 · 活跃跨度 {kw.firstYear}–{kw.lastYear}（均年 {kw.avgYear.toFixed(1)}）
                </p>
              </div>
              <div className="space-y-1.5">
                {kw.papers.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    className="block w-full text-left text-xs leading-5 text-[#0072BD] hover:underline dark:text-sky-400"
                  >
                    • [{analysis.paperYearById.get(p.id) || ''}] {p.titleZh || p.title}
                  </button>
                ))}
              </div>
              {onFilterByKeyword && (
                <button
                  type="button"
                  onClick={() => onFilterByKeyword(kw.info.shortLabel)}
                  className="w-full rounded-xl border border-[#0072BD] px-3 py-1.5 text-xs font-semibold text-[#0072BD] hover:bg-sky-50 dark:text-sky-300"
                >
                  按此热词检索文献
                </button>
              )}
            </div>
          );
        }

        if (kind === 'topic') {
          const topic = node.meta.topic as ResearchTopic;
          const relPapers = analysis.papers.filter((p) => (p.topics || []).includes(topic));
          return (
            <div className="space-y-3">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {TOPIC_META[topic]?.label || topic}（{relPapers.length} 篇）
              </h4>
              <div className="space-y-1.5">
                {relPapers.slice(0, 7).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpen(p)}
                    className="block w-full text-left text-xs leading-5 text-[#0072BD] hover:underline dark:text-sky-400"
                  >
                    • [{analysis.paperYearById.get(p.id) || ''}] {p.titleZh || p.title}
                  </button>
                ))}
              </div>
              {onFilterByTopic && (
                <button
                  type="button"
                  onClick={() => onFilterByTopic(topic)}
                  className="w-full rounded-xl border border-[#0072BD] px-3 py-1.5 text-xs font-semibold text-[#0072BD]"
                >
                  筛选此方向全部成果
                </button>
              )}
            </div>
          );
        }

        if (kind === 'opportunity') {
          const opp = node.meta.opp as LabAnalysisResult['potentialDirections'][number];
          return (
            <div className="space-y-2.5 text-xs leading-5">
              <span className="inline-block rounded bg-[#D95319] px-2 py-0.5 font-bold text-white">
                潜在高价值研究方向
              </span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{opp.title}</h4>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>科学问题：</strong>{opp.scientificQuestion}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>迁移路径：</strong>{opp.migrationPath}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                <strong>验证建议：</strong>{opp.validationHint}
              </p>
            </div>
          );
        }

        return (
          <div className="space-y-2 text-xs">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{node.label}</h4>
            <p className="text-slate-600 dark:text-slate-300">{node.subLabel}</p>
          </div>
        );
      }}
    />
  );
};
