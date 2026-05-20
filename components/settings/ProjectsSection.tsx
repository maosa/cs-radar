'use client'

import { useState, useEffect, useRef, memo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { ProjectRow } from '@/lib/supabase/types'
import { GripVertical, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
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
import ConfirmDialog from './ConfirmDialog'
import { ProjectProductBadge } from './SectionCard'
import { PRODUCTS } from './settings-types'
import type { Product } from '@/lib/supabase/types'

interface SortableProjectRowProps {
  project: ProjectRow
  editingId: string | null
  editName: string
  editProduct: Product | null
  editProductError: string
  editInputRef: React.RefObject<HTMLInputElement | null>
  onEditStart: (project: ProjectRow) => void
  onEditNameChange: (name: string) => void
  onEditProductChange: (product: Product | null) => void
  onEditProductBlur: () => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onToggleVisibility: (project: ProjectRow) => void
  onDelete: (project: ProjectRow) => void
}

const SortableProjectRow = memo(function SortableProjectRow({
  project,
  editingId,
  editName,
  editProduct,
  editProductError,
  editInputRef,
  onEditStart,
  onEditNameChange,
  onEditProductChange,
  onEditProductBlur,
  onEditSave,
  onEditCancel,
  onToggleVisibility,
  onDelete,
}: SortableProjectRowProps) {
  const isEditing = editingId === project.id
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: isEditing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col border-b border-bg last:border-b-0"
    >
      <div className="flex items-center gap-2 py-2.5 group">
      {/* Drag handle — hidden in edit mode */}
      <span
        {...(isEditing ? {} : { ...attributes, ...listeners })}
        className={`flex-shrink-0 text-border transition-colors ${
          isEditing
            ? 'invisible'
            : 'cursor-grab active:cursor-grabbing group-hover:text-text-muted'
        }`}
      >
        <GripVertical size={14} />
      </span>

      {isEditing ? (
        <>
          <select
            value={editProduct ?? ''}
            onChange={(e) => onEditProductChange((e.target.value as Product) || null)}
            onBlur={onEditProductBlur}
            className={`pl-2 pr-7 py-1.5 rounded-[6px] border text-[12px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0 ${editProductError ? 'border-red-dark' : 'border-border'}`}
          >
            <option value="">Select product…</option>
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <input
            ref={editInputRef}
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave(project.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="flex-1 px-2.5 py-1.5 rounded-[6px] border border-navy text-[13px] text-navy outline-none"
          />
          <button
            onClick={() => onEditSave(project.id)}
            className="p-1.5 rounded-[4px] text-navy hover:bg-bg"
            title="Save"
          >
            <Check size={13} />
          </button>
          <button
            onClick={onEditCancel}
            className="p-1.5 rounded-[4px] text-text-muted hover:bg-bg"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <>
          <div className={`flex items-center gap-2 flex-1 min-w-0 ${!project.is_visible ? 'opacity-40' : ''}`}>
            <ProjectProductBadge product={project.product} />
            <span className="text-[13px] text-navy truncate">{project.name}</span>
          </div>
          {/* Visibility toggle — Eye on hover for visible; EyeOff always shown for hidden */}
          <button
            onClick={() => onToggleVisibility(project)}
            className={`p-1.5 rounded-[4px] hover:bg-bg transition-colors ${
              project.is_visible
                ? 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy'
                : 'text-[#AAAAAA] opacity-100 hover:text-navy'
            }`}
            title={project.is_visible ? 'Hide from filters' : 'Show in filters'}
          >
            {project.is_visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            onClick={() => onEditStart(project)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-navy transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(project)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-red-flag-light hover:text-red-dark transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
      </div>
      {isEditing && editProductError && (
        <p className="text-[12px] text-red-dark pb-1.5 pl-6">{editProductError}</p>
      )}
    </div>
  )
})

export default function ProjectsSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newProduct, setNewProduct] = useState<Product | ''>('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editProductError, setEditProductError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null)
  const [deleteTaskCount, setDeleteTaskCount] = useState(0)
  const editInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    loadProjects()
  }, [userId])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  async function loadProjects() {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('projects')
      .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
      .eq('admin_user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    setProjects((data as ProjectRow[]) ?? [])
    setLoading(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    if (!newProduct) {
      setAddError('Please select a product.')
      return
    }
    // Block duplicate (name + product) pairs; same name under a different product is allowed
    if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.product === newProduct)) {
      setAddError('A project with this name already exists for the selected product.')
      return
    }
    setAdding(true)
    setAddError('')
    const nextOrder = projects.length
    const { data, error } = await supabase
      .from('projects')
      .insert({
        admin_user_id: userId!,
        name,
        product: newProduct,
        sort_order: nextOrder,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
    setAdding(false)
    if (error || !data) {
      onToast(
        error?.code === '23505'
          ? 'A project with this name already exists for the selected product.'
          : 'Failed to add project.',
        'error',
      )
    } else {
      setProjects((prev) => [...prev, data as ProjectRow])
      setNewName('')
      setNewProduct('')
      onToast('Project added.')
    }
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    if (!editProduct) { setEditProductError('Please select a product.'); return }
    // Block duplicate (name + product) pairs, excluding self
    if (projects.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase() && p.product === editProduct)) {
      onToast('A project with this name already exists for the selected product.', 'error')
      return
    }

    const original = projects.find((p) => p.id === id)
    const productChanged = original && original.product !== editProduct

    // Warn (but don't block) if remapping product while tasks reference this project under a different product
    if (productChanged && editProduct) {
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', id)
        .neq('product', editProduct)
      if ((count ?? 0) > 0) {
        onToast(
          `Note: ${count} task${count === 1 ? '' : 's'} using this project will still show their original product.`,
          'success',
        )
      }
    }

    const { error } = await supabase
      .from('projects')
      .update({ name, product: editProduct, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      onToast(
        error.code === '23505'
          ? 'A project with this name already exists for the selected product.'
          : 'Failed to save project.',
        'error',
      )
    } else {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name, product: editProduct } : p)))
      onToast('Project saved.')
    }
    setEditingId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = projects.findIndex((p) => p.id === active.id)
    const newIndex = projects.findIndex((p) => p.id === over.id)
    const reordered = arrayMove(projects, oldIndex, newIndex)

    // Optimistic update
    setProjects(reordered)

    // Persist new sort_order for every project
    await Promise.all(
      reordered.map((p, idx) =>
        supabase
          .from('projects')
          .update({ sort_order: idx, updated_at: new Date().toISOString() })
          .eq('id', p.id),
      ),
    )
  }

  const initiateDelete = async (project: ProjectRow) => {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
    if ((count ?? 0) > 0) {
      // Block deletion — show informational dialog instead
      setDeleteTaskCount(count ?? 0)
      setDeleteTarget(project)
      return
    }
    setDeleteTaskCount(0)
    setDeleteTarget(project)
  }

  const handleToggleVisibility = async (project: ProjectRow) => {
    const newVisibility = !project.is_visible
    // Optimistic update
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, is_visible: newVisibility } : p)))
    const { error } = await supabase
      .from('projects')
      .update({ is_visible: newVisibility, updated_at: new Date().toISOString() })
      .eq('id', project.id)
    if (error) {
      // Revert on failure
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, is_visible: project.is_visible } : p)))
      onToast('Failed to update project visibility.', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
    if (error) {
      onToast('Failed to delete project.', 'error')
    } else {
      const remaining = projects.filter((p) => p.id !== deleteTarget.id)
      setProjects(remaining)
      onToast('Project deleted.')
    }
    setDeleteTarget(null)
  }

  return (
    <>
      {deleteTarget && deleteTaskCount > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-[12px] shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-[13px] text-navy leading-relaxed">
              <span className="font-medium">&ldquo;{deleteTarget.name}&rdquo;</span> cannot be deleted because it is currently assigned to {deleteTaskCount} task{deleteTaskCount === 1 ? '' : 's'}. Please reassign or remove the project from those tasks first.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white hover:bg-[#2e2870]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && deleteTaskCount === 0 && (
        <ConfirmDialog
          message="Are you sure you want to delete this project? This action cannot be undone."
          confirmLabel="Delete"
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px] text-text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-[13px] text-text-muted">No projects yet. Add one below.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={projects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {projects.map((project) => (
                  <SortableProjectRow
                    key={project.id}
                    project={project}
                    editingId={editingId}
                    editName={editName}
                    editProduct={editProduct}
                    editInputRef={editInputRef}
                    onEditStart={(p) => { setEditingId(p.id); setEditName(p.name); setEditProduct(p.product); setEditProductError('') }}
                    onEditNameChange={setEditName}
                    onEditProductChange={(p) => { setEditProduct(p); if (p) setEditProductError('') }}
                    onEditProductBlur={() => { if (!editProduct) setEditProductError('Please select a product.') }}
                    editProductError={editProductError}
                    onEditSave={handleEditSave}
                    onEditCancel={() => { setEditingId(null); setEditProductError('') }}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={initiateDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex flex-col gap-1 pt-1">
          <div className="flex gap-2">
            <select
              value={newProduct}
              onChange={(e) => { setNewProduct(e.target.value as Product | ''); setAddError('') }}
              onBlur={() => { if (!newProduct) setAddError('Please select a product.') }}
              className={`pl-2 pr-7 py-2 rounded-[6px] border text-[13px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0 ${addError ? 'border-red-dark' : 'border-border'}`}
            >
              <option value="">Select product…</option>
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="New project name"
              className="flex-1 px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy placeholder:text-text-muted"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newProduct}
              className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-[12px] text-red-dark">{addError}</p>}
        </div>
      </div>
    </>
  )
}
