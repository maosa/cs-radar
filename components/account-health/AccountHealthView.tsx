'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight, Gauge, ArrowLeft, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { ClientAccountRow, AccountHealthMetadata, EngagementType } from '@/lib/supabase/types'
import RiskAssessmentTable from './RiskAssessmentTable'

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
  initialAccounts?: ClientAccountRow[]
}

export default function AccountHealthView({
  viewAsUserId,
  readOnly = false,
  managerUserId,
  initialAccounts,
}: AccountHealthViewProps) {
  const { userId: loggedInUserId } = useAuth()
  const effectiveUserId = viewAsUserId ?? loggedInUserId

  const [adminName, setAdminName] = useState('')
  const [accounts, setAccounts] = useState<ClientAccountRow[]>(initialAccounts ?? [])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [metadata, setMetadata] = useState<AccountHealthMetadata | null>(null)

  const [renewalDate, setRenewalDate] = useState('')
  const [lastEngagementDate, setLastEngagementDate] = useState('')
  const [engagementType, setEngagementType] = useState<EngagementType | ''>('')

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [showCopyDropdown, setShowCopyDropdown] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [copyVersion, setCopyVersion] = useState(0)
  const copyDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCopyDropdown) return
    const handler = (e: MouseEvent) => {
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(e.target as Node)) {
        setShowCopyDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCopyDropdown])

  useEffect(() => {
    if (!readOnly || !viewAsUserId) return
    supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', viewAsUserId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAdminName([data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unknown')
        }
      })
  }, [readOnly, viewAsUserId])

  useEffect(() => {
    if (!effectiveUserId) return
    if (initialAccounts && !viewAsUserId) return
    supabase
      .from('client_accounts')
      .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
      .eq('admin_user_id', effectiveUserId)
      .eq('is_visible', true)
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => {
        setAccounts((data as ClientAccountRow[]) ?? [])
      })
  }, [effectiveUserId])

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
      .select('id, client_account_id, admin_user_id, renewal_date, renewal_date_updated_at, renewal_date_updated_by, last_engagement_date, last_engagement_date_updated_at, last_engagement_date_updated_by, engagement_type, engagement_type_updated_at, engagement_type_updated_by, updated_at, updated_by')
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

  const copyPrevious = async (mode: 'responses' | 'responses_and_comments') => {
    if (!selectedAccountId || !effectiveUserId) return
    setIsCopying(true)
    setShowCopyDropdown(false)

    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    const prevMonthStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
    const currMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`

    const { data } = await supabase
      .from('account_health_responses')
      .select('question_id, response, cs_lead_comment')
      .eq('client_account_id', selectedAccountId)
      .eq('month', prevMonthStr)

    if (data && data.length > 0) {
      const now = new Date().toISOString()
      await supabase
        .from('account_health_responses')
        .upsert(
          data.map(r => ({
            client_account_id: selectedAccountId,
            admin_user_id: effectiveUserId,
            month: currMonthStr,
            question_id: r.question_id,
            response: r.response,
            ...(mode === 'responses_and_comments' ? { cs_lead_comment: r.cs_lead_comment } : {}),
            updated_at: now,
            updated_by: actorId,
          })),
          { onConflict: 'client_account_id,month,question_id' }
        )
    }

    setCopyVersion(v => v + 1)
    setIsCopying(false)
  }

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null

  return (
    <div className="flex flex-col">
      {/* Sticky header: controls + table column header */}
      <div className="sticky top-0 z-10 bg-white">
        {readOnly && adminName ? (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
            <Link
              href="/manager"
              className="flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white transition-colors"
            >
              <ArrowLeft size={14} />
              Back
            </Link>
            <span className="text-[13px] font-medium text-navy truncate max-w-[200px]">
              {adminName}&rsquo;s Account Health
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-bg text-text-muted border border-border">
              Read only
            </span>
          </div>
        ) : null}
        <div className="px-6 pt-6 pb-4 flex flex-col gap-3 border-b border-border">
          {!readOnly && <h1 className="text-base font-medium text-navy">Account Health</h1>}

          {/* Single combined row */}
          <div className="flex items-end gap-3">
            {/* Client account selector */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] text-text-muted">Client account</label>
              <select
                value={selectedAccountId}
                onChange={e => {
                  setSelectedAccountId(e.target.value)
                  const now = new Date()
                  setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                }}
                disabled={readOnly && !viewAsUserId}
                className="h-8 min-w-max pl-3 pr-7 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy disabled:cursor-not-allowed"
              >
                <option value="">Select a client account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.product ? `${a.product} - ${a.name}` : a.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedAccount && (
              <>
                {/* Separator 1: between client account and renewal date */}
                <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0 mb-2" />

                {/* Renewal date */}
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

                {/* Last engagement */}
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

                {/* Type of engagement */}
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
                    className="h-8 min-w-max pl-2 pr-7 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy disabled:cursor-not-allowed disabled:bg-bg"
                  >
                    <option value="">Select…</option>
                    {(Object.keys(ENGAGEMENT_TYPE_LABELS) as EngagementType[]).map(k => (
                      <option key={k} value={k}>{ENGAGEMENT_TYPE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>

                {/* Separator 2: between type of engagement and month navigation */}
                <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0 mb-2" />

                {/* Month navigation */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[11px] text-text-muted">Month</label>
                  <div className="h-8 flex items-center gap-1">
                    <button
                      onClick={prevMonth}
                      className="flex items-center justify-center w-7 h-8 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={goToToday}
                      className={`h-8 flex items-center px-2.5 text-[12px] font-medium rounded border transition-colors ${
                        isCurrentMonth(currentMonth)
                          ? 'border-teal text-teal bg-white cursor-default'
                          : 'border-border text-text-secondary bg-white hover:border-teal hover:text-teal'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={nextMonth}
                      className="flex items-center justify-center w-7 h-8 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
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
                </div>

                {!readOnly && (
                  <>
                    {/* Separator 3: between month navigation and copy button */}
                    <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0 mb-2" />

                    {/* Copy previous */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[11px] text-text-muted invisible select-none">Action</label>
                      <div ref={copyDropdownRef} className="relative">
                        <button
                          onClick={() => setShowCopyDropdown(v => !v)}
                          disabled={isCopying}
                          className="h-8 flex items-center gap-1.5 px-3 py-1 rounded-[6px] border border-border text-[13px] text-text-secondary bg-white hover:border-border-hover hover:text-navy transition-colors disabled:opacity-50"
                        >
                          <Copy size={13} />
                          {isCopying ? 'Copying…' : 'Copy previous'}
                          <ChevronDown size={12} />
                        </button>
                        {showCopyDropdown && (
                          <div className="absolute top-full mt-1 left-0 z-30 bg-white border border-border rounded-[6px] shadow-md min-w-[200px] py-1 overflow-hidden">
                            <button
                              onClick={() => copyPrevious('responses')}
                              className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
                            >
                              Responses only
                            </button>
                            <button
                              onClick={() => copyPrevious('responses_and_comments')}
                              className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
                            >
                              Responses and comments
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Table column header — only when an account is selected */}
        {selectedAccount && (
          <div className="px-6 pt-3">
            <div className="flex bg-[#E8E8E8] border-x border-t border-b border-border rounded-t-[8px]">
              <div className="w-[280px] shrink-0 px-4 py-2.5 text-[13px] font-medium text-navy">Risk Category</div>
              <div className="w-[160px] shrink-0 px-4 py-2.5 text-[13px] font-medium text-navy">Response</div>
              <div className="flex-1 px-4 py-2.5 text-[13px] font-medium text-navy">CS Lead Comments</div>
              <div className="flex-1 px-4 py-2.5 text-[13px] font-medium text-navy">Client Partner Comments</div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {!selectedAccount ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Gauge size={28} className="text-border" />
          <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
        </div>
      ) : (
        <div className="px-6 pb-6 bg-white">
          <RiskAssessmentTable
            key={`${selectedAccount.id}-${currentMonth.getTime()}-${copyVersion}`}
            clientAccountId={selectedAccount.id}
            adminUserId={effectiveUserId!}
            actorUserId={actorId!}
            month={currentMonth}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  )
}
