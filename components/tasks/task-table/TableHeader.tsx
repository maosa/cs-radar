'use client'

import { formatWeekHeader } from '@/lib/weeks'

interface TableHeaderProps {
  visibleWeekIndices: number[]
  currentWeekIndex: number
}

export default function TableHeader({ visibleWeekIndices, currentWeekIndex }: TableHeaderProps) {
  return (
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
        {visibleWeekIndices.map((wi) => {
          const isCurrent = wi === currentWeekIndex
          return (
            <th
              key={wi}
              className="sticky top-0 z-20 border-t border-b border-r border-border px-3 py-2 text-left text-[13px] font-medium text-navy bg-bg"
            >
              <div className="flex items-center gap-2">
                <span className={isCurrent ? 'underline decoration-teal decoration-2 underline-offset-2' : ''}>{formatWeekHeader(wi)}</span>
                <span className={`inline-flex items-center justify-center px-1.5 py-[3px] rounded text-[10px] font-medium bg-teal text-navy ${isCurrent ? '' : 'invisible'}`}>
                  current
                </span>
              </div>
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
