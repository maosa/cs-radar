'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'

const WEEK_OPTIONS = [
  { label: 'Next week (+1)', weeks: 1 },
  { label: '+2 weeks', weeks: 2 },
  { label: '+3 weeks', weeks: 3 },
  { label: '+4 weeks', weeks: 4 },
  { label: 'Previous week (−1)', weeks: -1 },
  { label: '−2 weeks', weeks: -2 },
  { label: '−3 weeks', weeks: -3 },
  { label: '−4 weeks', weeks: -4 },
]

const FORWARD = WEEK_OPTIONS.slice(0, 4)
const BACK = WEEK_OPTIONS.slice(4)

interface MoveDropdownProps {
  align?: 'left' | 'right'
  onMove: (weeks: number) => void
  onCopy: (weeks: number) => void
  onClose: () => void
}

export default function MoveDropdown({ align = 'right', onMove, onCopy, onClose }: MoveDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<null | 'move' | 'copy'>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleWeekClick = (weeks: number) => {
    if (mode === 'move') onMove(weeks)
    else onCopy(weeks)
    onClose()
  }

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 z-30 bg-white border border-border rounded-[6px] shadow-md min-w-[190px] py-1 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {mode === null ? (
        <>
          <button
            onClick={() => setMode('move')}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
          >
            Move task
            <ChevronRight size={13} className="text-text-muted" />
          </button>
          <button
            onClick={() => setMode('copy')}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
          >
            Copy task
            <ChevronRight size={13} className="text-text-muted" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setMode(null)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-navy hover:bg-bg transition-colors"
          >
            <ChevronLeft size={13} />
            {mode === 'move' ? 'Move task' : 'Copy task'}
          </button>
          <hr className="border-border my-1" />
          {FORWARD.map((opt) => (
            <button
              key={opt.weeks}
              onClick={() => handleWeekClick(opt.weeks)}
              className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
            >
              {opt.label}
            </button>
          ))}
          <hr className="border-border my-1" />
          {BACK.map((opt) => (
            <button
              key={opt.weeks}
              onClick={() => handleWeekClick(opt.weeks)}
              className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
