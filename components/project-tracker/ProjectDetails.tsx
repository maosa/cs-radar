'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import CommentsSection from '@/components/tasks/detail-panel/CommentsSection'
import DetailPanelFooter from '@/components/tasks/detail-panel/DetailPanelFooter'
import DeleteConfirmModal from '@/components/tasks/task-table/DeleteConfirmModal'
import { useProjectTrackerComments } from '@/lib/hooks/useProjectTrackerComments'
import { supabase } from '@/lib/supabase/client'
import type { ProjectTrackerEntry, ProjectRow, Product } from '@/lib/supabase/types'
import type { CommentRow } from '@/components/tasks/detail-panel/types'

interface Props {
  entry: ProjectTrackerEntry | null
  projects: ProjectRow[]
  existingWeekEntries?: ProjectTrackerEntry[]
  isOpen: boolean
  onClose: () => void
  onUpdate: (id: string, patch: { project_id: string; product: Product; description: string }) => void
  currentUserId: string | null
  scope: 'own' | 'manager'
  initialSection?: 'details' | 'comments'
}

export default function ProjectDetails({
  entry,
  projects,
  existingWeekEntries = [],
  isOpen,
  onClose,
  onUpdate,
  currentUserId,
  scope,
  initialSection = 'details',
}: Props) {
  const isOwner = scope === 'own'
  const queryClient = useQueryClient()

  // ── Realtime subscription for comments ───────────────────────────────────
  useEffect(() => {
    const entryId = entry?.id
    const adminUserId = entry?.admin_user_id
    if (!isOpen || !entryId || !adminUserId) return
    const channel = supabase
      .channel(`ptc:${entryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_tracker_comments', filter: `admin_user_id=eq.${adminUserId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['project-tracker-comments', entryId] }) },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isOpen, entry?.id, entry?.admin_user_id, queryClient])

  // ── Slide-in animation ────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    } else {
      setVisible(false)
    }
  }, [isOpen])

  // ── Form state (owner only) ───────────────────────────────────────────────
  const [projectId, setProjectId] = useState(entry?.project_id ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [saving, setSaving] = useState(false)

  // Reset form whenever the entry changes (new panel opened)
  useEffect(() => {
    setProjectId(entry?.project_id ?? '')
    setDescription(entry?.description ?? '')
    setSaving(false)
  }, [entry?.id])

  // Auto-resize description textarea
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = descriptionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [description])

  // ── Dirty detection ───────────────────────────────────────────────────────
  const isDirty = isOwner && (
    projectId !== (entry?.project_id ?? '') ||
    description !== (entry?.description ?? '')
  )

  // ── Scroll refs ───────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || initialSection !== 'comments') return
    const timer = setTimeout(() => {
      if (commentsRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: commentsRef.current.offsetTop - 8, behavior: 'smooth' })
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [isOpen, initialSection, entry?.id])

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // ── Comments (React Query) ────────────────────────────────────────────────
  const {
    comments: rawComments,
    isLoading: commentsLoading,
    createComment,
    updateComment,
    deleteComment,
    isCreating,
  } = useProjectTrackerComments({ entryId: entry?.id ?? null, userId: currentUserId })

  // Cast to CommentRow shape — all fields used by CommentsSection are present
  const comments = rawComments as unknown as CommentRow[]

  // Comment UI state
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null)
  const [deletingComment, setDeletingComment] = useState(false)

  const handleAddComment = useCallback(() => {
    if (!newComment.trim()) return
    createComment(newComment.trim())
    setNewComment('')
  }, [newComment, createComment])

  const handleEditSave = useCallback((commentId: string) => {
    if (!editContent.trim()) return
    updateComment(commentId, editContent.trim())
    setEditingCommentId(null)
  }, [editContent, updateComment])

  const handleDeleteComment = useCallback((commentId: string) => {
    setPendingDeleteCommentId(commentId)
  }, [])

  const confirmDeleteComment = useCallback(async () => {
    if (!pendingDeleteCommentId) return
    setDeletingComment(true)
    deleteComment(pendingDeleteCommentId)
    setDeletingComment(false)
    setPendingDeleteCommentId(null)
  }, [pendingDeleteCommentId, deleteComment])

  // ── Save / Discard ────────────────────────────────────────────────────────
  const selectedProject = projects.find((p) => p.id === projectId) ?? null

  const handleSave = useCallback(async () => {
    if (!entry || !selectedProject) return
    setSaving(true)
    onUpdate(entry.id, {
      project_id: projectId,
      product: selectedProject.product ?? 'N/A',
      description: description.trim(),
    })
    setSaving(false)
  }, [entry, projectId, description, selectedProject, onUpdate])

  const handleDiscard = useCallback(() => {
    setProjectId(entry?.project_id ?? '')
    setDescription(entry?.description ?? '')
  }, [entry?.project_id, entry?.description])

  // ── Derived display values ────────────────────────────────────────────────
  // Project IDs already used by other entries this week — exclude from dropdown
  // to prevent unique-constraint violations on (admin_user_id, project_id, week_start_date).
  // The entry's own current project is always kept selectable.
  const usedProjectIds = new Set(
    existingWeekEntries
      .filter((e) => e.id !== entry?.id)
      .map((e) => e.project_id),
  )

  const visibleProjects = [...projects]
    .filter((p) => p.is_visible !== false && !usedProjectIds.has(p.id))
    .sort((a, b) => a.sort_order - b.sort_order)

  const displayProjectLabel = selectedProject
    ? `${selectedProject.product ?? 'N/A'} - ${selectedProject.name}`
    : (entry ? `${entry.product} - (project removed)` : '—')

  if (!isOpen || !entry) return null

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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-[13px] font-medium text-navy">Project details</h2>
          {!isOwner && (
            <span className="text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">
              Read only
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto flex-shrink-0 p-1.5 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
            title="Close panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

          {/* Project + Description */}
          <div className="p-4 flex flex-col gap-4 border-b border-border">

            {/* Project field */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                Project
              </label>
              {isOwner ? (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="pl-3 pr-7 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy-mid"
                >
                  {visibleProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product ?? 'N/A'} - {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[13px] text-navy">{displayProjectLabel}</p>
              )}
            </div>

            {/* Description field */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                Description
              </label>
              {isOwner ? (
                <>
                  <textarea
                    ref={descriptionRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={5000}
                    rows={5}
                    className="w-full text-[13px] text-navy border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white leading-relaxed overflow-hidden"
                    style={{ minHeight: '120px' }}
                  />
                  <p className="text-[11px] text-text-muted text-right">
                    {description.length.toLocaleString()}/5,000
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
                  {entry.description}
                </p>
              )}
            </div>

          </div>

          {/* Comments */}
          <CommentsSection
            comments={comments}
            commentsLoading={commentsLoading}
            newComment={newComment}
            addingComment={isCreating}
            editingCommentId={editingCommentId}
            editContent={editContent}
            canEditAllComments={isOwner}
            userId={currentUserId}
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

        {/* Footer — owner only, shown when dirty */}
        {isOwner && (
          <DetailPanelFooter
            isDirty={isDirty}
            saving={saving}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </div>
    </>
  )
}
