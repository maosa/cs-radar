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
import { weekIndexToDateString, dateStringToWeekIndex } from '@/lib/weeks'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

interface Props {
  entries: ProjectTrackerEntry[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  weekSortModes: Record<number, SortMode>
  defaultSortMode: SortMode
  filterProducts: string[]
  filterProjects: string[]
  hasActiveFilters?: boolean
  onFlag: (id: string) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
  onDescriptionSave: (id: string, description: string) => void
  onSortOrderChange: (orderedIds: string[]) => void
}

export default function ProjectTrackerTable({
  entries,
  visibleWeekIndices,
  currentWeekIndex,
  weekSortModes,
  defaultSortMode,
  filterProducts,
  filterProjects,
  hasActiveFilters = false,
  onFlag,
  onDelete,
  onOpenPanel,
  onOpenComments,
  onDescriptionSave,
  onSortOrderChange,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const visibleWeekStrings = useMemo(
    () => new Set(visibleWeekIndices.map(weekIndexToDateString)),
    [visibleWeekIndices],
  )

  const displayEntries = useMemo(() => {
    let result = entries.filter((e) => visibleWeekStrings.has(e.week_start_date))

    if (filterProducts.length > 0) {
      result = result.filter((e) => filterProducts.includes(e.product))
    }
    if (filterProjects.length > 0) {
      result = result.filter((e) => filterProjects.includes(e.project_id))
    }

    result.sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      const f = parseSortMode(weekSortModes[wA] ?? defaultSortMode)
      if (f.product) {
        const pd = (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
        if (pd !== 0) return pd
      }
      if (f.project) {
        const pj = (a.project_name ?? '').localeCompare(b.project_name ?? '')
        if (pj !== 0) return pj
      }
      return a.sort_order - b.sort_order
    })

    return result
  }, [entries, visibleWeekStrings, filterProducts, filterProjects, weekSortModes, defaultSortMode])

  const activeEntry = activeId ? displayEntries.find((e) => e.id === activeId) ?? null : null

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const draggedEntry = displayEntries.find((e) => e.id === active.id)
    const targetEntry = displayEntries.find((e) => e.id === over.id)
    if (!draggedEntry || !targetEntry || draggedEntry.week_start_date !== targetEntry.week_start_date) return
    const weekEntries = displayEntries.filter((e) => e.week_start_date === draggedEntry.week_start_date)
    const reordered = arrayMove(
      weekEntries,
      weekEntries.findIndex((e) => e.id === active.id),
      weekEntries.findIndex((e) => e.id === over.id),
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
      <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 84, minWidth: 84 }} />
          <col style={{ width: 240, minWidth: 240 }} />
          {visibleWeekIndices.map((wi) => <col key={wi} />)}
        </colgroup>
        <tbody className="[&_tr:last-child_td]:border-b-0">
            <SortableContext items={displayEntries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {displayEntries.length === 0 ? (
                <tr>
                  <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                    {hasActiveFilters ? 'No entries match the current filters.' : 'No entries for this week.'}
                  </td>
                </tr>
              ) : (
                displayEntries.map((entry) => (
                  <ProjectTrackerRow
                    key={entry.id}
                    entry={entry}
                    visibleWeekIndices={visibleWeekIndices}
                    onFlag={onFlag}
                    onDelete={onDelete}
                    onOpenPanel={onOpenPanel}
                    onOpenComments={onOpenComments}
                    onDescriptionSave={onDescriptionSave}
                    isDragActive={parseSortMode(weekSortModes[dateStringToWeekIndex(entry.week_start_date)] ?? defaultSortMode).drag}
                  />
                ))
              )}
            </SortableContext>
          </tbody>
        </table>

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
