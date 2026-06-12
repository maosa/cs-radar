import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Plus, Search, ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'

interface SearchResult {
  task: any
  weekLabel: string
}

interface SharedToolbarProps {
  centerWeekIndex: number
  currentWeekIndex: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onAddTask?: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchResults: SearchResult[]
  showSearchDropdown: boolean
  onSearchResultClick: (task: any) => void
  onSearchClose: () => void
  adminName?: string
  projectNameFn?: (task: any) => string
  addButtonLabel?: string
  searchPlaceholder?: string
  managerViewTitle?: string
}

export default function SharedToolbar({
  centerWeekIndex,
  currentWeekIndex,
  onPrev,
  onNext,
  onToday,
  onAddTask,
  searchQuery,
  onSearchChange,
  searchResults,
  showSearchDropdown,
  onSearchResultClick,
  onSearchClose,
  adminName,
  projectNameFn = (t) => t.project_name ?? '—',
  addButtonLabel = 'Add task',
  searchPlaceholder = 'Search tasks…',
  managerViewTitle,
}: SharedToolbarProps) {
  const isAtCurrentWeek = centerWeekIndex === currentWeekIndex
  const searchRef = useRef<HTMLDivElement>(null)
  const todayBtnRef = useRef<HTMLButtonElement>(null)
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

  return (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-border flex-shrink-0">
      {onAddTask ? (
        <button
          onClick={onAddTask}
          className="flex items-center gap-1.5 px-3 py-1 bg-navy text-white text-[13px] font-medium rounded-[6px] border border-transparent hover:bg-navy-hover transition-colors"
        >
          <Plus size={14} />
          {addButtonLabel}
        </button>
      ) : null}

      <div className="flex-1" />

      {/* Week navigation */}
      <div className="flex items-center gap-1">
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
          className={`flex items-center justify-center min-w-[28px] w-14 flex-shrink h-7 text-[12px] font-medium rounded border transition-colors ${
            isAtCurrentWeek
              ? 'border-teal text-teal bg-white cursor-default'
              : 'border-border text-text-secondary bg-white hover:border-teal hover:text-teal'
          }`}
        >
          {todayShowText
            ? <span className="whitespace-nowrap">Today</span>
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

      {/* Search */}
      <div ref={searchRef} className="relative flex items-center">
        <span className="absolute left-2.5 text-text-muted pointer-events-none">
          <Search size={14} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { onSearchClose(); (e.target as HTMLInputElement).blur() } }}
          placeholder={searchPlaceholder}
          className="pl-7 pr-3 h-7 text-[13px] border border-border rounded-[6px] w-48 placeholder:text-text-muted focus:outline-none focus:border-navy-mid bg-white"
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
