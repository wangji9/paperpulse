import React, { useState } from 'react';
import type { AblationItem, ArchitectureModule, DatasetDetail, PaperAnatomy } from '../../types/paper';
import { DATASET_SOURCE_META } from '../../lib/constants';

export const LOGIC_STEPS = [
  { id: 'sec-bg', num: '01', label: '研究背景' },
  { id: 'sec-prob', num: '02', label: '核心问题' },
  { id: 'sec-status', num: '03', label: '研究现状' },
  { id: 'sec-gaps', num: '04', label: '现存局限' },
  { id: 'sec-method', num: '05', label: '提出方法' },
  { id: 'sec-exp', num: '06', label: '实验验证' },
  { id: 'sec-data', num: '07', label: '数据集' },
  { id: 'sec-cmp', num: '08', label: '对比消融' },
  { id: 'sec-conc', num: '09', label: '研究结论' },
  { id: 'sec-future', num: '10', label: '局限展望' },
  { id: 'sec-cite', num: '11', label: '引用图谱' },
];

export const LogicChainFlow: React.FC<{
  steps: typeof LOGIC_STEPS;
  activeStep: string;
  onSelectStep: (id: string) => void;
  darkMode?: boolean;
}> = ({ steps, activeStep, onSelectStep, darkMode }) => (
  <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
    {steps.map((step) => {
      const isActive = activeStep === step.id;
      return (
        <button
          key={step.id}
          type="button"
          onClick={() => onSelectStep(step.id)}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-1 text-sm transition ${
            isActive
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : darkMode
                ? 'border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500'
                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
          }`}
        >
          {step.num} {step.label}
        </button>
      );
    })}
  </div>
);

const STAGE_LABEL: Record<ArchitectureModule['stage'], string> = {
  input: '输入',
  encoder: '表征',
  core: '核心',
  fusion: '融合',
  output: '输出',
};

export const ArchitectureDiagram: React.FC<{ modules: ArchitectureModule[]; darkMode?: boolean }> = ({ modules, darkMode }) => {
  const [selectedId, setSelectedId] = useState<string>(modules[2]?.id || modules[0]?.id || '');
  const selected = modules.find((m) => m.id === selectedId) || modules[0];
  if (modules.length === 0) return null;
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50'}`}>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
        {modules.map((mod) => {
          const isSelected = selected?.id === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => setSelectedId(mod.id)}
              className={`rounded-xl border p-3 text-left transition ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50'
                  : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <div className="text-sm text-indigo-600 dark:text-indigo-300">{STAGE_LABEL[mod.stage]}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{mod.title}</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{mod.subtitle}</div>
            </button>
          );
        })}
      </div>
      {selected && <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{selected.detail}</p>}
    </div>
  );
};

export const DatasetProvenanceVisual: React.FC<{ dataset: DatasetDetail; darkMode?: boolean }> = ({ dataset, darkMode }) => {
  const meta = DATASET_SOURCE_META[dataset.sourceType] || DATASET_SOURCE_META.unspecified;
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-sm ${meta.badgeClass}`}>{meta.label}</span>
        {dataset.names.map((name) => (
          <span key={name} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {name}
          </span>
        ))}
      </div>
      {dataset.scale && <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">规模：{dataset.scale}</p>}
      {dataset.summary && <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{dataset.summary}</p>}
      {dataset.constructionSteps.length > 0 && (
        <div className="mt-3 space-y-2">
          {dataset.constructionSteps.map((st) => (
            <div key={st.step} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-sm text-white">{st.step}</span>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{st.title}</div>
                <div className="mt-0.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{st.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ComparisonTable: React.FC<{ comparison: PaperAnatomy['comparisonMetrics']; darkMode?: boolean }> = ({ comparison, darkMode }) => {
  if (comparison.rows.length === 0) return null;
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
      <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">对比实验</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <th className="px-3 py-2 font-semibold">方法</th>
              {comparison.metricNames.map((m) => (
                <th key={m} className="px-3 py-2 font-semibold">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {comparison.rows.map((row) => (
              <tr key={row.method} className={row.isProposed ? 'bg-indigo-50/50 font-medium dark:bg-indigo-950/30' : ''}>
                <td className="px-3 py-2.5">{row.method}</td>
                {comparison.metricNames.map((m) => (
                  <td key={m} className="px-3 py-2.5 leading-6">
                    {String(row.values[m] ?? '—')}
                    {comparison.hasQuantitativeData && typeof row.values[m] === 'number' ? comparison.unit : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AblationTable: React.FC<{ ablation: PaperAnatomy['ablationStudy']; darkMode?: boolean }> = ({ ablation, darkMode }) => {
  if (ablation.items.length === 0) return null;
  const quant = ablation.hasQuantitativeData;
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white'}`}>
      <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">消融实验</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <th className="px-3 py-2 font-semibold">变体</th>
              <th className="px-3 py-2 font-semibold">移除组件</th>
              {quant && <th className="px-3 py-2 font-semibold">结果</th>}
              <th className="px-3 py-2 font-semibold">影响</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ablation.items.map((item: AblationItem) => (
              <tr key={item.variant}>
                <td className="px-3 py-2.5 font-medium">{item.variant}</td>
                <td className="px-3 py-2.5">{item.removedModule}</td>
                {quant && (
                  <td className="px-3 py-2.5">
                    {item.score}（{item.delta}）
                  </td>
                )}
                <td className="px-3 py-2.5 leading-6">{item.impactNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ablation.summary && <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{ablation.summary}</p>}
    </div>
  );
};
