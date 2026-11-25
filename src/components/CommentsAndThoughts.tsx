import React, { useState } from 'react';
import { Check, CornerDownRight, Edit3, Heart, Lightbulb, MessageSquare, Reply, Send, Trash2, X } from 'lucide-react';
import type { EntryType, PaperComment, UserProfile } from '../types/paper';
import { formatRelativeTimeZh } from './SocialEngagement';

interface CommentsAndThoughtsProps {
  paperId: string;
  comments: PaperComment[];
  currentUser: UserProfile | null;
  darkMode: boolean;
  onAdd: (
    paperId: string,
    payload: { content: string; entryType: EntryType; parentId?: string; replyToAuthor?: string }
  ) => Promise<void>;
  onEdit: (paperId: string, commentId: string, payload: { content: string; entryType: EntryType }) => Promise<void>;
  onDelete: (paperId: string, commentId: string) => Promise<void>;
  onToggleLike?: (paperId: string, commentId: string) => Promise<void>;
}

export const CommentsAndThoughts: React.FC<CommentsAndThoughtsProps> = ({
  paperId,
  comments,
  currentUser,
  darkMode,
  onAdd,
  onEdit,
  onDelete,
  onToggleLike,
}) => {
  const [filterType, setFilterType] = useState<'all' | EntryType>('all');
  const [entryType, setEntryType] = useState<EntryType>('comment');
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null);
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
      await onAdd(paperId, {
        content: text.trim(),
        entryType,
        parentId: replyTarget?.id,
        replyToAuthor: replyTarget?.author,
      });
      setText('');
      setReplyTarget(null);
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
    if (!c.userId) return currentUser?.role === 'admin';
    if (!currentUser) return false;
    return currentUser.role === 'admin' || currentUser.id === c.userId;
  };

  return (
    <div className="space-y-4">
      {/* Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all' as const, label: `全部动态 (${comments.length})` },
            { id: 'comment' as const, label: `学术评论 (${commentCount})` },
            { id: 'thought' as const, label: `深度思考 (${thoughtCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filterType === tab.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Social Bubble Composer */}
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEntryType('comment')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                entryType === 'comment'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              学术评论气泡
            </button>
            <button
              type="button"
              onClick={() => setEntryType('thought')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                entryType === 'thought'
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              深度思考笔记
            </button>
          </div>

          {replyTarget && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <CornerDownRight className="h-3.5 w-3.5" />
              <span>正在回复 @{replyTarget.author}</span>
              <button type="button" onClick={() => setReplyTarget(null)} className="ml-1 hover:text-rose-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3">
          {currentUser && (
            <div
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-xs"
              style={{ backgroundColor: currentUser.avatarColor }}
            >
              {currentUser.displayName.slice(0, 1)}
            </div>
          )}
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                replyTarget
                  ? `回复 @${replyTarget.author} 的观点...`
                  : entryType === 'thought'
                    ? '以气泡笔记记录您的课题启发、复现思路或改进设想（对团队成员可见且可追溯）...'
                    : '发表对该论文方法、原文图表或实验数据的评论交流...'
              }
              className={`flex-1 rounded-2xl border px-3.5 py-2 text-sm outline-none focus:border-indigo-500 ${
                darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'
              }`}
            />
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 self-end rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:self-stretch"
            >
              <Send className="h-4 w-4" />
              发送
            </button>
          </div>
        </div>
      </form>

      {/* Social Chat Bubble Stream */}
      {filtered.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">
          暂无讨论动态，来发表第一条学术评论或深度思考吧
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((c) => {
            const isThought = c.entryType === 'thought';
            const isEditing = editingId === c.id;
            const likes = c.likes || [];

            return (
              <div key={c.id} className="flex items-start gap-3">
                {/* User Avatar */}
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-xs"
                  style={{ backgroundColor: c.avatarColor || '#4F46E5' }}
                  title={c.username ? `${c.author} (@${c.username})` : c.author}
                >
                  {c.author.slice(0, 1)}
                </div>

                {/* Speech Bubble Container */}
                <div className="min-w-0 flex-1">
                  {/* Author & Meta Line */}
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{c.author}</span>
                    {c.username && <span className="text-slate-400">@{c.username}</span>}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.2 font-medium ${
                        isThought
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                          : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      }`}
                    >
                      {isThought ? <Lightbulb className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                      {isThought ? '深度思考' : '学术评论'}
                    </span>
                    {(c.userTags || []).slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-slate-100 px-1.5 py-0.2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {t}
                      </span>
                    ))}
                    <span className="text-slate-400">
                      {formatRelativeTimeZh(c.createdAt)}
                      {c.updatedAt ? ' · 已编辑' : ''}
                    </span>
                  </div>

                  {/* Speech Bubble Body */}
                  <div
                    className={`rounded-2xl rounded-tl-xs border px-4 py-3 text-sm shadow-2xs ${
                      isThought
                        ? darkMode
                          ? 'border-amber-900/60 bg-amber-950/25'
                          : 'border-amber-200/80 bg-amber-50/60'
                        : darkMode
                          ? 'border-slate-800 bg-slate-900'
                          : 'border-slate-200/90 bg-white'
                    }`}
                  >
                    {c.replyToAuthor && (
                      <div className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-indigo-50/80 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        <CornerDownRight className="h-3 w-3" />
                        回复 @{c.replyToAuthor}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="space-y-2">
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as EntryType)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="comment">学术评论</option>
                          <option value="thought">深度思考</option>
                        </select>
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm outline-none dark:border-indigo-700 dark:bg-slate-950"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            <X className="h-3.5 w-3.5" /> 取消
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            <Check className="h-3.5 w-3.5" /> 保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line leading-6 text-slate-800 dark:text-slate-200">{c.content}</p>
                    )}

                    {/* Bubble Footer Social Actions (Like + Traceable Likers + Reply + Edit/Delete) */}
                    {!isEditing && (
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                        <div className="flex flex-wrap items-center gap-3">
                          {onToggleLike && (
                            <button
                              type="button"
                              onClick={() => void onToggleLike(paperId, c.id)}
                              className={`inline-flex items-center gap-1 font-medium transition ${
                                c.likedByMe
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500 hover:text-rose-600 dark:text-slate-400'
                              }`}
                            >
                              <Heart className={`h-3.5 w-3.5 ${c.likedByMe ? 'fill-current' : ''}`} />
                              <span>{likes.length > 0 ? `赞 (${likes.length})` : '点赞'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEntryType('comment');
                              setReplyTarget({ id: c.id, author: c.author });
                            }}
                            className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400"
                          >
                            <Reply className="h-3.5 w-3.5" />
                            回复
                          </button>

                          {likes.length > 0 && (
                            <span className="text-slate-400">
                              {likes.map((l) => l.displayName).join('、')} 觉得很赞
                            </span>
                          )}
                        </div>

                        {canModify(c) && (
                          <div className="flex items-center gap-1.5">
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
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="删除"
                              onClick={() => void onDelete(paperId, c.id)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
