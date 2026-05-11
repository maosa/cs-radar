'use client'

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import ProductBadge from './ProductBadge'
import AddTaskModal from './AddTaskModal'
import DetailPanel from './DetailPanel'
import { supabase } from '@/lib/supabase/client'
import type { TaskWithProject, ProjectRow } from '@/lib/supabase/types'
import {
  getCurrentWeekIndex,
  weekIndexToDateString,
  formatWeekHeader,
  dateStringToWeekIndex,
} from '@/lib/weeks'
import {
  Flag,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Trash2,
  GripVertical,
  PanelRight,
  Pencil,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
import { taskBg, descClass, projectName } from '@/lib/taskUtils'
import SharedToolbar from './shared/SharedToolbar'
import SharedFilterBar, { type SortMode, type UniqueProject } from './shared/SharedFilterBar'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useTasks, useTasksQuery, useProjectsQuery } from '@/lib/hooks/useTasks'

type ViewMode = 'focused' | 'expanded'
type AnyTask = TaskWithProject

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteConfirmModal({
  onConfirm,
  onCancel,
  deleting,
}: {
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-[15px] font-medium text-navy mb-2">Delete task?</h2>
        <p className="text-[13px] text-text-secondary mb-6">
          Are you sure you want to delete this task? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-[13px] font-medium bg-red-btn text-white rounded-[6px] border border-transparent hover:bg-red-btn-hover disabled:opacity-60 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Move dropdown ────────────────────────────────────────────────────────────

const MOVE_FORWARD_OPTIONS = [
  { label: 'Next week (+1)', weeks: 1 },
  { label: '+2 weeks', weeks: 2 },
  { label: '+3 weeks', weeks: 3 },
  { label: '+4 weeks', weeks: 4 },
]

const MOVE_BACK_OPTIONS = [
  { label: 'Previous week (−1)', weeks: -1 },
  { label: '−2 weeks', weeks: -2 },
  { label: '−3 weeks', weeks: -3 },
  { label: '−4 weeks', weeks: -4 },
]

function MoveDropdown({
  options,
  align = 'right',
  onMove,
  onClose,
}: {
  options: { label: string; weeks: number }[]
  align?: 'left' | 'right'
  onMove: (weeks: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 z-30 bg-white border border-border rounded-[6px] shadow-md min-w-[170px] py-1 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {options.map((opt) => (
        <button
          key={opt.weeks}
          onClick={() => { onMove(opt.weeks); onClose() }}
          className="w-full text-left px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Editable task row (owner, with DnD) ─────────────────────────────────────

interface EditableRowProps {
  task: AnyTask
  visibleWeekIndices: number[]
  onToggleComplete: (id: string) => void
  onToggleFlag: (id: string) => void
  onMove: (id: string, weeks: number) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  onEditDescription: (id: string, description: string) => void
  isDragMode: boolean
  isHighlighted: boolean
}

const SortableTaskRow = memo(function SortableTaskRow(props: EditableRowProps) {
  const { task, visibleWeekIndices, onToggleComplete, onToggleFlag, onMove, onDelete, onOpenPanel, onEditDescription, isDragMode, isHighlighted } = props
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const [showMoveBackDropdown, setShowMoveBackDropdown] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="group">
      <td
        className="sticky left-0 z-10 border-l border-r border-border px-3 py-2.5 bg-white"
        style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA' }}
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
        className="sticky z-10 border-r border-border px-3 py-2.5 text-[13px] text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]"
        style={{ left: 84, backgroundColor: '#FFFFFF', boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }}
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
                    <div className="relative">
                      <button
                        onClick={() => { setShowMoveBackDropdown((v) => !v); setShowMoveDropdown(false) }}
                        className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                        title="Move to a previous week"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      {showMoveBackDropdown && (
                        <MoveDropdown
                          options={MOVE_BACK_OPTIONS}
                          align="left"
                          onMove={(weeks) => onMove(task.id, weeks)}
                          onClose={() => setShowMoveBackDropdown(false)}
                        />
                      )}
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => { setShowMoveDropdown((v) => !v); setShowMoveBackDropdown(false) }}
                        className="p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                        title="Move to a future week"
                      >
                        <ArrowRight size={14} />
                      </button>
                      {showMoveDropdown && (
                        <MoveDropdown
                          options={MOVE_FORWARD_OPTIONS}
                          align="right"
                          onMove={(weeks) => onMove(task.id, weeks)}
                          onClose={() => setShowMoveDropdown(false)}
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
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
})

// ─── Read-only task row (manager) ─────────────────────────────────────────────

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
                <span className={`flex-1 min-w-0 truncate ${dc}`}>{task.description}</span>
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

// ─── Shared table header ──────────────────────────────────────────────────────

function TableHeader({ visibleWeekIndices, currentWeekIndex }: { visibleWeekIndices: number[]; currentWeekIndex: number }) {
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
                <span className={isCurrent ? 'pb-0.5 border-b-2 border-teal' : ''}>{formatWeekHeader(wi)}</span>
                {isCurrent && (
                  <span className="inline-flex items-center justify-center px-1.5 py-[3px] rounded text-[10px] font-medium bg-teal text-navy">
                    current
                  </span>
                )}
              </div>
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

// ─── Editable table (owner, with DnD) ────────────────────────────────────────

interface EditableTableProps {
  tasks: AnyTask[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  sortMode: SortMode
  highlightedTaskId: string | null
  onToggleComplete: (id: string) => void
  onToggleFlag: (id: string) => void
  onMove: (id: string, weeks: number) => void
  onDelete: (id: string) => void
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
  onEditDescription: (id: string, description: string) => void
  onAddTaskInWeek: (weekIndex: number) => void
  onReorder: (orderedIds: string[], weekDateStr: string) => void
}

function EditableTaskTable({
  tasks,
  visibleWeekIndices,
  currentWeekIndex,
  sortMode,
  highlightedTaskId,
  onToggleComplete,
  onToggleFlag,
  onMove,
  onDelete,
  onOpenPanel,
  onEditDescription,
  onAddTaskInWeek,
  onReorder,
}: EditableTableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const visibleWeekStrings = new Set(visibleWeekIndices.map(weekIndexToDateString))
  const visibleTasks = tasks
    .filter((t) => visibleWeekStrings.has(t.week_start_date))
    .sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      if (sortMode === 'product') return (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
      if (sortMode === 'project') return projectName(a).localeCompare(projectName(b))
      return a.sort_order - b.sort_order
    })

  const activeTask = activeId ? visibleTasks.find((t) => t.id === activeId) : null

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const draggedTask = visibleTasks.find((t) => t.id === active.id)
    const targetTask = visibleTasks.find((t) => t.id === over.id)
    if (!draggedTask || !targetTask || draggedTask.week_start_date !== targetTask.week_start_date) return
    const weekStr = draggedTask.week_start_date
    const weekTasks = visibleTasks.filter((t) => t.week_start_date === weekStr)
    const reordered = arrayMove(weekTasks, weekTasks.findIndex((t) => t.id === active.id), weekTasks.findIndex((t) => t.id === over.id))
    onReorder(reordered.map((t) => t.id), weekStr)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-y-auto flex-1">
        <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 84, minWidth: 84 }} />
            <col style={{ width: 240, minWidth: 240 }} />
            {visibleWeekIndices.map((wi) => <col key={wi} />)}
          </colgroup>
          <TableHeader visibleWeekIndices={visibleWeekIndices} currentWeekIndex={currentWeekIndex} />
          <tbody>
            <SortableContext items={visibleTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {visibleTasks.length === 0 && (
                <tr>
                  <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                    No tasks for this period.
                  </td>
                </tr>
              )}
              {visibleTasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  visibleWeekIndices={visibleWeekIndices}
                  onToggleComplete={onToggleComplete}
                  onToggleFlag={onToggleFlag}
                  onMove={onMove}
                  onDelete={onDelete}
                  onOpenPanel={onOpenPanel}
                  onEditDescription={onEditDescription}
                  isDragMode={sortMode === 'drag'}
                  isHighlighted={task.id === highlightedTaskId}
                />
              ))}
            </SortableContext>
            <tr className="group">
              <td className="sticky left-0 z-10 bg-white border-l border-r border-border" style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA' }} />
              <td className="sticky z-10 bg-white border-r border-border" style={{ left: 84, boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }} />
              {visibleWeekIndices.map((wi) => (
                <td key={wi} className="border-b border-r border-border px-3 py-2">
                  <button
                    onClick={() => onAddTaskInWeek(wi)}
                    className="text-[12px] text-text-muted hover:text-navy-mid transition-colors"
                  >
                    + Add task
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {activeTask && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded shadow-lg text-[13px] font-medium opacity-90"
            style={{ backgroundColor: '#19153F', color: '#fff', width: 300 }}
          >
            <ProductBadge product={activeTask.product} />
            <span className="truncate">{activeTask.description}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Read-only table (manager, no DnD) ───────────────────────────────────────

interface ReadOnlyTableProps {
  tasks: AnyTask[]
  visibleWeekIndices: number[]
  currentWeekIndex: number
  sortMode: SortMode
  highlightedTaskId: string | null
  onOpenPanel: (id: string, section: 'notes' | 'comments') => void
}

function ReadOnlyTaskTable({ tasks, visibleWeekIndices, currentWeekIndex, sortMode, highlightedTaskId, onOpenPanel }: ReadOnlyTableProps) {
  const visibleWeekStrings = new Set(visibleWeekIndices.map(weekIndexToDateString))
  const visibleTasks = tasks
    .filter((t) => visibleWeekStrings.has(t.week_start_date))
    .sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      if (sortMode === 'product') return (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
      if (sortMode === 'project') return projectName(a).localeCompare(projectName(b))
      return a.sort_order - b.sort_order
    })

  return (
    <div className="overflow-x-auto flex-1">
      <table className="border-separate border-spacing-0" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 84, minWidth: 84 }} />
          <col style={{ width: 240, minWidth: 240 }} />
          {visibleWeekIndices.map((wi) => <col key={wi} style={{ minWidth: 200 }} />)}
        </colgroup>
        <TableHeader visibleWeekIndices={visibleWeekIndices} currentWeekIndex={currentWeekIndex} />
        <tbody>
          {visibleTasks.length === 0 && (
            <tr>
              <td colSpan={2 + visibleWeekIndices.length} className="px-4 py-8 text-center text-[13px] text-text-muted">
                No tasks for this period.
              </td>
            </tr>
          )}
          {visibleTasks.map((task) => (
            <ReadOnlyTaskRow
              key={task.id}
              task={task}
              visibleWeekIndices={visibleWeekIndices}
              onOpenPanel={onOpenPanel}
              isHighlighted={task.id === highlightedTaskId}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Unified view ─────────────────────────────────────────────────────────────

interface TaskTableViewProps {
  readOnly?: boolean
  adminUserId?: string
}

export default function TaskTableView({ readOnly = false, adminUserId }: TaskTableViewProps) {
  const { userId } = useAuth()
  const router = useRouter()
  const todayWeekIndex = getCurrentWeekIndex()

  const [viewMode, setViewMode] = useState<ViewMode>('focused')
  const [centerWeekIndex, setCenterWeekIndex] = useState(todayWeekIndex)

  // Data fetching — scope determines cache isolation between own and managed tasks
  const targetId = readOnly ? (adminUserId ?? null) : userId
  const { data: tasks = [], isLoading: loadingTasks } = useTasksQuery(targetId, readOnly ? 'managed' : 'own')
  const { data: projects = [], isLoading: loadingProjects } = useProjectsQuery(readOnly ? null : userId)

  // Admin info (manager mode only)
  const [adminName, setAdminName] = useState('')
  const [loadingUser, setLoadingUser] = useState(readOnly)

  const loading = loadingTasks || (!readOnly && loadingProjects) || loadingUser

  // Filters and search
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('drag')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ task: AnyTask; weekLabel: string }[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  // Detail panel
  const [panelTask, setPanelTask] = useState<AnyTask | null>(null)
  const [panelSection, setPanelSection] = useState<'notes' | 'comments'>('notes')
  const [panelOpen, setPanelOpen] = useState(false)

  // Owner-only state
  const [addModalWeekIndex, setAddModalWeekIndex] = useState<number | null>(null)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Mutations — always called (hooks must not be conditional); only invoked in owner mode
  const { toggleComplete, toggleFlag, moveTask, editDescription, deleteTask, reorderTasks, taskCreated, updateTaskLocally } =
    useTasks(userId, addToast)

  // Fetch admin name and re-verify manager relationship (manager mode only)
  useEffect(() => {
    if (!readOnly || !adminUserId || !userId) {
      if (!readOnly) setLoadingUser(false)
      return
    }
    const load = async () => {
      setLoadingUser(true)
      const [userRes, relRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name').eq('id', adminUserId).maybeSingle(),
        supabase.from('manager_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('manager_user_id', userId)
          .eq('status', 'accepted'),
      ])
      if ((relRes.count ?? 0) === 0) {
        await supabase.from('users').update({ default_landing: 'task_list' }).eq('id', userId)
        router.replace('/tasks')
        return
      }
      if (userRes.data) {
        const { first_name, last_name } = userRes.data
        setAdminName([first_name, last_name].filter(Boolean).join(' ') || 'Unknown')
      }
      setLoadingUser(false)
    }
    load()
  }, [readOnly, adminUserId, userId, router])

  // Debounced search
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  useEffect(() => {
    if (debouncedSearchQuery.length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const q = debouncedSearchQuery.toLowerCase()
    const results = tasks
      .filter((t) =>
        t.description.toLowerCase().includes(q) ||
        t.product.toLowerCase().includes(q) ||
        projectName(t).toLowerCase().includes(q)
      )
      .sort((a, b) => dateStringToWeekIndex(b.week_start_date) - dateStringToWeekIndex(a.week_start_date))
      .slice(0, 8)
      .map((task) => ({ task, weekLabel: formatWeekHeader(dateStringToWeekIndex(task.week_start_date)) }))
    setSearchResults(results)
    setShowSearchDropdown(results.length > 0)
  }, [debouncedSearchQuery, tasks])

  // Unique projects for the filter bar
  const uniqueProjects = useMemo<UniqueProject[]>(() => {
    if (readOnly) {
      const seen = new Map<string, string>()
      tasks.forEach((t) => { if (t.project_id && !seen.has(t.project_id)) seen.set(t.project_id, projectName(t)) })
      return Array.from(seen.entries())
        .map(([id, name]) => ({ id, name, displayName: name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    // Owner mode: use the projects list for ordering and visibility, disambiguate duplicate names
    const usedProjectIds = new Set(tasks.map((t) => t.project_id).filter(Boolean))
    const filtered = projects.filter((p) => usedProjectIds.has(p.id) && p.is_visible !== false)
    const nameCounts = filtered.reduce<Record<string, number>>((acc, p) => {
      const key = p.name.toLowerCase()
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    return filtered.map((p) => ({
      id: p.id,
      name: p.name,
      displayName:
        nameCounts[p.name.toLowerCase()] > 1 && p.product !== 'N/A'
          ? `${p.name} (${p.product ?? 'Unassigned'})`
          : p.name,
    }))
  }, [readOnly, tasks, projects])

  // Auto-clear stale filters when their target disappears from the task list
  useEffect(() => {
    const validIds = new Set(uniqueProjects.map((p) => p.id))
    setFilterProjects((prev) => {
      const next = prev.filter((id) => validIds.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [uniqueProjects])

  useEffect(() => {
    const validProducts = new Set<string>(tasks.map((t) => t.product))
    setFilterProducts((prev) => {
      const next = prev.filter((p) => validProducts.has(p))
      return next.length === prev.length ? prev : next
    })
  }, [tasks])

  const visibleWeekIndices =
    viewMode === 'focused'
      ? [centerWeekIndex]
      : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0)

  const filteredTasks = useMemo(
    () => tasks.filter((t) => {
      if (filterProducts.length > 0 && !filterProducts.includes(t.product)) return false
      if (filterProjects.length > 0 && !filterProjects.includes(t.project_id ?? '')) return false
      return true
    }),
    [tasks, filterProducts, filterProjects]
  )

  const handleToggleProduct = useCallback((p: string) => {
    setFilterProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }, [])

  const handleToggleProject = useCallback((id: string) => {
    setFilterProjects((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilterProducts([])
    setFilterProjects([])
  }, [])

  const handleSearchResultClick = useCallback((task: AnyTask) => {
    setCenterWeekIndex(dateStringToWeekIndex(task.week_start_date))
    setHighlightedTaskId(task.id)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setFilterProducts([])
    setFilterProjects([])
    setTimeout(() => setHighlightedTaskId(null), 2000)
  }, [])

  const handleSearchClose = useCallback(() => setShowSearchDropdown(false), [])

  const handleOpenPanel = useCallback((id: string, section: 'notes' | 'comments') => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setPanelTask(task)
    setPanelSection(section)
    setPanelOpen(true)
  }, [tasks])

  const handleClosePanel = useCallback(() => setPanelOpen(false), [])

  const handleDeleteRequest = useCallback((id: string) => setDeleteTaskId(id), [])

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTaskId) return
    setDeleting(true)
    deleteTask(deleteTaskId, () => { setDeleting(false); setDeleteTaskId(null) })
  }, [deleteTaskId, deleteTask])

  return (
    <div className="flex flex-col h-full">
      <SharedToolbar
        adminName={readOnly ? adminName : undefined}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        onAddTask={readOnly ? undefined : () => setAddModalWeekIndex(centerWeekIndex)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        showSearchDropdown={showSearchDropdown}
        onSearchResultClick={handleSearchResultClick}
        onSearchClose={handleSearchClose}
        projectNameFn={projectName}
      />

      <SharedFilterBar
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        sortMode={sortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onSortMode={setSortMode}
        onClearFilters={readOnly ? undefined : handleClearFilters}
        hideDragSort={readOnly}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-text-muted">
          Loading…
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex">
          {readOnly ? (
            <ReadOnlyTaskTable
              tasks={filteredTasks}
              visibleWeekIndices={visibleWeekIndices}
              currentWeekIndex={todayWeekIndex}
              sortMode={sortMode}
              highlightedTaskId={highlightedTaskId}
              onOpenPanel={handleOpenPanel}
            />
          ) : (
            <EditableTaskTable
              tasks={filteredTasks}
              visibleWeekIndices={visibleWeekIndices}
              currentWeekIndex={todayWeekIndex}
              sortMode={sortMode}
              highlightedTaskId={highlightedTaskId}
              onToggleComplete={toggleComplete}
              onToggleFlag={toggleFlag}
              onMove={moveTask}
              onDelete={handleDeleteRequest}
              onOpenPanel={handleOpenPanel}
              onEditDescription={editDescription}
              onAddTaskInWeek={(wi) => setAddModalWeekIndex(wi)}
              onReorder={reorderTasks}
            />
          )}
        </div>
      )}

      {/* Owner-only modals */}
      {!readOnly && addModalWeekIndex !== null && (
        <AddTaskModal
          weekIndex={addModalWeekIndex}
          projects={projects}
          onClose={() => setAddModalWeekIndex(null)}
          onCreated={() => { taskCreated(); setAddModalWeekIndex(null) }}
        />
      )}
      {!readOnly && deleteTaskId && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTaskId(null)}
          deleting={deleting}
        />
      )}
      {!readOnly && <ToastContainer toasts={toasts} onDismiss={dismissToast} />}

      {/* Detail panel */}
      {panelTask && panelOpen && (
        <DetailPanel
          key={`${panelTask.id}-${panelSection}`}
          taskId={panelTask.id}
          taskDescription={panelTask.description}
          taskProduct={panelTask.product}
          taskProjectName={projectName(panelTask)}
          taskProjectId={panelTask.project_id ?? null}
          taskWeekStartDate={panelTask.week_start_date}
          projects={readOnly ? [] : projects}
          onTaskUpdated={readOnly ? undefined : (fields) => updateTaskLocally(panelTask.id, fields)}
          initialSection={panelSection}
          onClose={handleClosePanel}
          readOnlyNotes={readOnly}
          canEditAllComments={!readOnly}
        />
      )}
    </div>
  )
}
