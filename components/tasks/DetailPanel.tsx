'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import ProductBadge from './ProductBadge'
import { X, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

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

  const notesRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

  const handleNoteBlur = useCallback(async () => {
    if (noteContent === lastSavedContent.current) return
    setNoteSaving(true)
    const now = new Date().toISOString()
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
  }, [note, noteContent, taskId])

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
              <ProductBadge product={taskProduct as 'AH' | 'EH' | 'NURO' | 'N/A'} />
              {taskProjectName && (
                <span className="text-[12px] text-[#797979] truncate">{taskProjectName}</span>
              )}
            </div>
            <p className="text-[13px] font-medium text-[#19153F] leading-snug">{taskDescription}</p>
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
              noteContent ? (
                <p className="text-[13px] text-[#595959] whitespace-pre-wrap break-words">{noteContent}</p>
              ) : (
                <p className="text-[13px] text-[#797979] italic">No notes added.</p>
              )
            ) : (
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Add notes about this task…"
                rows={4}
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
                    {addingComment ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
