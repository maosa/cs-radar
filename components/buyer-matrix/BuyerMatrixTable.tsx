'use client'

import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'
import type { ClientAccountRow, BuyerMatrixEntry } from '@/lib/supabase/types'
import CommentCell from '@/components/account-health/CommentCell'
import ProductBadge from '@/components/tasks/ProductBadge'

type BuyerMatrixField = keyof Pick<
  BuyerMatrixEntry,
  'economic_buyer' | 'technical_buyer' | 'user_buyer' | 'coach_champion' | 'gatekeeper' | 'influencer'
>

interface Column {
  key: BuyerMatrixField
  label: string
  popover: { role: string; motivations: string; strategy: string }
}

const COLUMNS: Column[] = [
  {
    key: 'economic_buyer',
    label: 'Economic Buyer',
    popover: {
      role: 'Final budget approval',
      motivations: 'ROI, cost savings, efficiency',
      strategy: 'Business case, financial impact',
    },
  },
  {
    key: 'technical_buyer',
    label: 'Technical Buyer',
    popover: {
      role: 'Evaluates feasibility',
      motivations: 'Integration, compliance, risk',
      strategy: 'Demos, specs, security details',
    },
  },
  {
    key: 'user_buyer',
    label: 'User Buyer',
    popover: {
      role: 'Day-to-day usage',
      motivations: 'Usability, productivity',
      strategy: 'Training, ease-of-use benefits',
    },
  },
  {
    key: 'coach_champion',
    label: 'Coach / Champion',
    popover: {
      role: 'Internal advocate',
      motivations: 'Influence, innovation',
      strategy: 'Empowerment, co-creation',
    },
  },
  {
    key: 'gatekeeper',
    label: 'Gatekeeper',
    popover: {
      role: 'Controls access',
      motivations: 'Process adherence, control',
      strategy: 'Respect protocols, build trust',
    },
  },
  {
    key: 'influencer',
    label: 'Influencer',
    popover: {
      role: 'Shapes opinions',
      motivations: 'Thought leadership, trends',
      strategy: 'Insights, thought leadership',
    },
  },
]

interface BuyerMatrixTableProps {
  accounts: ClientAccountRow[]
  entriesMap: Map<string, BuyerMatrixEntry>
  readOnly?: boolean
  onSave: (clientAccountId: string, field: BuyerMatrixField, value: string) => Promise<void>
}

export default function BuyerMatrixTable({
  accounts,
  entriesMap,
  readOnly = false,
  onSave,
}: BuyerMatrixTableProps) {
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPopoverId) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPopoverId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openPopoverId])

  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-[13px] text-text-muted">No client accounts found. Add them in Settings.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: '960px' }}>
        <thead>
          <tr className="border-b border-border bg-[#F7F7F7]">
            <th
              className="text-left px-4 py-2.5 text-[12px] font-medium text-text-secondary border-r border-border whitespace-nowrap"
              style={{ width: '1px' }}
            >
              Client Accounts
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-2.5 text-[12px] font-medium text-text-secondary border-r border-border last:border-r-0"
                style={{ minWidth: '180px' }}
              >
                <div className="flex items-center gap-1.5">
                  <span>{col.label}</span>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenPopoverId(openPopoverId === col.key ? null : col.key)}
                      className="flex items-center text-text-muted hover:text-navy transition-colors"
                      aria-label={`Info about ${col.label}`}
                    >
                      <Info size={13} />
                    </button>
                    {openPopoverId === col.key && (
                      <div
                        ref={popoverRef}
                        className="absolute left-5 top-0 z-10 bg-white rounded-[8px] shadow-lg border border-border p-3 w-60"
                      >
                        <p className="text-[13px] font-medium text-navy mb-2">{col.label}</p>
                        <div className="flex flex-col gap-1.5 font-normal">
                          <p className="text-[12px]">
                            <span className="text-text-muted">Role in Decision: </span>
                            <span className="text-navy">{col.popover.role}</span>
                          </p>
                          <p className="text-[12px]">
                            <span className="text-text-muted">Motivations: </span>
                            <span className="text-navy">{col.popover.motivations}</span>
                          </p>
                          <p className="text-[12px]">
                            <span className="text-text-muted">Engagement Strategy: </span>
                            <span className="text-navy">{col.popover.strategy}</span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const entry = entriesMap.get(account.id)

            return (
              <tr key={account.id} className="border-b border-border hover:bg-[#FAFAFA]">
                <td
                  className="px-4 py-0 border-r border-border align-top whitespace-nowrap"
                >
                  <div className="py-3 flex items-center gap-3">
                    {/* Fixed-width slot sized to NURO (widest badge) keeps all names left-aligned */}
                    <div className="w-[46px] flex-shrink-0 flex items-center">
                      {account.product && <ProductBadge product={account.product} />}
                    </div>
                    <span className="text-[13px] font-medium text-navy whitespace-nowrap">{account.name}</span>
                  </div>
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="p-0 border-r border-border last:border-r-0 align-top"
                    style={{ minWidth: '180px' }}
                  >
                    <CommentCell
                      initialValue={entry?.[col.key] ?? null}
                      readOnly={readOnly}
                      onSave={(value) => onSave(account.id, col.key, value)}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
