import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, PlusCircle, X } from 'lucide-react';
import type {
  AcademicPaper,
  DatasetSourceType,
  DomainCategory,
  ResearchTopic,
} from '../types/paper';
import { CORE_MFG_AI_JOURNALS, TOPIC_META, TRACKED_JOURNALS } from '../lib/constants';
import { createPaper, importPaperByIdentifier, updatePaper } from '../lib/api';

interface PaperFormModalProps {
  editingPaper?: AcademicPaper | null;
  darkMode: boolean;
  onClose: () => void;
  onSaved: (paper: AcademicPaper, isNew: boolean) => void;
}

const ALL_TOPICS: ResearchTopic[] = [
  'LLM',
  'AgentCollaboration',
  'KnowledgeGraph',
  'ComputerVision',
  'Multimodal',
  'EmbodiedAI',
];

export const PaperFormModal: React.FC<PaperFormModalProps> = ({
  editingPaper,
  darkMode,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(editingPaper);
  const [mode, setMode] = useState<'import' | 'manual'>(isEditing ? 'manual' : 'import');
  const [identifier, setIdentifier] = useState('');
  const [personalTagsStr, setPersonalTagsStr] = useState((editingPaper?.myPersonalTags || []).join(', '));
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
  const [affiliationsStr, setAffiliationsStr] = useState((editingPaper?.affiliations || []).join(', '));
  const [journal, setJournal] = useState(editingPaper?.journal || 'Journal of Manufacturing Systems');
  const [journalShort, setJournalShort] = useState(editingPaper?.journalShort || 'JMS');
  const [domain, setDomain] = useState<DomainCategory>(editingPaper?.domain || 'manufacturing');
  const [topics, setTopics] = useState<ResearchTopic[]>(editingPaper?.topics || ['LLM']);
  const [publishedDate, setPublishedDate] = useState(
    editingPaper?.publishedDate || new Date().toISOString().slice(0, 10)
  );
  const [doi, setDoi] = useState(editingPaper?.doi || '');
  const [url, setUrl] = useState(editingPaper?.url || '');
  const [abstractOriginal, setAbstractOriginal] = useState(editingPaper?.abstractOriginal || '');
  const [digestSummary, setDigestSummary] = useState(editingPaper?.digestSummary || '');

  // 10-part anatomy fields + figure/table interpretation
  const [modelName, setModelName] = useState(editingPaper?.anatomy.modelName || '');
  const [figureUrl, setFigureUrl] = useState(editingPaper?.anatomy.figureUrl || '');
  const [figureCaption, setFigureCaption] = useState(editingPaper?.anatomy.figureCaption || '');
  const [tableAnalysis, setTableAnalysis] = useState(editingPaper?.anatomy.tableAnalysis || '');
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
      const personalTags = personalTagsStr
        .split(/[,，]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const { paper, alreadyExists } = await importPaperByIdentifier(identifier.trim(), {
        addToMyKb: true,
        personalTags,
      });
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
      setError('请输入论文标题');
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
              [baseAnatomy?.comparisonMetrics.metricNames[0] || '对比说明']: (val || '—').trim(),
            },
          };
        });

      const personalTags = personalTagsStr
        .split(/[,，]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: Partial<AcademicPaper> & { quickAbstract?: string; addToMyKb?: boolean; personalTags?: string[] } = {
        title: title.trim(),
        titleZh: titleZh.trim() || title.trim(),
        authors: authorsStr
          .split(/[,，]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        affiliations: affiliationsStr
          .split(/[,，;；]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        journal: journal.trim(),
        journalShort: journalShort.trim(),
        domain,
        topics,
        publishedDate,
        doi: doi.trim(),
        url: url.trim() || '#',
        abstractOriginal: abstractOriginal.trim(),
        digestSummary: digestSummary.trim(),
        quickAbstract: abstractOriginal.trim() || `${background} ${problem} ${proposedMethod} ${experimentalValidation}`,
        addToMyKb: true,
        personalTags,
      };

      if (background.trim() || proposedMethod.trim() || modelName.trim() || figureUrl.trim()) {
        payload.anatomy = {
          modelName: modelName.trim() || baseAnatomy?.modelName || undefined,
          figureUrl: figureUrl.trim() || baseAnatomy?.figureUrl || undefined,
          figureCaption: figureCaption.trim() || baseAnatomy?.figureCaption || undefined,
          feedbackLoopLabel: baseAnatomy?.feedbackLoopLabel,
          tableAnalysis: tableAnalysis.trim() || baseAnatomy?.tableAnalysis || undefined,
          background: background.trim() || baseAnatomy?.background || '',
          problem: problem.trim() || baseAnatomy?.problem || '',
          currentStatus: currentStatus.trim() || baseAnatomy?.currentStatus || '',
          limitationsOfPriorWork: limitationsOfPriorWork.trim() || baseAnatomy?.limitationsOfPriorWork || '',
          proposedMethod: proposedMethod.trim() || baseAnatomy?.proposedMethod || '',
          architectureModules: baseAnatomy?.architectureModules?.length
            ? baseAnatomy.architectureModules
            : [
                { id: 'u1', stage: 'input', title: '输入数据流', subtitle: '原始观测', detail: '输入标准化处理' },
                { id: 'u2', stage: 'encoder', title: '特征表征层', subtitle: '编码映射', detail: '高维语义特征提取' },
                { id: 'u3', stage: 'core', title: '核心创新机制', subtitle: topics.join(' + '), detail: proposedMethod.slice(0, 80) },
                { id: 'u5', stage: 'output', title: '输出与验证', subtitle: journalShort, detail: '任务结果输出' },
              ],
          experimentalValidation: experimentalValidation.trim() || baseAnatomy?.experimentalValidation || '',
          dataset: {
            sourceType: datasetSourceType,
            names: datasetNamesStr
              .split(/[,，]+/)
              .map((s) => s.trim())
              .filter(Boolean),
            scale: datasetScale.trim() || baseAnatomy?.dataset.scale || '',
            modalities: baseAnatomy?.dataset.modalities || [],
            constructionSteps: baseAnatomy?.dataset.constructionSteps || [],
            summary: datasetSummary.trim() || baseAnatomy?.dataset.summary || '',
          },
          comparisonMetrics: baseAnatomy?.comparisonMetrics
            ? {
                ...baseAnatomy.comparisonMetrics,
                rows: customRows.length > 0 ? customRows : baseAnatomy.comparisonMetrics.rows,
              }
            : {
                hasQuantitativeData: false,
                metricNames: customRows.length ? ['对比说明'] : [],
                primaryMetric: customRows.length ? '对比说明' : '',
                unit: '',
                rows: customRows,
              },
          ablationStudy: baseAnatomy?.ablationStudy
            ? { ...baseAnatomy.ablationStudy, summary: ablationSummary.trim() || baseAnatomy.ablationStudy.summary }
            : {
                hasQuantitativeData: false,
                metricName: '',
                unit: '',
                fullModelScore: '',
                items: [],
                summary: ablationSummary.trim(),
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

  const inputClass = `w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 ${
    darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-4xl flex-col overflow-hidden border shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl ${
          darkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold">{isEditing ? '编辑文献' : '添加文献'}</h2>
          </div>
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isEditing && (
          <div className="flex gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('import')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                mode === 'import' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              在线自动解析入库
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              手动填写或粘贴摘要解析
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          )}

          {mode === 'import' && !isEditing ? (
            <form onSubmit={handleImport} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">arXiv 编号 / DOI / 论文标题</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="例如 2503.20020 或 10.1016/j.jmsy.2026.01.003"
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">个人知识库标签（可选，逗号分隔）</label>
                <input
                  type="text"
                  value={personalTagsStr}
                  onChange={(e) => setPersonalTagsStr(e.target.value)}
                  placeholder="例如：重点精读, 多智能体参考"
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  自动抓取解析并加入知识库
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveManual} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">论文标题 *</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">中文标题（留空可自动翻译）</label>
                  <input type="text" value={titleZh} onChange={(e) => setTitleZh(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">作者（逗号分隔）</label>
                  <input type="text" value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">作者单位 / 机构（逗号或分号分隔）</label>
                  <input
                    type="text"
                    value={affiliationsStr}
                    onChange={(e) => setAffiliationsStr(e.target.value)}
                    placeholder="例如：上海交通大学; 清华大学"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">期刊 / 会议全称（可直接选择16本制造核心期刊）</label>
                  <input
                    type="text"
                    list="tracked-journals-list"
                    value={journal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setJournal(val);
                      const matched = TRACKED_JOURNALS.find((j) => j.full.toLowerCase() === val.toLowerCase());
                      if (matched) setJournalShort(matched.short);
                    }}
                    className={inputClass}
                  />
                  <datalist id="tracked-journals-list">
                    {CORE_MFG_AI_JOURNALS.map((j) => (
                      <option key={j.short} value={j.full}>{j.short}</option>
                    ))}
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold">简称</label>
                    <input type="text" value={journalShort} onChange={(e) => setJournalShort(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">发表日期</label>
                    <input type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">所属领域</label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value as DomainCategory)}
                    className={inputClass}
                  >
                    <option value="manufacturing">智能制造</option>
                    <option value="computer_science">计算机</option>
                    <option value="interdisciplinary">制造与AI交叉</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">DOI</label>
                  <input type="text" value={doi} onChange={(e) => setDoi(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">研究方向标签</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TOPICS.map((t) => {
                    const active = topics.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTopic(t)}
                        className={`rounded-lg border px-2.5 py-1 text-sm font-medium transition ${
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

              <div>
                <label className="mb-1 block text-sm font-semibold">原文摘要（粘贴英文或中文摘要，未填下方模块时将自动拆解解析）</label>
                <textarea rows={3} value={abstractOriginal} onChange={(e) => setAbstractOriginal(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">导读概述</label>
                <textarea rows={2} value={digestSummary} onChange={(e) => setDigestSummary(e.target.value)} className={inputClass} />
              </div>

              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h3 className="mb-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">模型命名、方法图与图表解析</h3>
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold">核心模型 / 方法英文简称（如 CausalKGPT, FMEA-KG-RAG）</label>
                    <input
                      type="text"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="例如：MSFR-PVTN / ASMDO"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">论文原图 URL（可选，支持粘贴方法框图图片链接）</label>
                    <input
                      type="text"
                      value={figureUrl}
                      onChange={(e) => setFigureUrl(e.target.value)}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Fig. 1 方法框图解析说明</label>
                    <textarea
                      rows={2}
                      value={figureCaption}
                      onChange={(e) => setFigureCaption(e.target.value)}
                      placeholder="结合论文描述解释方法框图各模块的数据流转与协同机制"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Table 1 实验表格结果解析</label>
                    <textarea
                      rows={2}
                      value={tableAnalysis}
                      onChange={(e) => setTableAnalysis(e.target.value)}
                      placeholder="结合论文实验解释对比表格中本文方法相较基线的优势原因"
                      className={inputClass}
                    />
                  </div>
                </div>
                <h3 className="mb-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400">精读内容</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold">01 研究背景</label>
                    <textarea rows={2} value={background} onChange={(e) => setBackground(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">02 核心问题</label>
                    <textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">03 研究现状</label>
                    <textarea rows={2} value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">04 现存局限</label>
                    <textarea
                      rows={2}
                      value={limitationsOfPriorWork}
                      onChange={(e) => setLimitationsOfPriorWork(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">05 提出方法</label>
                    <textarea rows={3} value={proposedMethod} onChange={(e) => setProposedMethod(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">06 实验验证</label>
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
                    <label className="mb-1 block text-sm font-semibold">07 数据集来源</label>
                    <select
                      value={datasetSourceType}
                      onChange={(e) => setDatasetSourceType(e.target.value as DatasetSourceType)}
                      className={inputClass}
                    >
                      <option value="public">公开数据集</option>
                      <option value="self_built">自建数据集</option>
                      <option value="hybrid">公开与自建混合</option>
                      <option value="unspecified">未说明</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">数据集名称</label>
                    <input type="text" value={datasetNamesStr} onChange={(e) => setDatasetNamesStr(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">规模说明</label>
                    <input type="text" value={datasetScale} onChange={(e) => setDatasetScale(e.target.value)} className={inputClass} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-sm font-semibold">构建方式</label>
                    <input type="text" value={datasetSummary} onChange={(e) => setDatasetSummary(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold">08 对比实验表（每行：方法: 结果）</label>
                    <textarea rows={2} value={comparisonInput} onChange={(e) => setComparisonInput(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">08 消融实验总结</label>
                    <textarea rows={2} value={ablationSummary} onChange={(e) => setAblationSummary(e.target.value)} className={inputClass} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-semibold">09 研究结论</label>
                    <textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">10 本文局限（每行一条）</label>
                    <textarea
                      rows={2}
                      value={paperLimitationsStr}
                      onChange={(e) => setPaperLimitationsStr(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">10 未来展望（每行一条）</label>
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
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEditing ? '保存更新' : '保存并入库'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
