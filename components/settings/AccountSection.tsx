'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { DefaultLanding } from '@/lib/supabase/types'
import { useAuth } from '@/lib/auth-context'
import { useSidebarCounter } from '@/lib/sidebar-context'

interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string | null
  default_landing: DefaultLanding
}

interface AccountSectionProps {
  onToast: (msg: string, type?: 'success' | 'error') => void
  initialProfile?: UserRow | null
  initialHasManagerRole?: boolean
}

export default function AccountSection({ onToast, initialProfile, initialHasManagerRole = false }: AccountSectionProps) {
  const { userId } = useAuth()
  const sidebarCounter = useSidebarCounter()
  const [user, setUser] = useState<UserRow | null>(initialProfile ?? null)
  const [firstName, setFirstName] = useState(initialProfile?.first_name ?? '')
  const [lastName, setLastName] = useState(initialProfile?.last_name ?? '')
  const [email, setEmail] = useState(initialProfile?.email ?? '')
  const [role, setRole] = useState(initialProfile?.role ?? '')
  const [defaultLanding, setDefaultLanding] = useState<DefaultLanding>(initialProfile?.default_landing ?? 'task_list')
  const [hasManagerRole, setHasManagerRole] = useState(initialHasManagerRole)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!initialProfile)

  useEffect(() => {
    if (initialProfile) return
    async function load() {
      if (!userId) return

      const [{ data: userData }, { data: relData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('manager_relationships').select('id').eq('manager_user_id', userId).eq('status', 'accepted').limit(1),
      ])

      if (userData) {
        setUser(userData)
        setFirstName(userData.first_name ?? '')
        setLastName(userData.last_name ?? '')
        setEmail(userData.email ?? '')
        setRole(userData.role ?? '')
        setDefaultLanding(userData.default_landing ?? 'task_list')
      }
      setHasManagerRole(Array.isArray(relData) && relData.length > 0)
      setLoading(false)
    }
    load()
  }, [userId])

  // Re-check manager role whenever an invitation is accepted or declined
  useEffect(() => {
    if (!userId) return
    supabase
      .from('manager_relationships')
      .select('id')
      .eq('manager_user_id', userId)
      .eq('status', 'accepted')
      .limit(1)
      .then(({ data }) => setHasManagerRole(Array.isArray(data) && data.length > 0))
  }, [userId, sidebarCounter])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('users').upsert({
      id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email,
      role: role || null,
      default_landing: defaultLanding,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    setSaving(false)
    if (error) {
      onToast('Failed to save account details.', 'error')
    } else {
      onToast('Account details saved.')
    }
  }

  if (loading) {
    return <p className="text-[13px] text-text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
            placeholder="First name"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">Last name</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
            placeholder="Last name"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">Current role</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
          placeholder="e.g. Product Manager"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-text-secondary">Default landing page</span>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="default_landing"
            value="task_list"
            checked={defaultLanding === 'task_list'}
            onChange={() => setDefaultLanding('task_list')}
            className="accent-navy"
          />
          <span className="text-[13px] text-navy">My task list</span>
        </label>
        <div className="flex flex-col gap-1">
          <label className={`flex items-center gap-2.5 ${!hasManagerRole ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input
              type="radio"
              name="default_landing"
              value="manager_view"
              checked={defaultLanding === 'manager_view'}
              onChange={() => hasManagerRole && setDefaultLanding('manager_view')}
              disabled={!hasManagerRole}
              className="accent-navy"
            />
            <span className="text-[13px] text-navy">Manager view</span>
          </label>
          {!hasManagerRole && (
            <p className="text-[12px] text-text-muted ml-6">
              Manager view is available once you have an accepted manager relationship. Ask a colleague to invite you as their manager.
            </p>
          )}
        </div>
      </div>

      <div className="pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
