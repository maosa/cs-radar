import { createClient } from '@/lib/supabase/server'
import { csvEscape, AH_QUESTION_MAP, AH_QUESTION_ORDER } from '@/components/settings/settings-utils'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id
  const date = new Date().toISOString().slice(0, 10)
  const headers = [
    'Client Account', 'Month', 'Risk Category', 'Question', 'Response',
    'CS Lead Comment', 'Client Partner Comment', 'Renewal Date', 'Last Engagement', 'Type of Engagement',
  ]
  const BOM = '﻿'

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

  if (accountsRes.error) return new Response('Export failed', { status: 500 })
  if (metadataRes.error) return new Response('Export failed', { status: 500 })
  if (responsesRes.error) return new Response('Export failed', { status: 500 })

  const accounts = accountsRes.data ?? []

  if (accounts.length === 0) {
    const csv = BOM + headers.join(',')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="account_health_${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const metadataMap: Record<string, { renewal_date: string | null; last_engagement_date: string | null; engagement_type: string | null }> = {}
  ;(metadataRes.data ?? []).forEach((m) => { metadataMap[m.client_account_id] = m })

  const responsesMap: Record<string, typeof responsesRes.data> = {}
  ;(responsesRes.data ?? []).forEach((r) => {
    if (!responsesMap[r.client_account_id]) responsesMap[r.client_account_id] = []
    responsesMap[r.client_account_id]!.push(r)
  })

  const rows: string[][] = []
  for (const account of accounts) {
    const meta = metadataMap[account.id]

    rows.push([
      account.name, '', '', '', '', '', '',
      meta?.renewal_date ?? '',
      meta?.last_engagement_date ?? '',
      meta?.engagement_type ?? '',
    ])

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

  const csv = BOM + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="account_health_${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
