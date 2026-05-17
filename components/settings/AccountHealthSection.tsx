'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { useSidebarRefresh } from '@/lib/sidebar-context'
import { SectionCard } from './SectionCard'
import ClientAccountsSection from './ClientAccountsSection'

export function AccountHealthSection({
  onToast,
  onEnabledChange,
  initialEnabled,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  onEnabledChange: (enabled: boolean) => void
  initialEnabled?: boolean
}) {
  const { userId } = useAuth()
  const triggerSidebarRefresh = useSidebarRefresh()
  const [enabled, setEnabled] = useState(initialEnabled ?? false)
  const [loading, setLoading] = useState(initialEnabled === undefined)

  useEffect(() => {
    if (!userId || initialEnabled !== undefined) return
    supabase
      .from('users')
      .select('account_health_enabled')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const val = data?.account_health_enabled ?? false
        setEnabled(val)
        onEnabledChange(val)
        setLoading(false)
      })
  }, [userId])

  const handleToggle = async () => {
    if (!userId) return
    const next = !enabled
    setEnabled(next)
    onEnabledChange(next)
    const { error } = await supabase
      .from('users')
      .update({ account_health_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      setEnabled(!next)
      onEnabledChange(!next)
      onToast('Failed to update account health setting.', 'error')
    } else {
      triggerSidebarRefresh()
    }
  }

  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <input
          id="account-health-toggle"
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="mt-0.5 accent-navy cursor-pointer"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="account-health-toggle" className="text-[13px] font-medium text-navy cursor-pointer">
            Enable Account Health
          </label>
          <p className="text-[12px] text-text-secondary">
            Turn this on if you manage client accounts and want to use the Account Health and Risk Assessment / Matrix features. This adds an Account Health page to your sidebar.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AccountHealthSettingsBlock({
  onToast,
  onEnabledChange,
  initialEnabled,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  onEnabledChange: (enabled: boolean) => void
  initialEnabled?: boolean
}) {
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(initialEnabled ?? false)

  const handleEnabledChange = (val: boolean) => {
    setAccountHealthEnabled(val)
    onEnabledChange(val)
  }

  return (
    <>
      <SectionCard title="Account Health">
        <AccountHealthSection
          onToast={onToast}
          onEnabledChange={handleEnabledChange}
          initialEnabled={initialEnabled}
        />
      </SectionCard>
      {accountHealthEnabled && (
        <SectionCard title="Client Accounts">
          <p className="text-[12px] text-text-secondary mb-4">
            Used in Account Health to select the client you are reviewing. Each account can be associated with a product.
          </p>
          <ClientAccountsSection onToast={onToast} />
        </SectionCard>
      )}
    </>
  )
}
