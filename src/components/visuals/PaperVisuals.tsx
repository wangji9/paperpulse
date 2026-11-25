import React, { useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  AblationItem,
  AcademicPaper,
  ArchitectureModule,
  DatasetDetail,
  PaperAnatomy,
} from '../../types/paper';
import { DATASET_SOURCE_META } from '../../lib/constants';

export const LOGIC_STEPS = [
  { id: 'sec-bg', num: '01', label: '研究背景', short: '背景' },
  { id: 'sec-prob', num: '02', label: '核心问题', short: '问题' },
  { id: 'sec-status', num: '03', label: '研究现状', short: '现状' },
  { id: 'sec-gaps', num: '04', label: '现存局限', short: '局限' },
  { id: 'sec-method', num: '05', label: '提出方法', short: '方法' },
  { id: 'sec-exp', num: '06', label: '实验验证', short: '实验' },
  { id: 'sec-data', num: '07', label: '数据构建', short: '数据' },
  { id: 'sec-cmp', num: '08', label: '对比消融', short: '消融' },
  { id: 'sec-conc', num: '09', label: '研究结论', short: '结论' },
  { id: 'sec-future', num: '10', label: '局限展望', short: '展望' },
];

export const LogicChainFlow: React.FC<{
  activeStep: string;
  onSelectStep: (id: string) => void;
  darkMode?: boolean;
}> = ({ activeStep, onSelectStep, darkMode }) => {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        darkMode ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200 bg-slate-50/80'
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-600 dark:text-indigo-400">
          <GitBranch className="h-3.5 w-3.5" />
          文献十维学术逻辑链全景导航 (点击节点直达精读模块)
        </span>
        <span className="font-mono-code text-[11px] text-slate-400">Background → Problem → Method → Validation → Outlook</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:justify-between">
        {LOGIC_STEPS.map((step, idx) => {
          const isActive = activeStep === step.id;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`group flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                    : darkMode
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
                }`}
              >
                <span
                  className={`font-mono-code text-[10px] ${
                    isActive ? 'text-indigo-200' : 'text-slate-400 group-hover:text-indigo-500'
                  }`}
                >
                  {step.num}
                </span>
                <span>{step.label}</span>
              </button>
              {idx < LOGIC_STEPS.length - 1 && (
                <ArrowRight className="hidden h-2.5 w-2.5 shrink-0 text-slate-300 xl:block dark:text-slate-600" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const STAGE_STYLES: Record<ArchitectureModule['stage'], { badge: string; border: string; bg: string }> = {
  input: { badge: 'INPUT 输入流', border: 'border-sky-300', bg: 'bg-sky-50/70' },
  encoder: { badge: 'ENCODER 表征', border: 'border-cyan-300', bg: 'bg-cyan-50/70' },
  core: { badge: 'CORE 核心引擎', border: 'border-indigo-400', bg: 'bg-indigo-50/80' },
  fusion: { badge: 'FUSION 融合约束', border: 'border-violet-300', bg: 'bg-violet-50/70' },
  output: { badge: 'OUTPUT 决策输出', border: 'border-emerald-300', bg: 'bg-emerald-50/70' },
};

export const ArchitectureDiagram: React.FC<{
  modules: ArchitectureModule[];
  darkMode?: boolean;
}> = ({ modules, darkMode }) => {
  const [selectedId, setSelectedId] = useState<string>(modules[2]?.id || modules[0]?.id || '');
  const selected = modules.find((m) => m.id === selectedId) || modules[0];

  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Cpu className="h-4 w-4 text-indigo-600" />
          <span>方法技术架构交互示意图 (点击模块查看机理细节)</span>
        </div>
        <span className="font-mono-code text-[11px] text-slate-400">{modules.length} Stages Pipeline</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
        {modules.map((mod, idx) => {
          const st = STAGE_STYLES[mod.stage] || STAGE_STYLES.core;
          const isSelected = selected?.id === mod.id;
          return (
            <div key={mod.id} className="relative flex items-stretch">
              <button
                type="button"
                onClick={() => setSelectedId(mod.id)}
                className={`flex w-full flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  darkMode
                    ? isSelected
                      ? 'border-indigo-400 bg-indigo-950/60 ring-2 ring-indigo-500/40'
                      : 'border-slate-700 bg-slate-800/80 hover:border-slate-500'
                    : isSelected
                      ? `${st.border} ${st.bg} ring-2 ring-indigo-500/25 shadow-sm`
                      : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div>
                  <span className="font-mono-code inline-block rounded bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {st.badge}
                  </span>
                  <div className="mt-2 text-xs font-bold leading-snug text-slate-900 dark:text-white">{mod.title}</div>
                </div>
                <div className="mt-2 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{mod.subtitle}</div>
              </button>
              {idx < modules.length - 1 && (
                <div className="hidden items-center justify-center px-0.5 md:flex">
                  <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div
          className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${
            darkMode ? 'border-indigo-800/60 bg-indigo-950/40 text-slate-200' : 'border-indigo-100 bg-indigo-50/60 text-slate-700'
          }`}
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <div>
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{selected.title} 机制解析：</span>
            <span>{selected.detail}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const DatasetProvenanceVisual: React.FC<{
  dataset: DatasetDetail;
  darkMode?: boolean;
}> = ({ dataset, darkMode }) => {
  const meta = DATASET_SOURCE_META[dataset.sourceType];
  const barColors = ['bg-indigo-600', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500'];

  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">数据集属性与构建管线图解</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>{meta.label}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Scale & Modalities */}
        <div className="space-y-3 lg:col-span-5">
          <div>
            <div className="text-[11px] font-medium text-slate-500">采用数据集清单</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {dataset.names.map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/70">
            <span className="font-semibold text-slate-700 dark:text-slate-200">样本规模：</span>
            <span className="text-slate-600 dark:text-slate-300">{dataset.scale}</span>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-slate-500">数据模态构成比例</div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {dataset.modalities.map((m, i) => (
                <div
                  key={m.label}
                  style={{ width: `${m.percentage}%` }}
                  className={barColors[i % barColors.length]}
                  title={`${m.label}: ${m.percentage}%`}
                />
              ))}
            </div>
            <div className="mt-2 space-y-1">
              {dataset.modalities.map((m, i) => (
                <div key={m.label} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className={`inline-block h-2 w-2 rounded-full ${barColors[i % barColors.length]}`} />
                    {m.label}
                  </span>
                  <span className="font-mono-code font-semibold text-slate-700 dark:text-slate-200">{m.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Construction Steps */}
        <div className="lg:col-span-7">
          <div className="mb-2 text-[11px] font-medium text-slate-500">数据集构建与预处理流程</div>
          <div className="space-y-2">
            {dataset.constructionSteps.map((st) => (
              <div
                key={st.step}
                className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <span className="font-mono-code flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">
                  {st.step}
                </span>
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{st.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{st.description}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">构建总评：</span>
            {dataset.summary}
          </p>
        </div>
      </div>
    </div>
  );
};

export const ComparisonChart: React.FC<{
  comparison: PaperAnatomy['comparisonMetrics'];
  darkMode?: boolean;
}> = ({ comparison, darkMode }) => {
  const [selectedMetric, setSelectedMetric] = useState<string>(comparison.primaryMetric || comparison.metricNames[0]);
  const maxVal = Math.max(
    100,
    ...comparison.rows.map((r) => Number(r.values[selectedMetric] ?? 0))
  );

  const proposedRow = comparison.rows.find((r) => r.isProposed) || comparison.rows[0];
  const bestBaseline = comparison.rows
    .filter((r) => !r.isProposed)
    .reduce((max, r) => Math.max(max, Number(r.values[selectedMetric] ?? 0)), 0);
  const gain = Number(proposedRow?.values[selectedMetric] ?? 0) - bestBaseline;

  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">对比实验定量评测 (Baseline Comparison)</span>
          {gain > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 font-mono-code text-[11px] font-semibold text-emerald-700">
              <TrendingUp className="h-3 w-3" />+{gain.toFixed(1)}
              {comparison.unit} vs 次优
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {comparison.metricNames.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMetric(m)}
              className={`rounded-md px-2.5 py-1 font-mono-code text-[11px] font-medium transition ${
                selectedMetric === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {comparison.rows.map((row) => {
          const val = Number(row.values[selectedMetric] ?? 0);
          const pct = Math.min(100, Math.max(4, (val / maxVal) * 100));
          return (
            <div key={row.method} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    row.isProposed
                      ? 'font-bold text-indigo-700 dark:text-indigo-300'
                      : 'font-medium text-slate-600 dark:text-slate-300'
                  }
                >
                  {row.method}
                </span>
                <span className="font-mono-code font-semibold text-slate-800 dark:text-slate-100">
                  {val.toFixed(1)}
                  {comparison.unit}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  style={{ width: `${pct}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    row.isProposed
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 shadow-sm'
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AblationChart: React.FC<{
  ablation: PaperAnatomy['ablationStudy'];
  darkMode?: boolean;
}> = ({ ablation, darkMode }) => {
  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-rose-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">消融实验贡献拆解 (Ablation Study)</span>
        </div>
        <span className="font-mono-code rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Full Model ({ablation.metricName}): {ablation.fullModelScore}
          {ablation.unit}
        </span>
      </div>

      <div className="space-y-2.5">
        {ablation.items.map((item: AblationItem) => {
          const dropPct = Math.min(100, Math.max(8, (item.score / Math.max(ablation.fullModelScore, 1)) * 100));
          return (
            <div
              key={item.variant}
              className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{item.variant}</span>
                  <span className="ml-2 text-[11px] text-slate-500">移除: {item.removedModule}</span>
                </div>
                <div className="flex items-center gap-2 font-mono-code">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {item.score}
                    {ablation.unit}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      item.delta < 0
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {item.delta < 0 && <TrendingDown className="h-3 w-3" />}
                    {item.delta > 0 ? `+${item.delta}` : item.delta}
                    {ablation.unit}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700">
                <div style={{ width: `${dropPct}%` }} className="h-full rounded-full bg-amber-500" />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">{item.impactNote}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-slate-800 dark:text-slate-100">消融结论：</span>
        {ablation.summary}
      </p>
    </div>
  );
};

export const FeedMiniVisual: React.FC<{
  paper: AcademicPaper;
  darkMode?: boolean;
  onOpenDeep: () => void;
}> = ({ paper, darkMode, onOpenDeep }) => {
  const { comparisonMetrics, architectureModules, dataset } = paper.anatomy;
  const top3Rows = comparisonMetrics.rows.slice(0, 3);
  const metric = comparisonMetrics.primaryMetric;
  const maxVal = Math.max(100, ...top3Rows.map((r) => Number(r.values[metric] ?? 0)));
  const dsMeta = DATASET_SOURCE_META[dataset.sourceType];

  return (
    <div
      onClick={onOpenDeep}
      className={`mt-3 cursor-pointer rounded-xl border p-3 transition-all hover:border-indigo-400 ${
        darkMode
          ? 'border-slate-700/90 bg-slate-900/60 hover:bg-slate-900'
          : 'border-slate-200/90 bg-gradient-to-r from-slate-50/90 via-white to-indigo-50/30 hover:shadow-sm'
      }`}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        {/* Left: Mini Method Flow */}
        <div className="md:col-span-7">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">核心方法链路缩略图</span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${dsMeta.badgeClass}`}>
              {dsMeta.shortLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 overflow-hidden">
            {architectureModules.slice(0, 4).map((m, idx) => (
              <React.Fragment key={m.id}>
                <div
                  className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 ${
                    m.stage === 'core'
                      ? 'border-indigo-300 bg-indigo-50/80 dark:border-indigo-700 dark:bg-indigo-950/60'
                      : darkMode
                        ? 'border-slate-700 bg-slate-800'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">{m.title}</div>
                  <div className="truncate text-[10px] text-slate-400">{m.subtitle}</div>
                </div>
                {idx < Math.min(3, architectureModules.length - 1) && (
                  <ArrowRight className="h-3 w-3 shrink-0 text-indigo-400" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right: Mini Metric Bars */}
        <div className="border-t border-slate-100 pt-2 md:col-span-5 md:border-l md:border-t-0 md:pl-3 md:pt-0 dark:border-slate-800">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-500">实验对比 ({metric})</span>
            <span className="font-mono-code font-bold text-indigo-600 dark:text-indigo-400">
              {paper.keyHighlightMetric.split('·')[0]}
            </span>
          </div>
          <div className="space-y-1.5">
            {top3Rows.map((row) => {
              const val = Number(row.values[metric] ?? 0);
              const pct = Math.min(100, Math.max(8, (val / maxVal) * 100));
              return (
                <div key={row.method} className="flex items-center gap-2 text-[10px]">
                  <span className="w-24 truncate font-medium text-slate-600 dark:text-slate-300">{row.method}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full ${
                        row.isProposed ? 'bg-gradient-to-r from-indigo-600 to-cyan-500' : 'bg-slate-400 dark:bg-slate-500'
                      }`}
                    />
                  </div>
                  <span className="font-mono-code w-10 text-right font-semibold text-slate-700 dark:text-slate-200">
                    {val}
                    {comparisonMetrics.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
