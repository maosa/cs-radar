'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Flag,
  ArrowLeft,
  ArrowRight,
  Trash2,
  GripVertical,
  FileText,
  MessageSquare,
  PanelRight,
  X,
  Pencil,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

type ViewMode = 'focused' | 'expanded'
type SortMode = 'drag' | 'product' | 'project'

const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2 }

// ─── Toasts ──────────────────────────────────────────────────────────────────

interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-[6px] text-[13px] font-medium shadow-lg border ${
            t.type === 'error'
              ? 'bg-white border-[#FF0522] text-[#CC0015]'
              : 'bg-[#19153F] border-transparent text-white'
          }`}
        >
          {t.message}
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-1 opacity-60 hover:opacity-100 text-[11px] font-bold"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Task normalisation ───────────────────────────────────────────────────────

type AnyTask = TaskWithProject

function taskBg(t: AnyTask): React.CSSProperties {
  if (t.status === 'complete') return { backgroundColor: '#C3FFF8' }
  if (t.is_flagged) return { backgroundColor: '#FFCDD3' }
  return { backgroundColor: '#FFFFFF' }
}

function descClass(t: AnyTask): string {
  if (t.status === 'complete') return 'line-through text-[#797979]'
  if (t.is_flagged) return 'text-[#CC0015]'
  return 'text-[#19153F]'
}

function projectName(t: AnyTask): string {
  return t.project_name ?? '—'
}

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
        <h2 className="text-[15px] font-medium text-[#19153F] mb-2">Delete task?</h2>
        <p className="text-[13px] text-[#595959] mb-6">
          Are you sure you want to delete this task? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium border border-[#DADADA] rounded-[6px] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] transition-colors bg-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-[13px] font-medium bg-[#FF0522] text-white rounded-[6px] border border-transparent hover:bg-[#cc0015] disabled:opacity-60 transition-colors"
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
      className={`absolute top-full mt-1 z-30 bg-white border border-[#DADADA] rounded-[6px] shadow-md min-w-[170px] py-1 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {options.map((opt) => (
        <button
          key={opt.weeks}
          onClick={() => { onMove(opt.weeks); onClose() }}
          className="w-full text-left px-3 py-1.5 text-[13px] text-[#595959] hover:bg-[#F2F2F2] hover:text-[#19153F] transition-colors"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Sortable task row ────────────────────────────────────────────────────────

interface RowProps {
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

function SortableTaskRow(props: RowProps) {
  const { task, visibleWeekIndices, onToggleComplete, onToggleFlag, onMove, onDelete, onOpenPanel, onEditDescription, isDragMode, isHighlighted } = props
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const [showMoveBackDropdown, setShowMoveBackDropdown] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const taskWeekIndex = dateStringToWeekIndex(task.week_start_date)
  const bg = taskBg(task)
  const dc = descClass(task)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="group">
      {/* Product — sticky, with drag handle */}
      <td
        className="sticky left-0 z-10 border-l border-r border-[#DADADA] px-3 py-2.5 bg-white"
        style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA' }}
      >
        <div className="flex items-center gap-1.5">
          {isDragMode && (
            <span
              {...attributes}
              {...listeners}
              className="opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-[#595959] flex-shrink-0"
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </span>
          )}
          <ProductBadge product={task.product} />
        </div>
      </td>

      {/* Project — sticky */}
      <td
        className="sticky z-10 border-r border-[#DADADA] px-3 py-2.5 text-[13px] text-[#595959] whitespace-nowrap overflow-hidden text-ellipsis max-w-[130px]"
        style={{ left: 110, backgroundColor: '#FFFFFF', boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }}
      >
        {projectName(task)}
      </td>

      {/* Week cells */}
      {visibleWeekIndices.map((wi) => {
        const isTaskWeek = wi === taskWeekIndex
        return (
          <td
            key={wi}
            className="border-b border-r border-[#DADADA] px-3 py-2.5 text-[13px]"
            style={isTaskWeek ? bg : { backgroundColor: '#FFFFFF' }}
          >
            {isTaskWeek && (
              <div className={`flex items-start gap-2 min-w-0 rounded-[4px] transition-all ${isHighlighted ? 'ring-2 ring-[#38308F] ring-offset-1' : ''}`}>
                {/* Checkbox */}
                <button
                  onClick={() => onToggleComplete(task.id)}
                  className={`mt-0.5 flex-shrink-0 w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center transition-colors ${
                    task.status === 'complete'
                      ? 'bg-[#00D1BA] border-[#00D1BA]'
                      : 'border-[#DADADA] hover:border-[#00D1BA] bg-white'
                  }`}
                  title={task.status === 'complete' ? 'Mark open' : 'Mark complete'}
                >
                  {task.status === 'complete' && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3l2.5 2.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Description */}
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
                      if (e.key === 'Escape') { setIsEditing(false) }
                    }}
                    className="flex-1 min-w-0 text-[13px] bg-transparent border-b border-[#38308F] outline-none text-[#19153F] placeholder:text-[#797979]"
                  />
                ) : (
                  <span className={`flex-1 min-w-0 truncate ${dc}`}>{task.description}</span>
                )}

                {/* Row actions — on hover, hidden while editing */}
                {!isEditing && (
                <div className="mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity relative">
                  {/* Edit */}
                  <button
                    onClick={() => { setEditValue(task.description); setIsEditing(true) }}
                    className="p-1 rounded text-[#797979] hover:text-[#19153F] hover:bg-[#F2F2F2] transition-colors"
                    title="Edit task"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Flag */}
                  <button
                    onClick={() => onToggleFlag(task.id)}
                    className="p-1 rounded text-[#797979] hover:text-[#FF0522] hover:bg-[#FFF0F2] transition-colors"
                    title={task.is_flagged ? 'Unflag' : 'Flag for manager'}
                  >
                    <Flag size={14} className={task.is_flagged ? 'text-[#FF0522] fill-[#FF0522]' : ''} />
                  </button>

                  {/* Move back */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowMoveBackDropdown((v) => !v); setShowMoveDropdown(false) }}
                      className="p-1 rounded text-[#797979] hover:text-[#19153F] hover:bg-[#F2F2F2] transition-colors"
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

                  {/* Move forward */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowMoveDropdown((v) => !v); setShowMoveBackDropdown(false) }}
                      className="p-1 rounded text-[#797979] hover:text-[#19153F] hover:bg-[#F2F2F2] transition-colors"
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

                  {/* Notes */}
                  <button
                    onClick={() => onOpenPanel(task.id, 'notes')}
                    className="p-1 rounded text-[#797979] hover:text-[#38308F] hover:bg-[#F2F2F2] transition-colors"
                    title="View notes"
                  >
                    <FileText size={14} />
                  </button>

                  {/* Comment */}
                  <button
                    onClick={() => onOpenPanel(task.id, 'comments')}
                    className="p-1 rounded text-[#797979] hover:text-[#38308F] hover:bg-[#F2F2F2] transition-colors"
                    title="View comments"
                  >
                    <MessageSquare size={14} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => onDelete(task.id)}
                    className="p-1 rounded text-[#797979] hover:text-[#FF0522] hover:bg-[#FFF0F2] transition-colors"
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
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface SearchResult {
  task: AnyTask
  weekLabel: string
}

interface ToolbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  centerWeekIndex: number
  currentWeekIndex: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onAddTask: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchResults: SearchResult[]
  showSearchDropdown: boolean
  onSearchResultClick: (task: AnyTask) => void
  onSearchClose: () => void
  panelOpen: boolean
  hasPanelTask: boolean
  onTogglePanel: () => void
}

function Toolbar({
  viewMode,
  onViewModeChange,
  centerWeekIndex,
  currentWeekIndex,
  onPrev,
  onNext,
  onToday,
  onAddTask,
  searchQuery,
  onSearchChange,
  searchResults,
  showSearchDropdown,
  onSearchResultClick,
  onSearchClose,
  panelOpen,
  hasPanelTask,
  onTogglePanel,
}: ToolbarProps) {
  const isAtCurrentWeek = centerWeekIndex === currentWeekIndex
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        onSearchClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onSearchClose])

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-[#DADADA] flex-shrink-0">
      {/* Add task */}
      <button
        onClick={onAddTask}
        className="flex items-center gap-1.5 px-3 py-1 bg-[#19153F] text-white text-[13px] font-medium rounded-[6px] border border-transparent hover:bg-[#2a2460] transition-colors"
      >
        <Plus size={14} />
        Add task
      </button>

      <div className="flex-1" />

      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={centerWeekIndex === 0}
          className="flex items-center justify-center w-7 h-7 rounded border border-[#DADADA] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-white"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={onToday}
          className={`px-2.5 py-1 text-[12px] font-medium rounded border transition-colors ${
            isAtCurrentWeek
              ? 'border-[#00D1BA] text-[#00D1BA] bg-white cursor-default'
              : 'border-[#DADADA] text-[#595959] bg-white hover:border-[#00D1BA] hover:text-[#00D1BA]'
          }`}
        >
          Today
        </button>

        <button
          onClick={onNext}
          className="flex items-center justify-center w-7 h-7 rounded border border-[#DADADA] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] transition-colors bg-white"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* View toggle */}
      <div className="flex rounded border border-[#DADADA] overflow-hidden bg-white">
        {(['focused', 'expanded'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
              viewMode === mode
                ? 'bg-[#19153F] text-white'
                : 'text-[#595959] hover:bg-[#F2F2F2]'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Panel toggle */}
      <button
        onClick={onTogglePanel}
        disabled={!hasPanelTask}
        title={panelOpen ? 'Close detail panel' : 'Open detail panel'}
        className={`flex items-center justify-center w-7 h-7 rounded border transition-colors ${
          panelOpen
            ? 'bg-[#19153F] text-white border-[#19153F]'
            : 'bg-white text-[#595959] border-[#DADADA] hover:border-[#aaa] hover:text-[#19153F] disabled:opacity-30 disabled:cursor-not-allowed'
        }`}
      >
        <PanelRight size={14} />
      </button>

      {/* Search */}
      <div ref={searchRef} className="relative flex items-center">
        <span className="absolute left-2.5 text-[#797979] pointer-events-none">
          <Search size={14} />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { onSearchClose(); (e.target as HTMLInputElement).blur() } }}
          placeholder="Search tasks…"
          className="pl-7 pr-3 py-1 text-[13px] border border-[#DADADA] rounded-[6px] w-48 placeholder:text-[#797979] focus:outline-none focus:border-[#38308F] bg-white"
        />
        {showSearchDropdown && searchResults.length > 0 && (
          <div className="absolute top-full right-0 mt-1 z-40 bg-white border border-[#DADADA] rounded-[6px] shadow-lg w-80 py-1 overflow-hidden">
            {searchResults.map(({ task, weekLabel }) => (
              <button
                key={task.id}
                onMouseDown={(e) => { e.preventDefault(); onSearchResultClick(task) }}
                className="w-full text-left px-3 py-2 hover:bg-[#F2F2F2] transition-colors flex flex-col gap-0.5"
              >
                <span className="text-[13px] text-[#19153F] truncate">{task.description}</span>
                <div className="flex items-center gap-2">
                  <ProductBadge product={task.product} />
                  <span className="text-[11px] text-[#797979]">{projectName(task)}</span>
                  <span className="text-[11px] text-[#797979] ml-auto">{weekLabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface UniqueProject {
  id: string
  name: string
}

interface FilterBarProps {
  uniqueProjects: UniqueProject[]
  filterProducts: string[]
  filterProjects: string[]
  sortMode: SortMode
  onToggleProduct: (p: string) => void
  onToggleProject: (id: string) => void
  onSortMode: (mode: SortMode) => void
  onClearFilters: () => void
}

const PRODUCT_LABELS: Record<string, string> = { AH: 'Access Hub', EH: 'Evidence Hub', NURO: 'NURO' }

function FilterBar({
  uniqueProjects,
  filterProducts,
  filterProjects,
  sortMode,
  onToggleProduct,
  onToggleProject,
  onSortMode,
  onClearFilters,
}: FilterBarProps) {
  const hasActiveFilters = filterProducts.length > 0 || filterProjects.length > 0
  const chipBase = 'px-2.5 py-1 text-[12px] font-medium rounded-[4px] border transition-colors'
  const chipActive = 'bg-[#19153F] text-white border-[#19153F]'
  const chipInactive = 'bg-white text-[#595959] border-[#DADADA] hover:border-[#aaa] hover:text-[#19153F]'

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-[#DADADA] flex-shrink-0 flex-wrap">
      {/* Product chips */}
      {(['AH', 'EH', 'NURO'] as const).map((p) => {
        const active = filterProducts.includes(p)
        return (
          <button
            key={p}
            onClick={() => onToggleProduct(p)}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {PRODUCT_LABELS[p]}
          </button>
        )
      })}

      {/* Divider */}
      {uniqueProjects.length > 0 && (
        <div className="w-px h-4 bg-[#DADADA] mx-0.5 flex-shrink-0" />
      )}

      {/* Project chips */}
      {uniqueProjects.map((proj) => {
        const active = filterProjects.includes(proj.id)
        return (
          <button
            key={proj.id}
            onClick={() => onToggleProject(proj.id)}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {proj.name}
          </button>
        )
      })}

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-[#797979] hover:text-[#CC0015] transition-colors"
          title="Clear all filters"
        >
          <X size={12} />
          Clear
        </button>
      )}

      <div className="flex-1" />

      {/* Sort mode */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[#797979]">Sort:</span>
        {([
          ['drag', 'Drag & drop'],
          ['product', 'By product'],
          ['project', 'By project'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => onSortMode(mode)}
            className={`${chipBase} ${sortMode === mode ? chipActive : chipInactive}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Task table ────────────────────────────────────────────────────────────────

interface TaskTableProps {
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

function TaskTable({
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
}: TaskTableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const visibleWeekStrings = new Set(visibleWeekIndices.map(weekIndexToDateString))

  const visibleTasks = tasks
    .filter((t) => visibleWeekStrings.has(t.week_start_date))
    .sort((a, b) => {
      const wA = dateStringToWeekIndex(a.week_start_date)
      const wB = dateStringToWeekIndex(b.week_start_date)
      if (wA !== wB) return wA - wB
      if (sortMode === 'product') {
        return (PRODUCT_ORDER[a.product] ?? 99) - (PRODUCT_ORDER[b.product] ?? 99)
      }
      if (sortMode === 'project') {
        return projectName(a).localeCompare(projectName(b))
      }
      return a.sort_order - b.sort_order
    })

  const taskIds = visibleTasks.map((t) => t.id)
  const activeTask = activeId ? visibleTasks.find((t) => t.id === activeId) : null

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const draggedTask = visibleTasks.find((t) => t.id === active.id)
    const targetTask = visibleTasks.find((t) => t.id === over.id)
    if (!draggedTask || !targetTask) return
    if (draggedTask.week_start_date !== targetTask.week_start_date) return

    const weekStr = draggedTask.week_start_date
    const weekTasks = visibleTasks.filter((t) => t.week_start_date === weekStr)
    const oldIdx = weekTasks.findIndex((t) => t.id === active.id)
    const newIdx = weekTasks.findIndex((t) => t.id === over.id)
    const reordered = arrayMove(weekTasks, oldIdx, newIdx)
    onReorder(reordered.map((t) => t.id), weekStr)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-y-auto flex-1">
        <table className="border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110, minWidth: 110 }} />
            <col style={{ width: 130, minWidth: 130 }} />
            {visibleWeekIndices.map((wi) => (
              <col key={wi} />
            ))}
          </colgroup>

          {/* Header */}
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 bg-[#F2F2F2] border-t border-b border-l border-r border-[#DADADA] px-3 py-2 text-left text-[11px] font-medium text-[#797979] uppercase tracking-wide"
              >
                Product
              </th>
              <th
                className="sticky top-0 z-30 bg-[#F2F2F2] border-t border-b border-r border-[#DADADA] px-3 py-2 text-left text-[11px] font-medium text-[#797979] uppercase tracking-wide"
                style={{ left: 110, boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)' }}
              >
                Project
              </th>
              {visibleWeekIndices.map((wi) => {
                const isCurrent = wi === currentWeekIndex
                return (
                  <th
                    key={wi}
                    className="sticky top-0 z-20 border-t border-b border-r border-[#DADADA] px-3 py-2 text-left text-[13px] font-medium text-[#19153F] bg-[#F2F2F2]"
                  >
                    <div className="flex items-center gap-2">
                      <span className={isCurrent ? 'pb-0.5 border-b-2 border-[#00D1BA]' : ''}>
                        {formatWeekHeader(wi)}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#00D1BA] text-[#19153F] leading-none">
                          current
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {visibleTasks.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + visibleWeekIndices.length}
                    className="px-4 py-8 text-center text-[13px] text-[#797979]"
                  >
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

            {/* "Add task" footer row per week */}
            <tr className="group">
              <td className="sticky left-0 z-10 bg-white border-l border-r border-[#DADADA]" style={{ boxShadow: 'inset 0 -1px 0 0 #DADADA' }} />
              <td
                className="sticky z-10 bg-white border-r border-[#DADADA]"
                style={{ left: 110, boxShadow: 'inset 0 -1px 0 0 #DADADA, 2px 0 4px -1px rgba(0,0,0,0.08)' }}
              />
              {visibleWeekIndices.map((wi) => (
                <td key={wi} className="border-b border-r border-[#DADADA] px-3 py-2">
                  <button
                    onClick={() => onAddTaskInWeek(wi)}
                    className="text-[12px] text-[#797979] hover:text-[#38308F] transition-colors"
                  >
                    + Add task
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Drag overlay */}
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

// ─── Main view ────────────────────────────────────────────────────────────────

export default function TasksView() {
  const { userId } = useAuth()
  const todayWeekIndex = getCurrentWeekIndex()
  const [viewMode, setViewMode] = useState<ViewMode>('focused')
  const [centerWeekIndex, setCenterWeekIndex] = useState(todayWeekIndex)

  const [tasks, setTasks] = useState<AnyTask[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const [addModalWeekIndex, setAddModalWeekIndex] = useState<number | null>(null)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Phase 4 state
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterProjects, setFilterProjects] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('drag')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ task: AnyTask; weekLabel: string }[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)

  // Phase 5 state — detail panel
  const [panelTask, setPanelTask] = useState<AnyTask | null>(null)
  const [panelSection, setPanelSection] = useState<'notes' | 'comments'>('notes')
  const [panelOpen, setPanelOpen] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Fetch tasks and projects
  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    const loadData = async () => {
      setLoading(true)
      const [tasksRes, projectsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, projects(name)')
          .eq('admin_user_id', userId)
          .order('week_start_date')
          .order('sort_order'),
        supabase
          .from('projects')
          .select('*')
          .eq('admin_user_id', userId)
          .is('deleted_at', null)
          .order('sort_order'),
      ])

      if (tasksRes.data) {
        const mapped: TaskWithProject[] = tasksRes.data.map((row) => {
          const proj = row.projects as { name: string } | null
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { projects: _p, ...rest } = row
          return { ...rest, project_name: proj?.name ?? null }
        })
        setTasks(mapped)
      }
      if (projectsRes.data) setProjects(projectsRes.data)
      setLoading(false)
    }
    loadData()
  }, [userId])

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    const timer = setTimeout(() => {
      const q = searchQuery.toLowerCase()
      const results = tasks
        .filter(
          (t) =>
            t.description.toLowerCase().includes(q) ||
            t.product.toLowerCase().includes(q) ||
            projectName(t).toLowerCase().includes(q)
        )
        .sort(
          (a, b) =>
            dateStringToWeekIndex(b.week_start_date) - dateStringToWeekIndex(a.week_start_date)
        )
        .slice(0, 8)
        .map((task) => ({ task, weekLabel: formatWeekHeader(dateStringToWeekIndex(task.week_start_date)) }))
      setSearchResults(results)
      setShowSearchDropdown(results.length > 0)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, tasks])

  // Unique projects derived from all tasks
  const uniqueProjects = useMemo<{ id: string; name: string }[]>(() => {
    const seen = new Map<string, string>()
    tasks.forEach((t) => {
      if (t.project_id && !seen.has(t.project_id)) {
        seen.set(t.project_id, projectName(t))
      }
    })
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const visibleWeekIndices =
    viewMode === 'focused'
      ? [centerWeekIndex]
      : [centerWeekIndex - 1, centerWeekIndex, centerWeekIndex + 1].filter((w) => w >= 0)

  // Apply product + project filters
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProducts.length > 0 && !filterProducts.includes(t.product)) return false
      if (filterProjects.length > 0 && !filterProjects.includes(t.project_id ?? '')) return false
      return true
    })
  }, [tasks, filterProducts, filterProjects])

  // ── Filter/sort handlers ───────────────────────────────────────────────────

  const handleToggleProduct = useCallback((p: string) => {
    setFilterProducts((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }, [])

  const handleToggleProject = useCallback((id: string) => {
    setFilterProjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilterProducts([])
    setFilterProjects([])
  }, [])

  const handleSearchResultClick = useCallback((task: AnyTask) => {
    const weekIdx = dateStringToWeekIndex(task.week_start_date)
    setCenterWeekIndex(weekIdx)
    setHighlightedTaskId(task.id)
    setSearchQuery('')
    setShowSearchDropdown(false)
    // Clear filters so the task is visible
    setFilterProducts([])
    setFilterProjects([])
    setTimeout(() => setHighlightedTaskId(null), 2000)
  }, [])

  const handleSearchClose = useCallback(() => {
    setShowSearchDropdown(false)
  }, [])

  const handleOpenPanel = useCallback((id: string, section: 'notes' | 'comments') => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setPanelTask(task)
    setPanelSection(section)
    setPanelOpen(true)
  }, [tasks])

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const handleTogglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev)
  }, [])

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleToggleComplete = useCallback(async (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'complete' ? 'open' : 'complete' } : t
      )
    )
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const newStatus = task.status === 'complete' ? 'open' : 'complete'
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)
    if (error) {
      addToast('Failed to update task.', 'error')
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: task.status } : t))
      )
    }
  }, [tasks, addToast, userId])

  const handleToggleFlag = useCallback(async (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_flagged: !t.is_flagged } : t))
    )
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const { error } = await supabase
      .from('tasks')
      .update({ is_flagged: !task.is_flagged, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)
    if (error) {
      addToast('Failed to update task.', 'error')
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_flagged: task.is_flagged } : t))
      )
    }
  }, [tasks, addToast, userId])

  const handleMove = useCallback(async (id: string, weeks: number) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const oldIndex = dateStringToWeekIndex(task.week_start_date)
    const newIndex = Math.max(0, oldIndex + weeks)
    if (newIndex === oldIndex) return
    const newDate = weekIndexToDateString(newIndex)

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, week_start_date: newDate } : t))
    )
    addToast(`Task moved to ${formatWeekHeader(newIndex)}.`)

    const { error } = await supabase
      .from('tasks')
      .update({ week_start_date: newDate, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)
    if (error) {
      addToast('Failed to move task.', 'error')
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, week_start_date: task.week_start_date } : t))
      )
    }
  }, [tasks, addToast, userId])

  const handleEditDescription = useCallback(async (id: string, description: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, description } : t)))
    const { error } = await supabase
      .from('tasks')
      .update({ description, updated_at: new Date().toISOString(), updated_by: userId })
      .eq('id', id)
    if (error) {
      addToast('Failed to update task.', 'error')
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, description: t.description } : t)))
    }
  }, [addToast, userId])

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteTaskId(id)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTaskId) return
    setDeleting(true)
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTaskId)
    if (error) {
      addToast('Failed to delete task.', 'error')
      setDeleting(false)
      setDeleteTaskId(null)
      return
    }
    setTasks((prev) => prev.filter((t) => t.id !== deleteTaskId))
    addToast('Task deleted.')
    setDeleting(false)
    setDeleteTaskId(null)
  }, [deleteTaskId, addToast])

  const handleReorder = useCallback(async (orderedIds: string[], weekDateStr: string) => {
    setTasks((prev) => {
      const otherTasks = prev.filter((t) => t.week_start_date !== weekDateStr)
      const weekTasks = prev.filter((t) => t.week_start_date === weekDateStr)
      const reordered = orderedIds
        .map((id) => weekTasks.find((t) => t.id === id))
        .filter((t): t is AnyTask => Boolean(t))
        .map((t, idx) => ({ ...t, sort_order: idx }))
      return [...otherTasks, ...reordered].sort((a, b) => {
        const wA = dateStringToWeekIndex(a.week_start_date)
        const wB = dateStringToWeekIndex(b.week_start_date)
        return wA !== wB ? wA - wB : a.sort_order - b.sort_order
      })
    })

    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase
          .from('tasks')
          .update({ sort_order: idx, updated_at: new Date().toISOString(), updated_by: userId })
          .eq('id', id)
      )
    )
  }, [userId])

  const handleTaskCreated = useCallback((task: TaskWithProject) => {
    setTasks((prev) => {
      const weekTasks = prev.filter((t) => t.week_start_date === task.week_start_date)
      return [...prev, { ...task, sort_order: weekTasks.length }]
    })
    setAddModalWeekIndex(null)
    addToast('Task created.')
  }, [addToast])

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        centerWeekIndex={centerWeekIndex}
        currentWeekIndex={todayWeekIndex}
        onPrev={() => setCenterWeekIndex((w) => Math.max(0, w - 1))}
        onNext={() => setCenterWeekIndex((w) => w + 1)}
        onToday={() => setCenterWeekIndex(todayWeekIndex)}
        onAddTask={() => setAddModalWeekIndex(centerWeekIndex)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        showSearchDropdown={showSearchDropdown}
        onSearchResultClick={handleSearchResultClick}
        onSearchClose={handleSearchClose}
        panelOpen={panelOpen}
        hasPanelTask={panelTask !== null}
        onTogglePanel={handleTogglePanel}
      />

      <FilterBar
        uniqueProjects={uniqueProjects}
        filterProducts={filterProducts}
        filterProjects={filterProjects}
        sortMode={sortMode}
        onToggleProduct={handleToggleProduct}
        onToggleProject={handleToggleProject}
        onSortMode={setSortMode}
        onClearFilters={handleClearFilters}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-[#797979]">
          Loading tasks…
        </div>
      ) : (
        <TaskTable
          tasks={filteredTasks}
          visibleWeekIndices={visibleWeekIndices}
          currentWeekIndex={todayWeekIndex}
          sortMode={sortMode}
          highlightedTaskId={highlightedTaskId}
          onToggleComplete={handleToggleComplete}
          onToggleFlag={handleToggleFlag}
          onMove={handleMove}
          onDelete={handleDeleteRequest}
          onOpenPanel={handleOpenPanel}
          onEditDescription={handleEditDescription}
          onAddTaskInWeek={(wi) => setAddModalWeekIndex(wi)}
          onReorder={handleReorder}
        />
      )}

      {addModalWeekIndex !== null && (
        <AddTaskModal
          weekIndex={addModalWeekIndex}
          projects={projects}
          onClose={() => setAddModalWeekIndex(null)}
          onCreated={handleTaskCreated}
        />
      )}

      {deleteTaskId && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTaskId(null)}
          deleting={deleting}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {panelTask && panelOpen && (
        <DetailPanel
          key={`${panelTask.id}-${panelSection}`}
          taskId={panelTask.id}
          taskDescription={panelTask.description}
          taskProduct={panelTask.product}
          taskProjectName={projectName(panelTask)}
          initialSection={panelSection}
          onClose={handleClosePanel}
        />
      )}
    </div>
  )
}
