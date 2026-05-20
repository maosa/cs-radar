'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import SharedToolbar from '@/components/tasks/shared/SharedToolbar'
import SharedFilterBar, { type SortMode, type UniqueProject } from '@/components/tasks/shared/SharedFilterBar'
import ReadOnlyProjectTrackerTable from '@/components/project-tracker/ReadOnlyProjectTrackerTable'
import ProjectDetails from '@/components/project-tracker/ProjectDetails'
import { useProjectTrackerEntries } from '@/lib/hooks/useProjectTrackerEntries'
import { useProjectsQuery } from '@/lib/hooks/useTasks'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase/client'
import { weekIndexToDateString, formatWeekHeader } from '@/lib/weeks'

interface Props {
  adminUserId: string
  adminFirstName: string
  adminFullName?: string
  accountHealthEnabled: boolean
}

export default function ManagerProjectTrackerView({ adminUserId, adminFirstName, adminFullName }: Props) {
  const { userId: currentUserId } = useAuth()
  const queryClient = useQueryClient()

  // ── Owner sort mode — read from DB, subscribe via Realtime ────────────────
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

  // Realtime: re-fetch owner prefs whenever they update their sort mode
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

  // ── View mode & visible weeks ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'focused' | 'expanded'>('focused')

  const visibleWeekIndices = useMemo(
    () =>
      viewMode === 'focused'
        ? [centerWeekIndex]
        : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0),
    [viewMode, centerWeekIndex],
  )

  const visibleWeekDates = useMemo(
    () => new Set(visibleWeekIndices.map(weekIndexToDateString)),
    [visibleWeekIndices],
  )

  // ── Filters & sort ────────────────────────────────────────────────────────
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('none')

  // Mirror owner's sort mode whenever their preference arrives or changes
  useEffect(() => {
    if (!ownerPrefs) return
    setSortMode((ownerPrefs.pt_sort_mode as SortMode | undefined) ?? 'product_project')
  }, [ownerPrefs])

  const uniqueProjects = useMemo<UniqueProject[]>(() => {
    const usedProjectIds = new Set(
      entries
        .filter((e) => visibleWeekDates.has(e.week_start_date))
        .map((e) => e.project_id),
    )
    return projects
      .filter((p) => usedProjectIds.has(p.id) && p.is_visible !== false)
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries, projects, visibleWeekDates])

  // Auto-clear stale project filters
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
    <div className="flex flex-col h-full">
      <SharedToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        adminName={adminFirstName}
        managerViewTitle={`${adminFullName ?? adminFirstName}'s Project Tracker`}
        searchPlaceholder="Search…"
        searchQuery=""
        onSearchChange={() => {}}
        searchResults={[]}
        showSearchDropdown={false}
        onSearchResultClick={() => {}}
        onSearchClose={() => {}}
      />

      <SharedFilterBar
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        filterStatuses={[]}
        sortMode={sortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onToggleStatus={() => {}}
        onSortMode={setSortMode}
        onClearFilters={handleClearFilters}
        hideStatus
        hideDragSort
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-text-muted">
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {visibleWeekIndices.map((wi) => {
            const weekDateStr = weekIndexToDateString(wi)
            const weekEntries = entries.filter((e) => e.week_start_date === weekDateStr)
            return (
              <ReadOnlyProjectTrackerTable
                key={wi}
                entries={weekEntries}
                sortMode={sortMode}
                filterProducts={filterProducts}
                filterProjects={filterProjects}
                onOpenPanel={handleOpenPanel}
                onOpenComments={handleOpenComments}
                weekLabel={formatWeekHeader(wi)}
              />
            )
          })}
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
