'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { ClientAccountRow, BuyerMatrixEntry } from '@/lib/supabase/types'
import BuyerMatrixTable from './BuyerMatrixTable'

type BuyerMatrixField = keyof Pick<
  BuyerMatrixEntry,
  'economic_buyer' | 'technical_buyer' | 'user_buyer' | 'coach_champion' | 'gatekeeper' | 'influencer'
>

interface BuyerMatrixViewProps {
  initialAccounts?: ClientAccountRow[]
  initialEntries?: BuyerMatrixEntry[]
  viewAsUserId?: string
  readOnly?: boolean
}

export default function BuyerMatrixView({
  initialAccounts,
  initialEntries,
  viewAsUserId,
  readOnly = false,
}: BuyerMatrixViewProps) {
  const { userId: loggedInUserId } = useAuth()
  const effectiveUserId = viewAsUserId ?? loggedInUserId

  const [adminName, setAdminName] = useState('')
  const [accounts, setAccounts] = useState<ClientAccountRow[]>(initialAccounts ?? [])
  const [entriesMap, setEntriesMap] = useState<Map<string, BuyerMatrixEntry>>(() => {
    const map = new Map<string, BuyerMatrixEntry>()
    for (const entry of initialEntries ?? []) {
      map.set(entry.client_account_id, entry)
    }
    return map
  })

  // Fetch admin name for manager view header
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

  // Fetch accounts client-side:
  // - Skip when we have server-provided initial data AND this is the owner view
  //   (initialAccounts present and viewAsUserId absent means server data is fresh enough)
  // - Always fetch for the manager view (viewAsUserId set) so visibility changes are reflected
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

  // Fetch entries client-side:
  // - Skip when we have server-provided initial data AND this is the owner view
  // - Always fetch for the manager view so existing entries are loaded on mount
  useEffect(() => {
    if (!effectiveUserId) return
    if (initialEntries && !viewAsUserId) return
    supabase
      .from('buyer_matrix_entries')
      .select('id, client_account_id, admin_user_id, economic_buyer, technical_buyer, user_buyer, coach_champion, gatekeeper, influencer, created_at, updated_at, updated_by')
      .eq('admin_user_id', effectiveUserId)
      .then(({ data }) => {
        if (!data) return
        setEntriesMap(() => {
          const map = new Map<string, BuyerMatrixEntry>()
          for (const entry of data as BuyerMatrixEntry[]) {
            map.set(entry.client_account_id, entry)
          }
          return map
        })
      })
  }, [effectiveUserId])

  // Realtime subscription for client_accounts changes (reorder, add, hide/unhide)
  // Re-fetches the full accounts list so row order stays in sync for both
  // the owner's page and the manager view without a manual refresh.
  useEffect(() => {
    if (!effectiveUserId) return
    const channel = supabase
      .channel(`bm_accounts:${effectiveUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_accounts',
          filter: `admin_user_id=eq.${effectiveUserId}`,
        },
        () => {
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
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  // Realtime subscription for live entry updates (owner and manager view)
  useEffect(() => {
    if (!effectiveUserId) return
    const channel = supabase
      .channel(`bmx:${effectiveUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buyer_matrix_entries',
          filter: `admin_user_id=eq.${effectiveUserId}`,
        },
        (payload) => {
          const row = payload.new as BuyerMatrixEntry
          if (!row?.client_account_id) return
          setEntriesMap((prev) => {
            const next = new Map(prev)
            next.set(row.client_account_id, row)
            return next
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  const handleSave = async (clientAccountId: string, field: BuyerMatrixField, value: string) => {
    if (!effectiveUserId) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('buyer_matrix_entries')
      .upsert(
        {
          client_account_id: clientAccountId,
          admin_user_id: effectiveUserId,
          [field]: value || null,
          updated_at: now,
          updated_by: loggedInUserId,
        },
        { onConflict: 'client_account_id' }
      )
      .select()
      .single()

    if (error) throw error

    if (data) {
      setEntriesMap((prev) => {
        const next = new Map(prev)
        next.set(clientAccountId, data as BuyerMatrixEntry)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {readOnly && adminName && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
          <Link
            href="/manager"
            className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-navy transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <span className="text-[13px] font-medium text-navy">
            {adminName}&rsquo;s Buyer Matrix
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-bg text-text-muted border border-border">
            Read only
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="px-6 pt-5 pb-4">
          {!readOnly && (
            <h1 className="text-[15px] font-medium text-navy mb-4">Buyer Matrix</h1>
          )}
          <BuyerMatrixTable
            accounts={accounts}
            entriesMap={entriesMap}
            readOnly={readOnly}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  )
}
