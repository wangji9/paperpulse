import React, { useState } from 'react';
import { Check, Edit3, Lightbulb, MessageSquare, Send, Trash2, X } from 'lucide-react';
import type { EntryType, PaperComment, UserProfile } from '../types/paper';

interface CommentsAndThoughtsProps {
  paperId: string;
  comments: PaperComment[];
  currentUser: UserProfile | null;
  darkMode: boolean;
  onAdd: (paperId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onEdit: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onDelete: (paperId: string, commentId: string) => Promise<void>;
}

export const CommentsAndThoughts: React.FC<CommentsAndThoughtsProps> = ({
  paperId,
  comments,
  currentUser,
  darkMode,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const [filterType, setFilterType] = useState<'all' | EntryType>('all');
  const [entryType, setEntryType] = useState<EntryType>('thought');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<EntryType>('comment');

  const thoughtCount = comments.filter((c) => c.entryType === 'thought').length;
  const commentCount = comments.filter((c) => c.entryType !== 'thought').length;
  const filtered = filterType === 'all' ? comments : comments.filter((c) => c.entryType === filterType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(paperId, { content: text.trim(), entryType });
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editText.trim()) return;
    await onEdit(paperId, commentId, { content: editText.trim(), entryType: editType });
    setEditingId(null);
  };

  const canModify = (c: PaperComment) => {
    if (!c.userId) return true;
    if (!currentUser) return false;
    return currentUser.role === 'admin' || currentUser.id === c.userId;
  };

  return (
    <div className="space-y-4">
      {/* Filter & Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all' as const, label: `全部 (${comments.length})` },
            { id: 'thought' as const, label: `深度思考 (${thoughtCount})` },
            { id: 'comment' as const, label: `学术评论 (${commentCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                filterType === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Create Form */}
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEntryType('thought')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              entryType === 'thought'
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <Lightbulb className="h-4 w-4" />
            记录深度思考
          </button>
          <button
            type="button"
            onClick={() => setEntryType('comment')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              entryType === 'comment'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            发表学术评论
          </button>
          <span className="text-sm text-slate-400">
            当前身份：{currentUser ? `${currentUser.displayName}` : '访客（登录后可附带个人标签）'}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              entryType === 'thought'
                ? '写下您的深度思考：例如本文方法迁移到自身课题的可行性、架构局限或改进设想...'
                : '写下对该文献实验、方法或数据集的评论与交流观点...'
            }
            className={`flex-1 rounded-xl border px-3.5 py-2 text-sm outline-none focus:border-indigo-500 ${
              darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'
            }`}
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {entryType === 'thought' ? '保存思考' : '发布评论'}
          </button>
        </div>
      </form>

      {/* List with inline Edit & Delete */}
      <div className="space-y-2.5">
        {filtered.map((c) => {
          const isThought = c.entryType === 'thought';
          const isEditing = editingId === c.id;

          return (
            <div
              key={c.id}
              className={`rounded-xl border p-3.5 text-sm ${
                isThought
                  ? darkMode
                    ? 'border-amber-900/60 bg-amber-950/20'
                    : 'border-amber-200/80 bg-amber-50/40'
                  : darkMode
                    ? 'border-slate-800 bg-slate-900'
                    : 'border-slate-200/80 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium ${
                      isThought
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                        : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    }`}
                  >
                    {isThought ? <Lightbulb className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    {isThought ? '深度思考' : '评论'}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{c.author}</span>
                  {(c.userTags || []).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="text-slate-400">
                    {c.createdAt.slice(0, 16).replace('T', ' ')}
                    {c.updatedAt ? '（已编辑）' : ''}
                  </span>
                </div>

                {canModify(c) && !isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="编辑"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditText(c.content);
                        setEditType(c.entryType);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={() => void onDelete(paperId, c.id)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="mt-2.5 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as EntryType)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="thought">深度思考</option>
                      <option value="comment">学术评论</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm outline-none dark:border-indigo-700 dark:bg-slate-950"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      <X className="h-3.5 w-3.5" /> 取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(c.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      <Check className="h-3.5 w-3.5" /> 保存修改
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-line leading-6 text-slate-700 dark:text-slate-200">{c.content}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
