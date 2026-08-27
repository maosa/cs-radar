'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Info, Pencil, GripVertical, Check, Minus } from 'lucide-react'
import type { BuyerMatrixStakeholder, BuyerMatrixBuyerType } from '@/lib/supabase/types'

type Column = {
  key: BuyerMatrixBuyerType
  label: string
  popover: { role: string; motivations: string; strategy: string }
}

const COLUMNS: Column[] = [
  {
    key: 'economic_buyer',
    label: 'Economic Buyer',
    popover: { role: 'Final budget approval', motivations: 'ROI, cost savings, efficiency', strategy: 'Business case, financial impact' },
  },
  {
    key: 'technical_buyer',
    label: 'Technical Buyer',
    popover: { role: 'Evaluates feasibility', motivations: 'Integration, compliance, risk', strategy: 'Demos, specs, security details' },
  },
  {
    key: 'user_buyer',
    label: 'User Buyer',
    popover: { role: 'Day-to-day usage', motivations: 'Usability, productivity', strategy: 'Training, ease-of-use benefits' },
  },
  {
    key: 'coach_champion',
    label: 'Coach / Champion',
    popover: { role: 'Internal advocate', motivations: 'Influence, innovation', strategy: 'Empowerment, co-creation' },
  },
  {
    key: 'gatekeeper',
    label: 'Gatekeeper',
    popover: { role: 'Controls access', motivations: 'Process adherence, control', strategy: 'Respect protocols, build trust' },
  },
  {
    key: 'influencer',
    label: 'Influencer',
    popover: { role: 'Shapes opinions', motivations: 'Thought leadership, trends', strategy: 'Insights, thought leadership' },
  },
]

interface BuyerMatrixTableProps {
  stakeholders: BuyerMatrixStakeholder[]
  readOnly?: boolean
  onEdit: (stakeholder: BuyerMatrixStakeholder) => void
  onReorder: (orderedIds: string[]) => void
}

export default function BuyerMatrixTable({
  stakeholders,
  readOnly = false,
  onEdit,
  onReorder,
}: BuyerMatrixTableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = stakeholders.findIndex(s => s.id === active.id)
    const newIdx = stakeholders.findIndex(s => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    onReorder(arrayMove(stakeholders, oldIdx, newIdx).map(s => s.id))
  }

  const activeStakeholder = activeId ? stakeholders.find(s => s.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="w-full rounded-[8px] border border-border overflow-hidden">
        {/*
          border-separate + border-spacing-0 + tableLayout:fixed + an explicit
          colgroup are what stop the columns reflowing while a dragged row is
          transformed. Fixed layout means column widths don't depend on the
          transformed content.
        */}
        <table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 240, minWidth: 240 }} />
            {COLUMNS.map(c => <col key={c.key} />)}
          </colgroup>
          <thead>
            <tr className="bg-[#E8E8E8]">
              <th className="text-left px-3 py-2.5 text-[13px] font-medium text-navy border-b border-r border-border">
                Stakeholder
              </th>
              {COLUMNS.map((col, colIndex) => (
                <ColumnHeader key={col.key} col={col} colIndex={colIndex} />
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child_td]:border-b-0">
            {stakeholders.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-[13px] text-text-muted">
                  {readOnly
                    ? 'No stakeholders have been added for this account.'
                    : 'No stakeholders yet. Use Add Person to get started.'}
                </td>
              </tr>
            ) : (
              <SortableContext items={stakeholders.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {stakeholders.map(s => (
                  <SortableStakeholderRow
                    key={s.id}
                    stakeholder={s}
                    readOnly={readOnly}
                    onEdit={onEdit}
                    isDragActive={activeId !== null}
                  />
                ))}
              </SortableContext>
            )}
          </tbody>
        </table>
      </div>

      <DragOverlay>
        {activeStakeholder && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded shadow-lg text-[13px] font-medium opacity-90"
            style={{ backgroundColor: '#19153F', color: '#fff', width: 240 }}
          >
            <GripVertical size={12} className="opacity-50 flex-shrink-0" />
            <span className="truncate">{activeStakeholder.full_name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── ColumnHeader ─────────────────────────────────────────────────────────────
// Each column header renders its popover via createPortal with position:fixed
// so overflow:hidden on the table wrapper cannot clip it.

function ColumnHeader({ col, colIndex }: { col: Column; colIndex: number }) {
  const [showPopover, setShowPopover] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPopover) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowPopover(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPopover])

  const toggle = () => {
    if (showPopover) { setShowPopover(false); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    // Right-align popover (w-60 = 240px) for last 2 columns to avoid viewport overflow
    const left = colIndex >= COLUMNS.length - 2 ? rect.right - 240 : rect.left
    setPos({ top: rect.bottom + 4, left })
    setShowPopover(true)
  }

  return (
    <th className="text-left px-3 py-2.5 text-[13px] font-medium text-navy border-b border-r border-border last:border-r-0">
      <div className="flex items-center gap-1.5">
        <span>{col.label}</span>
        <button
          ref={btnRef}
          onClick={toggle}
          className="flex items-center text-text-muted hover:text-navy transition-colors flex-shrink-0"
          aria-label={`Info about ${col.label}`}
        >
          <Info size={13} />
        </button>
        {showPopover && createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="bg-white rounded-[8px] shadow-lg border border-border p-3 w-60 font-normal"
          >
            <p className="text-[13px] font-medium text-navy mb-2">{col.label}</p>
            <div className="flex flex-col gap-1.5">
              <p className="text-[12px]">
                <span className="text-text-muted">Role in Decision: </span>
                <span className="text-navy">{col.popover.role}</span>
              </p>
              <p className="text-[12px]">
                <span className="text-text-muted">Motivations: </span>
                <span className="text-navy">{col.popover.motivations}</span>
              </p>
              <p className="text-[12px]">
                <span className="text-text-muted">Engagement Strategy: </span>
                <span className="text-navy">{col.popover.strategy}</span>
              </p>
            </div>
          </div>,
          document.body
        )}
      </div>
    </th>
  )
}

// ─── SortableStakeholderRow ──────────────────────────────────────────────────
// One table row per person: name + actions in the Stakeholder column, then a
// check / dash indicator for each of the six buyer types.
//
// The transform from useSortable is applied to every <td>, NOT to the <tr> —
// <tr> elements do not honour transform in table layout. Missing a single cell
// shears the row visually mid-drag.

function SortableStakeholderRow({
  stakeholder,
  readOnly,
  onEdit,
  isDragActive,
}: {
  stakeholder: BuyerMatrixStakeholder
  readOnly: boolean
  onEdit: (s: BuyerMatrixStakeholder) => void
  isDragActive: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stakeholder.id,
    disabled: readOnly,
  })

  const tdStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr ref={setNodeRef} className={`group${isDragging ? ' opacity-40' : ''}`}>
      {/* Stakeholder — drag handle, name, edit, info */}
      <td
        className="border-r border-b border-border px-3 py-2.5 bg-white group-hover:bg-[#FAFAFA]"
        style={tdStyle}
      >
        <div className="flex items-center gap-1">
          {!readOnly && (
            <span
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing flex-shrink-0 text-text-muted"
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </span>
          )}

          <span className="text-[13px] text-navy font-medium flex-1 min-w-0 truncate">
            {stakeholder.full_name}
          </span>

          <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {!readOnly && (
              <button
                onClick={() => onEdit(stakeholder)}
                className="p-1 rounded text-text-muted hover:text-navy hover:bg-[#EBEBEB] transition-colors"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
            )}
            <StakeholderInfoButton stakeholder={stakeholder} isDragActive={isDragActive} />
          </div>
        </div>
      </td>

      {/* Role indicators */}
      {COLUMNS.map(col => {
        const has = stakeholder[col.key]
        return (
          <td
            key={col.key}
            className="border-r border-b last:border-r-0 border-border px-3 py-2.5 text-center bg-white group-hover:bg-[#FAFAFA]"
            style={tdStyle}
          >
            {has ? (
              <Check
                size={15}
                strokeWidth={2.5}
                className="text-teal inline-block"
                aria-label={`${col.label}: yes`}
              />
            ) : (
              <Minus
                size={15}
                className="text-border-hover inline-block"
                aria-label={`${col.label}: no`}
              />
            )}
          </td>
        )
      })}
    </tr>
  )
}

// ─── StakeholderInfoButton ───────────────────────────────────────────────────
// Popover with the person's contact details. Positioned toward whichever side of
// the button has more room, so a long email is never clipped.

function StakeholderInfoButton({
  stakeholder,
  isDragActive,
}: {
  stakeholder: BuyerMatrixStakeholder
  isDragActive: boolean
}) {
  const [showInfo, setShowInfo] = useState(false)
  const [infoPos, setInfoPos] = useState<{ top: number; left?: number; right?: number; maxWidth: number }>({ top: 0, maxWidth: 400 })
  const infoBtnRef = useRef<HTMLButtonElement>(null)
  const infoPopRef = useRef<HTMLDivElement>(null)

  // Coordinates are captured once at click time, so any movement of the anchor
  // leaves the popover stranded. A drag transforms every row via CSS (which
  // fires no scroll/resize event), so close on any drag anywhere in the table.
  useEffect(() => {
    if (isDragActive) setShowInfo(false)
  }, [isDragActive])

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: MouseEvent) => {
      if (infoBtnRef.current?.contains(e.target as Node)) return
      if (infoPopRef.current && !infoPopRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    const close = () => setShowInfo(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [showInfo])

  const toggleInfo = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showInfo) { setShowInfo(false); return }
    const rect = infoBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    const mainLeft = document.querySelector('main')?.getBoundingClientRect().left ?? 0
    const spaceLeft = rect.right - mainLeft - 8
    const spaceRight = window.innerWidth - rect.left - 8
    if (spaceRight >= spaceLeft) {
      setInfoPos({ top: rect.bottom + 4, left: rect.left, maxWidth: spaceRight })
    } else {
      setInfoPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, maxWidth: spaceLeft })
    }
    setShowInfo(true)
  }

  const hasInfo = !!(stakeholder.email || stakeholder.role || stakeholder.additional_details)

  return (
    <>
      <button
        ref={infoBtnRef}
        onClick={toggleInfo}
        className="p-1 rounded text-text-muted hover:text-navy hover:bg-[#EBEBEB] transition-colors"
        title="View details"
      >
        <Info size={11} />
      </button>
      {/*
        Must stay portalled to document.body. The parent <td> carries a
        non-none transform during drag, which makes it the containing block for
        position:fixed descendants — rendering this inline would reinterpret the
        viewport coordinates below as td-relative and throw the popover offscreen.
      */}
      {showInfo && createPortal(
        <div
          ref={infoPopRef}
          style={{ position: 'fixed', top: infoPos.top, ...(infoPos.left !== undefined ? { left: infoPos.left } : { right: infoPos.right }), maxWidth: infoPos.maxWidth, minWidth: Math.min(208, infoPos.maxWidth), zIndex: 9999 }}
          className="bg-white rounded-[8px] shadow-lg border border-border p-3 w-max"
        >
          <p className="text-[12px] font-medium text-navy mb-2 max-w-[208px]">{stakeholder.full_name}</p>
          {hasInfo ? (
            <div className="flex flex-col gap-1.5">
              {stakeholder.email && (
                <p className="text-[12px] whitespace-nowrap">
                  <span className="text-text-muted">Email: </span>
                  <span className="text-navy">{stakeholder.email}</span>
                </p>
              )}
              {stakeholder.role && (
                <p className="text-[12px] max-w-[208px]">
                  <span className="text-text-muted">Role: </span>
                  <span className="text-navy">{stakeholder.role}</span>
                </p>
              )}
              {stakeholder.additional_details && (
                <p className="text-[12px] max-w-[208px]">
                  <span className="text-text-muted">Notes: </span>
                  <span className="text-navy whitespace-pre-wrap">{stakeholder.additional_details}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-text-muted italic max-w-[208px]">No additional details.</p>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
