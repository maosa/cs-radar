'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import ProductBadge from './ProductBadge'
import { X, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { dateStringToWeekIndex, weekIndexToDateString, formatWeekHeader } from '@/lib/weeks'
import type { Product, ProjectRow } from '@/lib/supabase/types'

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

interface NoteRow {
  id: string
  task_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
}

interface CommentRow {
  id: string
  task_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
  author_name?: string
}

// ─── Comment item ─────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: CommentRow
  isEditing: boolean
  editContent: string
  canEdit: boolean
  onEditStart: () => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onDelete: () => void
}

function CommentItem({
  comment,
  isEditing,
  editContent,
  canEdit,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: CommentItemProps) {
  return (
    <div className="group">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] font-medium text-navy truncate">
          {comment.author_name || 'Unknown'}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] text-text-muted">
            {formatTimestamp(comment.updated_at || comment.created_at)}
          </span>
          {!isEditing && canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
              <button
                onClick={onEditStart}
                className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                title="Edit comment"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded text-text-muted hover:text-red-flag hover:bg-red-hover transition-colors"
                title="Delete comment"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div>
          <textarea
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            autoFocus
            className="w-full text-[13px] text-navy border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white mb-1.5"
          />
          <div className="flex gap-1.5">
            <button
              onClick={onEditSave}
              disabled={!editContent.trim()}
              className="px-2.5 py-1 text-[12px] font-medium bg-navy text-white rounded-[6px] disabled:opacity-40 transition-colors hover:bg-navy-hover"
            >
              Save
            </button>
            <button
              onClick={onEditCancel}
              className="px-2.5 py-1 text-[12px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-text-secondary whitespace-pre-wrap break-words">{comment.content}</p>
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

export interface DetailPanelProps {
  taskId: string
  taskDescription: string
  taskProduct: string
  taskProjectName: string | null
  taskProjectId: string | null
  taskWeekStartDate: string
  projects: ProjectRow[]
  onTaskUpdated?: (fields: Partial<{
    description: string
    product: Product
    project_id: string | null
    project_name: string | null
    week_start_date: string
  }>) => void
  initialSection: 'notes' | 'comments'
  onClose: () => void
  readOnlyNotes?: boolean
  canEditAllComments?: boolean
}

export default function DetailPanel({
  taskId,
  taskDescription,
  taskProduct,
  taskProjectName,
  taskProjectId,
  taskWeekStartDate,
  projects,
  onTaskUpdated,
  initialSection,
  onClose,
  readOnlyNotes = false,
  canEditAllComments = true,
}: DetailPanelProps) {
  const { userId } = useAuth()

  // Slide-in animation
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Editable task fields (local — not saved until Save is clicked)
  const [form, setForm] = useState({
    description: taskDescription,
    product: taskProduct as Product,
    projectId: taskProjectId,
    weekIndex: dateStringToWeekIndex(taskWeekStartDate)
  })

  // Notes state
  const [note, setNote] = useState<NoteRow | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteLoading, setNoteLoading] = useState(true)
  const lastSavedContent = useRef('')

  // Comments state
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Footer save state
  const [saving, setSaving] = useState(false)

  const notesRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ─── Dirty detection (derived, no extra state) ───────────────────────────

  const initialWeekIndex = dateStringToWeekIndex(taskWeekStartDate)

  const isDetailsDirty =
    form.description !== taskDescription ||
    form.product !== (taskProduct as Product) ||
    form.projectId !== taskProjectId ||
    form.weekIndex !== initialWeekIndex

  useEffect(() => {
    if (!isDetailsDirty) {
      setForm({
        description: taskDescription,
        product: taskProduct as Product,
        projectId: taskProjectId,
        weekIndex: initialWeekIndex
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDescription, taskProduct, taskProjectId, taskWeekStartDate])

  const isNotesDirty = noteContent !== lastSavedContent.current

  const isDirty = isDetailsDirty || isNotesDirty

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch note
  useEffect(() => {
    const fetchNote = async () => {
      setNoteLoading(true)
      const { data } = await supabase
        .from('task_notes')
        .select('*')
        .eq('task_id', taskId)
        .maybeSingle()
      if (data) {
        setNote(data)
        setNoteContent(data.content)
        lastSavedContent.current = data.content
      }
      setNoteLoading(false)
    }
    fetchNote()
  }, [taskId])

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      setCommentsLoading(true)
      const { data } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((c) => c.created_by))]
        const nameMap: Record<string, string> = {}
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds)
        if (users) {
          users.forEach((u) => {
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ')
            nameMap[u.id] = name || 'Unknown'
          })
        }
        setComments(
          data.map((c) => ({
            ...c,
            author_name: c.created_by === userId ? 'You' : (nameMap[c.created_by] || 'Unknown'),
          }))
        )
      }
      setCommentsLoading(false)
    }
    fetchComments()
  }, [taskId])

  // Scroll to initial section after panel opens
  useEffect(() => {
    const timer = setTimeout(() => {
      const target = initialSection === 'notes' ? notesRef.current : commentsRef.current
      if (target && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' })
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [initialSection])

  // ─── Details field handlers (local state only — no Supabase) ─────────────

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm(f => ({ ...f, product: e.target.value as Product, projectId: null }))
  }

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm(f => ({ ...f, projectId: e.target.value || null }))
  }

  const handleWeekStep = (delta: number) => {
    setForm(f => {
      const next = f.weekIndex + delta
      if (next < 0) return f
      return { ...f, weekIndex: next }
    })
  }

  // ─── Footer: combined save ────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    const now = new Date().toISOString()

    if (isDetailsDirty) {
      const dateStr = weekIndexToDateString(form.weekIndex)
      const { error } = await supabase.from('tasks').update({
        description: form.description,
        product: form.product,
        project_id: form.projectId,
        week_start_date: dateStr,
        updated_at: now,
        updated_by: userId,
      }).eq('id', taskId)
      if (!error) {
        const projectName = projects.find(p => p.id === form.projectId)?.name ?? null
        onTaskUpdated?.({
          description: form.description,
          product: form.product,
          project_id: form.projectId,
          project_name: projectName,
          week_start_date: dateStr,
        })
      }
    }

    if (isNotesDirty) {
      setNoteSaving(true)
      if (note) {
        const { data, error } = await supabase
          .from('task_notes')
          .update({ content: noteContent, updated_at: now, updated_by: userId })
          .eq('id', note.id)
          .select()
          .single()
        if (!error && data) {
          setNote(data)
          lastSavedContent.current = noteContent
        }
      } else {
        const { data, error } = await supabase
          .from('task_notes')
          .insert({ task_id: taskId, content: noteContent, created_by: userId! })
          .select()
          .single()
        if (!error && data) {
          setNote(data)
          lastSavedContent.current = noteContent
        }
      }
      setNoteSaving(false)
    }

    setSaving(false)
  }, [isDetailsDirty, isNotesDirty, form, noteContent, note, taskId, userId, projects, onTaskUpdated])

  // ─── Footer: discard ─────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    setForm({
      description: taskDescription,
      product: taskProduct as Product,
      projectId: taskProjectId,
      weekIndex: dateStringToWeekIndex(taskWeekStartDate)
    })
    setNoteContent(lastSavedContent.current)
  }, [taskDescription, taskProduct, taskProjectId, taskWeekStartDate])

  // ─── Comments handlers ────────────────────────────────────────────────────

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim()) return
    setAddingComment(true)
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, content: newComment.trim(), created_by: userId! })
      .select()
      .single()
    if (!error && data) {
      setComments((prev) => [...prev, { ...data, author_name: 'You' }])
      setNewComment('')
    }
    setAddingComment(false)
  }, [newComment, taskId])

  const handleEditSave = useCallback(
    async (commentId: string) => {
      if (!editContent.trim()) return
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('task_comments')
        .update({ content: editContent.trim(), updated_at: now, updated_by: userId })
        .eq('id', commentId)
        .select()
        .single()
      if (!error && data) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...data, author_name: c.author_name } : c))
        )
        setEditingCommentId(null)
      }
    },
    [editContent]
  )

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId)
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    }
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-[360px] z-50 bg-white shadow-2xl flex flex-col border-l border-border transition-transform duration-250 ease-out"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <ProductBadge product={form.product as 'AH' | 'EH' | 'NURO' | 'N/A'} />
              {(form.projectId
                ? (projects.find(p => p.id === form.projectId)?.name ?? taskProjectName)
                : taskProjectName) && (
                <span className="text-[12px] text-text-muted truncate">
                  {form.projectId
                    ? (projects.find(p => p.id === form.projectId)?.name ?? taskProjectName)
                    : taskProjectName}
                </span>
              )}
            </div>
            {readOnlyNotes ? (
              <p className="text-[13px] font-medium text-navy leading-snug">{taskDescription}</p>
            ) : (
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full text-[13px] font-medium text-navy leading-snug resize-none bg-transparent border border-transparent rounded-[4px] focus:outline-none focus:border-navy-mid focus:bg-white px-1 -mx-1 transition-colors"
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

          {/* Details */}
          <div className={`p-4 border-b border-border${readOnlyNotes ? ' opacity-50' : ''}`}>
            <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-3">Details</h3>
            <div className="flex flex-col gap-3">

              {/* Product */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Product</span>
                <select
                  value={form.product}
                  onChange={handleProductChange}
                  disabled={readOnlyNotes}
                  className={`flex-1 h-8 px-2 text-[13px] border border-border rounded-[6px] text-navy focus:outline-none focus:border-navy-mid ${readOnlyNotes ? 'bg-bg cursor-not-allowed' : 'bg-white'}`}
                >
                  <option value="AH">Access Hub (AH)</option>
                  <option value="NURO">NURO</option>
                  <option value="EH">Evidence Hub (EH)</option>
                  <option value="N/A">N/A (Not Applicable)</option>
                </select>
              </div>

              {/* Project */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Project</span>
                <select
                  value={form.projectId ?? ''}
                  onChange={handleProjectChange}
                  disabled={readOnlyNotes}
                  className={`flex-1 h-8 px-2 text-[13px] border border-border rounded-[6px] text-navy focus:outline-none focus:border-navy-mid ${readOnlyNotes ? 'bg-bg cursor-not-allowed' : 'bg-white'}`}
                >
                  <option value="">No project</option>
                  {projects
                    .filter((p) => p.product === form.product || p.product === null || p.id === form.projectId)
                    .map((p) => {
                      const isMismatch = p.id === form.projectId && p.product !== null && p.product !== form.product
                      return (
                        <option key={p.id} value={p.id}>
                          {isMismatch ? `${p.name} (other product)` : p.name}
                        </option>
                      )
                    })}
                </select>
              </div>

              {/* Week */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Week</span>
                <div className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => handleWeekStep(-1)}
                    disabled={readOnlyNotes || form.weekIndex <= 0}
                    className="p-1 rounded text-text-secondary disabled:opacity-30 transition-colors"
                    title="Previous week"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="flex-1 text-center text-[12px] text-navy">
                    {formatWeekHeader(form.weekIndex)}
                  </span>
                  <button
                    onClick={() => handleWeekStep(1)}
                    disabled={readOnlyNotes}
                    className="p-1 rounded text-text-secondary disabled:opacity-30 transition-colors"
                    title="Next week"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Notes */}
          <div ref={notesRef} className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Notes</h3>
              {noteSaving ? (
                <span className="text-[11px] text-text-muted">Saving…</span>
              ) : note?.updated_at ? (
                <span className="text-[11px] text-text-muted">Saved {formatTimestamp(note.updated_at)}</span>
              ) : null}
            </div>
            {noteLoading ? (
              <p className="text-[13px] text-text-muted">Loading…</p>
            ) : readOnlyNotes ? (
              <textarea
                value={noteContent || ''}
                readOnly
                rows={7}
                placeholder="No notes added."
                className="w-full text-[13px] text-text-secondary placeholder:text-text-muted placeholder:italic border border-border rounded-[6px] px-3 py-2 resize-none bg-bg cursor-default focus:outline-none"
              />
            ) : (
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add notes about this task…"
                rows={7}
                className="w-full text-[13px] text-navy placeholder:text-text-muted border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white"
              />
            )}
          </div>

          {/* Comments */}
          <div ref={commentsRef} className="p-4">
            <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-3">Comments</h3>

            {commentsLoading ? (
              <p className="text-[13px] text-text-muted">Loading…</p>
            ) : (
              <>
                {comments.length === 0 && (
                  <p className="text-[13px] text-text-muted mb-4">No comments yet.</p>
                )}
                {comments.length > 0 && (
                  <div className="flex flex-col gap-4 mb-4">
                    {comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        isEditing={editingCommentId === comment.id}
                        editContent={editContent}
                        canEdit={canEditAllComments || comment.created_by === userId}
                        onEditStart={() => {
                          setEditingCommentId(comment.id)
                          setEditContent(comment.content)
                        }}
                        onEditChange={setEditContent}
                        onEditSave={() => handleEditSave(comment.id)}
                        onEditCancel={() => setEditingCommentId(null)}
                        onDelete={() => handleDeleteComment(comment.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Add comment */}
                <div className="border-t border-border pt-3">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                    }}
                    placeholder="Add a comment…"
                    rows={2}
                    className="w-full text-[13px] text-navy placeholder:text-text-muted border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white mb-2"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addingComment}
                    className="px-3 py-1.5 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {addingComment ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky footer — visible only when there are unsaved changes */}
        {isDirty && (
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-white">
            <span className="text-[12px] text-text-muted">Unsaved changes</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="px-2.5 py-1 text-[12px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white disabled:opacity-40 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2.5 py-1 text-[12px] font-medium bg-navy text-white rounded-[6px] hover:bg-navy-hover disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
