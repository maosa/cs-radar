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
        <span className="text-[12px] font-medium text-[#19153F] truncate">
          {comment.author_name || 'Unknown'}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[11px] text-[#797979]">
            {formatTimestamp(comment.updated_at || comment.created_at)}
          </span>
          {!isEditing && canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
              <button
                onClick={onEditStart}
                className="p-1 rounded text-[#797979] hover:text-[#19153F] hover:bg-[#F2F2F2] transition-colors"
                title="Edit comment"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded text-[#797979] hover:text-[#FF0522] hover:bg-[#FFF0F2] transition-colors"
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
            className="w-full text-[13px] text-[#19153F] border border-[#DADADA] rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-[#38308F] bg-white mb-1.5"
          />
          <div className="flex gap-1.5">
            <button
              onClick={onEditSave}
              disabled={!editContent.trim()}
              className="px-2.5 py-1 text-[12px] font-medium bg-[#19153F] text-white rounded-[6px] disabled:opacity-40 transition-colors hover:bg-[#2a2460]"
            >
              Save
            </button>
            <button
              onClick={onEditCancel}
              className="px-2.5 py-1 text-[12px] font-medium border border-[#DADADA] rounded-[6px] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] bg-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[#595959] whitespace-pre-wrap break-words">{comment.content}</p>
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
  const [localDescription, setLocalDescription] = useState(taskDescription)
  const [localProduct, setLocalProduct] = useState<Product>(taskProduct as Product)
  const [localProjectId, setLocalProjectId] = useState<string | null>(taskProjectId)
  const [localWeekIndex, setLocalWeekIndex] = useState(() => dateStringToWeekIndex(taskWeekStartDate))

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
    localDescription !== taskDescription ||
    localProduct !== (taskProduct as Product) ||
    localProjectId !== taskProjectId ||
    localWeekIndex !== initialWeekIndex

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
    setLocalProduct(e.target.value as Product)
    setLocalProjectId(null)
  }

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalProjectId(e.target.value || null)
  }

  const handleWeekStep = (delta: number) => {
    const next = localWeekIndex + delta
    if (next < 0) return
    setLocalWeekIndex(next)
  }

  // ─── Footer: combined save ────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    const now = new Date().toISOString()

    if (isDetailsDirty) {
      const dateStr = weekIndexToDateString(localWeekIndex)
      const { error } = await supabase.from('tasks').update({
        description: localDescription,
        product: localProduct,
        project_id: localProjectId,
        week_start_date: dateStr,
        updated_at: now,
        updated_by: userId,
      }).eq('id', taskId)
      if (!error) {
        const projectName = projects.find(p => p.id === localProjectId)?.name ?? null
        onTaskUpdated?.({
          description: localDescription,
          product: localProduct,
          project_id: localProjectId,
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
  }, [isDetailsDirty, isNotesDirty, localDescription, localProduct, localProjectId, localWeekIndex,
      noteContent, note, taskId, userId, projects, onTaskUpdated])

  // ─── Footer: discard ─────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    setLocalDescription(taskDescription)
    setLocalProduct(taskProduct as Product)
    setLocalProjectId(taskProjectId)
    setLocalWeekIndex(dateStringToWeekIndex(taskWeekStartDate))
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
        className="fixed right-0 top-0 h-full w-[360px] z-50 bg-white shadow-2xl flex flex-col border-l border-[#DADADA] transition-transform duration-250 ease-out"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-[#DADADA] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <ProductBadge product={localProduct as 'AH' | 'EH' | 'NURO' | 'N/A'} />
              {(localProjectId
                ? (projects.find(p => p.id === localProjectId)?.name ?? taskProjectName)
                : taskProjectName) && (
                <span className="text-[12px] text-[#797979] truncate">
                  {localProjectId
                    ? (projects.find(p => p.id === localProjectId)?.name ?? taskProjectName)
                    : taskProjectName}
                </span>
              )}
            </div>
            {readOnlyNotes ? (
              <p className="text-[13px] font-medium text-[#19153F] leading-snug">{taskDescription}</p>
            ) : (
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                rows={2}
                className="w-full text-[13px] font-medium text-[#19153F] leading-snug resize-none bg-transparent border border-transparent rounded-[4px] focus:outline-none focus:border-[#38308F] focus:bg-white px-1 -mx-1 transition-colors"
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded text-[#797979] hover:text-[#19153F] hover:bg-[#F2F2F2] transition-colors"
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

          {/* Details */}
          <div className={`p-4 border-b border-[#DADADA]${readOnlyNotes ? ' opacity-50' : ''}`}>
            <h3 className="text-[11px] font-medium text-[#797979] uppercase tracking-wide mb-3">Details</h3>
            <div className="flex flex-col gap-3">

              {/* Product */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#595959] w-16 flex-shrink-0">Product</span>
                <select
                  value={localProduct}
                  onChange={handleProductChange}
                  disabled={readOnlyNotes}
                  className={`flex-1 h-8 px-2 text-[13px] border border-[#DADADA] rounded-[6px] text-[#19153F] focus:outline-none focus:border-[#38308F] ${readOnlyNotes ? 'bg-[#F2F2F2] cursor-not-allowed' : 'bg-white'}`}
                >
                  <option value="AH">Access Hub (AH)</option>
                  <option value="NURO">NURO</option>
                  <option value="EH">Evidence Hub (EH)</option>
                  <option value="N/A">N/A (Not Applicable)</option>
                </select>
              </div>

              {/* Project */}
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#595959] w-16 flex-shrink-0">Project</span>
                <select
                  value={localProjectId ?? ''}
                  onChange={handleProjectChange}
                  disabled={readOnlyNotes}
                  className={`flex-1 h-8 px-2 text-[13px] border border-[#DADADA] rounded-[6px] text-[#19153F] focus:outline-none focus:border-[#38308F] ${readOnlyNotes ? 'bg-[#F2F2F2] cursor-not-allowed' : 'bg-white'}`}
                >
                  <option value="">No project</option>
                  {projects
                    .filter((p) => p.product === localProduct || p.product === null || p.id === localProjectId)
                    .map((p) => {
                      const isMismatch = p.id === localProjectId && p.product !== null && p.product !== localProduct
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
                <span className="text-[12px] text-[#595959] w-16 flex-shrink-0">Week</span>
                <div className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => handleWeekStep(-1)}
                    disabled={readOnlyNotes || localWeekIndex <= 0}
                    className="p-1 rounded text-[#595959] disabled:opacity-30 transition-colors"
                    title="Previous week"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="flex-1 text-center text-[12px] text-[#19153F]">
                    {formatWeekHeader(localWeekIndex)}
                  </span>
                  <button
                    onClick={() => handleWeekStep(1)}
                    disabled={readOnlyNotes}
                    className="p-1 rounded text-[#595959] disabled:opacity-30 transition-colors"
                    title="Next week"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Notes */}
          <div ref={notesRef} className="p-4 border-b border-[#DADADA]">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[11px] font-medium text-[#797979] uppercase tracking-wide">Notes</h3>
              {noteSaving ? (
                <span className="text-[11px] text-[#797979]">Saving…</span>
              ) : note?.updated_at ? (
                <span className="text-[11px] text-[#797979]">Saved {formatTimestamp(note.updated_at)}</span>
              ) : null}
            </div>
            {noteLoading ? (
              <p className="text-[13px] text-[#797979]">Loading…</p>
            ) : readOnlyNotes ? (
              <textarea
                value={noteContent || ''}
                readOnly
                rows={7}
                placeholder="No notes added."
                className="w-full text-[13px] text-[#595959] placeholder:text-[#797979] placeholder:italic border border-[#DADADA] rounded-[6px] px-3 py-2 resize-none bg-[#F2F2F2] cursor-default focus:outline-none"
              />
            ) : (
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add notes about this task…"
                rows={7}
                className="w-full text-[13px] text-[#19153F] placeholder:text-[#797979] border border-[#DADADA] rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-[#38308F] bg-white"
              />
            )}
          </div>

          {/* Comments */}
          <div ref={commentsRef} className="p-4">
            <h3 className="text-[11px] font-medium text-[#797979] uppercase tracking-wide mb-3">Comments</h3>

            {commentsLoading ? (
              <p className="text-[13px] text-[#797979]">Loading…</p>
            ) : (
              <>
                {comments.length === 0 && (
                  <p className="text-[13px] text-[#797979] mb-4">No comments yet.</p>
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
                <div className="border-t border-[#DADADA] pt-3">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                    }}
                    placeholder="Add a comment…"
                    rows={2}
                    className="w-full text-[13px] text-[#19153F] placeholder:text-[#797979] border border-[#DADADA] rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-[#38308F] bg-white mb-2"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addingComment}
                    className="px-3 py-1.5 text-[13px] font-medium bg-[#19153F] text-white rounded-[6px] border border-transparent hover:bg-[#2a2460] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-[#DADADA] bg-white">
            <span className="text-[12px] text-[#797979]">Unsaved changes</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="px-2.5 py-1 text-[12px] font-medium border border-[#DADADA] rounded-[6px] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] bg-white disabled:opacity-40 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2.5 py-1 text-[12px] font-medium bg-[#19153F] text-white rounded-[6px] hover:bg-[#2a2460] disabled:opacity-40 transition-colors"
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
