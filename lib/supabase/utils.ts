import type { TaskWithProject, ProjectTrackerEntry } from './types'

// Converts a raw Supabase tasks row (with joined `projects` and `task_comments`)
// into the TaskWithProject shape used throughout the app. Used both in the
// client-side query hook and in server-side prefetch queries so the shapes
// always match.
export function mapTaskRow(row: any): TaskWithProject {
  const proj = row.projects as { name: string } | null
  const tc = row.task_comments as { count: number }[] | null
  const { projects: _p, task_comments: _tc, ...rest } = row
  return {
    ...rest,
    project_name: proj?.name ?? null,
    comment_count: Array.isArray(tc) ? (tc[0]?.count ?? 0) : 0,
  } as TaskWithProject
}

// Converts a raw Supabase project_tracker_entries row (with joined `projects`
// and `project_tracker_comments`) into the ProjectTrackerEntry shape. Used in
// both the client-side hook and server-side prefetch so the shapes always match.
export function mapPTERow(row: any): ProjectTrackerEntry {
  const proj = row.projects as { name: string } | null
  const ptc = row.project_tracker_comments as { count: number }[] | null
  const { projects: _p, project_tracker_comments: _ptc, ...rest } = row
  return {
    ...rest,
    project_name: proj?.name ?? undefined,
    comment_count: Array.isArray(ptc) ? (ptc[0]?.count ?? 0) : 0,
  } as ProjectTrackerEntry
}
