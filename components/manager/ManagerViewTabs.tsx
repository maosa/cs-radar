'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

interface ManagerViewTabsProps {
  adminUserId: string
  accountHealthEnabled: boolean
  buyerMatrixEnabled?: boolean
}

export default function ManagerViewTabs({ adminUserId, accountHealthEnabled, buyerMatrixEnabled = false }: ManagerViewTabsProps) {
  const pathname = usePathname()
  const [adminName, setAdminName] = useState('')

  useEffect(() => {
    supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', adminUserId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAdminName([data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unknown')
        }
      })
  }, [adminUserId])

  const isProjectTracker =
    pathname.includes('/project-tracker') || pathname === `/manager/${adminUserId}`
  const isAccountHealth = pathname.includes('/account-health')
  const isBuyerMatrix = pathname.includes('/buyer-matrix')
  const isTaskList = pathname.includes('/tasks')

  return (
    <div className="flex gap-0 border-b border-border bg-white pl-6 pr-4">
      {/* Back button + name */}
      <div className="flex items-center gap-6 self-center pr-2">
        <Link
          href="/manager"
          className="flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        {adminName && (
          <span className="text-[13px] font-medium text-navy truncate max-w-[200px]">
            {adminName}&rsquo;s
          </span>
        )}
      </div>

      {/* Tabs */}
      <TabLink
        href={`/manager/${adminUserId}/project-tracker`}
        label="Project Tracker"
        active={isProjectTracker}
      />
      {accountHealthEnabled && (
        <TabLink
          href={`/manager/${adminUserId}/account-health`}
          label="Account Health"
          active={isAccountHealth}
        />
      )}
      {buyerMatrixEnabled && (
        <TabLink
          href={`/manager/${adminUserId}/buyer-matrix`}
          label="Buyer Matrix"
          active={isBuyerMatrix}
        />
      )}
      <TabLink
        href={`/manager/${adminUserId}/tasks`}
        label="Task List"
        active={isTaskList}
      />

      {/* Read only badge */}
      <div className="flex items-center self-center pl-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-bg text-text-muted border border-border">
          Read only
        </span>
      </div>
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-teal text-navy'
          : 'border-transparent text-text-muted hover:text-navy'
      }`}
    >
      {label}
    </Link>
  )
}
