import React, { useMemo, useState } from 'react';
import { BookmarkCheck, BookmarkPlus, BookOpenCheck, Network, Sparkles } from 'lucide-react';
import type { AcademicPaper } from '../types/paper';
import { relatedPapers, type RelatedMatch } from '../lib/relatedPapers';
import { DynamicKnowledgeGraph, type KnowledgeGraphLink, type KnowledgeGraphNode } from './DynamicKnowledgeGraph';
import { MATLAB_COLORS } from './MatlabCharts';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

interface RelatedPapersProps {
  seeds: AcademicPaper[];
  pool: AcademicPaper[];
  darkMode?: boolean;
  onOpen: (p: AcademicPaper) => void;
  onCollect?: (p: AcademicPaper) => Promise<void>;
  graph?: boolean;
  title?: string;
}

export const RelatedPapers: React.FC<RelatedPapersProps> = ({
  seeds,
  pool,
  darkMode = false,
  onOpen,
  onCollect,
  graph = false,
  title,
}) => {
  const matches = useMemo(() => relatedPapers(seeds, pool, graph ? 10 : 8), [seeds, pool, graph]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [showGraphInList, setShowGraphInList] = useState(graph);

  const activeGraph = graph || showGraphInList;
  const center = seeds[0];

  const { graphNodes, graphLinks, matchByNodeId } = useMemo(() => {
    const nodes: KnowledgeGraphNode[] = [];
    const links: KnowledgeGraphLink[] = [];
    const map = new Map<string, RelatedMatch>();
    if (!center || !matches.length) return { graphNodes: nodes, graphLinks: links, matchByNodeId: map };

    const W = 980;
    const H = 440;
    const cx = W / 2;
    const cy = H / 2;

    if (seeds.length === 1) {
      nodes.push({
        id: `seed:${center.id}`,
        label: cut(center.titleZh || center.title, 16),
        subLabel: `${center.journalShort} · ${(center.publishedDate || '').slice(0, 4)}`,
        group: 'focal',
        color: MATLAB_COLORS[0],
        radius: 28,
        shape: 'hex',
        badge: '核心',
        pinned: true,
        targetX: cx,
        targetY: cy,
        meta: { kind: 'focal', paper: center },
      });
    } else {
      seeds.slice(0, 5).forEach((s, i) => {
        const ang = (i / Math.min(seeds.length, 5)) * Math.PI * 2 - Math.PI / 2;
        nodes.push({
          id: `seed:${s.id}`,
          label: cut(s.titleZh || s.title, 13),
          subLabel: `我的收藏 · ${s.journalShort}`,
          group: 'focal',
          color: MATLAB_COLORS[0],
          radius: 22,
          shape: 'hex',
          badge: `藏${i + 1}`,
          targetX: cx + Math.cos(ang) * 110,
          targetY: cy + Math.sin(ang) * 85,
          meta: { kind: 'focal', paper: s },
        });
      });
    }

    const conceptAdded = new Set<string>();

    matches.forEach((m, idx) => {
      const nid = `rel:${m.paper.id}`;
      map.set(nid, m);
      const pct = Math.round(m.score * 100);
      const ang = (idx / Math.max(matches.length, 1)) * Math.PI * 2;
      const dist = 240 - Math.min(pct, 90) * 0.9;
      nodes.push({
        id: nid,
        label: cut(m.paper.titleZh || m.paper.title, 15),
        subLabel: `${m.paper.journalShort} · 匹配 ${pct}%`,
        group: m.paper.inMyKb ? 'in_kb' : 'recommended',
        color: m.paper.inMyKb ? MATLAB_COLORS[4] : MATLAB_COLORS[1],
        radius: 16 + Math.min(10, m.score * 12),
        shape: 'circle',
        badge: `${pct}`,
        targetX: cx + Math.cos(ang) * dist,
        targetY: cy + Math.sin(ang) * dist * 0.72,
        meta: { kind: 'match', match: m },
      });

      // Connect seed(s) to recommended paper
      const targetSeedIds = m.seedIds.length ? m.seedIds : [center.id];
      for (const sid of targetSeedIds) {
        if (!nodes.some((n) => n.id === `seed:${sid}`)) continue;
        links.push({
          id: `e:${sid}->${m.paper.id}`,
          source: `seed:${sid}`,
          target: nid,
          weight: Math.max(1, m.score * 5),
          label: m.hasCitationLink ? '直接引文' : `相似度 ${pct}%`,
          color: m.hasCitationLink ? MATLAB_COLORS[3] : MATLAB_COLORS[0],
          dashed: !m.hasCitationLink,
          animated: m.hasCitationLink || pct >= 40,
        });
      }

      // Add up to 2 shared bilingual canonical concept bridge nodes
      m.sharedKeywords.slice(0, 2).forEach((kw) => {
        const kid = `kw:${kw.id}`;
        if (!conceptAdded.has(kid) && conceptAdded.size < 10) {
          conceptAdded.add(kid);
          nodes.push({
            id: kid,
            label: kw.shortLabel,
            subLabel: kw.label,
            group: 'concept',
            color: MATLAB_COLORS[2],
            radius: 13,
            shape: 'diamond',
            meta: { kind: 'concept', keyword: kw },
          });
          const primarySeed = `seed:${targetSeedIds[0]}`;
          if (nodes.some((n) => n.id === primarySeed)) {
            links.push({
              id: `ek:${primarySeed}->${kid}`,
              source: primarySeed,
              target: kid,
              weight: 1.4,
              color: MATLAB_COLORS[2],
            });
          }
        }
        if (conceptAdded.has(kid)) {
          links.push({
            id: `ek:${kid}->${nid}`,
            source: kid,
            target: nid,
            weight: 1.2,
            color: MATLAB_COLORS[2],
            dashed: true,
          });
        }
      });
    });

    return { graphNodes: nodes, graphLinks: links, matchByNodeId: map };
  }, [seeds, center, matches]);

  const activeMatch =
    (selectedMatchId && matchByNodeId.get(selectedMatchId)) || matches[0] || null;

  return (
    <section
      className={`my-4 rounded-2xl border p-4 sm:p-5 ${
        darkMode ? 'border-slate-800 bg-slate-900' : 'border-indigo-100 bg-white shadow-xs'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#0072BD]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {title || (graph ? '单篇文献动态力导向关联知识图谱与相似文献分析' : '基于我的知识库的智能关联推荐')}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            融合中英文同义概念合并、标题/摘要语义向量、共享研究方向、共同作者与引文关系计算综合相关性
          </p>
        </div>
        {!graph && matches.length > 0 && (
          <button
            type="button"
            onClick={() => setShowGraphInList((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
          >
            <Network className="h-3.5 w-3.5" />
            {showGraphInList ? '收起关联知识图谱' : '展开动态力导向关联图谱'}
          </button>
        )}
      </div>

      {!matches.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {seeds.length
            ? '当前文献池暂无高置信度相似匹配，上传或同步同方向文献后将自动构建关联图谱。'
            : '请先在公共文献池收藏感兴趣的文献，即可为您生成个性化相似文献推荐与关联知识图谱。'}
        </div>
      ) : (
        <div className="space-y-4">
          {activeGraph && center && (
            <DynamicKnowledgeGraph
              title={
                seeds.length === 1
                  ? `单篇中心关联图谱：${cut(center.titleZh || center.title, 34)}`
                  : `个人知识库关联发现图谱（基于 ${seeds.length} 篇收藏文献）`
              }
              subtitle="中心六边形为种子文献，菱形为中英文合并后的共享桥梁概念，圆节点为相似推荐文献（数字为匹配度分值）"
              nodes={graphNodes}
              links={graphLinks}
              legend={[
                { group: 'focal', label: seeds.length === 1 ? '当前目标文献' : '我的收藏种子', color: MATLAB_COLORS[0], shape: 'hex' },
                { group: 'recommended', label: '推荐相似文献', color: MATLAB_COLORS[1], shape: 'circle' },
                { group: 'in_kb', label: '已在个人知识库', color: MATLAB_COLORS[4], shape: 'circle' },
                { group: 'concept', label: '桥梁核心概念(去重)', color: MATLAB_COLORS[2], shape: 'diamond' },
              ]}
              darkMode={darkMode}
              height={430}
              exportFilename={`paperpulse-related-${center.id.slice(0, 10)}`}
              selectedNodeId={selectedMatchId}
              onSelectNode={(n) => {
                if (n && n.id.startsWith('rel:')) setSelectedMatchId(n.id);
              }}
              onDoubleClickNode={(n) => {
                const m = matchByNodeId.get(n.id);
                if (m) onOpen(m.paper);
              }}
              renderInspector={(node) => {
                const picked = (node && matchByNodeId.get(node.id)) || activeMatch;
                if (!picked) {
                  return <p className="text-xs text-slate-500">点击左侧任意推荐文献节点查看匹配维度拆解。</p>;
                }
                const p = picked.paper;
                const bars: Array<[string, number, string]> = [
                  ['题名/摘要语义', picked.breakdown.semantic, MATLAB_COLORS[0]],
                  ['共享概念词', picked.breakdown.keyword, MATLAB_COLORS[2]],
                  ['共同研究方向', picked.breakdown.topic, MATLAB_COLORS[4]],
                  ['共同作者', picked.breakdown.author, MATLAB_COLORS[3]],
                  ['直接引文链路', picked.breakdown.citation, MATLAB_COLORS[1]],
                ];
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-[#D95319] px-2 py-0.5 font-mono text-xs font-bold text-white">
                        综合匹配 {Math.round(picked.score * 100)}%
                      </span>
                      <span className="text-xs text-slate-500">
                        {p.journalShort} · {(p.publishedDate || '').slice(0, 4)}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold leading-snug text-slate-900 dark:text-white">
                      {p.titleZh || p.title}
                    </h4>
                    <p className="line-clamp-4 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {p.abstractZh || p.abstractOriginal || p.digestSummary || '点击精读全文查看完整结构化解析'}
                    </p>

                    {/* MATLAB-style Multi-Dimension Match Breakdown */}
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/80">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        多维相关性拆解（Explainable Similarity）
                      </div>
                      {bars.map(([label, val, color]) => (
                        <div key={label} className="space-y-0.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-600 dark:text-slate-300">{label}</span>
                            <span className="font-mono font-semibold" style={{ color }}>
                              {val}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {picked.sharedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {picked.sharedKeywords.slice(0, 5).map((kw) => (
                          <span
                            key={kw.id}
                            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                          >
                            {kw.label}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpen(p)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0072BD] px-3 py-2 text-xs font-semibold text-white hover:bg-[#005a96]"
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" /> 精读全文
                      </button>
                      {onCollect && (
                        <button
                          type="button"
                          disabled={p.inMyKb}
                          onClick={() => !p.inMyKb && void onCollect(p)}
                          className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                            p.inMyKb
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#0072BD] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {p.inMyKb ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                          {p.inMyKb ? '已收藏' : '收入知识库'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}

          {/* Ranked Similar Literature Cards */}
          <div className="grid gap-3 md:grid-cols-2">
            {matches.map((m, i) => (
              <article
                key={m.paper.id}
                onMouseEnter={() => setSelectedMatchId(`rel:${m.paper.id}`)}
                className={`rounded-xl border p-3.5 transition ${
                  selectedMatchId === `rel:${m.paper.id}`
                    ? 'border-[#0072BD] bg-sky-50/30 dark:border-sky-500 dark:bg-sky-950/20'
                    : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold leading-snug text-slate-900 hover:text-[#0072BD] dark:text-white dark:hover:text-sky-400"
                    onClick={() => onOpen(m.paper)}
                  >
                    {i + 1}. {m.paper.titleZh || m.paper.title}
                  </button>
                  <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-[#0072BD] dark:bg-indigo-950 dark:text-sky-300">
                    {Math.round(m.score * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {m.paper.journalShort} · {(m.paper.publishedDate || '').slice(0, 4)}
                  {m.sharedAuthors.length > 0 && ` · 共同作者：${m.sharedAuthors.join('、')}`}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-teal-700 dark:text-teal-300">
                  {m.reasons.slice(0, 4).join('；')}
                </p>
                {!graph && m.seedIds.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    关联我的收藏：
                    {seeds
                      .filter((s) => m.seedIds.includes(s.id))
                      .map((s) => s.titleZh || s.title)
                      .join('；')}
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpen(m.paper)}
                    className="font-semibold text-[#0072BD] hover:underline dark:text-sky-400"
                  >
                    精读与图谱 →
                  </button>
                  {onCollect && (
                    <button
                      type="button"
                      disabled={m.paper.inMyKb}
                      onClick={() => !m.paper.inMyKb && void onCollect(m.paper)}
                      className="font-medium text-teal-700 hover:underline disabled:text-slate-400 dark:text-teal-300"
                    >
                      {m.paper.inMyKb ? '已在我的知识库' : '+ 收藏到我的知识库'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
