'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import ProductBadge from './ProductBadge'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { dateStringToWeekIndex, weekIndexToDateString } from '@/lib/weeks'
import type { Product, ProjectRow } from '@/lib/supabase/types'
import DetailsForm from './detail-panel/DetailsForm'
import NotesSection from './detail-panel/NotesSection'
import CommentsSection from './detail-panel/CommentsSection'
import DetailPanelFooter from './detail-panel/DetailPanelFooter'
import DeleteConfirmModal from './task-table/DeleteConfirmModal'
import type { NoteRow, CommentRow } from './detail-panel/types'

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
  taskOwnerUserId: string
  taskScope: 'own' | 'managed'
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
  taskOwnerUserId,
  taskScope,
}: DetailPanelProps) {
  const { userId } = useAuth()
  const queryClient = useQueryClient()

  // Slide-in animation
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Form state
  const initialWeekIndex = dateStringToWeekIndex(taskWeekStartDate)
  const [form, setForm] = useState({
    description: taskDescription,
    product: taskProduct as Product,
    projectId: taskProjectId,
    weekIndex: initialWeekIndex,
  })

  // Notes state
  const [note, setNote] = useState<NoteRow | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteLoading, setNoteLoading] = useState(true)
  const lastSavedContent = useRef('')

  // Auto-resize description textarea to fit content
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [form.description])

  // Comments state
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null)
  const [deletingComment, setDeletingComment] = useState(false)

  // Footer save state
  const [saving, setSaving] = useState(false)

  const notesRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ─── Dirty detection ─────────────────────────────────────────────────────

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
        weekIndex: initialWeekIndex,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDescription, taskProduct, taskProjectId, taskWeekStartDate])

  const isNotesDirty = noteContent !== lastSavedContent.current
  const isDirty = isDetailsDirty || isNotesDirty

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch note
  useEffect(() => {
    const fetchNote = async () => {
      setNoteLoading(true)
      const { data } = await supabase
        .from('task_notes')
        .select('id, task_id, content, created_by, created_at, updated_at, updated_by')
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

  // Fetch comments (single query with join — no N+1)
  useEffect(() => {
    const fetchComments = async () => {
      setCommentsLoading(true)
      const { data } = await supabase
        .from('task_comments')
        .select('*, author:users!created_by(first_name, last_name)')
        .eq('task_id', taskId)
        .order('created_at')
      if (data) {
        setComments(
          data.map((c) => {
            const author = c.author as { first_name: string | null; last_name: string | null } | null
            const name = author ? [author.first_name, author.last_name].filter(Boolean).join(' ') : ''
            const { author: _a, ...rest } = c
            return { ...rest, author_name: c.created_by === userId ? 'You' : (name || 'Unknown') }
          })
        )
      }
      setCommentsLoading(false)
    }
    fetchComments()
  }, [taskId, userId])

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

  // ─── Form field handlers ──────────────────────────────────────────────────

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((f) => ({ ...f, product: e.target.value as Product, projectId: null }))
  }

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((f) => ({ ...f, projectId: e.target.value || null }))
  }

  const handleWeekStep = (delta: number) => {
    setForm((f) => {
      const next = f.weekIndex + delta
      if (next < 0) return f
      return { ...f, weekIndex: next }
    })
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

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
        const projName = projects.find((p) => p.id === form.projectId)?.name ?? null
        onTaskUpdated?.({
          description: form.description,
          product: form.product,
          project_id: form.projectId,
          project_name: projName,
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
        if (!error && data) { setNote(data); lastSavedContent.current = noteContent }
      } else {
        const { data, error } = await supabase
          .from('task_notes')
          .insert({ task_id: taskId, content: noteContent, created_by: userId! })
          .select()
          .single()
        if (!error && data) { setNote(data); lastSavedContent.current = noteContent }
      }
      setNoteSaving(false)
    }

    setSaving(false)
  }, [isDetailsDirty, isNotesDirty, form, noteContent, note, taskId, userId, projects, onTaskUpdated])

  // ─── Discard ─────────────────────────────────────────────────────────────

  const handleDiscard = useCallback(() => {
    setForm({
      description: taskDescription,
      product: taskProduct as Product,
      projectId: taskProjectId,
      weekIndex: dateStringToWeekIndex(taskWeekStartDate),
    })
    setNoteContent(lastSavedContent.current)
  }, [taskDescription, taskProduct, taskProjectId, taskWeekStartDate])

  // ─── Comment handlers ─────────────────────────────────────────────────────

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
      queryClient.invalidateQueries({ queryKey: ['tasks', taskScope, taskOwnerUserId], exact: true })
    }
    setAddingComment(false)
  }, [newComment, taskId, userId, queryClient])

  const handleEditSave = useCallback(async (commentId: string) => {
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
  }, [editContent, userId])

  const handleDeleteComment = useCallback((commentId: string) => {
    setPendingDeleteCommentId(commentId)
  }, [])

  const confirmDeleteComment = useCallback(async () => {
    if (!pendingDeleteCommentId) return
    setDeletingComment(true)
    const { error } = await supabase.from('task_comments').delete().eq('id', pendingDeleteCommentId)
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== pendingDeleteCommentId))
      queryClient.invalidateQueries({ queryKey: ['tasks', taskScope, taskOwnerUserId], exact: true })
    }
    setDeletingComment(false)
    setPendingDeleteCommentId(null)
  }, [pendingDeleteCommentId, queryClient])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {pendingDeleteCommentId && (
        <DeleteConfirmModal
          title="Delete comment?"
          message="Are you sure you want to delete this comment? This action cannot be undone."
          deleting={deletingComment}
          onConfirm={confirmDeleteComment}
          onCancel={() => setPendingDeleteCommentId(null)}
        />
      )}

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
                ? (projects.find((p) => p.id === form.projectId)?.name ?? taskProjectName)
                : taskProjectName) && (
                <span className="text-[12px] text-text-muted truncate">
                  {form.projectId
                    ? (projects.find((p) => p.id === form.projectId)?.name ?? taskProjectName)
                    : taskProjectName}
                </span>
              )}
            </div>
            {readOnlyNotes ? (
              <p className="text-[13px] font-medium text-navy leading-snug">{taskDescription}</p>
            ) : (
              <textarea
                ref={descriptionRef}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={1}
                className="w-full text-[13px] font-medium text-navy leading-snug resize-none bg-transparent border border-transparent rounded-[4px] focus:outline-none focus:border-navy-mid focus:bg-white px-1 -mx-1 transition-colors overflow-hidden"
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
          <DetailsForm
            form={form}
            projects={projects}
            readOnly={readOnlyNotes}
            onProductChange={handleProductChange}
            onProjectChange={handleProjectChange}
            onWeekStep={handleWeekStep}
          />
          <NotesSection
            noteContent={noteContent}
            noteLoading={noteLoading}
            noteSaving={noteSaving}
            note={note}
            readOnly={readOnlyNotes}
            onChange={setNoteContent}
            containerRef={notesRef}
          />
          <CommentsSection
            comments={comments}
            commentsLoading={commentsLoading}
            newComment={newComment}
            addingComment={addingComment}
            editingCommentId={editingCommentId}
            editContent={editContent}
            canEditAllComments={canEditAllComments}
            userId={userId}
            containerRef={commentsRef}
            onNewCommentChange={setNewComment}
            onAddComment={handleAddComment}
            onEditStart={(id, content) => { setEditingCommentId(id); setEditContent(content) }}
            onEditChange={setEditContent}
            onEditSave={handleEditSave}
            onEditCancel={() => setEditingCommentId(null)}
            onDeleteComment={handleDeleteComment}
          />
        </div>

        <DetailPanelFooter
          isDirty={isDirty}
          saving={saving}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      </div>
    </>
  )
}
