'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  anchor: { top: number; bottom: number; left: number; right: number }
  onMove: (weeks: number) => void
  onCopy: (weeks: number) => void
  onClose: () => void
}

export default function MoveDropdown({ anchor, onMove, onCopy, onClose }: MoveDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<null | 'move' | 'copy'>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handleOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const handleWeekClick = (weeks: number) => {
    if (mode === 'move') onMove(weeks)
    else onCopy(weeks)
    onClose()
  }

  // Open below the button if there's room; otherwise open above
  const openBelow = anchor.bottom + 260 <= window.innerHeight
  const style: React.CSSProperties = {
    position: 'fixed',
    right: window.innerWidth - anchor.right,
    zIndex: 9999,
    ...(openBelow
      ? { top: anchor.bottom + 4 }
      : { bottom: window.innerHeight - anchor.top + 4 }),
  }

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="bg-white border border-border rounded-[6px] shadow-md min-w-[190px] py-1 overflow-hidden"
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
    </div>,
    document.body,
  )
}
