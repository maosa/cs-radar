'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AddTaskModal from './AddTaskModal'
import DetailPanel from './DetailPanel'
import DeleteConfirmModal from './task-table/DeleteConfirmModal'
import EditableTaskTable from './task-table/EditableTaskTable'
import ReadOnlyTaskTable from './task-table/ReadOnlyTaskTable'
import { supabase } from '@/lib/supabase/client'
import type { TaskWithProject } from '@/lib/supabase/types'
import { getCurrentWeekIndex, formatWeekHeader, dateStringToWeekIndex, weekIndexToDateString } from '@/lib/weeks'
import { useAuth } from '@/lib/auth-context'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
import { projectName } from '@/lib/taskUtils'
import SharedToolbar from './shared/SharedToolbar'
import SharedFilterBar, { type SortMode, type UniqueProject } from './shared/SharedFilterBar'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useTasks, useTasksQuery, useProjectsQuery } from '@/lib/hooks/useTasks'
import type { ViewMode } from './task-table/types'

type AnyTask = TaskWithProject

interface TaskTableViewProps {
  readOnly?: boolean
  adminUserId?: string
}

export default function TaskTableView({ readOnly = false, adminUserId }: TaskTableViewProps) {
  const { userId } = useAuth()
  const router = useRouter()
  const todayWeekIndex = getCurrentWeekIndex()

  const [viewMode, setViewMode] = useState<ViewMode>('focused')
  const [centerWeekIndex, setCenterWeekIndex] = useState(todayWeekIndex)

  // Week window — fetch a rolling range instead of all tasks.
  // Starts at [today − 26, today + 4] and auto-expands as the user navigates.
  const WINDOW_BACK = 26
  const WINDOW_FORWARD = 4
  const EXPAND_THRESHOLD = 4   // pre-load this many weeks before reaching the edge
  const EXPAND_BY = 13         // expand by one quarter at a time
  const [windowStart, setWindowStart] = useState(() => Math.max(0, todayWeekIndex - WINDOW_BACK))
  const [windowEnd, setWindowEnd] = useState(() => todayWeekIndex + WINDOW_FORWARD)
  const weekRange = useMemo(() => ({
    from: weekIndexToDateString(windowStart),
    to: weekIndexToDateString(windowEnd),
  }), [windowStart, windowEnd])

  useEffect(() => {
    if (windowStart > 0 && centerWeekIndex <= windowStart + EXPAND_THRESHOLD) {
      setWindowStart((s) => Math.max(0, s - EXPAND_BY))
    }
    if (centerWeekIndex >= windowEnd - EXPAND_THRESHOLD) {
      setWindowEnd((e) => e + EXPAND_BY)
    }
  }, [centerWeekIndex, windowStart, windowEnd])

  // Data fetching
  const targetId = readOnly ? (adminUserId ?? null) : userId
  const { data: tasks = [], isLoading: loadingTasks } = useTasksQuery(targetId, readOnly ? 'managed' : 'own', weekRange)
  const { data: projects = [], isLoading: loadingProjects } = useProjectsQuery(readOnly ? null : userId)

  // Admin info (manager mode only)
  const [adminName, setAdminName] = useState('')
  const [loadingUser, setLoadingUser] = useState(readOnly)

  const loading = loadingTasks || (!readOnly && loadingProjects) || loadingUser

  // Filters and search
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  // Owner: per-week sort modes persisted to DB (users.preferences); Manager: single global sort mode
  const [weekSortModes, setWeekSortModes] = useState<Record<number, SortMode>>({})
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [managerSortMode, setManagerSortMode] = useState<SortMode>('drag')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ task: AnyTask; weekLabel: string }[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  // Detail panel
  const [panelTask, setPanelTask] = useState<AnyTask | null>(null)
  const [panelSection, setPanelSection] = useState<'notes' | 'comments'>('notes')
  const [panelOpen, setPanelOpen] = useState(false)

  // Owner-only state
  const [addModalWeekIndex, setAddModalWeekIndex] = useState<number | null>(null)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Load per-week sort modes from DB once userId is known (owner only)
  useEffect(() => {
    if (readOnly || !userId) return
    supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const prefs = data?.preferences as Record<string, unknown> | null
        if (prefs?.task_week_sort_modes) {
          setWeekSortModes(prefs.task_week_sort_modes as Record<number, SortMode>)
        }
        setPreferencesLoaded(true)
      })
  }, [userId, readOnly])

  // Persist per-week sort modes to DB whenever they change (owner only, debounced)
  const debouncedWeekSortModes = useDebounce(weekSortModes, 1000)
  useEffect(() => {
    if (readOnly || !userId || !preferencesLoaded) return
    supabase
      .from('users')
      .update({ preferences: { task_week_sort_modes: debouncedWeekSortModes } })
      .eq('id', userId)
  }, [debouncedWeekSortModes, userId, readOnly, preferencesLoaded])

  // Mutations — always called (hooks must not be conditional); only invoked in owner mode
  const { toggleComplete, toggleFlag, moveTask, editDescription, deleteTask, reorderTasks, taskCreated, updateTaskLocally } =
    useTasks(userId, addToast)

  // Fetch admin name and re-verify manager relationship (manager mode only)
  useEffect(() => {
    if (!readOnly || !adminUserId || !userId) {
      if (!readOnly) setLoadingUser(false)
      return
    }
    const load = async () => {
      setLoadingUser(true)
      const [userRes, relRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name').eq('id', adminUserId).maybeSingle(),
        supabase.from('manager_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('manager_user_id', userId)
          .eq('status', 'accepted'),
      ])
      if (!relRes.error && (relRes.count ?? 0) === 0) {
        await supabase.from('users').update({ default_landing: 'task_list' }).eq('id', userId)
        router.replace('/tasks')
        return
      }
      if (userRes.data) {
        const { first_name, last_name } = userRes.data
        setAdminName([first_name, last_name].filter(Boolean).join(' ') || 'Unknown')
      }
      setLoadingUser(false)
    }
    load()
  }, [readOnly, adminUserId, userId, router])

  // Debounced search
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  useEffect(() => {
    if (debouncedSearchQuery.length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const q = debouncedSearchQuery.toLowerCase()
    const results = tasks
      .filter((t) =>
        t.description.toLowerCase().includes(q) ||
        t.product.toLowerCase().includes(q) ||
        projectName(t).toLowerCase().includes(q)
      )
      .sort((a, b) => dateStringToWeekIndex(b.week_start_date) - dateStringToWeekIndex(a.week_start_date))
      .slice(0, 8)
      .map((task) => ({ task, weekLabel: formatWeekHeader(dateStringToWeekIndex(task.week_start_date)) }))
    setSearchResults(results)
    setShowSearchDropdown(results.length > 0)
  }, [debouncedSearchQuery, tasks])

  // Date strings for the currently visible weeks — used to scope the project filter
  const visibleWeekDates = useMemo(() => {
    const indices =
      viewMode === 'focused'
        ? [centerWeekIndex]
        : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0)
    return new Set(indices.map(weekIndexToDateString))
  }, [viewMode, centerWeekIndex])

  // Unique projects for the filter bar — scoped to the visible weeks
  const uniqueProjects = useMemo<UniqueProject[]>(() => {
    if (readOnly) {
      const seen = new Map<string, string>()
      tasks
        .filter((t) => visibleWeekDates.has(t.week_start_date))
        .forEach((t) => { if (t.project_id && !seen.has(t.project_id)) seen.set(t.project_id, projectName(t)) })
      return Array.from(seen.entries())
        .map(([id, name]) => ({ id, name, displayName: name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    const usedProjectIds = new Set(
      tasks
        .filter((t) => visibleWeekDates.has(t.week_start_date))
        .map((t) => t.project_id)
        .filter(Boolean)
    )
    const filtered = projects.filter((p) => usedProjectIds.has(p.id) && p.is_visible !== false)
    const nameCounts = filtered.reduce<Record<string, number>>((acc, p) => {
      const key = p.name.toLowerCase()
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    return filtered.map((p) => ({
      id: p.id,
      name: p.name,
      displayName:
        nameCounts[p.name.toLowerCase()] > 1 && p.product !== 'N/A'
          ? `${p.name} (${p.product ?? 'Unassigned'})`
          : p.name,
    }))
  }, [readOnly, tasks, projects, visibleWeekDates])

  // Auto-clear stale filters
  useEffect(() => {
    const validIds = new Set(uniqueProjects.map((p) => p.id))
    setFilterProjects((prev) => {
      const next = prev.filter((id) => validIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [uniqueProjects])

  useEffect(() => {
    const validProducts = new Set<string>(tasks.map((t) => t.product))
    setFilterProducts((prev) => {
      const next = prev.filter((p) => validProducts.has(p))
      return next.length === prev.length ? prev : next
    })
  }, [tasks])

  const visibleWeekIndices =
    viewMode === 'focused'
      ? [centerWeekIndex]
      : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0)

  // Sort mode reflected in the filter bar — center week's mode for owner, global for manager
  const currentSortMode: SortMode = readOnly
    ? managerSortMode
    : (weekSortModes[centerWeekIndex] ?? 'product_project')

  // Clicking a sort button updates all currently visible weeks (owner) or the global mode (manager)
  const handleSortMode = useCallback((mode: SortMode) => {
    if (readOnly) {
      setManagerSortMode(mode)
    } else {
      setWeekSortModes((prev) => {
        const next = { ...prev }
        visibleWeekIndices.forEach((wi) => { next[wi] = mode })
        return next
      })
    }
  }, [readOnly, visibleWeekIndices])

  const filteredTasks = useMemo(
    () => tasks.filter((t) => {
      if (filterProducts.length > 0 && !filterProducts.includes(t.product)) return false
      if (filterProjects.length > 0 && !filterProjects.includes(t.project_id ?? '')) return false
      if (filterStatuses.length > 0) {
        const match = filterStatuses.some((s) =>
          s === 'open' ? t.status === 'open' :
          s === 'complete' ? t.status === 'complete' :
          s === 'flagged' ? t.is_flagged :
          false
        )
        if (!match) return false
      }
      return true
    }),
    [tasks, filterProducts, filterProjects, filterStatuses]
  )

  const handleToggleProduct = useCallback((p: string) => {
    setFilterProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }, [])

  const handleToggleProject = useCallback((id: string) => {
    setFilterProjects((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }, [])

  const handleToggleStatus = useCallback((s: string) => {
    setFilterStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilterProducts([])
    setFilterProjects([])
    setFilterStatuses([])
  }, [])

  const handleSearchResultClick = useCallback((task: AnyTask) => {
    setCenterWeekIndex(dateStringToWeekIndex(task.week_start_date))
    setHighlightedTaskId(task.id)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setFilterProducts([])
    setFilterProjects([])
    setFilterStatuses([])
    setTimeout(() => setHighlightedTaskId(null), 2000)
  }, [])

  const handleOpenPanel = useCallback((id: string, section: 'notes' | 'comments') => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setPanelTask(task)
    setPanelSection(section)
    setPanelOpen(true)
  }, [tasks])

  const handleClosePanel = useCallback(() => setPanelOpen(false), [])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTaskId) return
    setDeleting(true)
    deleteTask(deleteTaskId, () => { setDeleting(false); setDeleteTaskId(null) })
  }, [deleteTaskId, deleteTask])

  return (
    <div className="flex flex-col h-full">
      <SharedToolbar
        adminName={readOnly ? adminName : undefined}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        onAddTask={readOnly ? undefined : () => setAddModalWeekIndex(centerWeekIndex)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        showSearchDropdown={showSearchDropdown}
        onSearchResultClick={handleSearchResultClick}
        onSearchClose={() => setShowSearchDropdown(false)}
        projectNameFn={projectName}
      />

      <SharedFilterBar
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        filterStatuses={filterStatuses}
        sortMode={currentSortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onToggleStatus={handleToggleStatus}
        onSortMode={handleSortMode}
        onClearFilters={readOnly ? undefined : handleClearFilters}
        hideDragSort={readOnly}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-text-muted">
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex">
          {readOnly ? (
            <ReadOnlyTaskTable
              tasks={filteredTasks}
              visibleWeekIndices={visibleWeekIndices}
              currentWeekIndex={todayWeekIndex}
              weekSortModes={{}}
              defaultSortMode={managerSortMode}
              highlightedTaskId={highlightedTaskId}
              onOpenPanel={handleOpenPanel}
            />
          ) : (
            <EditableTaskTable
              tasks={filteredTasks}
              visibleWeekIndices={visibleWeekIndices}
              currentWeekIndex={todayWeekIndex}
              weekSortModes={weekSortModes}
              defaultSortMode="product_project"
              highlightedTaskId={highlightedTaskId}
              onToggleComplete={toggleComplete}
              onToggleFlag={toggleFlag}
              onMove={moveTask}
              onDelete={setDeleteTaskId}
              onOpenPanel={handleOpenPanel}
              onEditDescription={editDescription}
              onAddTaskInWeek={(wi) => setAddModalWeekIndex(wi)}
              onReorder={reorderTasks}
            />
          )}
        </div>
      )}

      {/* Owner-only modals */}
      {!readOnly && addModalWeekIndex !== null && (
        <AddTaskModal
          weekIndex={addModalWeekIndex}
          projects={projects}
          onClose={() => setAddModalWeekIndex(null)}
          onCreated={() => { taskCreated(); setAddModalWeekIndex(null) }}
        />
      )}
      {!readOnly && deleteTaskId && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTaskId(null)}
          deleting={deleting}
        />
      )}
      {!readOnly && <ToastContainer toasts={toasts} onDismiss={dismissToast} />}

      {/* Detail panel */}
      {panelTask && panelOpen && (
        <DetailPanel
          key={`${panelTask.id}-${panelSection}`}
          taskId={panelTask.id}
          taskDescription={panelTask.description}
          taskProduct={panelTask.product}
          taskProjectName={projectName(panelTask)}
          taskProjectId={panelTask.project_id ?? null}
          taskWeekStartDate={panelTask.week_start_date}
          projects={readOnly ? [] : projects}
          onTaskUpdated={readOnly ? undefined : (fields) => updateTaskLocally(panelTask.id, fields)}
          initialSection={panelSection}
          onClose={handleClosePanel}
          readOnlyNotes={readOnly}
          canEditAllComments={!readOnly}
        />
      )}
    </div>
  )
}
