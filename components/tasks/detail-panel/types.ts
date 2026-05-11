import type { Product, ProjectRow } from '@/lib/supabase/types'

export type { Product, ProjectRow }

export interface NoteRow {
  id: string
  task_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
}

export interface CommentRow {
  id: string
  task_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
  author_name?: string
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}
