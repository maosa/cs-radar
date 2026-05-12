'use client'

import { memo } from 'react'
import { Flag, MessageSquare } from 'lucide-react'
import ProductBadge from '../ProductBadge'
import { dateStringToWeekIndex } from '@/lib/weeks'
import { taskBg, descClass, projectName } from '@/lib/taskUtils'
import type { AnyTask } from './types'

interface ReadOnlyRowProps {
  task: AnyTask
  visibleWeekIndices: number[]
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  isHighlighted: boolean
}

const ReadOnlyTaskRow = memo(function ReadOnlyTaskRow({ task, visibleWeekIndices, onOpenPanel, isHighlighted }: ReadOnlyRowProps) {
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  return (
    <tr style={bg} className="group">
      <td className="sticky left-0 z-10 border-l border-r border-border px-3 py-2.5" style={{ ...bg, boxShadow: 'inset 0 -1px 0 0 #DADADA' }}>
        <ProductBadge product={task.product} />
      </td>
      <td
        className="sticky z-10 border-r border-border px-3 py-2.5 text-[13px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]"
        style={{ left: 84, ...bg, boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }}
      >
        {projectName(task)}
      </td>
      {visibleWeekIndices.map((wi) => {
        const isTaskWeek = wi === taskWeekIndex
        return (
          <td
            key={wi}
            className="border-b border-r border-border px-3 py-2.5 text-[13px]"
            style={isTaskWeek ? bg : { backgroundColor: '#FFFFFF' }}
          >
            {isTaskWeek && (
              <div className={`flex items-center gap-2 min-w-0 rounded-[4px] transition-all ${isHighlighted ? 'ring-2 ring-navy-mid ring-offset-1' : ''}`}>
                <span className={`flex-1 min-w-0 break-words ${dc}`}>{task.description}</span>
                {task.is_flagged && <Flag size={14} className="flex-shrink-0 text-red-flag fill-red-flag" />}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                  <button
                    onClick={() => onOpenPanel(task.id, 'comments')}
                    className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                    title="View comments"
                  >
                    <MessageSquare size={14} />
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

export default ReadOnlyTaskRow
