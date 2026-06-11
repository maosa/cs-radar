'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flag, Trash2, GripVertical, PanelRight, Pencil, MessageSquare } from 'lucide-react'
import ProductBadge from '@/components/tasks/ProductBadge'
import { dateStringToWeekIndex } from '@/lib/weeks'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'

interface Props {
  entry: ProjectTrackerEntry
  visibleWeekIndices: number[]
  onFlag: (id: string) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string) => void
  onOpenComments: (id: string) => void
  onDescriptionSave: (id: string, description: string) => void
  isDragActive: boolean
}

const ProjectTrackerRow = memo(function ProjectTrackerRow({
  entry,
  visibleWeekIndices,
  onFlag,
  onDelete,
  onOpenPanel,
  onOpenComments,
  onDescriptionSave,
  isDragActive,
}: Props) {
  const entryWeekIndex = dateStringToWeekIndex(entry.week_start_date)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: isEditing,
  })

  const tdStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Size the textarea to fit its content whenever editing starts or value changes
  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  useEffect(() => {
    if (isEditing) {
      resizeTextarea()
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = el.value.length
      }
    }
  }, [isEditing])

  const startEdit = () => {
    setEditValue(entry.description)
    setIsEditing(true)
  }

  const saveEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== entry.description) {
      onDescriptionSave(entry.id, trimmed)
    }
    setIsEditing(false)
  }

  const cancelEdit = () => setIsEditing(false)

  const cellBg = entry.is_flagged ? '#FFCDD3' : '#FFFFFF'
  const textColorClass = entry.is_flagged ? 'text-red-dark' : 'text-navy'

  return (
    <tr ref={setNodeRef} className={`group${isDragging ? ' opacity-40' : ''}`}>

      {/* Product — sticky left, ~84px */}
      <td
        className="sticky left-0 z-10 border-r border-border px-3 py-2.5 bg-white group-hover:bg-[#FAFAFA]"
        style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA', ...tdStyle }}
      >
        <div className="flex items-center gap-1.5">
          {isDragActive && (
            <span
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-text-secondary flex-shrink-0"
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </span>
          )}
          <ProductBadge product={entry.product} />
        </div>
      </td>

      {/* Project name — sticky at 84px, ~240px */}
      <td
        className="sticky z-10 border-r border-border px-3 py-2.5 text-[13px] text-navy whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px] bg-white group-hover:bg-[#FAFAFA]"
        style={{
          left: 84,
          boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)',
          ...tdStyle,
        }}
      >
        {entry.project_name ?? '—'}
      </td>

      {/* One cell per visible week — content only in the entry's own week */}
      {visibleWeekIndices.map((wi) => {
        const isEntryWeek = wi === entryWeekIndex
        return (
          <td
            key={wi}
            className={`border-b border-r border-border px-3 py-2.5 align-top${isEntryWeek ? '' : ' bg-white group-hover:bg-[#FAFAFA]'}`}
            style={isEntryWeek ? { backgroundColor: cellBg, ...tdStyle } : tdStyle}
          >
            {isEntryWeek && (
              <div className="flex items-start gap-2 min-w-0">

                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => { setEditValue(e.target.value); resizeTextarea() }}
                    onBlur={saveEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                    }}
                    maxLength={5000}
                    className={`flex-1 min-w-0 text-[13px] ${textColorClass} bg-transparent border-b border-navy-mid outline-none resize-none leading-relaxed overflow-hidden`}
                    style={{ minHeight: '3rem' }}
                  />
                ) : (
                  <span className={`flex-1 min-w-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${textColorClass}`}>
                    {entry.description}
                  </span>
                )}

                {/* Hover actions */}
                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                    <button
                      onClick={startEdit}
                      className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                      title="Edit description"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onFlag(entry.id)}
                      className="p-1 rounded text-text-muted hover:text-red-flag hover:bg-red-hover transition-colors"
                      title={entry.is_flagged ? 'Unflag' : 'Flag'}
                    >
                      <Flag size={14} className={entry.is_flagged ? 'text-red-flag fill-red-flag' : ''} />
                    </button>
                    <button
                      onClick={() => onOpenPanel(entry.id)}
                      className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                      title="Open project details"
                    >
                      <PanelRight size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="p-1 rounded text-text-muted hover:text-red-flag hover:bg-red-hover transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {/* Comment badge — always visible when comments exist */}
                {entry.comment_count! > 0 && !isEditing && (
                  <button
                    onClick={() => onOpenComments(entry.id)}
                    className="flex-shrink-0 p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                    title={`${entry.comment_count} comment${entry.comment_count === 1 ? '' : 's'}`}
                  >
                    <MessageSquare size={14} className="fill-current" />
                  </button>
                )}

              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
})

export default ProjectTrackerRow
