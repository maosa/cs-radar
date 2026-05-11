'use client'

import { type NoteRow, formatTimestamp } from './types'

export interface NotesSectionProps {
  noteContent: string
  noteLoading: boolean
  noteSaving: boolean
  note: NoteRow | null
  readOnly: boolean
  onChange: (v: string) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

export default function NotesSection({
  noteContent,
  noteLoading,
  noteSaving,
  note,
  readOnly,
  onChange,
  containerRef,
}: NotesSectionProps) {
  return (
    <div ref={containerRef} className="p-4 border-b border-border">
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
      ) : readOnly ? (
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
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add notes about this task…"
          rows={7}
          className="w-full text-[13px] text-navy placeholder:text-text-muted border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-navy-mid bg-white"
        />
      )}
    </div>
  )
}
