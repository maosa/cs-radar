'use client'

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProductBadge from '@/components/tasks/ProductBadge'
import DetailPanel from '@/components/tasks/DetailPanel'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import type { TaskWithProject } from '@/lib/supabase/types'
import { ChevronLeft, ChevronRight, Search, MessageSquare, ArrowLeft, Flag } from 'lucide-react'
import {
  getCurrentWeekIndex,
  weekIndexToDateString,
  formatWeekHeader,
  dateStringToWeekIndex,
} from '@/lib/weeks'

type ViewMode = 'focused' | 'expanded'
import SharedToolbar from '@/components/tasks/shared/SharedToolbar'
import SharedFilterBar, { SortMode } from '@/components/tasks/shared/SharedFilterBar'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useTasksQuery } from '@/lib/hooks/useTasks'
import { taskBg, descClass, projectName } from '@/lib/taskUtils'

type AnyTask = TaskWithProject
type SearchResult = { task: AnyTask; weekLabel: string }

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

// ─── Icons ────────────────────────────────────────────────────────────────────


// ─── Read-only task row ───────────────────────────────────────────────────────

interface ReadOnlyRowProps {
  task: AnyTask
  visibleWeekIndices: number[]
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  isHighlighted: boolean
}

const ReadOnlyTaskRow = memo(function ReadOnlyTaskRow({ task, visibleWeekIndices, onOpenPanel, isHighlighted }: ReadOnlyRowProps) {
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  return (
    <tr style={bg} className="group">
      {/* Product — sticky */}
      <td className="sticky left-0 z-10 border-l border-r border-border px-3 py-2.5" style={{ ...bg, boxShadow: 'inset 0 -1px 0 0 #DADADA' }}>
        <ProductBadge product={task.product} />
      </td>

      {/* Project — sticky */}
      <td
        className="sticky z-10 border-r border-border px-3 py-2.5 text-[13px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]"
        style={{ left: 84, ...bg, boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }}
      >
        {projectName(task)}
      </td>

      {/* Week cells */}
      {visibleWeekIndices.map((wi) => {
        const isTaskWeek = wi === taskWeekIndex
        return (
          <td
            key={wi}
            className="border-b border-r border-border px-3 py-2.5 text-[13px]"
            style={isTaskWeek ? bg : { backgroundColor: '#FFFFFF' }}
          >
            {isTaskWeek && (
              <div
                className={`flex items-center gap-2 min-w-0 rounded-[4px] transition-all ${
                  isHighlighted ? 'ring-2 ring-navy-mid ring-offset-1' : ''
                }`}
              >
                {/* Description */}
                <span className={`flex-1 min-w-0 truncate ${dc}`}>{task.description}</span>

                {/* Flag icon — always visible for flagged tasks */}
                {task.is_flagged && (
                  <Flag size={14} className="flex-shrink-0 text-red-flag fill-red-flag" />
                )}

                {/* Comments icon — visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                  <button
                    onClick={() => onOpenPanel(task.id, 'comments')}
                    className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                    title="View comments"
                  >
                    <MessageSquare size={14} />
                  </button>
                </div>
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
})

// ─── Task table ───────────────────────────────────────────────────────────────

interface TaskTableProps {
  tasks: AnyTask[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  sortMode: SortMode
  highlightedTaskId: string | null
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
}

function TaskTable({ tasks, visibleWeekIndices, currentWeekIndex, sortMode, highlightedTaskId, onOpenPanel }: TaskTableProps) {
  const visibleWeekStrings = new Set(visibleWeekIndices.map(weekIndexToDateString))

  const visibleTasks = tasks
    .filter((t) => visibleWeekStrings.has(t.week_start_date))
    .sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      if (sortMode === 'product') return (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
      if (sortMode === 'project') return projectName(a).localeCompare(projectName(b))
      return a.sort_order - b.sort_order
    })

  return (
    <div className="overflow-x-auto flex-1">
      <table className="border-separate border-spacing-0" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 84, minWidth: 84 }} />
          <col style={{ width: 240, minWidth: 240 }} />
          {visibleWeekIndices.map((wi) => <col key={wi} style={{ minWidth: 200 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-bg border-t border-b border-l border-r border-border px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wide">
              Product
            </th>
            <th
              className="sticky z-20 bg-bg border-t border-b border-r border-border px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wide"
              style={{ left: 84, boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)' }}
            >
              Project
            </th>
            {visibleWeekIndices.map((wi) => {
              const isCurrent = wi === currentWeekIndex
              return (
                <th key={wi} className="border-t border-b border-r border-border px-3 py-2 text-left text-[13px] font-medium text-navy bg-bg">
                  <div className="flex items-center gap-2">
                    <span className={isCurrent ? 'pb-0.5 border-b-2 border-teal' : ''}>{formatWeekHeader(wi)}</span>
                    {isCurrent && (
                      <span className="inline-flex items-center justify-center px-1.5 py-[3px] rounded text-[10px] font-medium bg-teal text-navy">
                        current
                      </span>
                    )}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visibleTasks.length === 0 && (
            <tr>
              <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                No tasks for this period.
              </td>
            </tr>
          )}
          {visibleTasks.map((task) => (
            <ReadOnlyTaskRow
              key={task.id}
              task={task}
              visibleWeekIndices={visibleWeekIndices}
              onOpenPanel={onOpenPanel}
              isHighlighted={task.id === highlightedTaskId}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface ManagerTaskViewProps {
  adminUserId: string
}

export default function ManagerTaskView({ adminUserId }: ManagerTaskViewProps) {
  const { userId } = useAuth()
  const router = useRouter()
  const todayWeekIndex = getCurrentWeekIndex()
  const [viewMode, setViewMode] = useState<ViewMode>('focused')
  const [centerWeekIndex, setCenterWeekIndex] = useState(todayWeekIndex)
  const { data: tasks = [], isLoading: loadingTasks } = useTasksQuery(adminUserId, 'managed')
  const [loadingUser, setLoadingUser] = useState(true)
  const [adminName, setAdminName] = useState('')

  const loading = loadingTasks || loadingUser

  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('drag')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  const [panelTask, setPanelTask] = useState<AnyTask | null>(null)
  const [panelSection, setPanelSection] = useState<'notes' | 'comments'>('notes')
  const [panelOpen, setPanelOpen] = useState(false)

  // Fetch admin name and verify relationship
  useEffect(() => {
    if (!userId) return
    const loadData = async () => {
      setLoadingUser(true)
      const [userRes, relRes] = await Promise.all([
        supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', adminUserId)
          .maybeSingle(),
        supabase
          .from('manager_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('manager_user_id', userId)
          .eq('status', 'accepted'),
      ])

      if ((relRes.count ?? 0) === 0) {
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
    loadData()
  }, [adminUserId, userId, router])

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
      .filter(
        (t) =>
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

  const uniqueProjects = useMemo<{ id: string; name: string }[]>(() => {
    const seen = new Map<string, string>()
    tasks.forEach((t) => {
      if (t.project_id && !seen.has(t.project_id)) seen.set(t.project_id, projectName(t))
    })
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const visibleWeekIndices =
    viewMode === 'focused'
      ? [centerWeekIndex]
      : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0)

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProducts.length > 0 && !filterProducts.includes(t.product)) return false
      if (filterProjects.length > 0 && !filterProjects.includes(t.project_id ?? '')) return false
      return true
    })
  }, [tasks, filterProducts, filterProjects])

  const handleToggleProduct = useCallback((p: string) => {
    setFilterProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }, [])

  const handleToggleProject = useCallback((id: string) => {
    setFilterProjects((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }, [])

  const handleSearchResultClick = useCallback((task: AnyTask) => {
    const weekIdx = dateStringToWeekIndex(task.week_start_date)
    setCenterWeekIndex(weekIdx)
    setHighlightedTaskId(task.id)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setFilterProducts([])
    setFilterProjects([])
    setTimeout(() => setHighlightedTaskId(null), 2000)
  }, [])

  const handleOpenPanel = useCallback((id: string, section: 'notes' | 'comments') => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setPanelTask(task)
    setPanelSection(section)
    setPanelOpen(true)
  }, [tasks])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] text-text-muted">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg">
      <SharedToolbar
        adminName={adminName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
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
        sortMode={sortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onSortMode={setSortMode}
        hideDragSort
      />
      <div className="flex-1 overflow-hidden flex">
        <TaskTable
          tasks={filteredTasks}
          visibleWeekIndices={visibleWeekIndices}
          currentWeekIndex={todayWeekIndex}
          sortMode={sortMode}
          highlightedTaskId={highlightedTaskId}
          onOpenPanel={handleOpenPanel}
        />
      </div>

      {panelOpen && panelTask && (
        <DetailPanel
          taskId={panelTask.id}
          taskDescription={panelTask.description}
          taskProduct={panelTask.product}
          taskProjectName={projectName(panelTask)}
          taskProjectId={panelTask.project_id ?? null}
          taskWeekStartDate={panelTask.week_start_date}
          projects={[]}
          initialSection={panelSection}
          onClose={() => setPanelOpen(false)}
          readOnlyNotes
          canEditAllComments={false}
        />
      )}
    </div>
  )
}
