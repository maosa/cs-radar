'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { useSidebarRefresh } from '@/lib/sidebar-context'
import ConfirmDialog from './ConfirmDialog'
import type {
  ManagingRow,
  BeingManagedRow,
  PendingIncomingRow,
  PendingOutgoingRow,
  DeclinedRow,
  ValidationState,
} from './settings-types'

function personLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ')
  return name ? `${name} (${email})` : email
}

const GreenDot = () => <span className="w-2 h-2 rounded-full bg-[#1B8C7A] flex-shrink-0 mt-[6px]" />
const AmberDot = () => <span className="w-2 h-2 rounded-full bg-[#B38600] flex-shrink-0 mt-[6px]" />
const RedDot = () => <span className="w-2 h-2 rounded-full bg-red-dark opacity-60 flex-shrink-0 mt-[6px]" />

export default function TeamManagementSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const triggerSidebarRefresh = useSidebarRefresh()
  const [loading, setLoading] = useState(true)
  const [managing, setManaging] = useState<ManagingRow[]>([])
  const [beingManaged, setBeingManaged] = useState<BeingManagedRow[]>([])
  const [pendingIncoming, setPendingIncoming] = useState<PendingIncomingRow[]>([])
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingOutgoingRow[]>([])
  const [declined, setDeclined] = useState<DeclinedRow[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    message: string
    confirmLabel: string
    onConfirm: () => Promise<void>
  } | null>(null)
  // "Add your manager" form
  const [inviteEmail, setInviteEmail] = useState('')
  const [validation, setValidation] = useState<ValidationState>('idle')
  const [sending, setSending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('manager_relationships')
        .select('id, admin_user_id, admin:users!admin_user_id(first_name, last_name, email)')
        .eq('manager_user_id', userId).eq('status', 'accepted'),
      supabase.from('manager_relationships')
        .select('id, manager_email, manager_user_id, accepted_at, manager:users!manager_user_id(first_name, last_name)')
        .eq('admin_user_id', userId).eq('status', 'accepted'),
      supabase.from('manager_relationships')
        .select('id, admin_user_id, manager_email, invited_at, admin:users!admin_user_id(first_name, last_name, email)')
        .eq('manager_user_id', userId).eq('status', 'pending').order('invited_at', { ascending: false }),
      supabase.from('manager_relationships')
        .select('id, manager_email, invited_at')
        .eq('admin_user_id', userId).eq('status', 'pending').order('invited_at', { ascending: false }),
      supabase.from('manager_relationships')
        .select('id, manager_email, invited_at')
        .eq('admin_user_id', userId).eq('status', 'archived').order('invited_at', { ascending: false }),
    ])
    setManaging((r1.data as unknown as ManagingRow[]) ?? [])
    setBeingManaged((r2.data as unknown as BeingManagedRow[]) ?? [])
    setPendingIncoming((r3.data as unknown as PendingIncomingRow[]) ?? [])
    setPendingOutgoing((r4.data as PendingOutgoingRow[]) ?? [])
    setDeclined((r5.data as DeclinedRow[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Email validation (debounced) ─────────────────────────────────────────────
  const validateEmail = useCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidation('idle'); return
    }
    const { data } = await supabase.from('users').select('id').eq('email', email).single()
    setValidation(data ? 'found' : 'not_found')
  }, [])

  const handleEmailChange = (val: string) => {
    setInviteEmail(val)
    setValidation('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => validateEmail(val), 300)
  }

  const handleEmailBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    validateEmail(inviteEmail)
  }

  // ── Send invitation ──────────────────────────────────────────────────────────
  const handleSendInvitation = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !userId) return
    setSending(true)

    const { data: existing } = await supabase
      .from('manager_relationships').select('id, status')
      .eq('admin_user_id', userId).eq('manager_email', email).maybeSingle()

    if (existing) {
      if (existing.status === 'archived') {
        onToast('This invitation was previously declined. Re-send it from the Declined section below.', 'error')
      } else {
        onToast('An invitation or relationship already exists for this email.', 'error')
      }
      setSending(false); return
    }

    const { data: managerUser } = await supabase.from('users').select('id').eq('email', email).single()
    const { error } = await supabase.from('manager_relationships').insert({
      admin_user_id: userId,
      manager_email: email,
      manager_user_id: managerUser?.id ?? null,
      status: 'pending',
      invited_at: new Date().toISOString(),
    })
    setSending(false)
    if (error) {
      onToast('Failed to send invitation.', 'error')
    } else {
      onToast('Invitation sent.')
      setInviteEmail('')
      setValidation('idle')
      loadAll()
    }
  }

  // ── Accept / Decline incoming ────────────────────────────────────────────────
  const handleAccept = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to accept invitation.', 'error') } else {
      onToast('Invitation accepted.')
      triggerSidebarRefresh()
      loadAll()
    }
  }

  const handleDecline = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'archived' }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to decline invitation.', 'error') } else {
      onToast('Invitation declined.')
      triggerSidebarRefresh()
      loadAll()
    }
  }

  // ── Re-send declined ─────────────────────────────────────────────────────────
  const handleResend = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'pending', invited_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to re-send invitation.', 'error') } else {
      onToast('Invitation re-sent.')
      loadAll()
    }
  }

  // ── Hard-delete helper ───────────────────────────────────────────────────────
  const hardDelete = async (id: string, successMsg: string, refreshSidebar = false) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships').delete().eq('id', id)
    setActing(null)
    if (error) { onToast('Action failed. Please try again.', 'error') } else {
      onToast(successMsg)
      if (refreshSidebar) triggerSidebarRefresh()
      loadAll()
    }
  }

  // ── Merged pending list ──────────────────────────────────────────────────────
  const allPending = [
    ...pendingIncoming.map((r) => ({ ...r, direction: 'incoming' as const })),
    ...pendingOutgoing.map((r) => ({ ...r, direction: 'outgoing' as const })),
  ].sort((a, b) => new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime())

  const hasRelationships = managing.length > 0 || beingManaged.length > 0
  const hasInvites = allPending.length > 0 || declined.length > 0
  const showSeparator = !loading && (hasRelationships || hasInvites)

  const fmtDate = (ts: string) =>
    new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          dangerous
          onConfirm={async () => { setConfirmAction(null); await confirmAction.onConfirm() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <div className="flex flex-col gap-5">
        {/* ── Add your manager ── */}
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-text-secondary">Add your manager</p>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendInvitation() }}
                placeholder="manager@example.com"
                className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy placeholder:text-text-muted"
              />
              {validation === 'found' && (
                <p className="text-[12px] text-[#1B8C7A]">✓ Registered user — invitation will be sent and they can accept it in Settings.</p>
              )}
              {validation === 'not_found' && (
                <p className="text-[12px] text-[#B38600]">User not found. You can still invite this email — the invitation will appear once they register.</p>
              )}
            </div>
            <button
              onClick={handleSendInvitation}
              disabled={sending || !inviteEmail.trim()}
              className="self-start px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Invite manager'}
            </button>
          </div>
        </div>

        {loading && <p className="text-[13px] text-text-muted">Loading…</p>}

        {showSeparator && <hr className="border-bg" />}

        {/* ── Manager relationships ── */}
        {hasRelationships && (
          <div className="flex flex-col gap-3">
            {managing.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">You are managing</p>
                <div className="flex flex-col divide-y divide-bg">
                  {managing.map((row) => {
                    const a = row.admin
                    const label = a ? personLabel(a.first_name, a.last_name, a.email) : row.admin_user_id
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <span className="text-[13px] text-navy truncate">{label}</span>
                        </div>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Remove yourself as a manager for ${a?.email ?? row.admin_user_id}? You will lose access to their task list.`,
                            confirmLabel: 'Remove',
                            onConfirm: () => hardDelete(row.id, 'Removed from manager role.', true),
                          })}
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {beingManaged.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">You are being managed by</p>
                <div className="flex flex-col divide-y divide-bg">
                  {beingManaged.map((row) => {
                    const m = row.manager
                    const label = m ? personLabel(m.first_name, m.last_name, row.manager_email) : row.manager_email
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[13px] text-navy truncate">{label}</span>
                            {row.accepted_at && (
                              <span className="text-[11px] text-text-muted">Since {fmtDate(row.accepted_at)}</span>
                            )}
                          </div>
                        </div>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Remove ${row.manager_email} as your manager? They will lose access to your task list.`,
                            confirmLabel: 'Sever',
                            onConfirm: () => hardDelete(row.id, 'Manager relationship severed.'),
                          })}
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Sever
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Invitations ── */}
        {hasInvites && (
          <div className="flex flex-col gap-3">
            {allPending.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">Pending</p>
                <div className="flex flex-col divide-y divide-bg">
                  {allPending.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <AmberDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {row.direction === 'incoming' ? (
                            <span className="text-[13px] text-navy">
                              {personLabel(row.admin?.first_name, row.admin?.last_name, row.admin?.email ?? row.admin_user_id)} wants you to manage their tasks
                            </span>
                          ) : (
                            <span className="text-[13px] text-navy truncate">{row.manager_email}</span>
                          )}
                          <span className="text-[11px] text-text-muted">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {row.direction === 'incoming' ? (
                          <>
                            <button
                              onClick={() => handleAccept(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleDecline(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={acting === row.id}
                            onClick={() => setConfirmAction({
                              message: `Cancel the pending invitation to ${row.manager_email}?`,
                              confirmLabel: 'Cancel invitation',
                              onConfirm: () => hardDelete(row.id, 'Invitation cancelled.'),
                            })}
                            className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {declined.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">Declined</p>
                <div className="flex flex-col divide-y divide-bg">
                  {declined.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <RedDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[13px] text-navy truncate">{row.manager_email}</span>
                          <span className="text-[11px] text-text-muted">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleResend(row.id)}
                          disabled={acting === row.id}
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
                        >
                          Re-send
                        </button>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Permanently delete the declined invitation from ${row.manager_email}?`,
                            confirmLabel: 'Delete',
                            onConfirm: () => hardDelete(row.id, 'Invitation deleted.'),
                          })}
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
