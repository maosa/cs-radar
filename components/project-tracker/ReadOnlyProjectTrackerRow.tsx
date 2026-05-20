'use client'

import { memo } from 'react'
import { Flag, MessageSquare } from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

interface Props {
  entry: ProjectTrackerEntry
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
}

const ReadOnlyProjectTrackerRow = memo(function ReadOnlyProjectTrackerRow({
  entry,
  onOpenPanel,
  onOpenComments,
}: Props) {
  const cellBg = entry.is_flagged ? '#FFCDD3' : '#FFFFFF'
  const textColorClass = entry.is_flagged ? 'text-red-dark' : 'text-navy'

  return (
    <tr className="group">

      {/* Product — sticky left, ~84px */}
      <td
        className="sticky left-0 z-10 border-l border-r border-border px-3 py-2.5 align-top"
        style={{ backgroundColor: cellBg, boxShadow: 'inset 0 -1px 0 0 #DADADA' }}
      >
        <div className="pt-0.5">
          <ProductBadge product={entry.product} />
        </div>
      </td>

      {/* Project name — sticky at 84px, ~240px */}
      <td
        className={`sticky z-10 border-r border-border px-3 py-2.5 text-[13px] ${textColorClass} whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px] align-top`}
        style={{
          left: 84,
          backgroundColor: cellBg,
          boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)',
        }}
      >
        {entry.project_name ?? '—'}
      </td>

      {/* Description — expands to fill */}
      <td
        className="border-b border-r border-border px-3 py-2.5 align-top"
        style={{ backgroundColor: cellBg }}
      >
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
      </td>
    </tr>
  )
})

export default ReadOnlyProjectTrackerRow
