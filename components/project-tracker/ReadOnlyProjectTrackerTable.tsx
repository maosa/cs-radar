'use client'

import { useMemo } from 'react'
import ReadOnlyProjectTrackerRow from './ReadOnlyProjectTrackerRow'
import TableHeader from '@/components/tasks/task-table/TableHeader'
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
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
}

export default function ReadOnlyProjectTrackerTable({
  entries,
  visibleWeekIndices,
  currentWeekIndex,
  weekSortModes,
  defaultSortMode,
  filterProducts,
  filterProjects,
  onOpenPanel,
  onOpenComments,
}: Props) {
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
          {displayEntries.length === 0 ? (
            <tr>
              <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                No entries for this week.
              </td>
            </tr>
          ) : (
            displayEntries.map((entry) => (
              <ReadOnlyProjectTrackerRow
                key={entry.id}
                entry={entry}
                visibleWeekIndices={visibleWeekIndices}
                onOpenPanel={onOpenPanel}
                onOpenComments={onOpenComments}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
