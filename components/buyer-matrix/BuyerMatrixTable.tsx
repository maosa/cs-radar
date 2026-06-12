'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Info, Pencil, GripVertical } from 'lucide-react'
import type { BuyerMatrixContact, BuyerMatrixBuyerType } from '@/lib/supabase/types'

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
  contacts: BuyerMatrixContact[]
  readOnly?: boolean
  onEdit: (contact: BuyerMatrixContact) => void
  onReorder: (buyerType: BuyerMatrixBuyerType, orderedIds: string[]) => void
}

export default function BuyerMatrixTable({
  contacts,
  readOnly = false,
  onEdit,
  onReorder,
}: BuyerMatrixTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-[8px] border border-border">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-[#E8E8E8]">
            {COLUMNS.map((col, colIndex) => (
              <ColumnHeader key={col.key} col={col} colIndex={colIndex} />
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {COLUMNS.map((col) => {
              const colContacts = contacts
                .filter(c => c.buyer_type === col.key)
                .sort((a, b) => a.sort_order - b.sort_order)
              return (
                <td
                  key={col.key}
                  className="border-r border-border last:border-r-0 align-top p-2"
                >
                  <ContactColumn
                    contacts={colContacts}
                    readOnly={readOnly}
                    onEdit={onEdit}
                    onReorder={(orderedIds) => onReorder(col.key, orderedIds)}
                  />
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
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

// ─── ContactColumn ────────────────────────────────────────────────────────────
// Manages the sortable list for one buyer-type column.
// Local state is used so drag ordering updates instantly. It re-syncs from props
// when the actual contact data changes (add / edit / delete / realtime), but NOT
// when only sort_order changes (which we apply locally after a drag).

interface ContactColumnProps {
  contacts: BuyerMatrixContact[]
  readOnly: boolean
  onEdit: (contact: BuyerMatrixContact) => void
  onReorder: (orderedIds: string[]) => void
}

function ContactColumn({ contacts, readOnly, onEdit, onReorder }: ContactColumnProps) {
  const [items, setItems] = useState<BuyerMatrixContact[]>(contacts)

  // Build a key from data fields (excluding sort_order) so we only re-sync on
  // real content changes, not on the sort_order update that follows a drag.
  const dataKey = contacts
    .map(c => `${c.id}:${c.full_name}:${c.email ?? ''}:${c.role ?? ''}:${c.additional_details ?? ''}:${c.buyer_type}`)
    .join('|')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(contacts) }, [dataKey])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex(c => c.id === active.id)
    const newIdx = items.findIndex(c => c.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(items, oldIdx, newIdx)
    setItems(reordered)
    onReorder(reordered.map(c => c.id))
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1.5 min-h-[48px]">
        {items.map(c => <ContactCard key={c.id} contact={c} readOnly />)}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5 min-h-[48px]">
          {items.map(c => (
            <SortableContactCard key={c.id} contact={c} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// ─── SortableContactCard ─────────────────────────────────────────────────────

function SortableContactCard({
  contact,
  onEdit,
}: {
  contact: BuyerMatrixContact
  onEdit: (c: BuyerMatrixContact) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: contact.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <ContactCard
        contact={contact}
        readOnly={false}
        onEdit={onEdit}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

// ─── ContactCard ─────────────────────────────────────────────────────────────
// The info popover is rendered via createPortal with position:fixed so it
// escapes the table wrapper's overflow:hidden and is never clipped.

function ContactCard({
  contact,
  readOnly,
  onEdit,
  dragHandleProps,
}: {
  contact: BuyerMatrixContact
  readOnly: boolean
  onEdit?: (c: BuyerMatrixContact) => void
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}) {
  const [showInfo, setShowInfo] = useState(false)
  const [infoPos, setInfoPos] = useState({ top: 0, right: 0, maxWidth: 400 })
  const infoBtnRef = useRef<HTMLButtonElement>(null)
  const infoPopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: MouseEvent) => {
      if (infoBtnRef.current?.contains(e.target as Node)) return
      if (infoPopRef.current && !infoPopRef.current.contains(e.target as Node)) setShowInfo(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showInfo])

  const toggleInfo = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showInfo) { setShowInfo(false); return }
    const rect = infoBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    // Anchor right edge to button; cap left edge at main content boundary (don't cover sidebar)
    const mainLeft = document.querySelector('main')?.getBoundingClientRect().left ?? 0
    setInfoPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
      maxWidth: rect.right - mainLeft - 8,
    })
    setShowInfo(true)
  }

  const hasInfo = !!(contact.email || contact.role || contact.additional_details)

  return (
    <div className="group relative flex items-center gap-1 px-2 py-1.5 rounded-[6px] border border-border bg-white hover:border-border-hover hover:bg-[#FAFAFA] transition-colors">
      {/* Drag handle — owner only */}
      {!readOnly && dragHandleProps && (
        <span
          {...dragHandleProps}
          className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing flex-shrink-0 text-text-muted"
        >
          <GripVertical size={12} />
        </span>
      )}

      {/* Name */}
      <span className="text-[12px] text-navy font-medium flex-1 min-w-0 truncate">
        {contact.full_name}
      </span>

      {/* Hover actions */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Edit — owner only */}
        {!readOnly && onEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(contact) }}
            className="p-1 rounded text-text-muted hover:text-navy hover:bg-[#EBEBEB] transition-colors"
            title="Edit"
          >
            <Pencil size={11} />
          </button>
        )}

        {/* Info popover */}
        <button
          ref={infoBtnRef}
          onClick={toggleInfo}
          className="p-1 rounded text-text-muted hover:text-navy hover:bg-[#EBEBEB] transition-colors"
          title="View details"
        >
          <Info size={11} />
        </button>
        {showInfo && createPortal(
          <div
            ref={infoPopRef}
            style={{ position: 'fixed', top: infoPos.top, right: infoPos.right, maxWidth: infoPos.maxWidth, minWidth: Math.min(208, infoPos.maxWidth), zIndex: 9999 }}
            className="bg-white rounded-[8px] shadow-lg border border-border p-3 w-max"
          >
            <p className="text-[12px] font-medium text-navy mb-2 max-w-[208px]">{contact.full_name}</p>
            {hasInfo ? (
              <div className="flex flex-col gap-1.5">
                {contact.email && (
                  <p className="text-[12px] whitespace-nowrap overflow-hidden">
                    <span className="text-text-muted">Email: </span>
                    <span className="text-navy">{contact.email}</span>
                  </p>
                )}
                {contact.role && (
                  <p className="text-[12px] max-w-[208px]">
                    <span className="text-text-muted">Role: </span>
                    <span className="text-navy">{contact.role}</span>
                  </p>
                )}
                {contact.additional_details && (
                  <p className="text-[12px] max-w-[208px]">
                    <span className="text-text-muted">Notes: </span>
                    <span className="text-navy whitespace-pre-wrap">{contact.additional_details}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-text-muted italic max-w-[208px]">No additional details.</p>
            )}
          </div>,
          document.body
        )}
      </div>
    </div>
  )
}
