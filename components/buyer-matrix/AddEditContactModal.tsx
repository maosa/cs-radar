'use client'

import { useState, useEffect } from 'react'
import type { BuyerMatrixContact, BuyerMatrixBuyerType } from '@/lib/supabase/types'

const BUYER_TYPE_OPTIONS: { value: BuyerMatrixBuyerType; label: string }[] = [
  { value: 'economic_buyer',  label: 'Economic Buyer'   },
  { value: 'technical_buyer', label: 'Technical Buyer'  },
  { value: 'user_buyer',      label: 'User Buyer'       },
  { value: 'coach_champion',  label: 'Coach / Champion' },
  { value: 'gatekeeper',      label: 'Gatekeeper'       },
  { value: 'influencer',      label: 'Influencer'       },
]

export interface ContactFormData {
  buyer_types: BuyerMatrixBuyerType[]   // array; single-element in edit mode
  full_name: string
  email: string
  role: string
  additional_details: string
}

interface Props {
  contact?: BuyerMatrixContact | null
  onClose: () => void
  onSave: (data: ContactFormData) => Promise<void>
  onDelete?: () => Promise<void>
}

export default function AddEditContactModal({ contact, onClose, onSave, onDelete }: Props) {
  const isEdit = !!contact

  // Add mode: multi-select via Set
  const [selectedTypes, setSelectedTypes] = useState<Set<BuyerMatrixBuyerType>>(new Set())
  // Edit mode: single select
  const [buyerType, setBuyerType] = useState<BuyerMatrixBuyerType | ''>(contact?.buyer_type ?? '')

  const [fullName, setFullName] = useState(contact?.full_name ?? '')
  const [email, setEmail]       = useState(contact?.email ?? '')
  const [role, setRole]         = useState(contact?.role ?? '')
  const [notes, setNotes]       = useState(contact?.additional_details ?? '')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const toggleType = (t: BuyerMatrixBuyerType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (isEdit) {
      if (!buyerType) { setError('Please select a column.'); return }
    } else {
      if (selectedTypes.size === 0) { setError('Please select at least one column.'); return }
    }
    if (!fullName.trim()) { setError('Full name is required.'); return }

    setSaving(true)
    try {
      await onSave({
        buyer_types:        isEdit ? [buyerType as BuyerMatrixBuyerType] : Array.from(selectedTypes),
        full_name:          fullName.trim(),
        email:              email.trim(),
        role:               role.trim(),
        additional_details: notes.trim(),
      })
      onClose()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to delete.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-[15px] font-medium text-navy mb-5">
          {isEdit ? 'Edit Person' : 'Add Person'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Column selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-text-secondary">
              {isEdit ? 'Column' : 'Columns'} <span className="text-red-flag">*</span>
            </label>

            {isEdit ? (
              /* Edit mode: single select — only moves this specific card */
              <select
                value={buyerType}
                onChange={e => setBuyerType(e.target.value as BuyerMatrixBuyerType | '')}
                className="pl-3 pr-7 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy"
              >
                <option value="">Select column…</option>
                {BUYER_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              /* Add mode: checkbox grid — person can appear in multiple columns */
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                {BUYER_TYPE_OPTIONS.map(o => (
                  <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(o.value)}
                      onChange={() => toggleType(o.value)}
                      className="w-3.5 h-3.5 accent-navy flex-shrink-0"
                    />
                    <span className="text-[13px] text-navy">{o.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Full name */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">
              Full name <span className="text-red-flag">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              autoFocus
              className="px-3 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy placeholder:text-text-muted"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="px-3 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy placeholder:text-text-muted"
            />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">Role</label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="VP of Engineering"
              className="px-3 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy placeholder:text-text-muted"
            />
          </div>

          {/* Additional details */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">Additional details</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any other relevant notes…"
              rows={3}
              className="px-3 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy placeholder:text-text-muted resize-none"
            />
          </div>

          {/* Propagation hint — edit mode only */}
          {isEdit && (
            <p className="text-[11px] text-text-muted italic -mt-1">
              Changes to name, email, role, and notes apply to all columns this person appears in.
            </p>
          )}

          {error && <p className="text-[12px] text-red-flag">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="px-4 py-2 text-[13px] font-medium text-red-flag border border-red-flag/30 rounded-[6px] hover:bg-red-flag/5 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] hover:bg-navy-hover disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
