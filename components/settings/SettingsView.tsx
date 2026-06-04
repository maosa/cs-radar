'use client'

import { useState, useCallback } from 'react'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
import { SectionCard } from './SectionCard'
import AccountSection from './AccountSection'
import ProjectsSection from './ProjectsSection'
import TeamManagementSection from './TeamManagementSection'
import AccountHealthSettingsBlock from './AccountHealthSection'
import BuyerMatrixSettingsBlock from './BuyerMatrixSection'
import ExportSection from './ExportSection'
import type { DefaultLanding } from '@/lib/supabase/types'

interface InitialProfile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string | null
  default_landing: DefaultLanding
  account_health_enabled: boolean
  buyer_matrix_enabled: boolean
}

interface SettingsViewProps {
  initialProfile?: InitialProfile | null
  initialHasManagerRole?: boolean
}

export default function SettingsView({ initialProfile, initialHasManagerRole }: SettingsViewProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(initialProfile?.account_health_enabled ?? false)
  const [buyerMatrixEnabled, setBuyerMatrixEnabled] = useState(initialProfile?.buyer_matrix_enabled ?? false)

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Settings</h1>
      <SectionCard title="Account Details">
        <AccountSection onToast={addToast} initialProfile={initialProfile ?? null} initialHasManagerRole={initialHasManagerRole ?? false} />
      </SectionCard>
      <SectionCard title="Projects">
        <ProjectsSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Team Management">
        <TeamManagementSection onToast={addToast} />
      </SectionCard>
      <AccountHealthSettingsBlock onToast={addToast} onEnabledChange={setAccountHealthEnabled} initialEnabled={initialProfile?.account_health_enabled} />
      <BuyerMatrixSettingsBlock
        onToast={addToast}
        onEnabledChange={setBuyerMatrixEnabled}
        initialEnabled={initialProfile?.buyer_matrix_enabled}
        accountHealthEnabled={accountHealthEnabled}
      />
      <SectionCard title="Export Data">
        <ExportSection onToast={addToast} accountHealthEnabled={accountHealthEnabled} />
      </SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
