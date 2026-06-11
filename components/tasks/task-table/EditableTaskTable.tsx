'use client'

import { useState, useMemo, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { weekIndexToDateString, dateStringToWeekIndex } from '@/lib/weeks'
import { projectName } from '@/lib/taskUtils'
import ProductBadge from '../ProductBadge'
import TableHeader from './TableHeader'
import SortableTaskRow from './SortableTaskRow'
import { PRODUCT_ORDER, type AnyTask } from './types'
import { parseSortMode, type SortMode } from '../shared/SharedFilterBar'

interface EditableTaskTableProps {
  tasks: AnyTask[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  weekSortModes: Record<number, SortMode>
  defaultSortMode: SortMode
  highlightedTaskId: string | null
  onToggleComplete: (id: string) => void
  onToggleFlag: (id: string) => void
  onMove: (id: string, weeks: number) => void
  onCopy: (id: string, weeks: number) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  onEditDescription: (id: string, description: string) => void
  onAddTaskInWeek: (weekIndex: number) => void
  onReorder: (orderedIds: string[], weekDateStr: string) => void
}

export default function EditableTaskTable({
  tasks,
  visibleWeekIndices,
  currentWeekIndex,
  weekSortModes,
  defaultSortMode,
  highlightedTaskId,
  onToggleComplete,
  onToggleFlag,
  onMove,
  onCopy,
  onDelete,
  onOpenPanel,
  onEditDescription,
  onAddTaskInWeek,
  onReorder,
}: EditableTaskTableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const visibleWeekStrings = useMemo(
    () => new Set(visibleWeekIndices.map(weekIndexToDateString)),
    [visibleWeekIndices],
  )

  const visibleTasks = useMemo(() => tasks
    .filter((t) => visibleWeekStrings.has(t.week_start_date))
    .slice()
    .sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      const f = parseSortMode(weekSortModes[wA] ?? defaultSortMode)
      if (f.product) {
        const pd = (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
        if (pd !== 0) return pd
      }
      if (f.project) {
        const pj = projectName(a).localeCompare(projectName(b))
        if (pj !== 0) return pj
      }
      return a.sort_order - b.sort_order
    }), [tasks, visibleWeekStrings, weekSortModes, defaultSortMode])

  const activeTask = activeId ? visibleTasks.find((t) => t.id === activeId) : null

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const draggedTask = visibleTasks.find((t) => t.id === active.id)
    const targetTask = visibleTasks.find((t) => t.id === over.id)
    if (!draggedTask || !targetTask || draggedTask.week_start_date !== targetTask.week_start_date) return
    const weekIdx = dateStringToWeekIndex(draggedTask.week_start_date)
    const f = parseSortMode(weekSortModes[weekIdx] ?? defaultSortMode)
    if (f.product && draggedTask.product !== targetTask.product) return
    if (f.project && draggedTask.project_id !== targetTask.project_id) return
    const weekStr = draggedTask.week_start_date
    const weekTasks = visibleTasks.filter((t) => t.week_start_date === weekStr)
    const reordered = arrayMove(
      weekTasks,
      weekTasks.findIndex((t) => t.id === active.id),
      weekTasks.findIndex((t) => t.id === over.id),
    )
    onReorder(reordered.map((t) => t.id), weekStr)
    // Force a repaint of sticky cells after React reorders <tr> DOM nodes.
    // Chrome doesn't invalidate compositor tiles for position:sticky children
    // when their parent <tr> is physically moved by React's reconciler, leaving
    // border-b faint. Hiding and immediately restoring the tbody (before any
    // paint) forces Chrome to repaint all cells from scratch.
    requestAnimationFrame(() => {
      const tbody = tbodyRef.current
      if (!tbody) return
      tbody.style.display = 'none'
      void tbody.offsetHeight
      tbody.style.display = ''
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-y-auto flex-1">
        <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 84, minWidth: 84 }} />
            <col style={{ width: 240, minWidth: 240 }} />
            {visibleWeekIndices.map((wi) => <col key={wi} />)}
          </colgroup>
          <TableHeader visibleWeekIndices={visibleWeekIndices} currentWeekIndex={currentWeekIndex} />
          <tbody ref={tbodyRef} className="[&_tr:last-child_td]:border-b-0">
            <SortableContext items={visibleTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {visibleTasks.length === 0 && (
                <tr>
                  <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                    No tasks for this period.
                  </td>
                </tr>
              )}
              {visibleTasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  visibleWeekIndices={visibleWeekIndices}
                  onToggleComplete={onToggleComplete}
                  onToggleFlag={onToggleFlag}
                  onMove={onMove}
                  onCopy={onCopy}
                  onDelete={onDelete}
                  onOpenPanel={onOpenPanel}
                  onEditDescription={onEditDescription}
                  isDragMode={parseSortMode(weekSortModes[dateStringToWeekIndex(task.week_start_date)] ?? defaultSortMode).drag}
                  isHighlighted={task.id === highlightedTaskId}
                />
              ))}
            </SortableContext>
            <tr className="group">
              <td className="sticky left-0 z-10 bg-white border-r border-border" style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA' }} />
              <td className="sticky z-10 bg-white border-r border-border" style={{ left: 84, boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }} />
              {visibleWeekIndices.map((wi) => (
                <td key={wi} className="border-b border-r last:border-r-0 border-border px-3 py-2">
                  <button
                    onClick={() => onAddTaskInWeek(wi)}
                    className="text-[12px] text-text-muted hover:text-navy-mid transition-colors"
                  >
                    + Add task
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {activeTask && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded shadow-lg text-[13px] font-medium opacity-90"
            style={{ backgroundColor: '#19153F', color: '#fff', width: 300 }}
          >
            <ProductBadge product={activeTask.product} />
            <span className="truncate">{activeTask.description}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
