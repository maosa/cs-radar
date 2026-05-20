'use client'

import { useMemo } from 'react'
import ReadOnlyProjectTrackerRow from './ReadOnlyProjectTrackerRow'
import { parseSortMode, type SortMode } from '@/components/tasks/shared/SharedFilterBar'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

interface Props {
  entries: ProjectTrackerEntry[]
  sortMode: SortMode
  filterProducts: string[]
  filterProjects: string[]
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
  weekLabel: string
  isCurrent?: boolean
}

export default function ReadOnlyProjectTrackerTable({
  entries,
  sortMode,
  filterProducts,
  filterProjects,
  onOpenPanel,
  onOpenComments,
  weekLabel,
  isCurrent = false,
}: Props) {
  const { product: isSortProduct, project: isSortProject } = useMemo(
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

  return (
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
              <div className="inline-flex items-center gap-2">
                <span className={`self-stretch flex items-center border-b-2 ${isCurrent ? 'border-teal' : 'border-transparent'}`}>{weekLabel}</span>
                <span className={`inline-flex items-center justify-center px-1.5 py-[3px] rounded text-[10px] font-medium bg-teal text-navy ${isCurrent ? '' : 'invisible'}`}>
                  current
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {displayEntries.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-[13px] text-text-muted">
                No entries for this week.
              </td>
            </tr>
          ) : (
            displayEntries.map((entry) => (
              <ReadOnlyProjectTrackerRow
                key={entry.id}
                entry={entry}
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
