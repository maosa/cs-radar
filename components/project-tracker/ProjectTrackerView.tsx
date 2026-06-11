'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import { type SortMode, type UniqueProject } from '@/components/tasks/shared/SharedFilterBar'
import OwnerControlBar from '@/components/tasks/shared/OwnerControlBar'
import ProjectTrackerTable from './ProjectTrackerTable'
import AddProjectModal from './AddProjectModal'
import ProjectDetails from './ProjectDetails'
import DeleteConfirmModal from '@/components/tasks/task-table/DeleteConfirmModal'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
import { useProjectTrackerEntries } from '@/lib/hooks/useProjectTrackerEntries'
import { useProjectsQuery } from '@/lib/hooks/useTasks'
import { useAuth } from '@/lib/auth-context'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { supabase } from '@/lib/supabase/client'
import { formatWeekHeader, weekIndexToDateString } from '@/lib/weeks'
import type { ProjectTrackerEntry, Product } from '@/lib/supabase/types'

type ViewMode = 'focused' | 'expanded'

export default function ProjectTrackerView() {
  const { userId } = useAuth()

  // ── Toasts ────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    entries,
    isLoading,
    centerWeekIndex,
    setCenterWeekIndex,
    todayWeekIndex,
    createEntry,
    updateEntry,
    deleteEntry,
    batchUpdateSortOrder,
  } = useProjectTrackerEntries({ scope: 'own', userId, addToast })

  const { data: projects = [] } = useProjectsQuery(userId)

  // ── View mode & visible weeks ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('focused')

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
  const [weekSortModes, setWeekSortModes] = useState<Record<number, SortMode>>({})

  // ── Sort mode persistence (load from DB, sync to manager view via Realtime) ─
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const loadedPrefsRef = useRef<Record<string, unknown>>({})

  // Load saved sort modes on mount
  useEffect(() => {
    if (!userId) return
    supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const prefs = (data?.preferences ?? {}) as Record<string, unknown>
        loadedPrefsRef.current = prefs
        if (prefs.pt_week_sort_modes) {
          setWeekSortModes(prefs.pt_week_sort_modes as Record<number, SortMode>)
        }
        setPreferencesLoaded(true)
      })
  }, [userId])

  // Persist sort mode changes (debounced 1 s, merges with existing prefs)
  const debouncedWeekSortModes = useDebounce(weekSortModes, 1000)
  useEffect(() => {
    if (!userId || !preferencesLoaded) return
    const merged = { ...loadedPrefsRef.current, pt_week_sort_modes: debouncedWeekSortModes }
    supabase
      .from('users')
      .update({ preferences: merged })
      .eq('id', userId)
      .then(() => { loadedPrefsRef.current = merged })
  }, [debouncedWeekSortModes, userId, preferencesLoaded])

  // Derived sort mode for the filter bar (reflects center week)
  const currentSortMode: SortMode = weekSortModes[centerWeekIndex] ?? 'product_project'

  // Applies the chosen sort to all currently-visible weeks simultaneously
  const handleSortMode = useCallback((mode: SortMode) => {
    setWeekSortModes((prev) => {
      const next = { ...prev }
      visibleWeekIndices.forEach((wi) => { next[wi] = mode })
      return next
    })
  }, [visibleWeekIndices])

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

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [searchResults, setSearchResults] = useState<{ task: ProjectTrackerEntry; weekLabel: string }[]>([])

  const debouncedSearch = useDebounce(searchQuery, 300)
  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const q = debouncedSearch.toLowerCase()
    const results = entries
      .filter((e) => e.description.toLowerCase().includes(q))
      .slice(0, 8)
      .map((e) => ({
        task: e,
        weekLabel: formatWeekHeader(centerWeekIndex),
      }))
    setSearchResults(results)
    setShowSearchDropdown(results.length > 0)
  }, [debouncedSearch, entries, centerWeekIndex])

  const handleSearchResultClick = useCallback((entry: ProjectTrackerEntry) => {
    const weekDate = entry.week_start_date
    const idx = visibleWeekIndices.find(
      (wi) => weekIndexToDateString(wi) === weekDate,
    ) ?? centerWeekIndex
    setCenterWeekIndex(idx)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setFilterProducts([])
    setFilterProjects([])
  }, [visibleWeekIndices, centerWeekIndex, setCenterWeekIndex])

  // ── Add modal ─────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)

  const handleCreate = useCallback((data: {
    project_id: string
    product: string
    description: string
    week_start_date: string
  }) => {
    createEntry(data)
    setModalOpen(false)
  }, [createEntry])

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteEntryId) return
    setDeleting(true)
    deleteEntry(deleteEntryId)
    setDeleting(false)
    setDeleteEntryId(null)
  }, [deleteEntryId, deleteEntry])

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [sidebarSection, setSidebarSection] = useState<'details' | 'comments'>('details')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  )

  // Entries for the same week as the selected entry — used to prevent
  // the user changing to a project that already has an entry that week.
  const selectedEntryWeekEntries = useMemo(
    () => selectedEntry
      ? entries.filter((e) => e.week_start_date === selectedEntry.week_start_date)
      : [],
    [entries, selectedEntry],
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

  const handleUpdate = useCallback((id: string, patch: {
    project_id: string
    product: Product
    description: string
  }) => {
    const project_name = projects.find((p) => p.id === patch.project_id)?.name
    updateEntry(id, { ...patch, project_name })
    setSidebarOpen(false)
  }, [updateEntry, projects])

  // ── Target week Date for the modal ────────────────────────────────────────
  const targetWeekDate = useMemo(
    () => new Date(weekIndexToDateString(centerWeekIndex) + 'T00:00:00Z'),
    [centerWeekIndex],
  )

  // ── Entries for center week (for duplicate check in modal) ────────────────
  const centerWeekEntries = useMemo(
    () => entries.filter((e) => e.week_start_date === weekIndexToDateString(centerWeekIndex)),
    [entries, centerWeekIndex],
  )

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Tracker" />
      <OwnerControlBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        onAddTask={() => setModalOpen(true)}
        addButtonLabel="Add project"
        searchPlaceholder="Search..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        showSearchDropdown={showSearchDropdown}
        onSearchResultClick={handleSearchResultClick}
        onSearchClose={() => setShowSearchDropdown(false)}
        projectNameFn={(e: ProjectTrackerEntry) => e.project_name ?? '—'}
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        filterStatuses={[]}
        sortMode={currentSortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onToggleStatus={() => {}}
        onSortMode={handleSortMode}
        onClearFilters={handleClearFilters}
        hideStatus
        dragExclusive
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-text-muted">
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex px-6 pb-6">
          <div className="overflow-hidden rounded-[8px] border border-border flex-1 flex">
            <ProjectTrackerTable
              entries={entries}
              visibleWeekIndices={visibleWeekIndices}
              currentWeekIndex={todayWeekIndex}
              weekSortModes={weekSortModes}
              defaultSortMode="product_project"
              filterProducts={filterProducts}
              filterProjects={filterProjects}
              onFlag={(id) => {
                const e = entries.find((x) => x.id === id)
                if (e) updateEntry(id, { is_flagged: !e.is_flagged })
              }}
              onDelete={setDeleteEntryId}
              onOpenPanel={handleOpenPanel}
              onOpenComments={handleOpenComments}
              onDescriptionSave={(id, description) => updateEntry(id, { description })}
              onSortOrderChange={batchUpdateSortOrder}
            />
          </div>
        </div>
      )}

      <AddProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        targetWeek={targetWeekDate}
        existingEntries={centerWeekEntries}
        projects={projects}
      />

      {deleteEntryId && (
        <DeleteConfirmModal
          title="Delete entry?"
          message="Are you sure you want to delete this entry? This action cannot be undone."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteEntryId(null)}
          deleting={deleting}
        />
      )}

      <ProjectDetails
        entry={selectedEntry}
        projects={projects}
        existingWeekEntries={selectedEntryWeekEntries}
        isOpen={sidebarOpen}
        onClose={handleClosePanel}
        onUpdate={handleUpdate}
        currentUserId={userId}
        scope="own"
        initialSection={sidebarSection}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
