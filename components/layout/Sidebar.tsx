'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ListTodo, Users, Settings, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

const STORAGE_KEY = 'sidebar_expanded'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

export default function Sidebar() {
  const { userId } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hasManagerRelationships, setHasManagerRelationships] = useState(false)
  const [pendingInviteCount, setPendingInviteCount] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setExpanded(stored === 'true')
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!userId) return

    const fetchRelationshipData = () => {
      supabase
        .from('manager_relationships')
        .select('id')
        .eq('manager_user_id', userId)
        .eq('status', 'accepted')
        .limit(1)
        .then(({ data }) => {
          setHasManagerRelationships(Array.isArray(data) && data.length > 0)
        })
      supabase
        .from('manager_relationships')
        .select('id', { count: 'exact', head: true })
        .eq('manager_user_id', userId)
        .eq('status', 'pending')
        .then(({ count }) => {
          setPendingInviteCount(count ?? 0)
        })
    }

    fetchRelationshipData()
    window.addEventListener('sidebar:refresh', fetchRelationshipData)
    return () => window.removeEventListener('sidebar:refresh', fetchRelationshipData)
  }, [userId])

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  const mainNavItems: NavItem[] = [
    { href: '/tasks', label: 'My tasks', icon: <ListTodo size={20} /> },
    ...(hasManagerRelationships
      ? [{ href: '/manager', label: 'Manager view', icon: <Users size={20} /> }]
      : []),
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Prevent layout shift by rendering collapsed state until localStorage is read
  const isExpanded = mounted ? expanded : false

  return (
    <aside
      className="flex flex-col h-full bg-[#19153F] text-white flex-shrink-0 transition-[width] duration-200"
      style={{ width: isExpanded ? '220px' : '52px' }}
    >
      {/* Toggle button */}
      <div className="flex items-center justify-end px-2 pt-3 pb-2">
        <button
          onClick={toggle}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 transition-colors"
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Logo / app name */}
      <div className="flex items-center gap-3 px-3 pb-4">
        <div className="w-7 h-7 rounded bg-[#00D1BA] flex-shrink-0 flex items-center justify-center text-[#19153F] font-semibold text-xs select-none">
          TT
        </div>
        {isExpanded && (
          <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            Task Tracker
          </span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {mainNavItems.map((item) => (
          <NavLink key={item.href} item={item} expanded={isExpanded} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Settings — pinned to bottom */}
      <div className="px-2 pb-4">
        <NavLink
          item={{ href: '/settings', label: 'Settings', icon: <Settings size={20} /> }}
          expanded={isExpanded}
          active={isActive('/settings')}
          badge={pendingInviteCount}
        />
      </div>
    </aside>
  )
}

function NavLink({
  item,
  expanded,
  active,
  badge,
}: {
  item: NavItem
  expanded: boolean
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={item.href}
      title={!expanded ? item.label : undefined}
      className={`
        flex items-center gap-3 rounded px-2 py-2 text-sm transition-colors
        ${active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}
      `}
    >
      <span className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {item.icon}
        {badge && badge > 0 ? (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#CC0015] text-white text-[8px] font-bold flex items-center justify-center leading-none">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </span>
      {expanded && (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
      )}
    </Link>
  )
}
