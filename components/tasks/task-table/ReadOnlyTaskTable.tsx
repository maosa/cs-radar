'use client'

import { weekIndexToDateString, dateStringToWeekIndex } from '@/lib/weeks'
import { projectName } from '@/lib/taskUtils'
import TableHeader from './TableHeader'
import ReadOnlyTaskRow from './ReadOnlyTaskRow'
import { PRODUCT_ORDER, type AnyTask } from './types'
import type { SortMode } from '../shared/SharedFilterBar'

interface ReadOnlyTaskTableProps {
  tasks: AnyTask[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  sortMode: SortMode
  highlightedTaskId: string | null
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
}

export default function ReadOnlyTaskTable({
  tasks,
  visibleWeekIndices,
  currentWeekIndex,
  sortMode,
  highlightedTaskId,
  onOpenPanel,
}: ReadOnlyTaskTableProps) {
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
    <div className="overflow-y-auto flex-1">
      <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 84, minWidth: 84 }} />
          <col style={{ width: 240, minWidth: 240 }} />
          {visibleWeekIndices.map((wi) => <col key={wi} />)}
        </colgroup>
        <TableHeader visibleWeekIndices={visibleWeekIndices} currentWeekIndex={currentWeekIndex} />
        <tbody>
          {visibleTasks.length === 0 && (
            <tr>
              <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
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
