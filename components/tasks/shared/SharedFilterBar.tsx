'use client'

import { useRef, useState, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'

export type SortMode = 'drag' | 'product' | 'project' | 'product_project'

export interface UniqueProject {
  id: string
  name: string
  displayName?: string
}

interface FilterBarProps {
  uniqueProjects: UniqueProject[]
  filterProducts: string[]
  filterProjects: string[]
  filterStatuses: string[]
  sortMode: SortMode
  onToggleProduct: (p: string) => void
  onToggleProject: (id: string) => void
  onToggleStatus: (s: string) => void
  onSortMode: (mode: SortMode) => void
  onClearFilters?: () => void
  hideDragSort?: boolean
}

const PRODUCT_OPTIONS = ['AH', 'EH', 'NURO', 'N/A'] as const

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'complete', label: 'Completed' },
  { value: 'flagged', label: 'Flagged' },
]

const chipBase = 'px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors'
const chipActive = 'bg-navy text-white border-navy'
const chipInactive = 'bg-white text-text-secondary border-border hover:border-border-hover hover:text-navy'

function useDropdownClose(ref: React.RefObject<HTMLElement | null>, setOpen: (v: boolean) => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, setOpen])
}

function ProductDropdown({
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
        className={`${chipBase} ${activeCount > 0 ? chipActive : chipInactive} flex items-center gap-1`}
      >
        Product
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[100px]">
          {PRODUCT_OPTIONS.map((value) => {
            const checked = filterProducts.includes(value)
            return (
              <label
                key={value}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleProduct(value)}
                  className="accent-navy w-3 h-3"
                />
                {value}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectDropdown({
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

  if (uniqueProjects.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`${chipBase} ${activeCount > 0 ? chipActive : chipInactive} flex items-center gap-1`}
      >
        Project
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[140px] max-w-[240px]">
          {uniqueProjects.map((proj) => {
            const checked = filterProjects.includes(proj.id)
            return (
              <label
                key={proj.id}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleProject(proj.id)}
                  className="accent-navy w-3 h-3 flex-shrink-0"
                />
                <span className="truncate">{proj.displayName || proj.name}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDropdown({
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
        className={`${chipBase} ${activeCount > 0 ? chipActive : chipInactive} flex items-center gap-1`}
      >
        Status
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-navy text-[10px] font-semibold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-[6px] shadow-md py-1 min-w-[130px]">
          {STATUS_OPTIONS.map(({ value, label }) => {
            const checked = filterStatuses.includes(value)
            return (
              <label
                key={value}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-surface text-[12px] text-navy"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStatus(value)}
                  className="accent-navy w-3 h-3"
                />
                {label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SharedFilterBar({
  uniqueProjects,
  filterProducts,
  filterProjects,
  filterStatuses,
  sortMode,
  onToggleProduct,
  onToggleProject,
  onToggleStatus,
  onSortMode,
  onClearFilters,
  hideDragSort,
}: FilterBarProps) {
  const hasActiveFilters =
    filterProducts.length > 0 || filterProjects.length > 0 || filterStatuses.length > 0

  const isProductSort = sortMode === 'product' || sortMode === 'product_project'
  const isProjectSort = sortMode === 'project' || sortMode === 'product_project'

  const handleSortProduct = () => {
    if (sortMode === 'drag') onSortMode('product')
    else if (sortMode === 'product') onSortMode('drag')
    else if (sortMode === 'project') onSortMode('product_project')
    else onSortMode('project') // product_project → remove product
  }

  const handleSortProject = () => {
    if (sortMode === 'drag') onSortMode('project')
    else if (sortMode === 'project') onSortMode('drag')
    else if (sortMode === 'product') onSortMode('product_project')
    else onSortMode('product') // product_project → remove project
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
      {/* Product dropdown */}
      <ProductDropdown filterProducts={filterProducts} onToggleProduct={onToggleProduct} />

      {/* Divider before project dropdown */}
      {uniqueProjects.length > 0 && (
        <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
      )}

      {/* Project dropdown */}
      <ProjectDropdown
        uniqueProjects={uniqueProjects}
        filterProjects={filterProjects}
        onToggleProject={onToggleProject}
      />

      {/* Divider before status dropdown */}
      <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />

      {/* Status dropdown */}
      <StatusDropdown filterStatuses={filterStatuses} onToggleStatus={onToggleStatus} />

      {/* Clear filters */}
      {hasActiveFilters && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-text-muted hover:text-red-dark transition-colors"
          title="Clear all filters"
        >
          <X size={12} />
          Clear
        </button>
      )}

      <div className="flex-1" />

      {/* Sort mode */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-muted">Sort:</span>

        {/* By product chip */}
        <button
          onClick={handleSortProduct}
          className={`${chipBase} ${isProductSort ? chipActive : chipInactive}`}
        >
          By product
        </button>

        {/* By project chip */}
        <button
          onClick={handleSortProject}
          className={`${chipBase} ${isProjectSort ? chipActive : chipInactive}`}
        >
          By project
        </button>

        {/* Separator between by-project and drag */}
        {!hideDragSort && (
          <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
        )}

        {/* Drag & drop chip */}
        {!hideDragSort && (
          <button
            onClick={() => onSortMode('drag')}
            className={`${chipBase} ${sortMode === 'drag' ? chipActive : chipInactive}`}
          >
            Drag &amp; drop
          </button>
        )}
      </div>
    </div>
  )
}
