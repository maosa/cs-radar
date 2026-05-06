'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Search, UserRound, ArchiveX, ArchiveRestore } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

const PREFS_KEY = 'manager_card_prefs'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonCard {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isFavorite: boolean
  isArchived: boolean
  adminUserId: string
}

interface CardPrefs {
  isFavorite: boolean
  isArchived: boolean
}

type SortMode = 'name' | 'role' | 'favorites'
type Tab = 'home' | 'archive'

// ─── Person card ──────────────────────────────────────────────────────────────

interface PersonCardProps {
  person: PersonCard
  onToggleFavorite: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onClick: (person: PersonCard) => void
  activeTab: Tab
}

function PersonCardItem({ person, onToggleFavorite, onArchive, onUnarchive, onClick, activeTab }: PersonCardProps) {
  const initials =
    (person.firstName[0] || '') + (person.lastName[0] || '')

  return (
    <div
      className="relative bg-white rounded-[10px] border border-[#DADADA] p-5 cursor-pointer hover:border-[#38308F] hover:shadow-sm transition-all group"
      onClick={() => onClick(person)}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(person.id) }}
        className={`absolute top-3 left-3 p-1 rounded transition-colors ${
          person.isFavorite ? 'text-[#FFD300]' : 'text-[#DADADA] hover:text-[#aaa]'
        }`}
        title={person.isFavorite ? 'Unpin' : 'Pin to top'}
      >
        <Star size={16} className={person.isFavorite ? 'text-[#FFD300] fill-[#FFD300]' : ''} />
      </button>

      {/* Archive / Unarchive button */}
      {activeTab === 'home' ? (
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(person.id) }}
          className="absolute top-3 right-3 p-1 rounded text-[#DADADA] hover:text-[#595959] hover:bg-[#F2F2F2] opacity-0 group-hover:opacity-100 transition-all"
          title="Archive"
        >
          <ArchiveX size={13} />
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onUnarchive(person.id) }}
          className="absolute top-3 right-3 p-1 rounded text-[#DADADA] hover:text-[#595959] hover:bg-[#F2F2F2] opacity-0 group-hover:opacity-100 transition-all"
          title="Unarchive"
        >
          <ArchiveRestore size={13} />
        </button>
      )}

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-14 h-14 rounded-full bg-[#B4AFE4] flex items-center justify-center text-[#19153F] text-[18px] font-medium select-none">
          {initials.toUpperCase()}
        </div>
        <div className="text-center">
          <p className="text-[14px] font-medium text-[#19153F]">
            {person.firstName} {person.lastName}
          </p>
          {person.role && (
            <p className="text-[12px] text-[#797979] mt-0.5">{person.role}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function ManagerLandingView() {
  const { userId } = useAuth()
  const router = useRouter()
  const [people, setPeople] = useState<PersonCard[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('favorites')

  // ─── Load from Supabase on mount ─────────────────────────────────────────

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    async function loadPeople() {
      // Fetch accepted relationships where current user is the manager
      const { data: relationships } = await supabase
        .from('manager_relationships')
        .select('*')
        .eq('manager_user_id', userId)
        .eq('status', 'accepted')

      if (!relationships || relationships.length === 0) {
        await supabase.from('users').update({ default_landing: 'task_list' }).eq('id', userId)
        router.replace('/tasks')
        return
      }

      // 3. Fetch user details for all admin_user_ids in those relationships
      const adminUserIds: string[] = relationships.map((r: { admin_user_id: string }) => r.admin_user_id)
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .in('id', adminUserIds)

      const usersMap = new Map<string, { id: string; first_name: string | null; last_name: string | null; email: string; role: string | null }>(
        (users ?? []).map((u: { id: string; first_name: string | null; last_name: string | null; email: string; role: string | null }) => [u.id, u])
      )

      // 4. Load prefs from localStorage
      let prefsMap: Record<string, CardPrefs> = {}
      try {
        const raw = localStorage.getItem(PREFS_KEY)
        if (raw) prefsMap = JSON.parse(raw)
      } catch {
        // ignore
      }

      // 5. Build PersonCard[] from combined data
      const cards: PersonCard[] = relationships.map((rel: { id: string; admin_user_id: string }) => {
        const user = usersMap.get(rel.admin_user_id)
        const prefs = prefsMap[rel.admin_user_id] ?? { isFavorite: false, isArchived: false }
        return {
          id: rel.id,
          adminUserId: rel.admin_user_id,
          firstName: user?.first_name ?? '',
          lastName: user?.last_name ?? '',
          email: user?.email ?? '',
          role: user?.role ?? '',
          isFavorite: prefs.isFavorite,
          isArchived: prefs.isArchived,
        }
      })

      setPeople(cards)
      setLoading(false)
    }

    loadPeople()
  }, [userId])

  // ─── Prefs helpers ────────────────────────────────────────────────────────

  const savePrefs = (next: PersonCard[]) => {
    const prefsMap: Record<string, CardPrefs> = {}
    for (const p of next) {
      prefsMap[p.adminUserId] = { isFavorite: p.isFavorite, isArchived: p.isArchived }
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsMap))
  }

  const handleToggleFavorite = (id: string) => {
    const next = people.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p))
    setPeople(next)
    savePrefs(next)
  }

  const handleArchiveCard = (id: string) => {
    const next = people.map((p) => (p.id === id ? { ...p, isArchived: true, isFavorite: false } : p))
    setPeople(next)
    savePrefs(next)
  }

  const handleUnarchiveCard = (id: string) => {
    const next = people.map((p) => (p.id === id ? { ...p, isArchived: false } : p))
    setPeople(next)
    savePrefs(next)
  }

  const handleCardClick = (person: PersonCard) => {
    router.push(`/manager/${person.adminUserId}`)
  }

  // ─── Filter and sort ──────────────────────────────────────────────────────

  const q = searchQuery.toLowerCase()
  const filtered = people
    .filter((p) => p.isArchived === (activeTab === 'archive'))
    .filter((p) =>
      !q ||
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      if (sortMode === 'favorites') {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      }
      if (sortMode === 'role') return a.role.localeCompare(b.role)
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    })

  const chipBase = 'px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors'
  const chipActive = 'bg-[#19153F] text-white border-[#19153F]'
  const chipInactive = 'bg-white text-[#595959] border-[#DADADA] hover:border-[#aaa] hover:text-[#19153F]'

  return (
    <div className="flex flex-col h-full bg-[#F2F2F2]">
      {/* Header */}
      <div className="bg-white border-b border-[#DADADA] px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-[16px] font-medium text-[#19153F]">Manager view</h1>
            <p className="text-[12px] text-[#797979] mt-0.5">Task lists of your direct reports</p>
          </div>

          {/* Search */}
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-[#797979] pointer-events-none">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people…"
              className="pl-7 pr-3 py-1 text-[13px] border border-[#DADADA] rounded-[6px] w-48 placeholder:text-[#797979] focus:outline-none focus:border-[#38308F] bg-white"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#797979]">Sort:</span>
            {([
              ['favorites', 'Favourites first'],
              ['name', 'Name A–Z'],
              ['role', 'By role'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`${chipBase} ${sortMode === mode ? chipActive : chipInactive}`}
              >
                {label}
              </button>
            ))}
          </div>

        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 border-b border-[#DADADA] -mb-[1px]">
          {(['home', 'archive'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#19153F] text-[#19153F]'
                  : 'border-transparent text-[#797979] hover:text-[#595959]'
              }`}
            >
              {tab === 'home' ? 'Home' : 'Archive'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-[13px] text-[#797979]">Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#797979]">
            <UserRound size={28} />
            <p className="text-[13px]">
              {activeTab === 'archive'
                ? 'No archived people.'
                : searchQuery
                ? 'No results for your search.'
                : 'No direct reports yet. They will appear once a manager relationship is accepted.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {filtered.map((person) => (
              <PersonCardItem
                key={person.id}
                person={person}
                onToggleFavorite={handleToggleFavorite}
                onArchive={handleArchiveCard}
                onUnarchive={handleUnarchiveCard}
                onClick={handleCardClick}
                activeTab={activeTab}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
