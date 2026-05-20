'use client'

import { memo } from 'react'
import { PanelRight, MessageSquare } from 'lucide-react'
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

          {/* Hover actions — panel open only */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
            <button
              onClick={() => onOpenPanel(entry.id)}
              className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
              title="Open project details"
            >
              <PanelRight size={14} />
            </button>
          </div>

          {/* Comment badge — always visible when comments exist */}
          {(entry.comment_count ?? 0) > 0 && (
            <button
              onClick={() => onOpenComments(entry.id)}
              className="flex-shrink-0 p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
              title={`${entry.comment_count} comment${entry.comment_count === 1 ? '' : 's'}`}
            >
              <MessageSquare size={14} className="fill-current" />
            </button>
          )}

        </div>
      </td>
    </tr>
  )
})

export default ReadOnlyProjectTrackerRow
