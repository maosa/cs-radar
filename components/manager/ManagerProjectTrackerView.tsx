'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type SortMode, type UniqueProject } from '@/components/tasks/shared/SharedFilterBar'
import ManagerControlBar from '@/components/manager/ManagerControlBar'
import ReadOnlyProjectTrackerTable from '@/components/project-tracker/ReadOnlyProjectTrackerTable'
import TableHeader from '@/components/tasks/task-table/TableHeader'
import ProjectDetails from '@/components/project-tracker/ProjectDetails'
import { useProjectTrackerEntries } from '@/lib/hooks/useProjectTrackerEntries'
import { useProjectsQuery } from '@/lib/hooks/useTasks'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase/client'

interface Props {
  adminUserId: string
  adminFirstName: string
  adminFullName?: string
  accountHealthEnabled: boolean
  tabBar?: React.ReactNode
}

export default function ManagerProjectTrackerView({ adminUserId, adminFirstName, adminFullName, tabBar }: Props) {
  const { userId: currentUserId } = useAuth()
  const queryClient = useQueryClient()

  // ── Owner sort modes — read from DB, subscribe via Realtime ───────────────
  // Used to mirror the owner's visual row order without lighting up any filter
  // bar buttons. The manager's own sortMode (starts 'none') is applied instead
  // when the manager explicitly clicks a sort button.
  const { data: ownerPrefs } = useQuery({
    queryKey: ['user-preferences', adminUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', adminUserId)
        .single()
      return (data?.preferences ?? {}) as Record<string, unknown>
    },
    enabled: !!adminUserId,
  })

  useEffect(() => {
    if (!adminUserId) return
    const channel = supabase
      .channel(`user-prefs:${adminUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${adminUserId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['user-preferences', adminUserId] }) },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [adminUserId, queryClient])

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    entries,
    isLoading,
    centerWeekIndex,
    setCenterWeekIndex,
    todayWeekIndex,
  } = useProjectTrackerEntries({ scope: 'manager', userId: adminUserId })

  const { data: projects = [] } = useProjectsQuery(adminUserId)

  // ── Visible weeks ─────────────────────────────────────────────────────────
  const visibleWeekIndices = useMemo(() => [centerWeekIndex], [centerWeekIndex])

  // ── Filters & sort ────────────────────────────────────────────────────────
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('none')

  // Reset manager's own sort whenever they navigate to a different week
  useEffect(() => { setSortMode('none') }, [centerWeekIndex])

  // Derive owner's per-week sort modes from their preferences
  const ownerWeekSortModes = useMemo<Record<number, SortMode>>(
    () => (ownerPrefs?.pt_week_sort_modes as Record<number, SortMode> | undefined) ?? {},
    [ownerPrefs],
  )

  // If the manager has selected a sort, apply it to all visible weeks.
  // Otherwise, silently mirror the owner's per-week sort modes so the manager
  // sees the same row order — without any filter bar buttons appearing selected.
  const effectiveWeekSortModes = useMemo<Record<number, SortMode>>(() => {
    if (sortMode !== 'none') {
      const result: Record<number, SortMode> = {}
      visibleWeekIndices.forEach((wi) => { result[wi] = sortMode })
      return result
    }
    return ownerWeekSortModes
  }, [sortMode, visibleWeekIndices, ownerWeekSortModes])

  const effectiveDefaultSortMode: SortMode = sortMode !== 'none' ? sortMode : 'product_project'

  // Full project roster (stable across weeks) — drives the project filter list
  const uniqueProjects = useMemo<UniqueProject[]>(() => {
    return projects
      .filter((p) => p.is_visible !== false)
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  // Clear a selected project filter only if that project leaves the roster
  // (deleted/hidden). Filters otherwise persist across week navigation.
  useEffect(() => {
    const validIds = new Set(uniqueProjects.map((p) => p.id))
    setFilterProjects((prev) => {
      const next = prev.filter((id) => validIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [uniqueProjects])

  const handleToggleProduct = useCallback((p: string) => {
    setFilterProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }, [])
  const handleToggleProject = useCallback((id: string) => {
    setFilterProjects((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }, [])
  const handleClearFilters = useCallback(() => {
    setFilterProducts([])
    setFilterProjects([])
  }, [])

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [sidebarSection, setSidebarSection] = useState<'details' | 'comments'>('details')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  )

  const handleOpenPanel = useCallback((id: string) => {
    setSelectedEntryId(id)
    setSidebarSection('details')
    setSidebarOpen(true)
  }, [])

  const handleOpenComments = useCallback((id: string) => {
    setSelectedEntryId(id)
    setSidebarSection('comments')
    setSidebarOpen(true)
  }, [])

  const handleClosePanel = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="flex flex-col min-h-full bg-white">
      <div className="sticky top-0 z-20 bg-white">
        {tabBar}
      <ManagerControlBar
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        filterStatuses={[]}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onToggleStatus={() => {}}
        onClearFilters={handleClearFilters}
        hideStatus
        sortMode={sortMode}
        onSortMode={setSortMode}
        searchQuery=""
        onSearchChange={() => {}}
        searchResults={[]}
        showSearchDropdown={false}
        onSearchResultClick={() => {}}
        onSearchClose={() => {}}
      />

        {!isLoading && (
          <div className="px-6 pt-4 bg-white">
            <div className="overflow-hidden rounded-t-[8px] border-t border-l border-r border-border">
              <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 84, minWidth: 84 }} />
                  <col style={{ width: 240, minWidth: 240 }} />
                  {visibleWeekIndices.map((wi) => <col key={wi} />)}
                </colgroup>
                <TableHeader visibleWeekIndices={visibleWeekIndices} currentWeekIndex={todayWeekIndex} />
              </table>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-[13px] text-text-muted">
          Loading…
        </div>
      ) : (
        <div className="bg-white">
          <div className="px-6 pb-6">
            <div className="overflow-hidden rounded-b-[8px] border-b border-l border-r border-border">
              <ReadOnlyProjectTrackerTable
                entries={entries}
                visibleWeekIndices={visibleWeekIndices}
                currentWeekIndex={todayWeekIndex}
                weekSortModes={effectiveWeekSortModes}
                defaultSortMode={effectiveDefaultSortMode}
                filterProducts={filterProducts}
                filterProjects={filterProjects}
                hasActiveFilters={filterProducts.length > 0 || filterProjects.length > 0}
                onOpenPanel={handleOpenPanel}
                onOpenComments={handleOpenComments}
              />
            </div>
          </div>
        </div>
      )}

      <ProjectDetails
        entry={selectedEntry}
        projects={projects}
        isOpen={sidebarOpen}
        onClose={handleClosePanel}
        onUpdate={() => {}}
        currentUserId={currentUserId}
        scope="manager"
        initialSection={sidebarSection}
      />
    </div>
  )
}
