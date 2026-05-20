'use client'

import { useRef, useState, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'

export type SortMode =
  | 'none'
  | 'drag'
  | 'product'
  | 'project'
  | 'product_project'
  | 'drag_product'
  | 'drag_project'
  | 'drag_product_project'

export function parseSortMode(mode: SortMode) {
  return {
    drag:    mode === 'drag'    || mode === 'drag_product' || mode === 'drag_project' || mode === 'drag_product_project',
    product: mode === 'product' || mode === 'product_project' || mode === 'drag_product' || mode === 'drag_product_project',
    project: mode === 'project' || mode === 'product_project' || mode === 'drag_project' || mode === 'drag_product_project',
  }
}

export function buildSortMode(drag: boolean, product: boolean, project: boolean): SortMode {
  if (drag && product && project) return 'drag_product_project'
  if (drag && product)            return 'drag_product'
  if (drag && project)            return 'drag_project'
  if (product && project)         return 'product_project'
  if (drag)                       return 'drag'
  if (product)                    return 'product'
  if (project)                    return 'project'
  return 'none'
}

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
  hideStatus?: boolean
  dragExclusive?: boolean
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
  hideStatus = false,
  dragExclusive = false,
}: FilterBarProps) {
  const hasActiveFilters =
    filterProducts.length > 0 || filterProjects.length > 0 || filterStatuses.length > 0

  const flags = parseSortMode(sortMode)
  const isProductSort = flags.product
  const isProjectSort = flags.project
  const isDragSort    = flags.drag

  const handleSortProduct = () => {
    if (dragExclusive && flags.drag) {
      onSortMode(buildSortMode(false, !flags.product, flags.project))
    } else {
      onSortMode(buildSortMode(flags.drag, !flags.product, flags.project))
    }
  }
  const handleSortProject = () => {
    if (dragExclusive && flags.drag) {
      onSortMode(buildSortMode(false, flags.product, !flags.project))
    } else {
      onSortMode(buildSortMode(flags.drag, flags.product, !flags.project))
    }
  }
  const handleSortDrag = () => {
    if (dragExclusive) {
      onSortMode('drag')
    } else {
      onSortMode(buildSortMode(!flags.drag, flags.product, flags.project))
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
      {/* Filter label */}
      <span className="text-[11px] text-text-muted">Filter:</span>

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
      {!hideStatus && <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />}

      {/* Status dropdown */}
      {!hideStatus && <StatusDropdown filterStatuses={filterStatuses} onToggleStatus={onToggleStatus} />}

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
            onClick={handleSortDrag}
            className={`${chipBase} ${isDragSort ? chipActive : chipInactive}`}
          >
            Drag &amp; drop
          </button>
        )}
      </div>
    </div>
  )
}
