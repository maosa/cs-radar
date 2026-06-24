'use client'

import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import {
  Search, ChevronLeft, ChevronRight, ChevronDown,
  CalendarCheck, Funnel, ArrowDownUp, X,
} from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'
import {
  type SortMode,
  type UniqueProject,
  parseSortMode,
  buildSortMode,
} from '@/components/tasks/shared/SharedFilterBar'

interface SearchResult {
  task: any
  weekLabel: string
}

interface ManagerControlBarProps {
  // Week nav
  centerWeekIndex: number
  currentWeekIndex: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  // Filters
  uniqueProjects: UniqueProject[]
  filterProducts: string[]
  filterProjects: string[]
  filterStatuses: string[]
  onToggleProduct: (p: string) => void
  onToggleProject: (id: string) => void
  onToggleStatus: (s: string) => void
  onClearFilters?: () => void
  hideStatus?: boolean
  // Sort
  sortMode: SortMode
  onSortMode: (mode: SortMode) => void
  // Search
  searchQuery: string
  onSearchChange: (q: string) => void
  searchResults: SearchResult[]
  showSearchDropdown: boolean
  onSearchResultClick: (task: any) => void
  onSearchClose: () => void
  projectNameFn?: (task: any) => string
  searchPlaceholder?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_OPTIONS = ['AH', 'EH', 'NURO', 'N/A'] as const

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open',     label: 'Open'      },
  { value: 'complete', label: 'Completed' },
  { value: 'flagged',  label: 'Flagged'   },
]

const chipBase     = 'flex items-center gap-1 h-7 text-[12px] font-medium rounded-[4px] border transition-colors'
const chipActive   = 'bg-navy text-white border-navy'
const chipInactive = 'bg-white text-text-secondary border-border hover:border-border-hover hover:text-navy'

// ── useDropdownClose hook ────────────────────────────────────────────────────

function useDropdownClose(
  ref: React.RefObject<HTMLElement | null>,
  setOpen: (v: boolean) => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, setOpen])
}

// ── Filter chip sub-components ───────────────────────────────────────────────

function ProductChip({
  filterProducts,
  onToggleProduct,
}: {
  filterProducts: string[]
  onToggleProduct: (p: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDropdownClose(ref, setOpen)
  const activeCount = filterProducts.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${chipBase} px-2.5 ${activeCount > 0 ? chipActive : chipInactive}`}
        aria-label="Filter by product"
      >
        <span className="hidden lg:inline">Product</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[100px]">
          {PRODUCT_OPTIONS.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
            >
              <input
                type="checkbox"
                checked={filterProducts.includes(value)}
                onChange={() => onToggleProduct(value)}
                className="accent-navy w-3 h-3"
              />
              {value}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectChip({
  uniqueProjects,
  filterProjects,
  onToggleProject,
}: {
  uniqueProjects: UniqueProject[]
  filterProjects: string[]
  onToggleProject: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDropdownClose(ref, setOpen)
  const activeCount = filterProjects.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${chipBase} px-2.5 ${activeCount > 0 ? chipActive : chipInactive}`}
        aria-label="Filter by project"
      >
        <span className="hidden lg:inline">Project</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[140px] max-w-[240px]">
          {uniqueProjects.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-text-muted italic whitespace-nowrap">No projects yet</div>
          ) : uniqueProjects.map((proj) => (
            <label
              key={proj.id}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
            >
              <input
                type="checkbox"
                checked={filterProjects.includes(proj.id)}
                onChange={() => onToggleProject(proj.id)}
                className="accent-navy w-3 h-3 flex-shrink-0"
              />
              <span className="truncate">{proj.displayName || proj.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusChip({
  filterStatuses,
  onToggleStatus,
}: {
  filterStatuses: string[]
  onToggleStatus: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDropdownClose(ref, setOpen)
  const activeCount = filterStatuses.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${chipBase} px-2.5 ${activeCount > 0 ? chipActive : chipInactive}`}
        aria-label="Filter by status"
      >
        <span className="hidden lg:inline">Status</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[130px]">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
            >
              <input
                type="checkbox"
                checked={filterStatuses.includes(value)}
                onChange={() => onToggleStatus(value)}
                className="accent-navy w-3 h-3"
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ManagerControlBar({
  centerWeekIndex,
  currentWeekIndex,
  onPrev,
  onNext,
  onToday,
  uniqueProjects,
  filterProducts,
  filterProjects,
  filterStatuses,
  onToggleProduct,
  onToggleProject,
  onToggleStatus,
  onClearFilters,
  hideStatus = false,
  sortMode,
  onSortMode,
  searchQuery,
  onSearchChange,
  searchResults,
  showSearchDropdown,
  onSearchResultClick,
  onSearchClose,
  projectNameFn = (t) => t.project_name ?? '—',
  searchPlaceholder = 'Search tasks…',
}: ManagerControlBarProps) {
  const isAtCurrentWeek = centerWeekIndex === currentWeekIndex
  const todayBtnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const [todayShowText, setTodayShowText] = useState(true)

  useLayoutEffect(() => {
    const btn = todayBtnRef.current
    if (!btn) return
    const ro = new ResizeObserver(([entry]) => {
      setTodayShowText(entry.contentRect.width >= 44)
    })
    ro.observe(btn)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        onSearchClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onSearchClose])

  const flags = parseSortMode(sortMode)
  const handleSortProduct = () => onSortMode(buildSortMode(false, !flags.product, flags.project))
  const handleSortProject = () => onSortMode(buildSortMode(false, flags.product, !flags.project))

  const hasActiveFilters =
    filterProducts.length > 0 || filterProjects.length > 0 || filterStatuses.length > 0

  return (
    <div className="flex items-center gap-1.5 px-6 py-2 bg-white border-b border-border flex-shrink-0">

      {/* ── Week navigation (LEFT) ──────────────────────────────────── */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onPrev}
          disabled={centerWeekIndex === 0}
          className="flex items-center justify-center w-7 h-7 flex-shrink-0 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          ref={todayBtnRef}
          onClick={onToday}
          className={`flex items-center justify-center min-w-[28px] w-14 flex-shrink h-7 rounded border transition-colors bg-white ${
            isAtCurrentWeek
              ? 'border-teal text-teal cursor-default'
              : 'border-border text-text-secondary hover:border-teal hover:text-teal'
          }`}
          aria-label="Go to current week"
          title="Today"
        >
          {todayShowText
            ? <span className="text-[12px] font-medium whitespace-nowrap">Today</span>
            : <CalendarCheck size={15} />
          }
        </button>
        <button
          onClick={onNext}
          className="flex items-center justify-center w-7 h-7 flex-shrink-0 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Spacer ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0" />

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Funnel size={13} className="text-text-muted flex-shrink-0" />
        <ProductChip filterProducts={filterProducts} onToggleProduct={onToggleProduct} />
        <ProjectChip
          uniqueProjects={uniqueProjects}
          filterProjects={filterProjects}
          onToggleProject={onToggleProject}
        />
        {!hideStatus && (
          <StatusChip filterStatuses={filterStatuses} onToggleStatus={onToggleStatus} />
        )}
        {hasActiveFilters && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 px-1.5 py-1 text-[12px] font-medium text-text-muted hover:text-red-dark transition-colors"
            title="Clear all filters"
          >
            <X size={12} />
            <span className="hidden lg:inline">Clear</span>
          </button>
        )}
      </div>

      <div className="w-px h-4 bg-border flex-shrink-0" />

      {/* ── Sort chips ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <ArrowDownUp size={13} className="text-text-muted flex-shrink-0" />
        <button
          onClick={handleSortProduct}
          className={`${chipBase} px-1.5 lg:px-2.5 ${flags.product ? chipActive : chipInactive}`}
        >
          By product
        </button>
        <button
          onClick={handleSortProject}
          className={`${chipBase} px-1.5 lg:px-2.5 ${flags.project ? chipActive : chipInactive}`}
        >
          By project
        </button>
      </div>

      <div className="w-px h-4 bg-border flex-shrink-0" />

      {/* ── Search ──────────────────────────────────────────────────── */}
      <div ref={searchRef} className="relative flex items-center flex-shrink-0">
        <span className="absolute left-2.5 text-text-muted pointer-events-none">
          <Search size={14} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onSearchClose()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={searchPlaceholder}
          className="pl-7 pr-3 h-7 text-[13px] border border-border rounded-[6px] w-36 lg:w-48 placeholder:text-text-muted focus:outline-none focus:border-navy-mid bg-white"
        />
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute top-full right-0 mt-1 z-40 bg-white border border-border rounded-[6px] shadow-lg w-80 py-1 overflow-hidden">
            {searchResults.map(({ task, weekLabel }) => (
              <button
                key={task.id}
                onMouseDown={(e) => { e.preventDefault(); onSearchResultClick(task) }}
                className="w-full text-left px-3 py-2 hover:bg-bg transition-colors flex flex-col gap-0.5"
              >
                <span className="text-[13px] text-navy truncate">{task.description}</span>
                <div className="flex items-center gap-2">
                  <ProductBadge product={task.product} />
                  <span className="text-[11px] text-text-muted">{projectNameFn(task)}</span>
                  <span className="text-[11px] text-text-muted ml-auto">{weekLabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
