'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { csvEscape, formatExportDate, triggerDownload, AH_QUESTION_MAP, AH_QUESTION_ORDER } from './settings-utils'

export default function ExportSection({
  onToast,
  accountHealthEnabled,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  accountHealthEnabled: boolean
}) {
  const { userId } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [exportingAH, setExportingAH] = useState(false)

  const handleExport = async () => {
    if (!userId) return
    setExporting(true)
    try {
      // 1. Fetch all tasks with project names
      const { data: tasksRaw, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name)')
        .eq('admin_user_id', userId)
        .order('week_start_date')
        .order('sort_order')
      if (tasksErr) throw tasksErr
      const tasks = tasksRaw ?? []
      const taskIds = tasks.map((t) => t.id)

      if (taskIds.length === 0) {
        // No tasks — still produce a headers-only CSV
        const csv = '﻿' + ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged'].join(',')
        triggerDownload(csv, `tasks_${new Date().toISOString().slice(0, 10)}.csv`)
        return
      }

      // 2. Parallel fetch notes + comments
      const [notesRes, commentsRes] = await Promise.all([
        supabase.from('task_notes').select('task_id, content').in('task_id', taskIds),
        supabase.from('task_comments').select('task_id, content, created_by, updated_by, created_at, updated_at').in('task_id', taskIds).order('created_at'),
      ])
      if (notesRes.error) throw notesRes.error
      if (commentsRes.error) throw commentsRes.error
      const notes = notesRes.data ?? []
      const comments = commentsRes.data ?? []

      // 3. Resolve user names for comment authors
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

      // 4. Build lookup maps
      const notesMap: Record<string, string> = {}
      notes.forEach((n) => { notesMap[n.task_id] = n.content })

      const commentsMap: Record<string, string> = {}
      comments.forEach((c) => {
        const authorId = c.updated_by ?? c.created_by
        const timestamp = c.updated_at ?? c.created_at
        const name = nameMap[authorId] ?? 'Unknown'
        const date = formatExportDate(timestamp)
        const text = c.content.trimEnd()
        const entry = `[${name} on ${date}] ${text}${text.endsWith('.') ? '' : '.'}`
        commentsMap[c.task_id] = commentsMap[c.task_id] ? `${commentsMap[c.task_id]} ${entry}` : entry
      })

      // 5. Build rows
      const headers = ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged']
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

      // 6. Serialise + download (BOM for Excel UTF-8 compatibility)
      const csv = '﻿' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
      triggerDownload(csv, `tasks_${new Date().toISOString().slice(0, 10)}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportAccountHealth = async () => {
    if (!userId) return
    setExportingAH(true)
    try {
      const headers = [
        'Client Account', 'Month', 'Risk Category', 'Question', 'Response',
        'CS Lead Comment', 'Client Partner Comment', 'Renewal Date', 'Last Engagement', 'Type of Engagement',
      ]

      // 1. Parallel fetch accounts, metadata, and responses
      const [accountsRes, metadataRes, responsesRes] = await Promise.all([
        supabase
          .from('client_accounts')
          .select('id, name')
          .eq('admin_user_id', userId)
          .is('deleted_at', null)
          .order('sort_order'),
        supabase
          .from('account_health_metadata')
          .select('client_account_id, renewal_date, last_engagement_date, engagement_type')
          .eq('admin_user_id', userId),
        supabase
          .from('account_health_responses')
          .select('client_account_id, month, question_id, response, cs_lead_comment, client_partner_comment')
          .eq('admin_user_id', userId),
      ])
      if (accountsRes.error) throw accountsRes.error
      if (metadataRes.error) throw metadataRes.error
      if (responsesRes.error) throw responsesRes.error

      const accounts = accountsRes.data ?? []

      if (accounts.length === 0) {
        const csv = '﻿' + headers.join(',')
        triggerDownload(csv, `account_health_${new Date().toISOString().slice(0, 10)}.csv`)
        return
      }

      // 2. Build lookup maps
      const metadataMap: Record<string, { renewal_date: string | null; last_engagement_date: string | null; engagement_type: string | null }> = {}
      ;(metadataRes.data ?? []).forEach((m) => { metadataMap[m.client_account_id] = m })

      const responsesMap: Record<string, typeof responsesRes.data> = {}
      ;(responsesRes.data ?? []).forEach((r) => {
        if (!responsesMap[r.client_account_id]) responsesMap[r.client_account_id] = []
        responsesMap[r.client_account_id]!.push(r)
      })

      // 3. Build rows per account
      const rows: string[][] = []
      for (const account of accounts) {
        const meta = metadataMap[account.id]

        // Metadata row — account-level fields, risk columns empty
        rows.push([
          account.name, '', '', '', '', '', '',
          meta?.renewal_date ?? '',
          meta?.last_engagement_date ?? '',
          meta?.engagement_type ?? '',
        ])

        // Response rows — sorted by month then by canonical question order
        const accountResponses = (responsesMap[account.id] ?? []).slice().sort((a, b) => {
          const monthDiff = a.month.localeCompare(b.month)
          if (monthDiff !== 0) return monthDiff
          return (AH_QUESTION_ORDER[a.question_id] ?? 999) - (AH_QUESTION_ORDER[b.question_id] ?? 999)
        })

        for (const r of accountResponses) {
          const q = AH_QUESTION_MAP[r.question_id]
          const month = new Date(r.month + 'T12:00:00')
            .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
            .replace(' ', '-')
          rows.push([
            account.name,
            month,
            q?.category ?? r.question_id,
            q?.question ?? r.question_id,
            r.response ?? '',
            r.cs_lead_comment ?? '',
            r.client_partner_comment ?? '',
            '', '', '',
          ])
        }
      }

      // 4. Serialise + download (BOM for Excel UTF-8 compatibility)
      const csv = '﻿' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
      triggerDownload(csv, `account_health_${new Date().toISOString().slice(0, 10)}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExportingAH(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] text-text-secondary mb-4">
        Download all your tasks, notes, and comments as a CSV file.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting ? 'Exporting…' : 'Export to CSV'}
      </button>
      {accountHealthEnabled && (
        <>
          <hr className="border-border my-4" />
          <p className="text-[13px] text-text-secondary mb-4">
            Download all your Account Health data as a CSV file.
          </p>
          <button
            onClick={handleExportAccountHealth}
            disabled={exportingAH}
            className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exportingAH ? 'Exporting…' : 'Export Account Health to CSV'}
          </button>
        </>
      )}
    </div>
  )
}
