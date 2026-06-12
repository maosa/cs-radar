'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Users } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { ClientAccountRow, BuyerMatrixContact, BuyerMatrixBuyerType } from '@/lib/supabase/types'
import BuyerMatrixTable from './BuyerMatrixTable'
import AddEditContactModal, { type ContactFormData } from './AddEditContactModal'

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

  const [accounts, setAccounts]               = useState<ClientAccountRow[]>(initialAccounts ?? [])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [contacts, setContacts]               = useState<BuyerMatrixContact[]>([])
  const [modalOpen, setModalOpen]             = useState(false)
  const [editingContact, setEditingContact]   = useState<BuyerMatrixContact | null>(null)

  // Keep a ref so the realtime handler always sees the current selected account
  // without recreating the subscription channel.
  const selectedAccountIdRef = useRef(selectedAccountId)
  useEffect(() => { selectedAccountIdRef.current = selectedAccountId }, [selectedAccountId])

  // ── Fetch accounts ──────────────────────────────────────────────────────────
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
      .then(({ data }) => setAccounts((data as ClientAccountRow[]) ?? []))
  }, [effectiveUserId])

  // ── Fetch contacts when selected account changes ────────────────────────────
  useEffect(() => {
    if (!effectiveUserId || !selectedAccountId) {
      setContacts([])
      return
    }
    supabase
      .from('buyer_matrix_contacts')
      .select('*')
      .eq('admin_user_id', effectiveUserId)
      .eq('client_account_id', selectedAccountId)
      .order('sort_order')
      .then(({ data }) => setContacts((data as BuyerMatrixContact[]) ?? []))
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
          .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
          .eq('admin_user_id', effectiveUserId)
          .eq('is_visible', true)
          .is('deleted_at', null)
          .order('sort_order')
          .then(({ data }) => setAccounts((data as ClientAccountRow[]) ?? []))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  // ── Realtime: buyer_matrix_contacts ────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUserId) return
    const channel = supabase
      .channel(`bmc:${effectiveUserId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'buyer_matrix_contacts',
        filter: `admin_user_id=eq.${effectiveUserId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id: string }
          setContacts(prev => prev.filter(c => c.id !== old.id))
          return
        }
        const row = payload.new as BuyerMatrixContact
        // Only update state if this contact belongs to the currently viewed account
        if (row.client_account_id !== selectedAccountIdRef.current) return
        setContacts(prev => {
          const idx = prev.findIndex(c => c.id === row.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = row
            return next
          }
          return [...prev, row]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [effectiveUserId])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleModalSave = async (data: ContactFormData) => {
    if (!effectiveUserId || !selectedAccountId) return
    const now = new Date().toISOString()

    if (editingContact) {
      // Data fields propagate to every row sharing this person_id
      const sharedFields = {
        full_name:          data.full_name,
        email:              data.email  || null,
        role:               data.role   || null,
        additional_details: data.additional_details || null,
        updated_at:         now,
        updated_by:         loggedInUserId,
      }
      const { error: dataError } = await supabase
        .from('buyer_matrix_contacts')
        .update(sharedFields)
        .eq('person_id', editingContact.person_id)
      if (dataError) throw dataError

      // If the column changed, update buyer_type on this specific row only
      const newType = data.buyer_types[0]
      if (newType !== editingContact.buyer_type) {
        const { error: typeError } = await supabase
          .from('buyer_matrix_contacts')
          .update({ buyer_type: newType })
          .eq('id', editingContact.id)
        if (typeError) throw typeError
      }

      // Optimistic state update
      setContacts(prev => prev.map(c => {
        if (c.person_id === editingContact.person_id) {
          const updated = { ...c, ...sharedFields }
          if (c.id === editingContact.id && newType !== editingContact.buyer_type) {
            updated.buyer_type = newType
          }
          return updated
        }
        return c
      }))
    } else {
      // Generate one person_id shared across all selected columns
      const personId = crypto.randomUUID()
      const sharedFields = {
        client_account_id:  selectedAccountId,
        admin_user_id:      effectiveUserId,
        person_id:          personId,
        full_name:          data.full_name,
        email:              data.email  || null,
        role:               data.role   || null,
        additional_details: data.additional_details || null,
        updated_by:         loggedInUserId,
      }
      const newContacts = await Promise.all(
        data.buyer_types.map(async (type) => {
          const maxOrder = contacts
            .filter(c => c.buyer_type === type)
            .reduce((m, c) => Math.max(m, c.sort_order), -1)
          const { data: inserted, error } = await supabase
            .from('buyer_matrix_contacts')
            .insert({ ...sharedFields, buyer_type: type, sort_order: maxOrder + 1 })
            .select()
            .single()
          if (error) throw error
          return inserted as BuyerMatrixContact
        })
      )
      setContacts(prev => [...prev, ...newContacts])
    }
  }

  const handleDelete = async () => {
    if (!editingContact) return
    const { error } = await supabase
      .from('buyer_matrix_contacts')
      .delete()
      .eq('id', editingContact.id)
    if (error) throw error
    setContacts(prev => prev.filter(c => c.id !== editingContact.id))
  }

  const handleReorder = useCallback(async (buyerType: BuyerMatrixBuyerType, orderedIds: string[]) => {
    // Optimistic: update sort_order in local state immediately
    setContacts(prev => {
      const updated = [...prev]
      orderedIds.forEach((id, index) => {
        const idx = updated.findIndex(c => c.id === id)
        if (idx >= 0) updated[idx] = { ...updated[idx], sort_order: index }
      })
      return updated
    })
    // Persist in background — errors are silent (order will resync on next load)
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase.from('buyer_matrix_contacts').update({ sort_order: index }).eq('id', id)
      )
    )
  }, [])

  const openEditModal = (contact: BuyerMatrixContact) => {
    setEditingContact(contact)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingContact(null)
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
            onClick={() => { setEditingContact(null); setModalOpen(true) }}
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
            contacts={contacts}
            readOnly={readOnly}
            onEdit={openEditModal}
            onReorder={handleReorder}
          />
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <AddEditContactModal
          contact={editingContact}
          onClose={closeModal}
          onSave={handleModalSave}
          onDelete={editingContact ? handleDelete : undefined}
        />
      )}
    </div>
  )
}
