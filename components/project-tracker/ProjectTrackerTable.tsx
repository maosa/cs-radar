'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import ProductBadge from '@/components/tasks/ProductBadge'
import ProjectTrackerRow from './ProjectTrackerRow'
import { parseSortMode, type SortMode } from '@/components/tasks/shared/SharedFilterBar'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

interface Props {
  entries: ProjectTrackerEntry[]
  sortMode: SortMode
  filterProducts: string[]
  filterProjects: string[]
  onFlag: (id: string) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
  onDescriptionSave: (id: string, description: string) => void
  onSortOrderChange: (orderedIds: string[]) => void
  weekLabel: string
}

export default function ProjectTrackerTable({
  entries,
  sortMode,
  filterProducts,
  filterProjects,
  onFlag,
  onDelete,
  onOpenPanel,
  onOpenComments,
  onDescriptionSave,
  onSortOrderChange,
  weekLabel,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const { drag: isDragActive, product: isSortProduct, project: isSortProject } = useMemo(
    () => parseSortMode(sortMode),
    [sortMode],
  )

  const displayEntries = useMemo(() => {
    let result = [...entries]

    if (filterProducts.length > 0) {
      result = result.filter((e) => filterProducts.includes(e.product))
    }
    if (filterProjects.length > 0) {
      result = result.filter((e) => filterProjects.includes(e.project_id))
    }

    // When drag is active, product/project flags are cleared by dragExclusive logic
    // in SharedFilterBar, so this falls through to sort_order automatically.
    result.sort((a, b) => {
      if (isSortProduct) {
        const pd = (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
        if (pd !== 0) return pd
      }
      if (isSortProject) {
        const pj = (a.project_name ?? '').localeCompare(b.project_name ?? '')
        if (pj !== 0) return pj
      }
      return a.sort_order - b.sort_order
    })

    return result
  }, [entries, filterProducts, filterProjects, isSortProduct, isSortProject])

  const activeEntry = activeId ? displayEntries.find((e) => e.id === activeId) ?? null : null

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const reordered = arrayMove(
      displayEntries,
      displayEntries.findIndex((e) => e.id === active.id),
      displayEntries.findIndex((e) => e.id === over.id),
    )
    onSortOrderChange(reordered.map((e) => e.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-y-auto flex-1">
        <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 84, minWidth: 84 }} />
            <col style={{ width: 240, minWidth: 240 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-bg border-t border-b border-l border-r border-border px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wide">
                Product
              </th>
              <th
                className="sticky top-0 z-30 bg-bg border-t border-b border-r border-border px-3 py-2 text-left text-[11px] font-medium text-text-muted uppercase tracking-wide"
                style={{ left: 84, boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)' }}
              >
                Project
              </th>
              <th className="sticky top-0 z-20 bg-bg border-t border-b border-r border-border px-3 py-2 text-left text-[13px] font-medium text-navy">
                {weekLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={displayEntries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {displayEntries.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-[13px] text-text-muted">
                    No entries for this week.
                  </td>
                </tr>
              ) : (
                displayEntries.map((entry) => (
                  <ProjectTrackerRow
                    key={entry.id}
                    entry={entry}
                    onFlag={onFlag}
                    onDelete={onDelete}
                    onOpenPanel={onOpenPanel}
                    onOpenComments={onOpenComments}
                    onDescriptionSave={onDescriptionSave}
                    isDragActive={isDragActive}
                  />
                ))
              )}
            </SortableContext>
          </tbody>
        </table>
      </div>

      <DragOverlay>
        {activeEntry && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded shadow-lg text-[13px] font-medium opacity-90"
            style={{ backgroundColor: '#19153F', color: '#fff', width: 300 }}
          >
            <ProductBadge product={activeEntry.product} />
            <span className="truncate">{activeEntry.project_name ?? '—'}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
