import { createClient } from '@/lib/supabase/server'
import { csvEscape } from '@/components/settings/settings-utils'

function formatWeekLabel(weekStartDate: string): string {
  // Return the Monday date as YYYYMMDD (e.g. 20260518)
  return weekStartDate.replace(/-/g, '')
}

function formatCommentDate(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id
  const date = new Date().toISOString().slice(0, 10)
  const headers = ['Week', 'Product', 'Project', 'Description', 'Flagged', 'Comments']
  const BOM = '﻿'

  // Fetch all entries (no week-window filter — full history export)
  const { data: entriesRaw, error: entriesErr } = await supabase
    .from('project_tracker_entries')
    .select('id, product, project_id, description, week_start_date, is_flagged, projects(name)')
    .eq('admin_user_id', userId)
    .order('week_start_date')
    .order('sort_order')

  if (entriesErr) {
    return new Response('Export failed', { status: 500 })
  }

  const entries = entriesRaw ?? []

  if (entries.length === 0) {
    const csv = BOM + headers.join(',')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="project_tracker_${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const entryIds = entries.map((e) => e.id)

  // Fetch all comments for these entries
  const { data: commentsRaw, error: commentsErr } = await supabase
    .from('project_tracker_comments')
    .select('entry_id, content, created_by, created_at')
    .in('entry_id', entryIds)
    .order('created_at')

  if (commentsErr) {
    return new Response('Export failed', { status: 500 })
  }

  const comments = commentsRaw ?? []

  // Fetch author names
  const authorIds = new Set(comments.map((c) => c.created_by))
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

  // Build comment map per entry
  const commentsMap: Record<string, string> = {}
  comments.forEach((c) => {
    const name = nameMap[c.created_by] ?? 'Unknown'
    const dateStr = formatCommentDate(c.created_at)
    const text = c.content.trimEnd()
    const entry = `[${name} on ${dateStr}] ${text}${text.endsWith('.') ? '' : '.'}`
    commentsMap[c.entry_id] = commentsMap[c.entry_id]
      ? `${commentsMap[c.entry_id]} ${entry}`
      : entry
  })

  const rows = entries.map((entry) => {
    const proj = entry.projects as unknown as { name: string } | null
    return [
      formatWeekLabel(entry.week_start_date),
      entry.product,
      proj?.name ?? '',
      entry.description,
      entry.is_flagged ? 'true' : 'false',
      commentsMap[entry.id] ?? '',
    ]
  })

  const csv = BOM + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="project_tracker_${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
