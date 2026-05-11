import type { CSSProperties } from 'react'
import type { TaskWithProject } from '@/lib/supabase/types'

export function taskBg(t: TaskWithProject): CSSProperties {
  if (t.status === 'complete') return { backgroundColor: '#C3FFF8' }
  if (t.is_flagged) return { backgroundColor: '#FFCDD3' }
  return { backgroundColor: '#FFFFFF' }
}

export function descClass(t: TaskWithProject): string {
  if (t.status === 'complete') return 'line-through text-text-muted'
  if (t.is_flagged) return 'text-red-dark'
  return 'text-navy'
}

export function projectName(t: TaskWithProject): string {
  return t.project_name ?? '—'
}
