'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { type CommentRow, formatTimestamp } from './types'

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

// ─── Comments section ─────────────────────────────────────────────────────────

export interface CommentsSectionProps {
  comments: CommentRow[]
  commentsLoading: boolean
  newComment: string
  addingComment: boolean
  editingCommentId: string | null
  editContent: string
  canEditAllComments: boolean
  userId: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onNewCommentChange: (v: string) => void
  onAddComment: () => void
  onEditStart: (commentId: string, content: string) => void
  onEditChange: (v: string) => void
  onEditSave: (commentId: string) => void
  onEditCancel: () => void
  onDeleteComment: (commentId: string) => void
}

export default function CommentsSection({
  comments,
  commentsLoading,
  newComment,
  addingComment,
  editingCommentId,
  editContent,
  canEditAllComments,
  userId,
  containerRef,
  onNewCommentChange,
  onAddComment,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDeleteComment,
}: CommentsSectionProps) {
  return (
    <div ref={containerRef} className="p-4">
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
                  onEditStart={() => onEditStart(comment.id, comment.content)}
                  onEditChange={onEditChange}
                  onEditSave={() => onEditSave(comment.id)}
                  onEditCancel={onEditCancel}
                  onDelete={() => onDeleteComment(comment.id)}
                />
              ))}
            </div>
          )}

          <div className="border-t border-border pt-3">
            <textarea
              value={newComment}
              onChange={(e) => onNewCommentChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAddComment()
              }}
              placeholder="Add a comment…"
              rows={2}
              className="w-full text-[13px] text-navy placeholder:text-text-muted border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white mb-2"
            />
            <button
              onClick={onAddComment}
              disabled={!newComment.trim() || addingComment}
              className="px-3 py-1.5 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {addingComment ? 'Posting…' : 'Post'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
