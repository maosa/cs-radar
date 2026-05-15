'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface ManagerViewTabsProps {
  adminUserId: string
  accountHealthEnabled: boolean
}

export default function ManagerViewTabs({ adminUserId, accountHealthEnabled }: ManagerViewTabsProps) {
  const pathname = usePathname()
  const isAccountHealth = pathname.includes('/account-health')

  if (!accountHealthEnabled) return null

  return (
    <div className="flex items-center gap-0 border-b border-border bg-white px-6">
      <TabLink
        href={`/manager/${adminUserId}`}
        label="Task List"
        active={!isAccountHealth}
      />
      <TabLink
        href={`/manager/${adminUserId}/account-health`}
        label="Account Health"
        active={isAccountHealth}
      />
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-teal text-navy'
          : 'border-transparent text-text-muted hover:text-navy'
      }`}
    >
      {label}
    </Link>
  )
}
