'use client'

import { useState, useRef, memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flag, ChevronsLeftRight, Trash2, GripVertical, PanelRight, Pencil, MessageSquare } from 'lucide-react'
import ProductBadge from '../ProductBadge'
import MoveDropdown from './MoveDropdown'
import { dateStringToWeekIndex } from '@/lib/weeks'
import { taskBg, descClass, projectName } from '@/lib/taskUtils'
import type { AnyTask } from './types'

interface EditableRowProps {
  task: AnyTask
  visibleWeekIndices: number[]
  onToggleComplete: (id: string) => void
  onToggleFlag: (id: string) => void
  onMove: (id: string, weeks: number) => void
  onCopy: (id: string, weeks: number) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  onEditDescription: (id: string, description: string) => void
  isDragMode: boolean
  isHighlighted: boolean
}

const SortableTaskRow = memo(function SortableTaskRow(props: EditableRowProps) {
  const { task, visibleWeekIndices, onToggleComplete, onToggleFlag, onMove, onCopy, onDelete, onOpenPanel, onEditDescription, isDragMode, isHighlighted } = props
  const [moveDropdownAnchor, setMoveDropdownAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null)
  const moveDropdownBtnRef = useRef<HTMLButtonElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const tdStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr ref={setNodeRef} className={`group${isDragging ? ' opacity-40' : ''}`}>
      <td
        className="sticky left-0 z-10 border-r border-b border-border px-3 py-2.5 bg-white group-hover:bg-[#FAFAFA]"
        style={tdStyle}
      >
        <div className="flex items-center gap-1.5">
          {isDragMode && (
            <span
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-text-secondary flex-shrink-0"
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </span>
          )}
          <ProductBadge product={task.product} />
        </div>
      </td>

      <td
        className="sticky z-10 border-r border-b border-border px-3 py-2.5 text-[13px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px] bg-white group-hover:bg-[#FAFAFA]"
        style={{ left: 84, boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)', ...tdStyle }}
      >
        {projectName(task)}
      </td>

      {visibleWeekIndices.map((wi) => {
        const isTaskWeek = wi === taskWeekIndex
        return (
          <td
            key={wi}
            className={`border-b border-r last:border-r-0 border-border px-3 py-2.5 text-[13px]${isTaskWeek ? '' : ' bg-white group-hover:bg-[#FAFAFA]'}`}
            style={isTaskWeek ? { ...bg, ...tdStyle } : tdStyle}
          >
            {isTaskWeek && (
              <div className={`flex items-center gap-2 min-w-0 rounded-[4px] transition-all ${isHighlighted ? 'ring-2 ring-navy-mid ring-offset-1' : ''}`}>
                <button
                  onClick={() => onToggleComplete(task.id)}
                  className={`flex-shrink-0 w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center transition-colors ${
                    task.status === 'complete'
                      ? 'bg-teal border-teal'
                      : 'border-border hover:border-teal bg-white'
                  }`}
                  title={task.status === 'complete' ? 'Mark open' : 'Mark complete'}
                >
                  {task.status === 'complete' && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3l2.5 2.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {isEditing ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      const trimmed = editValue.trim()
                      if (trimmed && trimmed !== task.description) onEditDescription(task.id, trimmed)
                      setIsEditing(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setIsEditing(false)
                    }}
                    className="flex-1 min-w-0 text-[13px] bg-transparent border-b border-navy-mid outline-none text-navy placeholder:text-text-muted"
                  />
                ) : (
                  <span className={`flex-1 min-w-0 break-words ${dc}`}>{task.description}</span>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity relative">
                    <button
                      onClick={() => { setEditValue(task.description); setIsEditing(true) }}
                      className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                      title="Edit task"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onToggleFlag(task.id)}
                      className="p-1 rounded text-text-muted hover:text-red-flag hover:bg-red-hover transition-colors"
                      title={task.is_flagged ? 'Unflag' : 'Flag for manager'}
                    >
                      <Flag size={14} className={task.is_flagged ? 'text-red-flag fill-red-flag' : ''} />
                    </button>
                    <div>
                      <button
                        ref={moveDropdownBtnRef}
                        onClick={() => {
                          if (moveDropdownBtnRef.current && !moveDropdownAnchor) {
                            const r = moveDropdownBtnRef.current.getBoundingClientRect()
                            setMoveDropdownAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
                          } else {
                            setMoveDropdownAnchor(null)
                          }
                        }}
                        className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                        title="Move to another week"
                      >
                        <ChevronsLeftRight size={14} />
                      </button>
                      {moveDropdownAnchor && (
                        <MoveDropdown
                          anchor={moveDropdownAnchor}
                          onMove={(weeks) => onMove(task.id, weeks)}
                          onCopy={(weeks) => onCopy(task.id, weeks)}
                          onClose={() => setMoveDropdownAnchor(null)}
                        />
                      )}
                    </div>
                    <button
                      onClick={() => onOpenPanel(task.id, 'notes')}
                      className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors"
                      title="Open task details"
                    >
                      <PanelRight size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(task.id)}
                      className="p-1 rounded text-text-muted hover:text-red-flag hover:bg-red-hover transition-colors"
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {task.comment_count > 0 && !isEditing && (
                  <button
                    onClick={() => onOpenPanel(task.id, 'comments')}
                    className="p-1 rounded text-text-muted hover:text-navy-mid hover:bg-bg transition-colors flex-shrink-0"
                    title="View comments"
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

export default SortableTaskRow
