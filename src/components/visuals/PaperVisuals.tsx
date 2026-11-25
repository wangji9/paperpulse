import React, { useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Sparkles,
} from 'lucide-react';
import type {
  AblationItem,
  ArchitectureModule,
  DatasetDetail,
  PaperAnatomy,
} from '../../types/paper';
import { DATASET_SOURCE_META } from '../../lib/constants';

export const LOGIC_STEPS = [
  { id: 'sec-bg', num: '01', label: '研究背景' },
  { id: 'sec-prob', num: '02', label: '核心问题' },
  { id: 'sec-status', num: '03', label: '研究现状' },
  { id: 'sec-gaps', num: '04', label: '现存局限' },
  { id: 'sec-method', num: '05', label: '提出方法' },
  { id: 'sec-exp', num: '06', label: '实验验证' },
  { id: 'sec-data', num: '07', label: '数据构建' },
  { id: 'sec-cmp', num: '08', label: '对比消融' },
  { id: 'sec-conc', num: '09', label: '研究结论' },
  { id: 'sec-future', num: '10', label: '局限展望' },
  { id: 'sec-cite', num: '11', label: '引用图谱' },
];

export const LogicChainFlow: React.FC<{
  activeStep: string;
  onSelectStep: (id: string) => void;
  darkMode?: boolean;
}> = ({ activeStep, onSelectStep, darkMode }) => {
  return (
    <div
      className={`rounded-xl border p-3 ${
        darkMode ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200 bg-slate-50/80'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          <GitBranch className="h-3.5 w-3.5" />
          十维学术逻辑链与引用图谱直达导航
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-between">
        {LOGIC_STEPS.map((step, idx) => {
          const isActive = activeStep === step.id;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`group flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
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
  input: { badge: 'INPUT 输入层', border: 'border-sky-300', bg: 'bg-sky-50/70' },
  encoder: { badge: 'ENCODER 表征层', border: 'border-cyan-300', bg: 'bg-cyan-50/70' },
  core: { badge: 'CORE 核心方法', border: 'border-indigo-400', bg: 'bg-indigo-50/80' },
  fusion: { badge: 'FUSION 融合约束', border: 'border-violet-300', bg: 'bg-violet-50/70' },
  output: { badge: 'OUTPUT 输出决策', border: 'border-emerald-300', bg: 'bg-emerald-50/70' },
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
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/50'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Cpu className="h-4 w-4 text-indigo-600" />
          <span>方法原理框图 (点击任一模块查看机理说明)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
        {modules.map((mod) => {
          const st = STAGE_STYLES[mod.stage] || STAGE_STYLES.core;
          const isSelected = selected?.id === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => setSelectedId(mod.id)}
              className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                darkMode
                  ? isSelected
                    ? 'border-indigo-400 bg-indigo-950/60 ring-2 ring-indigo-500/40'
                    : 'border-slate-700 bg-slate-800/80 hover:border-slate-500'
                  : isSelected
                    ? `${st.border} ${st.bg} ring-2 ring-indigo-500/20 shadow-sm`
                    : 'border-slate-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div>
                <span className="font-mono-code inline-block rounded bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {st.badge}
                </span>
                <div className="mt-2 text-xs font-bold leading-snug text-slate-900 dark:text-white">{mod.title}</div>
              </div>
              <div className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{mod.subtitle}</div>
            </button>
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
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{selected.title}：</span>
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
  const meta = DATASET_SOURCE_META[dataset.sourceType] || DATASET_SOURCE_META.unspecified;

  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">数据集属性与构建方案</span>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>{meta.label}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          <div>
            <div className="text-[11px] font-medium text-slate-500">使用数据集</div>
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
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-800/70">
            <span className="font-semibold text-slate-700 dark:text-slate-200">数据规模与构成：</span>
            <span className="text-slate-600 dark:text-slate-300">{dataset.scale}</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">说明：</span>
            {dataset.summary}
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="mb-2 text-[11px] font-medium text-slate-500">数据集构建 / 标注流程</div>
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
        </div>
      </div>
    </div>
  );
};

export const ComparisonTable: React.FC<{
  comparison: PaperAnatomy['comparisonMetrics'];
  darkMode?: boolean;
}> = ({ comparison, darkMode }) => {
  return (
    <div
      className={`rounded-xl border p-4 ${
        darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">对比实验结果表 (Baseline Comparison Table)</span>
        </div>
        {!comparison.hasQuantitativeData && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            定性结构对比 · 支持编辑录入精确数值
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <th className="px-3 py-2 font-semibold">对比方法 / 模型</th>
              {comparison.metricNames.map((m) => (
                <th key={m} className="px-3 py-2 font-semibold">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {comparison.rows.map((row) => (
              <tr
                key={row.method}
                className={
                  row.isProposed
                    ? 'bg-indigo-50/50 font-semibold text-indigo-950 dark:bg-indigo-950/30 dark:text-indigo-200'
                    : 'text-slate-700 dark:text-slate-300'
                }
              >
                <td className="px-3 py-2.5">{row.method}</td>
                {comparison.metricNames.map((m) => (
                  <td key={m} className="px-3 py-2.5 leading-relaxed">
                    {String(row.values[m] ?? '—')}
                    {comparison.hasQuantitativeData && typeof row.values[m] === 'number' ? comparison.unit : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparison.note && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{comparison.note}</p>
      )}
    </div>
  );
};

export const AblationTable: React.FC<{
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
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">消融实验结果表 (Ablation Study Table)</span>
        </div>
        <span className="font-mono-code rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          基准模型：{ablation.fullModelScore}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <th className="px-3 py-2 font-semibold">消融变体</th>
              <th className="px-3 py-2 font-semibold">移除/替换组件</th>
              <th className="px-3 py-2 font-semibold">变化趋势</th>
              <th className="px-3 py-2 font-semibold">机理影响分析</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ablation.items.map((item: AblationItem) => (
              <tr key={item.variant} className="text-slate-700 dark:text-slate-300">
                <td className="px-3 py-2.5 font-semibold">{item.variant}</td>
                <td className="px-3 py-2.5">{item.removedModule}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono-code text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {item.score} ({item.delta})
                  </span>
                </td>
                <td className="px-3 py-2.5 leading-relaxed">{item.impactNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-slate-800 dark:text-slate-100">消融总结：</span>
        {ablation.summary}
      </p>
    </div>
  );
};
