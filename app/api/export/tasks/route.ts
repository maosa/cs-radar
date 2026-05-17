import { createClient } from '@/lib/supabase/server'
import { csvEscape, formatExportDate } from '@/components/settings/settings-utils'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id
  const date = new Date().toISOString().slice(0, 10)
  const headers = ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged']
  const BOM = '﻿'

  const { data: tasksRaw, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name)')
    .eq('admin_user_id', userId)
    .order('week_start_date')
    .order('sort_order')

  if (tasksErr) {
    return new Response('Export failed', { status: 500 })
  }

  const tasks = tasksRaw ?? []

  if (tasks.length === 0) {
    const csv = BOM + headers.join(',')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tasks_${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const taskIds = tasks.map((t) => t.id)

  const [notesRes, commentsRes] = await Promise.all([
    supabase.from('task_notes').select('task_id, content').in('task_id', taskIds),
    supabase
      .from('task_comments')
      .select('task_id, content, created_by, updated_by, created_at, updated_at')
      .in('task_id', taskIds)
      .order('created_at'),
  ])

  if (notesRes.error) return new Response('Export failed', { status: 500 })
  if (commentsRes.error) return new Response('Export failed', { status: 500 })

  const notes = notesRes.data ?? []
  const comments = commentsRes.data ?? []

  const authorIds = new Set<string>()
  comments.forEach((c) => {
    authorIds.add(c.created_by)
    if (c.updated_by) authorIds.add(c.updated_by)
  })

  const nameMap: Record<string, string> = {}
  if (authorIds.size > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', [...authorIds])
    if (users) {
      users.forEach((u) => {
        nameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown'
      })
    }
  }

  const notesMap: Record<string, string> = {}
  notes.forEach((n) => { notesMap[n.task_id] = n.content })

  const commentsMap: Record<string, string> = {}
  comments.forEach((c) => {
    const authorId = c.updated_by ?? c.created_by
    const timestamp = c.updated_at ?? c.created_at
    const name = nameMap[authorId] ?? 'Unknown'
    const dateStr = formatExportDate(timestamp)
    const text = c.content.trimEnd()
    const entry = `[${name} on ${dateStr}] ${text}${text.endsWith('.') ? '' : '.'}`
    commentsMap[c.task_id] = commentsMap[c.task_id] ? `${commentsMap[c.task_id]} ${entry}` : entry
  })

  const rows = tasks.map((task) => {
    const proj = task.projects as unknown as { name: string } | null
    return [
      task.week_start_date,
      task.product,
      proj?.name ?? '',
      task.description,
      notesMap[task.id] ?? '',
      commentsMap[task.id] ?? '',
      task.status === 'complete' ? 'Complete' : 'Open',
      task.is_flagged ? 'Yes' : 'No',
    ]
  })

  const csv = BOM + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tasks_${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
