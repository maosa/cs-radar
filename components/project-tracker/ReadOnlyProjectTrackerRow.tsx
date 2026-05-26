'use client'

import { memo } from 'react'
import { Flag, MessageSquare } from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'
import { dateStringToWeekIndex } from '@/lib/weeks'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

interface Props {
  entry: ProjectTrackerEntry
  visibleWeekIndices: number[]
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
}

const ReadOnlyProjectTrackerRow = memo(function ReadOnlyProjectTrackerRow({
  entry,
  visibleWeekIndices,
  onOpenPanel,
  onOpenComments,
}: Props) {
  const entryWeekIndex = dateStringToWeekIndex(entry.week_start_date)
  const cellBg = entry.is_flagged ? '#FFCDD3' : '#FFFFFF'
  const textColorClass = entry.is_flagged ? 'text-red-dark' : 'text-navy'

  return (
    <tr className="group">

      {/* Product — sticky left, ~84px */}
      <td
        className="sticky left-0 z-10 border-l border-r border-border px-3 py-2.5"
        style={{ backgroundColor: '#FFFFFF', boxShadow: 'inset 0 -1px 0 0 #DADADA' }}
      >
        <ProductBadge product={entry.product} />
      </td>

      {/* Project name — sticky at 84px, ~240px */}
      <td
        className="sticky z-10 border-r border-border px-3 py-2.5 text-[13px] text-navy whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]"
        style={{
          left: 84,
          backgroundColor: '#FFFFFF',
          boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)',
        }}
      >
        {entry.project_name ?? '—'}
      </td>

      {/* One cell per visible week — content only in the entry's own week */}
      {visibleWeekIndices.map((wi) => {
        const isEntryWeek = wi === entryWeekIndex
        return (
          <td
            key={wi}
            className="border-b border-r border-border px-3 py-2.5 align-top"
            style={{ backgroundColor: isEntryWeek ? cellBg : '#FFFFFF' }}
          >
            {isEntryWeek && (
              <div className="flex items-start gap-2 min-w-0">

                <span className={`flex-1 min-w-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${textColorClass}`}>
                  {entry.description}
                </span>

                {/* Flag — visual only, shown when flagged */}
                {entry.is_flagged && (
                  <Flag size={14} className="flex-shrink-0 text-red-flag fill-red-flag" />
                )}

                {/* Comment icon — visible on hover; always visible + filled when comments exist */}
                <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${(entry.comment_count ?? 0) > 0 ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button
                    onClick={() => onOpenComments(entry.id)}
                    className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                    title="View comments"
                  >
                    <MessageSquare size={14} className={(entry.comment_count ?? 0) > 0 ? 'fill-current' : ''} />
                  </button>
                </div>

              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
})

export default ReadOnlyProjectTrackerRow
