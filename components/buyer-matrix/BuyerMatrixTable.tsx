'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openPopoverId) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPopoverId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openPopoverId])

  return (
    <div className="w-full overflow-hidden rounded-[8px] border border-border">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-[#E8E8E8]">
            {COLUMNS.map((col, colIndex) => (
              <th
                key={col.key}
                className="text-left px-3 py-2.5 text-[13px] font-medium text-navy border-r border-border last:border-r-0"
              >
                <div className="flex items-center gap-1.5">
                  <span>{col.label}</span>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setOpenPopoverId(openPopoverId === col.key ? null : col.key)}
                      className="flex items-center text-text-muted hover:text-navy transition-colors"
                      aria-label={`Info about ${col.label}`}
                    >
                      <Info size={13} />
                    </button>
                    {openPopoverId === col.key && (
                      <div
                        ref={popoverRef}
                        className={`absolute top-full mt-1 z-10 bg-white rounded-[8px] shadow-lg border border-border p-3 w-60 font-normal ${
                          colIndex >= COLUMNS.length - 2 ? 'right-0' : 'left-0'
                        }`}
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
                      </div>
                    )}
                  </div>
                </div>
              </th>
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
  const infoWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showInfo) return
    const handler = (e: MouseEvent) => {
      if (infoWrapRef.current && !infoWrapRef.current.contains(e.target as Node)) {
        setShowInfo(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showInfo])

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
        <div ref={infoWrapRef} className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowInfo(v => !v) }}
            className="p-1 rounded text-text-muted hover:text-navy hover:bg-[#EBEBEB] transition-colors"
            title="View details"
          >
            <Info size={11} />
          </button>
          {showInfo && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-[8px] shadow-lg border border-border p-3 w-52">
              <p className="text-[12px] font-medium text-navy mb-2">{contact.full_name}</p>
              {hasInfo ? (
                <div className="flex flex-col gap-1.5">
                  {contact.email && (
                    <p className="text-[12px]">
                      <span className="text-text-muted">Email: </span>
                      <span className="text-navy break-all">{contact.email}</span>
                    </p>
                  )}
                  {contact.role && (
                    <p className="text-[12px]">
                      <span className="text-text-muted">Role: </span>
                      <span className="text-navy">{contact.role}</span>
                    </p>
                  )}
                  {contact.additional_details && (
                    <p className="text-[12px]">
                      <span className="text-text-muted">Notes: </span>
                      <span className="text-navy whitespace-pre-wrap">{contact.additional_details}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-text-muted italic">No additional details.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
