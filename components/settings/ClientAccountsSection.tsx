'use client'

import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { ClientAccountRow, Product } from '@/lib/supabase/types'
import { GripVertical, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ConfirmDialog from './ConfirmDialog'
import { ProjectProductBadge } from './SectionCard'
import { PRODUCTS } from './settings-types'

interface SortableClientAccountRowProps {
  account: ClientAccountRow
  editingId: string | null
  editName: string
  editProduct: Product | null
  editInputRef: React.RefObject<HTMLInputElement | null>
  onEditStart: (account: ClientAccountRow) => void
  onEditNameChange: (name: string) => void
  onEditProductChange: (product: Product | null) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onToggleVisibility: (account: ClientAccountRow) => void
  onDelete: (account: ClientAccountRow) => void
}

const SortableClientAccountRow = memo(function SortableClientAccountRow({
  account,
  editingId,
  editName,
  editProduct,
  editInputRef,
  onEditStart,
  onEditNameChange,
  onEditProductChange,
  onEditSave,
  onEditCancel,
  onToggleVisibility,
  onDelete,
}: SortableClientAccountRowProps) {
  const isEditing = editingId === account.id
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id, disabled: isEditing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2.5 group border-b border-bg last:border-b-0"
    >
      <span
        {...(isEditing ? {} : { ...attributes, ...listeners })}
        className={`flex-shrink-0 text-border transition-colors ${
          isEditing
            ? 'invisible'
            : 'cursor-grab active:cursor-grabbing group-hover:text-text-muted'
        }`}
      >
        <GripVertical size={14} />
      </span>

      {isEditing ? (
        <>
          <select
            value={editProduct ?? ''}
            onChange={(e) => onEditProductChange((e.target.value as Product) || null)}
            className="pl-2 pr-7 py-1.5 rounded-[6px] border border-border text-[12px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
          >
            <option value="">Unassigned</option>
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <input
            ref={editInputRef}
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave(account.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="flex-1 px-2.5 py-1.5 rounded-[6px] border border-navy text-[13px] text-navy outline-none"
          />
          <button
            onClick={() => onEditSave(account.id)}
            className="p-1.5 rounded-[4px] text-navy hover:bg-bg"
            title="Save"
          >
            <Check size={13} />
          </button>
          <button
            onClick={onEditCancel}
            className="p-1.5 rounded-[4px] text-text-muted hover:bg-bg"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <>
          <div className={`flex items-center gap-2 flex-1 min-w-0 ${!account.is_visible ? 'opacity-40' : ''}`}>
            <ProjectProductBadge product={account.product} />
            <span className="text-[13px] text-navy truncate">{account.name}</span>
          </div>
          <button
            onClick={() => onToggleVisibility(account)}
            className={`p-1.5 rounded-[4px] hover:bg-bg transition-colors ${
              account.is_visible
                ? 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy'
                : 'text-[#AAAAAA] opacity-100 hover:text-navy'
            }`}
            title={account.is_visible ? 'Hide from selectors' : 'Show in selectors'}
          >
            {account.is_visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            onClick={() => onEditStart(account)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-navy transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(account)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-red-flag-light hover:text-red-dark transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
})

export default function ClientAccountsSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const [accounts, setAccounts] = useState<ClientAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newProduct, setNewProduct] = useState<Product | ''>('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClientAccountRow | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => { loadAccounts() }, [userId])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  async function loadAccounts() {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('client_accounts')
      .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
      .eq('admin_user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    setAccounts((data as ClientAccountRow[]) ?? [])
    setLoading(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    if (!newProduct) {
      setAddError('Please select a product.')
      return
    }
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.product === newProduct)) {
      setAddError('A client account with this name already exists for the selected product.')
      return
    }
    setAdding(true)
    setAddError('')
    const nextOrder = accounts.length
    const { data, error } = await supabase
      .from('client_accounts')
      .insert({
        admin_user_id: userId!,
        name,
        product: newProduct,
        sort_order: nextOrder,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
    setAdding(false)
    if (error || !data) {
      onToast(
        error?.code === '23505'
          ? 'A client account with this name already exists for the selected product.'
          : 'Failed to add client account.',
        'error',
      )
    } else {
      setAccounts((prev) => [...prev, data as ClientAccountRow])
      setNewName('')
      setNewProduct('')
      onToast('Client account added.')
    }
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    if (accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase() && a.product === editProduct)) {
      onToast('A client account with this name already exists for the selected product.', 'error')
      return
    }
    const { error } = await supabase
      .from('client_accounts')
      .update({ name, product: editProduct, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      onToast(
        error.code === '23505'
          ? 'A client account with this name already exists for the selected product.'
          : 'Failed to save client account.',
        'error',
      )
    } else {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, name, product: editProduct } : a)))
      onToast('Client account saved.')
    }
    setEditingId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = accounts.findIndex((a) => a.id === active.id)
    const newIndex = accounts.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(accounts, oldIndex, newIndex)

    setAccounts(reordered)

    await Promise.all(
      reordered.map((a, idx) =>
        supabase
          .from('client_accounts')
          .update({ sort_order: idx, updated_at: new Date().toISOString() })
          .eq('id', a.id),
      ),
    )
  }

  const initiateDelete = async (account: ClientAccountRow) => {
    // Check if any assessment data exists for this account
    const [responsesRes, metadataRes] = await Promise.all([
      supabase
        .from('account_health_responses')
        .select('id', { count: 'exact', head: true })
        .eq('client_account_id', account.id),
      supabase
        .from('account_health_metadata')
        .select('id', { count: 'exact', head: true })
        .eq('client_account_id', account.id),
    ])
    const hasData = (responsesRes.count ?? 0) > 0 || (metadataRes.count ?? 0) > 0
    setDeleteBlocked(hasData)
    setDeleteTarget(account)
  }

  const handleToggleVisibility = async (account: ClientAccountRow) => {
    const newVisibility = !account.is_visible
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, is_visible: newVisibility } : a)))
    const { error } = await supabase
      .from('client_accounts')
      .update({ is_visible: newVisibility, updated_at: new Date().toISOString() })
      .eq('id', account.id)
    if (error) {
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, is_visible: account.is_visible } : a)))
      onToast('Failed to update visibility.', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase
      .from('client_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
    if (error) {
      onToast('Failed to delete client account.', 'error')
    } else {
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      onToast('Client account deleted.')
    }
    setDeleteTarget(null)
  }

  return (
    <>
      {deleteTarget && deleteBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-[12px] shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-[13px] text-navy leading-relaxed">
              <span className="font-medium">&ldquo;{deleteTarget.name}&rdquo;</span> cannot be deleted because it has assessment data.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white hover:bg-[#2e2870]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && !deleteBlocked && (
        <ConfirmDialog
          message="Are you sure you want to delete this client account? This action cannot be undone."
          confirmLabel="Delete"
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px] text-text-muted">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-[13px] text-text-muted">No client accounts yet. Add one below.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={accounts.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {accounts.map((account) => (
                  <SortableClientAccountRow
                    key={account.id}
                    account={account}
                    editingId={editingId}
                    editName={editName}
                    editProduct={editProduct}
                    editInputRef={editInputRef}
                    onEditStart={(a) => { setEditingId(a.id); setEditName(a.name); setEditProduct(a.product) }}
                    onEditNameChange={setEditName}
                    onEditProductChange={setEditProduct}
                    onEditSave={handleEditSave}
                    onEditCancel={() => setEditingId(null)}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={initiateDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex flex-col gap-1 pt-1">
          <div className="flex gap-2">
            <select
              value={newProduct}
              onChange={(e) => { setNewProduct(e.target.value as Product | ''); setAddError('') }}
              className="pl-2 pr-7 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
            >
              <option value="">Select product…</option>
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="New client account name"
              className="flex-1 px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy placeholder:text-text-muted"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-[12px] text-red-dark">{addError}</p>}
        </div>
      </div>
    </>
  )
}
