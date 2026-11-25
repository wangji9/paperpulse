import React, { useEffect, useState } from 'react';
import { Loader2, PlusCircle, Sparkles, X } from 'lucide-react';
import type {
  AcademicPaper,
  DatasetSourceType,
  DomainCategory,
  ResearchTopic,
} from '../types/paper';
import { TOPIC_META } from '../lib/constants';
import { createPaper, importPaperByIdentifier, updatePaper } from '../lib/api';

interface PaperFormModalProps {
  editingPaper?: AcademicPaper | null;
  darkMode: boolean;
  onClose: () => void;
  onSaved: (paper: AcademicPaper, isNew: boolean) => void;
}

const ALL_TOPICS: ResearchTopic[] = ['LLM', 'KnowledgeGraph', 'ComputerVision', 'Multimodal', 'EmbodiedAI'];

export const PaperFormModal: React.FC<PaperFormModalProps> = ({
  editingPaper,
  darkMode,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(editingPaper);
  const [mode, setMode] = useState<'import' | 'manual'>(isEditing ? 'manual' : 'import');
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [title, setTitle] = useState(editingPaper?.title || '');
  const [titleZh, setTitleZh] = useState(editingPaper?.titleZh || '');
  const [authorsStr, setAuthorsStr] = useState(editingPaper?.authors.join(', ') || '');
  const [journal, setJournal] = useState(editingPaper?.journal || 'Journal of Manufacturing Systems');
  const [journalShort, setJournalShort] = useState(editingPaper?.journalShort || 'JMS');
  const [domain, setDomain] = useState<DomainCategory>(editingPaper?.domain || 'manufacturing');
  const [topics, setTopics] = useState<ResearchTopic[]>(editingPaper?.topics || ['LLM']);
  const [publishedDate, setPublishedDate] = useState(
    editingPaper?.publishedDate || new Date().toISOString().slice(0, 10)
  );
  const [doi, setDoi] = useState(editingPaper?.doi || '');
  const [url, setUrl] = useState(editingPaper?.url || '');
  const [digestSummary, setDigestSummary] = useState(editingPaper?.digestSummary || '');

  // 10-part anatomy fields
  const [background, setBackground] = useState(editingPaper?.anatomy.background || '');
  const [problem, setProblem] = useState(editingPaper?.anatomy.problem || '');
  const [currentStatus, setCurrentStatus] = useState(editingPaper?.anatomy.currentStatus || '');
  const [limitationsOfPriorWork, setLimitationsOfPriorWork] = useState(
    editingPaper?.anatomy.limitationsOfPriorWork || ''
  );
  const [proposedMethod, setProposedMethod] = useState(editingPaper?.anatomy.proposedMethod || '');
  const [experimentalValidation, setExperimentalValidation] = useState(
    editingPaper?.anatomy.experimentalValidation || ''
  );
  const [datasetSourceType, setDatasetSourceType] = useState<DatasetSourceType>(
    editingPaper?.anatomy.dataset.sourceType || 'hybrid'
  );
  const [datasetNamesStr, setDatasetNamesStr] = useState(
    editingPaper?.anatomy.dataset.names.join(', ') || ''
  );
  const [datasetScale, setDatasetScale] = useState(editingPaper?.anatomy.dataset.scale || '');
  const [datasetSummary, setDatasetSummary] = useState(editingPaper?.anatomy.dataset.summary || '');
  const [comparisonInput, setComparisonInput] = useState(
    editingPaper
      ? editingPaper.anatomy.comparisonMetrics.rows
          .map((r) => `${r.method}: ${String(Object.values(r.values)[0] ?? '')}`)
          .join('\n')
      : ''
  );
  const [ablationSummary, setAblationSummary] = useState(editingPaper?.anatomy.ablationStudy.summary || '');
  const [conclusion, setConclusion] = useState(editingPaper?.anatomy.conclusion || '');
  const [paperLimitationsStr, setPaperLimitationsStr] = useState(
    editingPaper?.anatomy.futureAndLimitations.paperLimitations.join('\n') || ''
  );
  const [futureDirectionsStr, setFutureDirectionsStr] = useState(
    editingPaper?.anatomy.futureAndLimitations.futureDirections.join('\n') || ''
  );

  const toggleTopic = (t: ResearchTopic) => {
    setTopics((prev) => (prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]));
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { paper, alreadyExists } = await importPaperByIdentifier(identifier.trim());
      onSaved(paper, !alreadyExists);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '自动解析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请输入英文/原始文献标题');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const baseAnatomy = editingPaper?.anatomy;
      const customRows = comparisonInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const [method, val] = line.split(':');
          return {
            method: (method || `方法 ${idx + 1}`).trim(),
            isProposed: idx === 0 || (method || '').includes('本文'),
            values: {
              [baseAnatomy?.comparisonMetrics.metricNames[0] || '对比说明']: (val || '待补充').trim(),
            },
          };
        });

      const payload: Partial<AcademicPaper> & { quickAbstract?: string } = {
        title: title.trim(),
        titleZh: titleZh.trim() || title.trim(),
        authors: authorsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        journal: journal.trim(),
        journalShort: journalShort.trim(),
        domain,
        topics,
        publishedDate,
        doi: doi.trim(),
        url: url.trim() || '#',
        digestSummary: digestSummary.trim(),
        quickAbstract: `${background} ${problem} ${proposedMethod} ${experimentalValidation}`,
      };

      if (background.trim() || proposedMethod.trim()) {
        payload.anatomy = {
          background: background.trim() || baseAnatomy?.background || '',
          problem: problem.trim() || baseAnatomy?.problem || '',
          currentStatus: currentStatus.trim() || baseAnatomy?.currentStatus || '',
          limitationsOfPriorWork: limitationsOfPriorWork.trim() || baseAnatomy?.limitationsOfPriorWork || '',
          proposedMethod: proposedMethod.trim() || baseAnatomy?.proposedMethod || '',
          architectureModules: baseAnatomy?.architectureModules || [
            { id: 'u1', stage: 'input', title: '输入数据流', subtitle: '原始观测', detail: '输入标准化处理' },
            { id: 'u2', stage: 'encoder', title: '特征表征层', subtitle: '编码映射', detail: '高维语义特征提取' },
            { id: 'u3', stage: 'core', title: '核心创新机制', subtitle: topics.join(' + '), detail: proposedMethod.slice(0, 80) },
            { id: 'u4', stage: 'fusion', title: '对齐约束层', subtitle: '优化校验', detail: '保障方法可靠性' },
            { id: 'u5', stage: 'output', title: '输出与验证', subtitle: journalShort, detail: '任务结果输出' },
          ],
          experimentalValidation: experimentalValidation.trim() || baseAnatomy?.experimentalValidation || '',
          dataset: {
            sourceType: datasetSourceType,
            names: datasetNamesStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            scale: datasetScale.trim() || baseAnatomy?.dataset.scale || '依据原文实验设定',
            modalities: baseAnatomy?.dataset.modalities || [
              { label: '主模态数据', percentage: 60 },
              { label: '标注与辅助信息', percentage: 40 },
            ],
            constructionSteps: baseAnatomy?.dataset.constructionSteps || [
              { step: '01', title: '数据构建流程', description: datasetSummary || '依据原文构建与标注协议' },
            ],
            summary: datasetSummary.trim() || baseAnatomy?.dataset.summary || '已完成数据集来源确认',
          },
          comparisonMetrics: baseAnatomy?.comparisonMetrics
            ? {
                ...baseAnatomy.comparisonMetrics,
                rows: customRows.length > 0 ? customRows : baseAnatomy.comparisonMetrics.rows,
              }
            : {
                hasQuantitativeData: false,
                metricNames: ['对比说明'],
                primaryMetric: '对比说明',
                unit: '',
                rows: customRows,
              },
          ablationStudy: baseAnatomy?.ablationStudy
            ? { ...baseAnatomy.ablationStudy, summary: ablationSummary.trim() || baseAnatomy.ablationStudy.summary }
            : {
                hasQuantitativeData: false,
                metricName: '消融总结',
                unit: '',
                fullModelScore: '完整方法',
                items: [],
                summary: ablationSummary.trim() || '待补充消融细节',
              },
          conclusion: conclusion.trim() || baseAnatomy?.conclusion || '',
          futureAndLimitations: {
            paperLimitations: paperLimitationsStr
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            futureDirections: futureDirectionsStr
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          },
        };
      }

      if (editingPaper) {
        const saved = await updatePaper(editingPaper.id, payload);
        onSaved(saved, false);
      } else {
        const saved = await createPaper(payload);
        onSaved(saved, true);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-indigo-500 ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold">{isEditing ? '编辑文献与十维精读笔记' : '入库新文献 · 在线抓取或结构化录入'}</h2>
          </div>
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isEditing && (
          <div className="flex gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('import')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'import' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              arXiv / DOI / OpenAlex 一键抓取入库
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              十维精读表单录入
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          )}

          {mode === 'import' && !isEditing ? (
            <form onSubmit={handleImport} className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-relaxed text-slate-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="h-4 w-4" />
                  自动引文与元数据解析（arXiv + OpenAlex）
                </div>
                <p className="mt-1">
                  输入 arXiv 编号（如 <code className="font-mono-code font-semibold">2503.20020</code>）、DOI（如{' '}
                  <code className="font-mono-code font-semibold">10.1016/j.aei.2023.102333</code>）或英文标题关键词，系统将抓取真实摘要、发表日期与上下游引用关系图谱，并严格不伪造任何实验数值。
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold">arXiv ID / DOI / OpenAlex ID / 关键词</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="例如: 10.1016/j.jmsy.2026.01.003 或 2503.20020"
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  抓取元数据与引文并入库
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveManual} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">英文/原始标题 *</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">中文精译标题</label>
                  <input type="text" value={titleZh} onChange={(e) => setTitleZh(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">期刊 / 会议全称</label>
                  <input type="text" value={journal} onChange={(e) => setJournal(e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">期刊简称</label>
                    <input type="text" value={journalShort} onChange={(e) => setJournalShort(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">发表日期</label>
                    <input type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">作者（逗号分隔）</label>
                  <input type="text" value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">所属领域</label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value as DomainCategory)}
                    className={inputClass}
                  >
                    <option value="manufacturing">智能制造期刊</option>
                    <option value="computer_science">计算机顶刊顶会</option>
                    <option value="interdisciplinary">制造 × AI 交叉</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">研究方向标签</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TOPICS.map((t) => {
                    const active = topics.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTopic(t)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {TOPIC_META[t].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">DOI</label>
                  <input type="text" value={doi} onChange={(e) => setDoi(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">原文链接</label>
                  <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">一句话学术导读</label>
                <textarea rows={2} value={digestSummary} onChange={(e) => setDigestSummary(e.target.value)} className={inputClass} />
              </div>

              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h3 className="mb-3 text-xs font-bold text-indigo-600 dark:text-indigo-400">十维学术逻辑精读内容</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">01 研究背景</label>
                    <textarea rows={2} value={background} onChange={(e) => setBackground(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">02 核心问题</label>
                    <textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">03 研究现状</label>
                    <textarea rows={2} value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">04 现存局限性</label>
                    <textarea
                      rows={2}
                      value={limitationsOfPriorWork}
                      onChange={(e) => setLimitationsOfPriorWork(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">05 本文提出的方法</label>
                    <textarea rows={3} value={proposedMethod} onChange={(e) => setProposedMethod(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">06 实验验证设计</label>
                    <textarea
                      rows={3}
                      value={experimentalValidation}
                      onChange={(e) => setExperimentalValidation(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">07 数据集来源</label>
                    <select
                      value={datasetSourceType}
                      onChange={(e) => setDatasetSourceType(e.target.value as DatasetSourceType)}
                      className={inputClass}
                    >
                      <option value="public">公开基准数据集</option>
                      <option value="self_built">研究团队自建数据集</option>
                      <option value="hybrid">公开 + 自建混合</option>
                      <option value="unspecified">待精读核实</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">数据集名称（逗号分隔）</label>
                    <input type="text" value={datasetNamesStr} onChange={(e) => setDatasetNamesStr(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">规模与样本说明</label>
                    <input type="text" value={datasetScale} onChange={(e) => setDatasetScale(e.target.value)} className={inputClass} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-semibold">数据集如何构建</label>
                    <input type="text" value={datasetSummary} onChange={(e) => setDatasetSummary(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">08 对比实验表条目（每行: 方法: 结果说明）</label>
                    <textarea rows={2} value={comparisonInput} onChange={(e) => setComparisonInput(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">08 消融实验核心发现</label>
                    <textarea rows={2} value={ablationSummary} onChange={(e) => setAblationSummary(e.target.value)} className={inputClass} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold">09 研究结论</label>
                    <textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">10 本文局限性（每行一条）</label>
                    <textarea
                      rows={2}
                      value={paperLimitationsStr}
                      onChange={(e) => setPaperLimitationsStr(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">10 未来研究展望（每行一条）</label>
                    <textarea
                      rows={2}
                      value={futureDirectionsStr}
                      onChange={(e) => setFutureDirectionsStr(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEditing ? '保存更新' : '入库保存'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
