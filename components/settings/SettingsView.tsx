'use client'

import { useState, useCallback } from 'react'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
import { SectionCard } from './SectionCard'
import AccountSection from './AccountSection'
import ProjectsSection from './ProjectsSection'
import TeamManagementSection from './TeamManagementSection'
import AccountHealthSettingsBlock from './AccountHealthSection'
import ExportSection from './ExportSection'

export default function SettingsView() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)

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
        <AccountSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Projects">
        <ProjectsSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Team Management">
        <TeamManagementSection onToast={addToast} />
      </SectionCard>
      <AccountHealthSettingsBlock onToast={addToast} onEnabledChange={setAccountHealthEnabled} />
      <SectionCard title="Export Data">
        <ExportSection onToast={addToast} accountHealthEnabled={accountHealthEnabled} />
      </SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
