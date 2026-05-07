'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
type SortMode = 'drag' | 'product' | 'project'
type AnyTask = TaskWithProject

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

function taskBg(t: AnyTask): React.CSSProperties {
  if (t.status === 'complete') return { backgroundColor: '#C3FFF8' }
  if (t.is_flagged) return { backgroundColor: '#FFCDD3' }
  return { backgroundColor: '#FFFFFF' }
}

function descClass(t: AnyTask): string {
  if (t.status === 'complete') return 'line-through text-[#797979]'
  if (t.is_flagged) return 'text-[#CC0015]'
  return 'text-[#19153F]'
}

function projectName(t: AnyTask): string {
  return t.project_name ?? '—'
}

// ─── Icons ────────────────────────────────────────────────────────────────────


// ─── Read-only task row ───────────────────────────────────────────────────────

interface ReadOnlyRowProps {
  task: AnyTask
  visibleWeekIndices: number[]
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  isHighlighted: boolean
}

function ReadOnlyTaskRow({ task, visibleWeekIndices, onOpenPanel, isHighlighted }: ReadOnlyRowProps) {
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  return (
    <tr style={bg} className="group">
      {/* Product — sticky */}
      <td className="sticky left-0 z-10 border-l border-r border-[#DADADA] px-3 py-2.5" style={{ ...bg, boxShadow: 'inset 0 -1px 0 0 #DADADA' }}>
        <ProductBadge product={task.product} />
      </td>

      {/* Project — sticky */}
      <td
        className="sticky z-10 border-r border-[#DADADA] px-3 py-2.5 text-[13px] text-[#595959] whitespace-nowrap overflow-hidden text-ellipsis max-w-[182px]"
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
            className="border-b border-r border-[#DADADA] px-3 py-2.5 text-[13px]"
            style={isTaskWeek ? bg : { backgroundColor: '#FFFFFF' }}
          >
            {isTaskWeek && (
              <div
                className={`flex items-center gap-2 min-w-0 rounded-[4px] transition-all ${
                  isHighlighted ? 'ring-2 ring-[#38308F] ring-offset-1' : ''
                }`}
              >
                {/* Description */}
                <span className={`flex-1 min-w-0 truncate ${dc}`}>{task.description}</span>

                {/* Flag icon — always visible for flagged tasks */}
                {task.is_flagged && (
                  <Flag size={14} className="flex-shrink-0 text-[#FF0522] fill-[#FF0522]" />
                )}

                {/* Comments icon — visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                  <button
                    onClick={() => onOpenPanel(task.id, 'comments')}
                    className="p-1 rounded text-[#797979] hover:text-[#38308F] hover:bg-[#F2F2F2] transition-colors"
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
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface SearchResult { task: AnyTask; weekLabel: string }

interface ToolbarProps {
  adminName: string
  viewMode: ViewMode
  onViewModeChange: (m: ViewMode) => void
  centerWeekIndex: number
  currentWeekIndex: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchResults: SearchResult[]
  showSearchDropdown: boolean
  onSearchResultClick: (t: AnyTask) => void
  onSearchClose: () => void
}

function Toolbar({
  adminName,
  viewMode,
  onViewModeChange,
  centerWeekIndex,
  currentWeekIndex,
  onPrev,
  onNext,
  onToday,
  searchQuery,
  onSearchChange,
  searchResults,
  showSearchDropdown,
  onSearchResultClick,
  onSearchClose,
}: ToolbarProps) {
  const isAtCurrentWeek = centerWeekIndex === currentWeekIndex
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) onSearchClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onSearchClose])

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-[#DADADA] flex-shrink-0">
      {/* Back */}
      <Link
        href="/manager"
        className="flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium border border-[#DADADA] rounded-[6px] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] bg-white transition-colors"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      {/* Admin name */}
      <span className="text-[13px] font-medium text-[#19153F] truncate max-w-[200px]">
        {adminName}&rsquo;s tasks
      </span>

      {/* Read-only badge */}
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#F2F2F2] text-[#797979] border border-[#DADADA]">
        Read only
      </span>

      <div className="flex-1" />

      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={centerWeekIndex === 0}
          className="flex items-center justify-center w-7 h-7 rounded border border-[#DADADA] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={onToday}
          className={`px-2.5 py-1 text-[12px] font-medium rounded border transition-colors ${
            isAtCurrentWeek
              ? 'border-[#00D1BA] text-[#00D1BA] bg-white cursor-default'
              : 'border-[#DADADA] text-[#595959] bg-white hover:border-[#00D1BA] hover:text-[#00D1BA]'
          }`}
        >
          Today
        </button>
        <button
          onClick={onNext}
          className="flex items-center justify-center w-7 h-7 rounded border border-[#DADADA] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] transition-colors bg-white"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* View toggle */}
      <div className="flex rounded border border-[#DADADA] overflow-hidden bg-white">
        {(['focused', 'expanded'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
              viewMode === mode ? 'bg-[#19153F] text-white' : 'text-[#595959] hover:bg-[#F2F2F2]'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Search */}
      <div ref={searchRef} className="relative flex items-center">
        <span className="absolute left-2.5 text-[#797979] pointer-events-none">
          <Search size={14} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { onSearchClose(); (e.target as HTMLInputElement).blur() }
          }}
          placeholder="Search tasks…"
          className="pl-7 pr-3 h-7 text-[13px] border border-[#DADADA] rounded-[6px] w-48 placeholder:text-[#797979] focus:outline-none focus:border-[#38308F] bg-white"
        />
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute top-full right-0 mt-1 z-40 bg-white border border-[#DADADA] rounded-[6px] shadow-lg w-80 py-1 overflow-hidden">
            {searchResults.map(({ task, weekLabel }) => (
              <button
                key={task.id}
                onMouseDown={(e) => { e.preventDefault(); onSearchResultClick(task) }}
                className="w-full text-left px-3 py-2 hover:bg-[#F2F2F2] transition-colors flex flex-col gap-0.5"
              >
                <span className="text-[13px] text-[#19153F] truncate">{task.description}</span>
                <div className="flex items-center gap-2">
                  <ProductBadge product={task.product} />
                  <span className="text-[11px] text-[#797979]">{projectName(task)}</span>
                  <span className="text-[11px] text-[#797979] ml-auto">{weekLabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const PRODUCT_LABELS: Record<string, string> = { AH: 'Access Hub', EH: 'Evidence Hub', NURO: 'NURO', 'N/A': 'N/A' }

interface FilterBarProps {
  uniqueProjects: { id: string; name: string }[]
  filterProducts: string[]
  filterProjects: string[]
  sortMode: SortMode
  onToggleProduct: (p: string) => void
  onToggleProject: (id: string) => void
  onSortMode: (m: SortMode) => void
}

function FilterBar({ uniqueProjects, filterProducts, filterProjects, sortMode, onToggleProduct, onToggleProject, onSortMode }: FilterBarProps) {
  const chipBase = 'px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors'
  const chipActive = 'bg-[#19153F] text-white border-[#19153F]'
  const chipInactive = 'bg-white text-[#595959] border-[#DADADA] hover:border-[#aaa] hover:text-[#19153F]'

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-[#DADADA] flex-shrink-0 flex-wrap">
      {(['AH', 'EH', 'NURO', 'N/A'] as const).map((p) => (
        <button
          key={p}
          onClick={() => onToggleProduct(p)}
          className={`${chipBase} ${filterProducts.includes(p) ? chipActive : chipInactive}`}
        >
          {PRODUCT_LABELS[p]}
        </button>
      ))}
      {uniqueProjects.length > 0 && <div className="w-px h-4 bg-[#DADADA] mx-0.5 flex-shrink-0" />}
      {uniqueProjects.map((proj) => (
        <button
          key={proj.id}
          onClick={() => onToggleProject(proj.id)}
          className={`${chipBase} ${filterProjects.includes(proj.id) ? chipActive : chipInactive}`}
        >
          {proj.name}
        </button>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[#797979]">Sort:</span>
        {([['product', 'By product'], ['project', 'By project']] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => onSortMode(mode)}
            className={`${chipBase} ${sortMode === mode ? chipActive : chipInactive}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

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
          <col style={{ width: 182, minWidth: 182 }} />
          {visibleWeekIndices.map((wi) => <col key={wi} style={{ minWidth: 200 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-[#F2F2F2] border-t border-b border-l border-r border-[#DADADA] px-3 py-2 text-left text-[11px] font-medium text-[#797979] uppercase tracking-wide">
              Product
            </th>
            <th
              className="sticky z-20 bg-[#F2F2F2] border-t border-b border-r border-[#DADADA] px-3 py-2 text-left text-[11px] font-medium text-[#797979] uppercase tracking-wide"
              style={{ left: 84, boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)' }}
            >
              Project
            </th>
            {visibleWeekIndices.map((wi) => {
              const isCurrent = wi === currentWeekIndex
              return (
                <th key={wi} className="border-t border-b border-r border-[#DADADA] px-3 py-2 text-left text-[13px] font-medium text-[#19153F] bg-[#F2F2F2]">
                  <div className="flex items-center gap-2">
                    <span className={isCurrent ? 'pb-0.5 border-b-2 border-[#00D1BA]' : ''}>{formatWeekHeader(wi)}</span>
                    {isCurrent && (
                      <span className="inline-flex items-center justify-center px-1.5 py-[3px] rounded text-[10px] font-medium bg-[#00D1BA] text-[#19153F]">
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
              <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-[#797979]">
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
  const [tasks, setTasks] = useState<AnyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('')

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

  // Fetch tasks and admin name
  useEffect(() => {
    if (!userId) return
    const loadData = async () => {
      setLoading(true)
      const [tasksRes, userRes, relRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, projects(name)')
          .eq('admin_user_id', adminUserId)
          .order('week_start_date')
          .order('sort_order'),
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

      if (tasksRes.data) {
        const mapped: TaskWithProject[] = tasksRes.data.map((row) => {
          const proj = row.projects as { name: string } | null
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { projects: _p, ...rest } = row
          return { ...rest, project_name: proj?.name ?? null }
        })
        setTasks(mapped)
      }

      if (userRes.data) {
        const { first_name, last_name } = userRes.data
        setAdminName([first_name, last_name].filter(Boolean).join(' ') || 'Unknown')
      }

      setLoading(false)
    }
    loadData()
  }, [adminUserId, userId, router])

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const timer = setTimeout(() => {
      const q = searchQuery.toLowerCase()
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
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, tasks])

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
      <div className="flex items-center justify-center h-full text-[13px] text-[#797979]">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F2F2F2]">
      <Toolbar
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
      />
      <FilterBar
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        sortMode={sortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onSortMode={setSortMode}
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
