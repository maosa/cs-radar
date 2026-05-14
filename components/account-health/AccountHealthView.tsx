'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Gauge } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { ClientAccountRow, AccountHealthMetadata, EngagementType } from '@/lib/supabase/types'

const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  monthly_review: 'Monthly review',
  qbr: 'QBR',
  training: 'Training',
  project_call: 'Project call',
  spontaneous: 'Spontaneous mail / call',
  other: 'Other',
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' }) + ' - ' + d.getFullYear()
}

function isCurrentMonth(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

interface AccountHealthViewProps {
  viewAsUserId?: string
  readOnly?: boolean
  managerUserId?: string
}

export default function AccountHealthView({
  viewAsUserId,
  readOnly = false,
  managerUserId,
}: AccountHealthViewProps) {
  const { userId: loggedInUserId } = useAuth()
  const effectiveUserId = viewAsUserId ?? loggedInUserId

  const [accounts, setAccounts] = useState<ClientAccountRow[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [metadata, setMetadata] = useState<AccountHealthMetadata | null>(null)

  const [renewalDate, setRenewalDate] = useState('')
  const [lastEngagementDate, setLastEngagementDate] = useState('')
  const [engagementType, setEngagementType] = useState<EngagementType | ''>('')

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  // Load client accounts
  useEffect(() => {
    if (!effectiveUserId) return
    supabase
      .from('client_accounts')
      .select('*')
      .eq('admin_user_id', effectiveUserId)
      .eq('is_visible', true)
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => {
        setAccounts((data as ClientAccountRow[]) ?? [])
      })
  }, [effectiveUserId])

  // Load metadata when account changes
  useEffect(() => {
    if (!selectedAccountId) {
      setMetadata(null)
      setRenewalDate('')
      setLastEngagementDate('')
      setEngagementType('')
      return
    }
    supabase
      .from('account_health_metadata')
      .select('*')
      .eq('client_account_id', selectedAccountId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as AccountHealthMetadata | null
        setMetadata(row)
        setRenewalDate(row?.renewal_date ?? '')
        setLastEngagementDate(row?.last_engagement_date ?? '')
        setEngagementType((row?.engagement_type as EngagementType) ?? '')
      })
  }, [selectedAccountId])

  const actorId = managerUserId ?? loggedInUserId

  const saveRenewalDate = async (value: string) => {
    if (!selectedAccountId || !effectiveUserId) return
    await supabase.from('account_health_metadata').upsert({
      client_account_id: selectedAccountId,
      admin_user_id: effectiveUserId,
      renewal_date: value || null,
      renewal_date_updated_at: new Date().toISOString(),
      renewal_date_updated_by: actorId,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    }, { onConflict: 'client_account_id' })
  }

  const saveLastEngagementDate = async (value: string) => {
    if (!selectedAccountId || !effectiveUserId) return
    await supabase.from('account_health_metadata').upsert({
      client_account_id: selectedAccountId,
      admin_user_id: effectiveUserId,
      last_engagement_date: value || null,
      last_engagement_date_updated_at: new Date().toISOString(),
      last_engagement_date_updated_by: actorId,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    }, { onConflict: 'client_account_id' })
  }

  const saveEngagementType = async (value: EngagementType | '') => {
    if (!selectedAccountId || !effectiveUserId) return
    await supabase.from('account_health_metadata').upsert({
      client_account_id: selectedAccountId,
      admin_user_id: effectiveUserId,
      engagement_type: value || null,
      engagement_type_updated_at: new Date().toISOString(),
      engagement_type_updated_by: actorId,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    }, { onConflict: 'client_account_id' })
  }

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  return (
    <div className="p-6 flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Account health</h1>

      {/* Account selector row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] text-text-muted">Client account</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            disabled={readOnly && !viewAsUserId}
            className="h-8 pl-3 pr-7 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy disabled:cursor-not-allowed"
          >
            <option value="">Select a client account…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {selectedAccount && (
          <>
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-text-muted">Renewal date</label>
              <input
                type="date"
                value={renewalDate}
                onChange={e => setRenewalDate(e.target.value)}
                onBlur={() => saveRenewalDate(renewalDate)}
                readOnly={readOnly}
                className="h-8 px-2 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy read-only:cursor-default read-only:bg-bg"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-text-muted">Last engagement</label>
              <input
                type="date"
                value={lastEngagementDate}
                onChange={e => setLastEngagementDate(e.target.value)}
                onBlur={() => saveLastEngagementDate(lastEngagementDate)}
                readOnly={readOnly}
                className="h-8 px-2 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy read-only:cursor-default read-only:bg-bg"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-text-muted">Type of engagement</label>
              <select
                value={engagementType}
                onChange={e => {
                  const val = e.target.value as EngagementType | ''
                  setEngagementType(val)
                  saveEngagementType(val)
                }}
                disabled={readOnly}
                className="h-8 pl-2 pr-7 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy disabled:cursor-not-allowed disabled:bg-bg"
              >
                <option value="">Select…</option>
                {(Object.keys(ENGAGEMENT_TYPE_LABELS) as EngagementType[]).map(k => (
                  <option key={k} value={k}>{ENGAGEMENT_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Month navigation — only shown when an account is selected */}
      {selectedAccount && (
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="flex items-center justify-center w-7 h-7 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goToToday}
            className={`px-2.5 py-1 text-[12px] font-medium rounded border transition-colors ${
              isCurrentMonth(currentMonth)
                ? 'border-teal text-teal bg-white cursor-default'
                : 'border-border text-text-secondary bg-white hover:border-teal hover:text-teal'
            }`}
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="flex items-center justify-center w-7 h-7 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
          <span className="text-[14px] font-medium text-navy ml-2">
            {formatMonthLabel(currentMonth)}
          </span>
          {isCurrentMonth(currentMonth) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
              current
            </span>
          )}
        </div>
      )}

      {/* Empty state or table placeholder */}
      {!selectedAccount ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Gauge size={28} className="text-border" />
          <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
        </div>
      ) : (
        <div className="text-[13px] text-text-muted">Risk assessment table coming in Phase C.</div>
      )}
    </div>
  )
}
