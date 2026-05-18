'use client'

import { useEffect, useRef } from 'react'

export const MOVE_FORWARD_OPTIONS = [
  { label: 'Next week (+1)', weeks: 1 },
  { label: '+2 weeks', weeks: 2 },
  { label: '+3 weeks', weeks: 3 },
  { label: '+4 weeks', weeks: 4 },
]

export const MOVE_BACK_OPTIONS = [
  { label: 'Previous week (−1)', weeks: -1 },
  { label: '−2 weeks', weeks: -2 },
  { label: '−3 weeks', weeks: -3 },
  { label: '−4 weeks', weeks: -4 },
]

interface MoveDropdownProps {
  groups: { label: string; weeks: number }[][]
  align?: 'left' | 'right'
  onMove: (weeks: number) => void
  onClose: () => void
}

export default function MoveDropdown({ groups, align = 'right', onMove, onClose }: MoveDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const renderOption = (opt: { label: string; weeks: number }) => (
    <button
      key={opt.weeks}
      onClick={() => { onMove(opt.weeks); onClose() }}
      className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
    >
      {opt.label}
    </button>
  )

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 z-30 bg-white border border-border rounded-[6px] shadow-md min-w-[170px] py-1 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {groups.map((group, i) => (
        <div key={i}>
          {i > 0 && <hr className="border-border my-1" />}
          {group.map(renderOption)}
        </div>
      ))}
    </div>
  )
}
