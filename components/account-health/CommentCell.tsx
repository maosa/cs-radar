'use client'

import { useState, useRef } from 'react'
import { Pencil } from 'lucide-react'

interface CommentCellProps {
  initialValue: string | null
  onSave: (value: string) => Promise<void>
  readOnly?: boolean
  // 'text' (default): always show "Add a comment…" placeholder when empty
  // 'icon': show pencil on hover only — no text; read-only empty cells are always blank
  emptyHint?: 'text' | 'icon'
}

export default function CommentCell({
  initialValue,
  onSave,
  readOnly = false,
  emptyHint = 'text',
}: CommentCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const enterEdit = () => {
    if (readOnly) return
    setDraft(initialValue ?? '')
    setError(null)
    setIsEditing(true)
    setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.value.length
        el.selectionEnd = el.value.length
        autoResize(el)
      }
    }, 0)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setDraft('')
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim())
      setIsEditing(false)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasContent = initialValue && initialValue.trim().length > 0

  if (isEditing) {
    return (
      <div className="px-2 py-3 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          rows={2}
          onChange={e => {
            setDraft(e.target.value)
            autoResize(e.target)
          }}
          disabled={saving}
          className="w-full px-2 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy resize-none overflow-hidden disabled:opacity-50"
        />
        {error && (
          <p className="text-[12px] text-[#C0001A]">{error}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-6 px-2.5 rounded-[6px] border border-navy bg-navy text-white text-[12px] font-medium hover:bg-navy/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="h-6 px-2.5 rounded-[6px] border border-border text-[12px] text-text-secondary hover:border-navy hover:text-navy disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (hasContent) {
    return (
      <div
        className={`group px-2 py-3 flex items-start gap-2 ${!readOnly ? 'cursor-pointer hover:bg-[#F7F7F7]' : ''}`}
        onClick={!readOnly ? enterEdit : undefined}
      >
        <p className="text-[13px] text-navy whitespace-pre-wrap flex-1 min-w-0">{initialValue}</p>
        {!readOnly && (
          <button
            onClick={e => { e.stopPropagation(); enterEdit() }}
            className="flex-shrink-0 p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy hover:bg-[#EBEBEB] transition-all"
            title="Edit comment"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
    )
  }

  // Empty cell — read-only: always blank regardless of emptyHint
  if (readOnly) {
    return <div className="px-2 py-3" />
  }

  // Empty cell — owner, icon hint: blank with hover-reveal pencil
  if (emptyHint === 'icon') {
    return (
      <div
        className="group px-2 py-3 flex items-center justify-end cursor-text hover:bg-[#F7F7F7]"
        onClick={enterEdit}
      >
        <button
          onClick={e => { e.stopPropagation(); enterEdit() }}
          className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy hover:bg-[#EBEBEB] transition-all"
          title="Add a comment"
        >
          <Pencil size={12} />
        </button>
      </div>
    )
  }

  // Empty cell — owner, text hint (default): always-visible placeholder
  return (
    <div
      className="px-2 py-3 cursor-text hover:bg-[#F7F7F7]"
      onClick={enterEdit}
    >
      <p className="text-[12px] text-text-muted italic">Add a comment…</p>
    </div>
  )
}
