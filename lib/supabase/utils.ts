import type { TaskWithProject } from './types'

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
