import { X } from 'lucide-react'

export type SortMode = 'drag' | 'product' | 'project'

export interface UniqueProject {
  id: string
  name: string
  displayName?: string
}

interface FilterBarProps {
  uniqueProjects: UniqueProject[]
  filterProducts: string[]
  filterProjects: string[]
  sortMode: SortMode
  onToggleProduct: (p: string) => void
  onToggleProject: (id: string) => void
  onSortMode: (mode: SortMode) => void
  onClearFilters?: () => void
  hideDragSort?: boolean
}

const PRODUCT_LABELS: Record<string, string> = { AH: 'Access Hub', EH: 'Evidence Hub', NURO: 'NURO', 'N/A': 'N/A' }

export default function SharedFilterBar({
  uniqueProjects,
  filterProducts,
  filterProjects,
  sortMode,
  onToggleProduct,
  onToggleProject,
  onSortMode,
  onClearFilters,
  hideDragSort,
}: FilterBarProps) {
  const hasActiveFilters = filterProducts.length > 0 || filterProjects.length > 0
  const chipBase = 'px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors'
  const chipActive = 'bg-navy text-white border-navy'
  const chipInactive = 'bg-white text-text-secondary border-border hover:border-border-hover hover:text-navy'

  const sortOptions: [SortMode, string][] = hideDragSort
    ? [['product', 'By product'], ['project', 'By project']]
    : [['drag', 'Drag & drop'], ['product', 'By product'], ['project', 'By project']]

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-border flex-shrink-0 flex-wrap">
      {/* Product chips */}
      {(['AH', 'EH', 'NURO', 'N/A'] as const).map((p) => {
        const active = filterProducts.includes(p)
        return (
          <button
            key={p}
            onClick={() => onToggleProduct(p)}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {PRODUCT_LABELS[p]}
          </button>
        )
      })}

      {/* Divider */}
      {uniqueProjects.length > 0 && (
        <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
      )}

      {/* Project chips */}
      {uniqueProjects.map((proj) => {
        const active = filterProjects.includes(proj.id)
        return (
          <button
            key={proj.id}
            onClick={() => onToggleProject(proj.id)}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {proj.displayName || proj.name}
          </button>
        )
      })}

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
        {sortOptions.map(([mode, label]) => (
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
