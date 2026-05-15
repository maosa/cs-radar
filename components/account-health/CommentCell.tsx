'use client'

import { useState, useEffect, useRef } from 'react'
import { Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

interface CommentCellProps {
  initialValue: string | null
  updatedAt: string | null
  updatedByUserId: string | null
  onSave: (value: string) => Promise<void>
  readOnly?: boolean
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date} at ${time}`
}

export default function CommentCell({
  initialValue,
  updatedAt,
  updatedByUserId,
  onSave,
  readOnly = false,
}: CommentCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!updatedByUserId || updatedByUserId === fetchedUserIdRef.current) return
    fetchedUserIdRef.current = updatedByUserId
    supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', updatedByUserId)
      .single()
      .then(({ data }) => {
        if (data) {
          setUserName([data.first_name, data.last_name].filter(Boolean).join(' ') || null)
        }
      })
  }, [updatedByUserId])

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
      <div className="px-4 py-3 flex flex-col gap-2">
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
        className={`group relative px-4 py-3 flex flex-col gap-1 ${!readOnly ? 'cursor-pointer hover:bg-[#F7F7F7]' : ''}`}
        onClick={!readOnly ? enterEdit : undefined}
      >
        {!readOnly && (
          <button
            onClick={e => { e.stopPropagation(); enterEdit() }}
            className="absolute top-2 right-2 p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy hover:bg-[#EBEBEB] transition-all"
            title="Edit comment"
          >
            <Pencil size={12} />
          </button>
        )}
        <p className="text-[13px] text-navy whitespace-pre-wrap">{initialValue}</p>
        {updatedAt && (
          <p className="text-[11px] text-text-muted">
            Updated{userName ? ` by ${userName}` : ''} on {formatDateTime(updatedAt)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={`px-4 py-3 ${!readOnly ? 'cursor-text hover:bg-[#F7F7F7]' : ''}`}
      onClick={!readOnly ? enterEdit : undefined}
    >
      <p className="text-[12px] text-text-muted italic">Add a comment…</p>
    </div>
  )
}
