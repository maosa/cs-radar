'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ListTodo, Users, Settings, ChevronRight, ChevronLeft, AlertCircle, Gauge, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { useSidebarCounter } from '@/lib/sidebar-context'

const STORAGE_KEY = 'sidebar_expanded'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface SidebarInitialData {
  profile: {
    first_name: string | null
    last_name: string | null
    email: string
    account_health_enabled: boolean
  } | null
  hasManagerRelationships: boolean
  pendingInviteCount: number
}

function deriveNameAndInitials(profile: SidebarInitialData['profile']): { fullName: string; initials: string } {
  if (!profile) return { fullName: '', initials: '?' }
  const first = profile.first_name ?? ''
  const last = profile.last_name ?? ''
  const fullName = [first, last].filter(Boolean).join(' ') || profile.email
  const initials = [(first[0] ?? ''), (last[0] ?? '')].filter(Boolean).join('').toUpperCase() || (profile.email?.[0]?.toUpperCase() ?? '?')
  return { fullName, initials }
}

export default function Sidebar({ initialData }: { initialData: SidebarInitialData }) {
  const { userId } = useAuth()
  const refreshCounter = useSidebarCounter()
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  const derived = deriveNameAndInitials(initialData.profile)
  const [hasManagerRelationships, setHasManagerRelationships] = useState(initialData.hasManagerRelationships)
  const [pendingInviteCount, setPendingInviteCount] = useState(initialData.pendingInviteCount)
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(initialData.profile?.account_health_enabled ?? false)
  const [fetchError, setFetchError] = useState(false)
  const [initials, setInitials] = useState(derived.initials)
  const [fullName, setFullName] = useState(derived.fullName)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Skip the first run of these effects when server-provided initial data is available.
  const skipInitialRelFetch = useRef(true)
  const skipInitialProfileFetch = useRef(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setExpanded(stored === 'true')
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!userId) return

    if (skipInitialRelFetch.current) {
      skipInitialRelFetch.current = false
      return
    }

    const fetchRelationshipData = async () => {
      const [relResult, countResult, userResult] = await Promise.all([
        supabase
          .from('manager_relationships')
          .select('id')
          .eq('manager_user_id', userId)
          .eq('status', 'accepted')
          .limit(1),
        supabase
          .from('manager_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('manager_user_id', userId)
          .eq('status', 'pending'),
        supabase
          .from('users')
          .select('account_health_enabled')
          .eq('id', userId)
          .single(),
      ])

      if (relResult.error || countResult.error) {
        setFetchError(true)
        return
      }

      setFetchError(false)
      setHasManagerRelationships(Array.isArray(relResult.data) && relResult.data.length > 0)
      setPendingInviteCount(countResult.count ?? 0)
      setAccountHealthEnabled(userResult.data?.account_health_enabled ?? false)
    }

    fetchRelationshipData()
  }, [userId, refreshCounter])

  useEffect(() => {
    if (!userId) return

    if (skipInitialProfileFetch.current) {
      skipInitialProfileFetch.current = false
      return
    }

    supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const first = data.first_name ?? ''
        const last = data.last_name ?? ''
        const name = [first, last].filter(Boolean).join(' ')
        setFullName(name || data.email)
        const i = [(first[0] ?? ''), (last[0] ?? '')].filter(Boolean).join('').toUpperCase()
        setInitials(i || (data.email?.[0]?.toUpperCase() ?? '?'))
      })
  }, [userId])

  useEffect(() => {
    if (!avatarMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [avatarMenuOpen])

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const mainNavItems: NavItem[] = [
    { href: '/tasks', label: 'My tasks', icon: <ListTodo size={20} /> },
    ...(accountHealthEnabled
      ? [{ href: '/account-health', label: 'Account health', icon: <Gauge size={20} /> }]
      : []),
    ...(hasManagerRelationships
      ? [{ href: '/manager', label: 'Manager view', icon: <Users size={20} /> }]
      : []),
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Prevent layout shift by rendering collapsed state until localStorage is read
  const isExpanded = mounted ? expanded : false

  return (
    <aside
      className="flex flex-col h-full bg-navy text-white flex-shrink-0 transition-[width] duration-200"
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
        <div className="w-7 h-7 rounded bg-teal flex-shrink-0 flex items-center justify-center text-navy font-semibold text-xs select-none">
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

      {/* Settings + user avatar — pinned to bottom */}
      <div className="px-2 pb-4 flex flex-col gap-1">
        {fetchError && (
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 text-white/50"
            title="Could not load sidebar data. Check your connection."
          >
            <AlertCircle size={14} className="flex-shrink-0" />
            {isExpanded && <span className="text-[11px]">Could not load data</span>}
          </div>
        )}
        <NavLink
          item={{ href: '/settings', label: 'Settings', icon: <Settings size={20} /> }}
          expanded={isExpanded}
          active={isActive('/settings')}
          badge={pendingInviteCount}
        />

        {/* User avatar */}
        <div className="relative" ref={avatarMenuRef}>
          <button
            onClick={() => setAvatarMenuOpen((v) => !v)}
            title={!isExpanded ? (fullName || undefined) : undefined}
            aria-label={fullName ? `Signed in as ${fullName}` : 'User menu'}
            className="flex items-center gap-3 rounded px-2 py-2 w-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <span className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center">
              <span className="w-5 h-5 rounded-full bg-navy-mid flex items-center justify-center text-white text-[9px] font-medium select-none">
                {initials}
              </span>
            </span>
            {isExpanded && (
              <span className="whitespace-nowrap overflow-hidden text-ellipsis text-sm">{fullName}</span>
            )}
          </button>

          {avatarMenuOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-border rounded-lg shadow-lg py-1 z-50">
              {fullName && (
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-[12px] font-medium text-navy truncate">{fullName}</p>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>
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
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-dark text-white text-[8px] font-bold flex items-center justify-center leading-none">
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
