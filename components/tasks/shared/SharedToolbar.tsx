import { useRef, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'

type ViewMode = 'focused' | 'expanded'

interface SearchResult {
  task: any
  weekLabel: string
}

interface SharedToolbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
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
}

export default function SharedToolbar({
  viewMode,
  onViewModeChange,
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
}: SharedToolbarProps) {
  const isAtCurrentWeek = centerWeekIndex === currentWeekIndex
  const searchRef = useRef<HTMLDivElement>(null)

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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
      {/* Manager View specifics */}
      {adminName ? (
        <>
          <Link
            href="/manager"
            className="flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <span className="text-[13px] font-medium text-navy truncate max-w-[200px]">
            {adminName}&rsquo;s Task List
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-bg text-text-muted border border-border">
            Read only
          </span>
        </>
      ) : onAddTask ? (
        <button
          onClick={onAddTask}
          className="flex items-center gap-1.5 px-3 py-1 bg-navy text-white text-[13px] font-medium rounded-[6px] border border-transparent hover:bg-navy-hover transition-colors"
        >
          <Plus size={14} />
          Add task
        </button>
      ) : null}

      <div className="flex-1" />

      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={centerWeekIndex === 0}
          className="flex items-center justify-center w-7 h-7 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={onToday}
          className={`px-2.5 py-1 text-[12px] font-medium rounded border transition-colors ${
            isAtCurrentWeek
              ? 'border-teal text-teal bg-white cursor-default'
              : 'border-border text-text-secondary bg-white hover:border-teal hover:text-teal'
          }`}
        >
          Today
        </button>

        <button
          onClick={onNext}
          className="flex items-center justify-center w-7 h-7 rounded border border-border text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* View toggle */}
      <div className="flex rounded border border-border overflow-hidden bg-white">
        {(['focused', 'expanded'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
              viewMode === mode
                ? 'bg-navy text-white'
                : 'text-text-secondary hover:bg-bg'
            }`}
          >
            {mode}
          </button>
        ))}
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
          placeholder="Search tasks…"
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
