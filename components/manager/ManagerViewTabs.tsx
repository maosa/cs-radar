'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface ManagerViewTabsProps {
  adminUserId: string
  accountHealthEnabled: boolean
}

export default function ManagerViewTabs({ adminUserId, accountHealthEnabled }: ManagerViewTabsProps) {
  const pathname = usePathname()

  const isProjectTracker =
    pathname.includes('/project-tracker') || pathname === `/manager/${adminUserId}`
  const isAccountHealth = pathname.includes('/account-health')
  const isTaskList = pathname.includes('/tasks')

  return (
    <div className="flex gap-0 border-b border-border bg-white px-6">
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
      <TabLink
        href={`/manager/${adminUserId}/tasks`}
        label="Task List"
        active={isTaskList}
      />
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
