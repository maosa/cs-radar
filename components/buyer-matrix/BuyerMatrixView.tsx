'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { ClientAccountRow, BuyerMatrixStakeholder, BuyerMatrixBuyerType } from '@/lib/supabase/types'
import BuyerMatrixTable from './BuyerMatrixTable'
import AddEditContactModal, { type ContactFormData } from './AddEditContactModal'

const ACCOUNT_FIELDS =
  'id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at'

const ROLE_KEYS: BuyerMatrixBuyerType[] = [
  'economic_buyer', 'technical_buyer', 'user_buyer',
  'coach_champion', 'gatekeeper', 'influencer',
]

/** sort_order is not unique, so tie-break on created_at to keep order stable. */
const bySortOrder = (a: BuyerMatrixStakeholder, b: BuyerMatrixStakeholder) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)

interface BuyerMatrixViewProps {
  initialAccounts?: ClientAccountRow[]
  viewAsUserId?: string
  readOnly?: boolean
}

export default function BuyerMatrixView({
  initialAccounts,
  viewAsUserId,
  readOnly = false,
}: BuyerMatrixViewProps) {
  const { userId: loggedInUserId } = useAuth()
  const effectiveUserId = viewAsUserId ?? loggedInUserId

  const [accounts, setAccounts]                   = useState<ClientAccountRow[]>(initialAccounts ?? [])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [stakeholders, setStakeholders]           = useState<BuyerMatrixStakeholder[]>([])
  const [modalOpen, setModalOpen]                 = useState(false)
  const [editingStakeholder, setEditingStakeholder] = useState<BuyerMatrixStakeholder | null>(null)

  // Assigned during render, not in an effect: an effect-synced ref lags one
  // commit, so a realtime event arriving between the state update and the sync
  // would be tested against the previously selected account.
  const selectedAccountIdRef = useRef(selectedAccountId)
  selectedAccountIdRef.current = selectedAccountId

  // ── Fetch accounts ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUserId) return
    if (initialAccounts && !viewAsUserId) return
    let ignore = false
    supabase
      .from('client_accounts')
      .select(ACCOUNT_FIELDS)
      .eq('admin_user_id', effectiveUserId)
      .eq('is_visible', true)
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => { if (!ignore) setAccounts((data as ClientAccountRow[]) ?? []) })
    return () => { ignore = true }
  }, [effectiveUserId, initialAccounts, viewAsUserId])

  // ── Fetch stakeholders when selected account changes ────────────────────────
  useEffect(() => {
    if (!effectiveUserId || !selectedAccountId) {
      setStakeholders([])
      return
    }
    // `ignore` guards against a slow response for account A landing after the
    // user has already switched to B, which would also clobber any row the
    // realtime handler added while the fetch was in flight.
    let ignore = false
    supabase
      .from('buyer_matrix_stakeholders')
      .select('*')
      .eq('admin_user_id', effectiveUserId)
      .eq('client_account_id', selectedAccountId)
      .order('sort_order')
      .order('created_at')
      .then(({ data }) => { if (!ignore) setStakeholders((data as BuyerMatrixStakeholder[]) ?? []) })
    return () => { ignore = true }
  }, [effectiveUserId, selectedAccountId])

  // ── Realtime: client_accounts (visibility / reorder) ───────────────────────
  useEffect(() => {
    if (!effectiveUserId) return
    const channel = supabase
      .channel(`bm_accounts:${effectiveUserId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'client_accounts',
        filter: `admin_user_id=eq.${effectiveUserId}`,
      }, () => {
        supabase
          .from('client_accounts')
          .select(ACCOUNT_FIELDS)
          .eq('admin_user_id', effectiveUserId)
          .eq('is_visible', true)
          .is('deleted_at', null)
          .order('sort_order')
          .then(({ data }) => setAccounts((data as ClientAccountRow[]) ?? []))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  // ── Realtime: buyer_matrix_stakeholders ────────────────────────────────────
  useEffect(() => {
    if (!effectiveUserId) return
    const channel = supabase
      .channel(`bms:${effectiveUserId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'buyer_matrix_stakeholders',
        filter: `admin_user_id=eq.${effectiveUserId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id: string }
          setStakeholders(prev => prev.filter(s => s.id !== old.id))
          return
        }
        const row = payload.new as BuyerMatrixStakeholder
        // Ignore rows belonging to an account we're not currently viewing
        if (row.client_account_id !== selectedAccountIdRef.current) return
        setStakeholders(prev => {
          const idx = prev.findIndex(s => s.id === row.id)
          const next = idx >= 0
            ? prev.map(s => (s.id === row.id ? row : s))
            : [...prev, row]
          return next.sort(bySortOrder)
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Deliberately not memoized: it reads `stakeholders` to compute the next
  // sort_order, and a stale closure would hand every added stakeholder the
  // same position.
  const handleModalSave = async (data: ContactFormData) => {
    if (!effectiveUserId || !selectedAccountId) return

    const fields = {
      full_name:          data.full_name,
      email:              data.email  || null,
      role:               data.role   || null,
      additional_details: data.additional_details || null,
      ...Object.fromEntries(ROLE_KEYS.map(k => [k, data.buyer_types.includes(k)])),
    }

    if (editingStakeholder) {
      const patch = { ...fields, updated_at: new Date().toISOString(), updated_by: loggedInUserId }
      const { error } = await supabase
        .from('buyer_matrix_stakeholders')
        .update(patch)
        .eq('id', editingStakeholder.id)
      if (error) throw error
      setStakeholders(prev =>
        prev.map(s => (s.id === editingStakeholder.id ? { ...s, ...patch } as BuyerMatrixStakeholder : s))
      )
    } else {
      const maxOrder = stakeholders.reduce((m, s) => Math.max(m, s.sort_order), -1)
      const { data: inserted, error } = await supabase
        .from('buyer_matrix_stakeholders')
        .insert({
          client_account_id: selectedAccountId,
          admin_user_id:     effectiveUserId,
          sort_order:        maxOrder + 1,
          updated_by:        loggedInUserId,
          ...fields,
        })
        .select()
        .single()
      if (error) throw error
      setStakeholders(prev => [...prev, inserted as BuyerMatrixStakeholder].sort(bySortOrder))
    }
  }

  const handleDelete = async () => {
    if (!editingStakeholder) return
    const { error } = await supabase
      .from('buyer_matrix_stakeholders')
      .delete()
      .eq('id', editingStakeholder.id)
    if (error) throw error
    setStakeholders(prev => prev.filter(s => s.id !== editingStakeholder.id))
  }

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    // Optimistic: apply the new positions immediately
    setStakeholders(prev => {
      const pos = new Map(orderedIds.map((id, i) => [id, i]))
      return prev
        .map(s => (pos.has(s.id) ? { ...s, sort_order: pos.get(s.id)! } : s))
        .sort(bySortOrder)
    })
    // One atomic statement rather than N parallel updates — interleaved realtime
    // echoes from per-row updates can re-deliver a stale sort_order and make the
    // dragged row jump back.
    await supabase.rpc('batch_update_bms_sort_order', {
      stakeholder_ids: orderedIds,
      sort_orders:     orderedIds.map((_, i) => i),
    })
  }, [])

  const openEditModal = (stakeholder: BuyerMatrixStakeholder) => {
    setEditingStakeholder(stakeholder)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingStakeholder(null)
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  return (
    <div className="flex flex-col min-w-0">
      {!readOnly && <PageHeader title="Buyer Matrix" />}

      {/* Filter bar */}
      <div className="px-6 py-3 flex items-center gap-4 border-b border-border bg-white">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] text-text-muted">Client account</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="h-8 min-w-max pl-3 pr-7 py-1.5 rounded-[6px] border border-border text-[13px] text-navy bg-white outline-none focus:border-navy"
          >
            <option value="">Select a client account…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.product ? `${a.product} - ${a.name}` : a.name}
              </option>
            ))}
          </select>
        </div>

        {!readOnly && (
          <button
            onClick={() => { setEditingStakeholder(null); setModalOpen(true) }}
            disabled={!selectedAccountId}
            className="flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium bg-navy text-white rounded-[6px] disabled:opacity-40 hover:bg-navy-hover transition-colors self-end"
          >
            <Plus size={14} />
            Add Person
          </button>
        )}
      </div>

      {/* Body */}
      {!selectedAccount ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Users size={28} className="text-border" />
          <p className="text-[13px] text-text-muted">Select a client account above to view the Buyer Matrix.</p>
        </div>
      ) : (
        <div className="px-6 py-6 bg-white">
          <BuyerMatrixTable
            stakeholders={stakeholders}
            readOnly={readOnly}
            onEdit={openEditModal}
            onReorder={handleReorder}
          />
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddEditContactModal
          stakeholder={editingStakeholder}
          onClose={closeModal}
          onSave={handleModalSave}
          onDelete={editingStakeholder ? handleDelete : undefined}
        />
      )}
    </div>
  )
}
