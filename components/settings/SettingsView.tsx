'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { DefaultLanding, Product, ProjectRow, ClientAccountRow } from '@/lib/supabase/types'
import ProductBadge from '@/components/tasks/ProductBadge'
import { GripVertical, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSidebarRefresh, useSidebarCounter } from '@/lib/sidebar-context'
import { ToastContainer, type Toast } from '@/components/ui/ToastContainer'
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string | null
  default_landing: DefaultLanding
}

interface ManagingRow {
  id: string
  admin_user_id: string
  admin: { first_name: string | null; last_name: string | null; email: string } | null
}

interface BeingManagedRow {
  id: string
  manager_email: string
  manager_user_id: string | null
  accepted_at: string | null
  manager: { first_name: string | null; last_name: string | null } | null
}

interface PendingIncomingRow {
  id: string
  admin_user_id: string
  manager_email: string
  invited_at: string
  admin: { first_name: string | null; last_name: string | null; email: string } | null
}

interface PendingOutgoingRow {
  id: string
  manager_email: string
  invited_at: string
}

interface DeclinedRow {
  id: string
  manager_email: string
  invited_at: string
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  dangerous?: boolean
}

function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Confirm', dangerous = false }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-[12px] shadow-xl p-6 max-w-sm w-full mx-4">
        <p className="text-[13px] text-navy leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[6px] text-[13px] font-medium border border-border text-text-secondary bg-white hover:border-[#AAAAAA]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-[6px] text-[13px] font-medium border border-transparent text-white ${
              dangerous ? 'bg-red-btn hover:bg-red-btn-hover' : 'bg-navy hover:bg-[#2e2870]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[8px] border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-[13px] font-medium text-navy">{title}</h2>
      </div>
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  )
}

// ─── Account Section ──────────────────────────────────────────────────────────

function AccountSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const sidebarCounter = useSidebarCounter()
  const [user, setUser] = useState<UserRow | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [defaultLanding, setDefaultLanding] = useState<DefaultLanding>('task_list')
  const [hasManagerRole, setHasManagerRole] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!userId) return

      const [{ data: userData }, { data: relData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('manager_relationships').select('id').eq('manager_user_id', userId).eq('status', 'accepted').limit(1),
      ])

      if (userData) {
        setUser(userData)
        setFirstName(userData.first_name ?? '')
        setLastName(userData.last_name ?? '')
        setEmail(userData.email ?? '')
        setRole(userData.role ?? '')
        setDefaultLanding(userData.default_landing ?? 'task_list')
      }
      setHasManagerRole(Array.isArray(relData) && relData.length > 0)
      setLoading(false)
    }
    load()
  }, [userId])

  // Re-check manager role whenever an invitation is accepted or declined
  useEffect(() => {
    if (!userId) return
    supabase
      .from('manager_relationships')
      .select('id')
      .eq('manager_user_id', userId)
      .eq('status', 'accepted')
      .limit(1)
      .then(({ data }) => setHasManagerRole(Array.isArray(data) && data.length > 0))
  }, [userId, sidebarCounter])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('users').upsert({
      id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email,
      role: role || null,
      default_landing: defaultLanding,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    setSaving(false)
    if (error) {
      onToast('Failed to save account details.', 'error')
    } else {
      onToast('Account details saved.')
    }
  }

  if (loading) {
    return <p className="text-[13px] text-text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
            placeholder="First name"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-text-secondary">Last name</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
            placeholder="Last name"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-text-secondary">Current role</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy"
          placeholder="e.g. Product Manager"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-text-secondary">Default landing page</span>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="default_landing"
            value="task_list"
            checked={defaultLanding === 'task_list'}
            onChange={() => setDefaultLanding('task_list')}
            className="accent-navy"
          />
          <span className="text-[13px] text-navy">My task list</span>
        </label>
        <div className="flex flex-col gap-1">
          <label className={`flex items-center gap-2.5 ${!hasManagerRole ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input
              type="radio"
              name="default_landing"
              value="manager_view"
              checked={defaultLanding === 'manager_view'}
              onChange={() => hasManagerRole && setDefaultLanding('manager_view')}
              disabled={!hasManagerRole}
              className="accent-navy"
            />
            <span className="text-[13px] text-navy">Manager view</span>
          </label>
          {!hasManagerRole && (
            <p className="text-[12px] text-text-muted ml-6">
              Manager view is available once you have an accepted manager relationship. Ask a colleague to invite you as their manager.
            </p>
          )}
        </div>
      </div>

      <div className="pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Projects Section ─────────────────────────────────────────────────────────

const PRODUCTS: { value: Product; label: string }[] = [
  { value: 'AH', label: 'Access Hub (AH)' },
  { value: 'NURO', label: 'NURO' },
  { value: 'EH', label: 'Evidence Hub (EH)' },
  { value: 'N/A', label: 'N/A' },
]

function ProjectProductBadge({ product }: { product: Product | null }) {
  return (
    <div className="w-[82px] flex-shrink-0 flex items-center">
      {product ? (
        <ProductBadge product={product} />
      ) : (
        <span className="inline-flex items-center justify-center px-2 py-[3px] rounded text-[11px] font-medium bg-[#E8E8E8] text-text-secondary whitespace-nowrap select-none">
          Unassigned
        </span>
      )}
    </div>
  )
}

interface SortableProjectRowProps {
  project: ProjectRow
  editingId: string | null
  editName: string
  editProduct: Product | null
  editInputRef: React.RefObject<HTMLInputElement | null>
  onEditStart: (project: ProjectRow) => void
  onEditNameChange: (name: string) => void
  onEditProductChange: (product: Product | null) => void
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
  editInputRef,
  onEditStart,
  onEditNameChange,
  onEditProductChange,
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
      className="flex items-center gap-2 py-2.5 group border-b border-bg last:border-b-0"
    >
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
            className="pl-2 pr-7 py-1.5 rounded-[6px] border border-border text-[12px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
          >
            <option value="">Unassigned</option>
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
  )
})

function ProjectsSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
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
      onToast('Failed to add project.', 'error')
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
      onToast('Failed to save project.', 'error')
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
                    onEditStart={(p) => { setEditingId(p.id); setEditName(p.name); setEditProduct(p.product) }}
                    onEditNameChange={setEditName}
                    onEditProductChange={setEditProduct}
                    onEditSave={handleEditSave}
                    onEditCancel={() => setEditingId(null)}
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
              className="pl-2 pr-7 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
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
              disabled={adding || !newName.trim()}
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

// ─── Team Management Section ──────────────────────────────────────────────────

type ValidationState = 'idle' | 'found' | 'not_found'

function personLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ')
  return name ? `${name} (${email})` : email
}

const GreenDot = () => <span className="w-2 h-2 rounded-full bg-[#1B8C7A] flex-shrink-0 mt-[6px]" />
const AmberDot = () => <span className="w-2 h-2 rounded-full bg-[#B38600] flex-shrink-0 mt-[6px]" />
const RedDot = () => <span className="w-2 h-2 rounded-full bg-red-dark opacity-60 flex-shrink-0 mt-[6px]" />

function TeamManagementSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const triggerSidebarRefresh = useSidebarRefresh()
  const [loading, setLoading] = useState(true)
  const [managing, setManaging] = useState<ManagingRow[]>([])
  const [beingManaged, setBeingManaged] = useState<BeingManagedRow[]>([])
  const [pendingIncoming, setPendingIncoming] = useState<PendingIncomingRow[]>([])
  const [pendingOutgoing, setPendingOutgoing] = useState<PendingOutgoingRow[]>([])
  const [declined, setDeclined] = useState<DeclinedRow[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    message: string
    confirmLabel: string
    onConfirm: () => Promise<void>
  } | null>(null)
  // "Add your manager" form
  const [inviteEmail, setInviteEmail] = useState('')
  const [validation, setValidation] = useState<ValidationState>('idle')
  const [sending, setSending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('manager_relationships')
        .select('id, admin_user_id, admin:users!admin_user_id(first_name, last_name, email)')
        .eq('manager_user_id', userId).eq('status', 'accepted'),
      supabase.from('manager_relationships')
        .select('id, manager_email, manager_user_id, accepted_at, manager:users!manager_user_id(first_name, last_name)')
        .eq('admin_user_id', userId).eq('status', 'accepted'),
      supabase.from('manager_relationships')
        .select('id, admin_user_id, manager_email, invited_at, admin:users!admin_user_id(first_name, last_name, email)')
        .eq('manager_user_id', userId).eq('status', 'pending').order('invited_at', { ascending: false }),
      supabase.from('manager_relationships')
        .select('id, manager_email, invited_at')
        .eq('admin_user_id', userId).eq('status', 'pending').order('invited_at', { ascending: false }),
      supabase.from('manager_relationships')
        .select('id, manager_email, invited_at')
        .eq('admin_user_id', userId).eq('status', 'archived').order('invited_at', { ascending: false }),
    ])
    setManaging((r1.data as unknown as ManagingRow[]) ?? [])
    setBeingManaged((r2.data as unknown as BeingManagedRow[]) ?? [])
    setPendingIncoming((r3.data as unknown as PendingIncomingRow[]) ?? [])
    setPendingOutgoing((r4.data as PendingOutgoingRow[]) ?? [])
    setDeclined((r5.data as DeclinedRow[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Email validation (debounced) ─────────────────────────────────────────────
  const validateEmail = useCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidation('idle'); return
    }
    const { data } = await supabase.from('users').select('id').eq('email', email).single()
    setValidation(data ? 'found' : 'not_found')
  }, [])

  const handleEmailChange = (val: string) => {
    setInviteEmail(val)
    setValidation('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => validateEmail(val), 300)
  }

  const handleEmailBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    validateEmail(inviteEmail)
  }

  // ── Send invitation ──────────────────────────────────────────────────────────
  const handleSendInvitation = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !userId) return
    setSending(true)

    const { data: existing } = await supabase
      .from('manager_relationships').select('id, status')
      .eq('admin_user_id', userId).eq('manager_email', email).maybeSingle()

    if (existing) {
      if (existing.status === 'archived') {
        onToast('This invitation was previously declined. Re-send it from the Declined section below.', 'error')
      } else {
        onToast('An invitation or relationship already exists for this email.', 'error')
      }
      setSending(false); return
    }

    const { data: managerUser } = await supabase.from('users').select('id').eq('email', email).single()
    const { error } = await supabase.from('manager_relationships').insert({
      admin_user_id: userId,
      manager_email: email,
      manager_user_id: managerUser?.id ?? null,
      status: 'pending',
      invited_at: new Date().toISOString(),
    })
    setSending(false)
    if (error) {
      onToast('Failed to send invitation.', 'error')
    } else {
      onToast('Invitation sent.')
      setInviteEmail('')
      setValidation('idle')
      loadAll()
    }
  }

  // ── Accept / Decline incoming ────────────────────────────────────────────────
  const handleAccept = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to accept invitation.', 'error') } else {
      onToast('Invitation accepted.')
      triggerSidebarRefresh()
      loadAll()
    }
  }

  const handleDecline = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'archived' }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to decline invitation.', 'error') } else {
      onToast('Invitation declined.')
      triggerSidebarRefresh()
      loadAll()
    }
  }

  // ── Re-send declined ─────────────────────────────────────────────────────────
  const handleResend = async (id: string) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships')
      .update({ status: 'pending', invited_at: new Date().toISOString() }).eq('id', id)
    setActing(null)
    if (error) { onToast('Failed to re-send invitation.', 'error') } else {
      onToast('Invitation re-sent.')
      loadAll()
    }
  }

  // ── Hard-delete helper ───────────────────────────────────────────────────────
  const hardDelete = async (id: string, successMsg: string, refreshSidebar = false) => {
    setActing(id)
    const { error } = await supabase.from('manager_relationships').delete().eq('id', id)
    setActing(null)
    if (error) { onToast('Action failed. Please try again.', 'error') } else {
      onToast(successMsg)
      if (refreshSidebar) triggerSidebarRefresh()
      loadAll()
    }
  }

  // ── Merged pending list ──────────────────────────────────────────────────────
  const allPending = [
    ...pendingIncoming.map((r) => ({ ...r, direction: 'incoming' as const })),
    ...pendingOutgoing.map((r) => ({ ...r, direction: 'outgoing' as const })),
  ].sort((a, b) => new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime())

  const hasRelationships = managing.length > 0 || beingManaged.length > 0
  const hasInvites = allPending.length > 0 || declined.length > 0
  const showSeparator = !loading && (hasRelationships || hasInvites)

  const fmtDate = (ts: string) =>
    new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          dangerous
          onConfirm={async () => { setConfirmAction(null); await confirmAction.onConfirm() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <div className="flex flex-col gap-5">
        {/* ── Add your manager ── */}
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-text-secondary">Add your manager</p>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendInvitation() }}
                placeholder="manager@example.com"
                className="px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy placeholder:text-text-muted"
              />
              {validation === 'found' && (
                <p className="text-[12px] text-[#1B8C7A]">✓ Registered user — invitation will be sent and they can accept it in Settings.</p>
              )}
              {validation === 'not_found' && (
                <p className="text-[12px] text-[#B38600]">User not found. You can still invite this email — the invitation will appear once they register.</p>
              )}
            </div>
            <button
              onClick={handleSendInvitation}
              disabled={sending || !inviteEmail.trim()}
              className="self-start px-4 py-2 rounded-[6px] text-[13px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Invite manager'}
            </button>
          </div>
        </div>

        {loading && <p className="text-[13px] text-text-muted">Loading…</p>}

        {showSeparator && <hr className="border-bg" />}

        {/* ── Manager relationships ── */}
        {hasRelationships && (
          <div className="flex flex-col gap-3">
            {managing.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">You are managing</p>
                <div className="flex flex-col divide-y divide-bg">
                  {managing.map((row) => {
                    const a = row.admin
                    const label = a ? personLabel(a.first_name, a.last_name, a.email) : row.admin_user_id
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <span className="text-[13px] text-navy truncate">{label}</span>
                        </div>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Remove yourself as a manager for ${a?.email ?? row.admin_user_id}? You will lose access to their task list.`,
                            confirmLabel: 'Remove',
                            onConfirm: () => hardDelete(row.id, 'Removed from manager role.', true),
                          })}
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {beingManaged.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">You are being managed by</p>
                <div className="flex flex-col divide-y divide-bg">
                  {beingManaged.map((row) => {
                    const m = row.manager
                    const label = m ? personLabel(m.first_name, m.last_name, row.manager_email) : row.manager_email
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[13px] text-navy truncate">{label}</span>
                            {row.accepted_at && (
                              <span className="text-[11px] text-text-muted">Since {fmtDate(row.accepted_at)}</span>
                            )}
                          </div>
                        </div>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Remove ${row.manager_email} as your manager? They will lose access to your task list.`,
                            confirmLabel: 'Sever',
                            onConfirm: () => hardDelete(row.id, 'Manager relationship severed.'),
                          })}
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Sever
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Invitations ── */}
        {hasInvites && (
          <div className="flex flex-col gap-3">
            {allPending.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">Pending</p>
                <div className="flex flex-col divide-y divide-bg">
                  {allPending.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <AmberDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {row.direction === 'incoming' ? (
                            <span className="text-[13px] text-navy">
                              {personLabel(row.admin?.first_name, row.admin?.last_name, row.admin?.email ?? row.admin_user_id)} wants you to manage their tasks
                            </span>
                          ) : (
                            <span className="text-[13px] text-navy truncate">{row.manager_email}</span>
                          )}
                          <span className="text-[11px] text-text-muted">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {row.direction === 'incoming' ? (
                          <>
                            <button
                              onClick={() => handleAccept(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleDecline(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={acting === row.id}
                            onClick={() => setConfirmAction({
                              message: `Cancel the pending invitation to ${row.manager_email}?`,
                              confirmLabel: 'Cancel invitation',
                              onConfirm: () => hardDelete(row.id, 'Invitation cancelled.'),
                            })}
                            className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {declined.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-text-secondary">Declined</p>
                <div className="flex flex-col divide-y divide-bg">
                  {declined.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <RedDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[13px] text-navy truncate">{row.manager_email}</span>
                          <span className="text-[11px] text-text-muted">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleResend(row.id)}
                          disabled={acting === row.id}
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-navy text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
                        >
                          Re-send
                        </button>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Permanently delete the declined invitation from ${row.manager_email}?`,
                            confirmLabel: 'Delete',
                            onConfirm: () => hardDelete(row.id, 'Invitation deleted.'),
                          })}
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-text-muted border border-border bg-white hover:border-red-flag hover:text-red-dark disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Account Health Section ───────────────────────────────────────────────────

function AccountHealthSection({
  onToast,
  onEnabledChange,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  onEnabledChange: (enabled: boolean) => void
}) {
  const { userId } = useAuth()
  const triggerSidebarRefresh = useSidebarRefresh()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('users')
      .select('account_health_enabled')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const val = data?.account_health_enabled ?? false
        setEnabled(val)
        onEnabledChange(val)
        setLoading(false)
      })
  }, [userId])

  const handleToggle = async () => {
    if (!userId) return
    const next = !enabled
    setEnabled(next)
    onEnabledChange(next)
    const { error } = await supabase
      .from('users')
      .update({ account_health_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      setEnabled(!next)
      onEnabledChange(!next)
      onToast('Failed to update account health setting.', 'error')
    } else {
      triggerSidebarRefresh()
    }
  }

  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <input
          id="account-health-toggle"
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="mt-0.5 accent-navy cursor-pointer"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="account-health-toggle" className="text-[13px] font-medium text-navy cursor-pointer">
            Enable Account Health
          </label>
          <p className="text-[12px] text-text-secondary">
            Turn this on if you manage client accounts and want to use the Account Health and Risk Assessment / Matrix features. This adds an Account Health page to your sidebar.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Client Accounts Section ──────────────────────────────────────────────────

interface SortableClientAccountRowProps {
  account: ClientAccountRow
  editingId: string | null
  editName: string
  editProduct: Product | null
  editInputRef: React.RefObject<HTMLInputElement | null>
  onEditStart: (account: ClientAccountRow) => void
  onEditNameChange: (name: string) => void
  onEditProductChange: (product: Product | null) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onToggleVisibility: (account: ClientAccountRow) => void
  onDelete: (account: ClientAccountRow) => void
}

const SortableClientAccountRow = memo(function SortableClientAccountRow({
  account,
  editingId,
  editName,
  editProduct,
  editInputRef,
  onEditStart,
  onEditNameChange,
  onEditProductChange,
  onEditSave,
  onEditCancel,
  onToggleVisibility,
  onDelete,
}: SortableClientAccountRowProps) {
  const isEditing = editingId === account.id
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id, disabled: isEditing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2.5 group border-b border-bg last:border-b-0"
    >
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
            className="pl-2 pr-7 py-1.5 rounded-[6px] border border-border text-[12px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
          >
            <option value="">Unassigned</option>
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
              if (e.key === 'Enter') onEditSave(account.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="flex-1 px-2.5 py-1.5 rounded-[6px] border border-navy text-[13px] text-navy outline-none"
          />
          <button
            onClick={() => onEditSave(account.id)}
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
          <div className={`flex items-center gap-2 flex-1 min-w-0 ${!account.is_visible ? 'opacity-40' : ''}`}>
            <ProjectProductBadge product={account.product} />
            <span className="text-[13px] text-navy truncate">{account.name}</span>
          </div>
          <button
            onClick={() => onToggleVisibility(account)}
            className={`p-1.5 rounded-[4px] hover:bg-bg transition-colors ${
              account.is_visible
                ? 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-navy'
                : 'text-[#AAAAAA] opacity-100 hover:text-navy'
            }`}
            title={account.is_visible ? 'Hide from selectors' : 'Show in selectors'}
          >
            {account.is_visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            onClick={() => onEditStart(account)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-bg hover:text-navy transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(account)}
            className="p-1.5 rounded-[4px] text-text-muted opacity-0 group-hover:opacity-100 hover:bg-red-flag-light hover:text-red-dark transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
})

function ClientAccountsSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const [accounts, setAccounts] = useState<ClientAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newProduct, setNewProduct] = useState<Product | ''>('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClientAccountRow | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => { loadAccounts() }, [userId])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  async function loadAccounts() {
    if (!userId) { setLoading(false); return }
    const { data } = await supabase
      .from('client_accounts')
      .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
      .eq('admin_user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    setAccounts((data as ClientAccountRow[]) ?? [])
    setLoading(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    if (!newProduct) {
      setAddError('Please select a product.')
      return
    }
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.product === newProduct)) {
      setAddError('A client account with this name already exists for the selected product.')
      return
    }
    setAdding(true)
    setAddError('')
    const nextOrder = accounts.length
    const { data, error } = await supabase
      .from('client_accounts')
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
      onToast('Failed to add client account.', 'error')
    } else {
      setAccounts((prev) => [...prev, data as ClientAccountRow])
      setNewName('')
      setNewProduct('')
      onToast('Client account added.')
    }
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    if (accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase() && a.product === editProduct)) {
      onToast('A client account with this name already exists for the selected product.', 'error')
      return
    }
    const { error } = await supabase
      .from('client_accounts')
      .update({ name, product: editProduct, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      onToast('Failed to save client account.', 'error')
    } else {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, name, product: editProduct } : a)))
      onToast('Client account saved.')
    }
    setEditingId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = accounts.findIndex((a) => a.id === active.id)
    const newIndex = accounts.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(accounts, oldIndex, newIndex)

    setAccounts(reordered)

    await Promise.all(
      reordered.map((a, idx) =>
        supabase
          .from('client_accounts')
          .update({ sort_order: idx, updated_at: new Date().toISOString() })
          .eq('id', a.id),
      ),
    )
  }

  const initiateDelete = async (account: ClientAccountRow) => {
    // Check if any assessment data exists for this account
    const [responsesRes, metadataRes] = await Promise.all([
      supabase
        .from('account_health_responses')
        .select('id', { count: 'exact', head: true })
        .eq('client_account_id', account.id),
      supabase
        .from('account_health_metadata')
        .select('id', { count: 'exact', head: true })
        .eq('client_account_id', account.id),
    ])
    const hasData = (responsesRes.count ?? 0) > 0 || (metadataRes.count ?? 0) > 0
    setDeleteBlocked(hasData)
    setDeleteTarget(account)
  }

  const handleToggleVisibility = async (account: ClientAccountRow) => {
    const newVisibility = !account.is_visible
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, is_visible: newVisibility } : a)))
    const { error } = await supabase
      .from('client_accounts')
      .update({ is_visible: newVisibility, updated_at: new Date().toISOString() })
      .eq('id', account.id)
    if (error) {
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, is_visible: account.is_visible } : a)))
      onToast('Failed to update visibility.', 'error')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase
      .from('client_accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
    if (error) {
      onToast('Failed to delete client account.', 'error')
    } else {
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      onToast('Client account deleted.')
    }
    setDeleteTarget(null)
  }

  return (
    <>
      {deleteTarget && deleteBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-[12px] shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-[13px] text-navy leading-relaxed">
              <span className="font-medium">&ldquo;{deleteTarget.name}&rdquo;</span> cannot be deleted because it has assessment data.
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
      {deleteTarget && !deleteBlocked && (
        <ConfirmDialog
          message="Are you sure you want to delete this client account? This action cannot be undone."
          confirmLabel="Delete"
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px] text-text-muted">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-[13px] text-text-muted">No client accounts yet. Add one below.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={accounts.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {accounts.map((account) => (
                  <SortableClientAccountRow
                    key={account.id}
                    account={account}
                    editingId={editingId}
                    editName={editName}
                    editProduct={editProduct}
                    editInputRef={editInputRef}
                    onEditStart={(a) => { setEditingId(a.id); setEditName(a.name); setEditProduct(a.product) }}
                    onEditNameChange={setEditName}
                    onEditProductChange={setEditProduct}
                    onEditSave={handleEditSave}
                    onEditCancel={() => setEditingId(null)}
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
              className="pl-2 pr-7 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy bg-white w-[190px] flex-shrink-0"
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
              placeholder="New client account name"
              className="flex-1 px-3 py-2 rounded-[6px] border border-border text-[13px] text-navy outline-none focus:border-navy placeholder:text-text-muted"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
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

// ─── Account Health Settings Block ────────────────────────────────────────────

function AccountHealthSettingsBlock({
  onToast,
  onEnabledChange,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  onEnabledChange: (enabled: boolean) => void
}) {
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)

  const handleEnabledChange = (val: boolean) => {
    setAccountHealthEnabled(val)
    onEnabledChange(val)
  }

  return (
    <>
      <SectionCard title="Account Health">
        <AccountHealthSection
          onToast={onToast}
          onEnabledChange={handleEnabledChange}
        />
      </SectionCard>
      {accountHealthEnabled && (
        <SectionCard title="Client Accounts">
          <p className="text-[12px] text-text-secondary mb-4">
            Used in Account Health to select the client you are reviewing. Each account can be associated with a product.
          </p>
          <ClientAccountsSection onToast={onToast} />
        </SectionCard>
      )}
    </>
  )
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  const s = String(value ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function formatExportDate(ts: string): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Account health question map (mirrors RiskAssessmentTable sections) ───────

const ACCOUNT_HEALTH_QUESTIONS: { category: string; questionId: string; question: string }[] = [
  { category: 'Engagement',       questionId: 'engagement_usage_declining',     question: 'Is platform usage declining or inactive for 4+ weeks?' },
  { category: 'Engagement',       questionId: 'engagement_milestone_weakening', question: 'Are milestone or KPI tracking habits weakening?' },
  { category: 'Engagement',       questionId: 'engagement_qbr_missed',          question: 'Are QBRs consistently missed or poorly attended?' },
  { category: 'Engagement',       questionId: 'engagement_feedback_passive',    question: 'Is client feedback passive or negative? Are NPS scores low?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_key_left',              question: 'Have key admins, sponsors, or power users left or changed roles?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_ownership_unclear',     question: 'Is there unclear ownership or missing champions?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_csm_changed',           question: 'Have CSMs been regularly changed?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_ai_sponsor_missing',    question: 'Are they missing an internal AI sponsor?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_relationship_unstable', question: 'Is there an unstable relationship with sales, CS, product owner, or sponsor?' },
  { category: 'Strategic Fit',    questionId: 'strategic_nonessential',            question: 'Is the product seen as non-essential or misaligned with client priorities?' },
  { category: 'Operational Risk', questionId: 'operational_rollout_delayed',       question: 'Has roll-out been delayed due to inattentive or unresponsive admins?' },
  { category: 'Operational Risk', questionId: 'operational_feedback_passive',      question: 'Is client feedback passive or negative? Are NPS scores low?' },
  { category: 'Commercial Risk',  questionId: 'commercial_renewal_delayed',        question: 'Are renewal conversations delayed or stalled?' },
  { category: 'Risk Matrix',      questionId: 'matrix_engagement',                 question: 'Engagement risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_stakeholder',                question: 'Stakeholder risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_strategic_fit',              question: 'Strategic fit' },
  { category: 'Risk Matrix',      questionId: 'matrix_operational',                question: 'Operational risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_commercial',                 question: 'Commercial risk' },
  { category: 'Risk Factor',      questionId: 'risk_flagged_high',                 question: 'Is the client flagged as High-Risk in the CS risk review?' },
  { category: 'Risk Factor',      questionId: 'risk_admin_left',                   question: 'Has the primary admin, sponsor, or power user left and not been replaced?' },
  { category: 'Risk Factor',      questionId: 'risk_usage_dropped',                question: 'Has product usage dropped significantly (30% or more decline) over a 4-week period?' },
  { category: 'Risk Factor',      questionId: 'risk_renewal_low_engagement',       question: 'Is renewal within 3 months with low engagement?' },
  { category: 'Risk Factor',      questionId: 'risk_confirmed_misalignment',       question: 'Is there a confirmed commercial, strategic, or stakeholder misalignment?' },
]

const AH_QUESTION_MAP = Object.fromEntries(
  ACCOUNT_HEALTH_QUESTIONS.map((q) => [q.questionId, q])
)

const AH_QUESTION_ORDER = Object.fromEntries(
  ACCOUNT_HEALTH_QUESTIONS.map((q, i) => [q.questionId, i])
)

// ─── Export section ───────────────────────────────────────────────────────────

function ExportSection({
  onToast,
  accountHealthEnabled,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  accountHealthEnabled: boolean
}) {
  const { userId } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [exportingAH, setExportingAH] = useState(false)

  const handleExport = async () => {
    if (!userId) return
    setExporting(true)
    try {
      // 1. Fetch all tasks with project names
      const { data: tasksRaw, error: tasksErr } = await supabase
        .from('tasks')
        .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name)')
        .eq('admin_user_id', userId)
        .order('week_start_date')
        .order('sort_order')
      if (tasksErr) throw tasksErr
      const tasks = tasksRaw ?? []
      const taskIds = tasks.map((t) => t.id)

      if (taskIds.length === 0) {
        // No tasks — still produce a headers-only CSV
        const csv = '﻿' + ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged'].join(',')
        triggerDownload(csv, `tasks_${new Date().toISOString().slice(0, 10)}.csv`)
        return
      }

      // 2. Parallel fetch notes + comments
      const [notesRes, commentsRes] = await Promise.all([
        supabase.from('task_notes').select('task_id, content').in('task_id', taskIds),
        supabase.from('task_comments').select('task_id, content, created_by, updated_by, created_at, updated_at').in('task_id', taskIds).order('created_at'),
      ])
      if (notesRes.error) throw notesRes.error
      if (commentsRes.error) throw commentsRes.error
      const notes = notesRes.data ?? []
      const comments = commentsRes.data ?? []

      // 3. Resolve user names for comment authors
      const authorIds = new Set<string>()
      comments.forEach((c) => {
        authorIds.add(c.created_by)
        if (c.updated_by) authorIds.add(c.updated_by)
      })
      const nameMap: Record<string, string> = {}
      if (authorIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', [...authorIds])
        if (users) {
          users.forEach((u) => {
            nameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown'
          })
        }
      }

      // 4. Build lookup maps
      const notesMap: Record<string, string> = {}
      notes.forEach((n) => { notesMap[n.task_id] = n.content })

      const commentsMap: Record<string, string> = {}
      comments.forEach((c) => {
        const authorId = c.updated_by ?? c.created_by
        const timestamp = c.updated_at ?? c.created_at
        const name = nameMap[authorId] ?? 'Unknown'
        const date = formatExportDate(timestamp)
        const text = c.content.trimEnd()
        const entry = `[${name} on ${date}] ${text}${text.endsWith('.') ? '' : '.'}`
        commentsMap[c.task_id] = commentsMap[c.task_id] ? `${commentsMap[c.task_id]} ${entry}` : entry
      })

      // 5. Build rows
      const headers = ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged']
      const rows = tasks.map((task) => {
        const proj = task.projects as unknown as { name: string } | null
        return [
          task.week_start_date,
          task.product,
          proj?.name ?? '',
          task.description,
          notesMap[task.id] ?? '',
          commentsMap[task.id] ?? '',
          task.status === 'complete' ? 'Complete' : 'Open',
          task.is_flagged ? 'Yes' : 'No',
        ]
      })

      // 6. Serialise + download (BOM for Excel UTF-8 compatibility)
      const csv = '﻿' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
      triggerDownload(csv, `tasks_${new Date().toISOString().slice(0, 10)}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportAccountHealth = async () => {
    if (!userId) return
    setExportingAH(true)
    try {
      const headers = [
        'Client Account', 'Month', 'Risk Category', 'Question', 'Response',
        'CS Lead Comment', 'Client Partner Comment', 'Renewal Date', 'Last Engagement', 'Type of Engagement',
      ]

      // 1. Parallel fetch accounts, metadata, and responses
      const [accountsRes, metadataRes, responsesRes] = await Promise.all([
        supabase
          .from('client_accounts')
          .select('id, name')
          .eq('admin_user_id', userId)
          .is('deleted_at', null)
          .order('sort_order'),
        supabase
          .from('account_health_metadata')
          .select('client_account_id, renewal_date, last_engagement_date, engagement_type')
          .eq('admin_user_id', userId),
        supabase
          .from('account_health_responses')
          .select('client_account_id, month, question_id, response, cs_lead_comment, client_partner_comment')
          .eq('admin_user_id', userId),
      ])
      if (accountsRes.error) throw accountsRes.error
      if (metadataRes.error) throw metadataRes.error
      if (responsesRes.error) throw responsesRes.error

      const accounts = accountsRes.data ?? []

      if (accounts.length === 0) {
        const csv = '﻿' + headers.join(',')
        triggerDownload(csv, `account_health_${new Date().toISOString().slice(0, 10)}.csv`)
        return
      }

      // 2. Build lookup maps
      const metadataMap: Record<string, { renewal_date: string | null; last_engagement_date: string | null; engagement_type: string | null }> = {}
      ;(metadataRes.data ?? []).forEach((m) => { metadataMap[m.client_account_id] = m })

      const responsesMap: Record<string, typeof responsesRes.data> = {}
      ;(responsesRes.data ?? []).forEach((r) => {
        if (!responsesMap[r.client_account_id]) responsesMap[r.client_account_id] = []
        responsesMap[r.client_account_id]!.push(r)
      })

      // 3. Build rows per account
      const rows: string[][] = []
      for (const account of accounts) {
        const meta = metadataMap[account.id]

        // Metadata row — account-level fields, risk columns empty
        rows.push([
          account.name, '', '', '', '', '', '',
          meta?.renewal_date ?? '',
          meta?.last_engagement_date ?? '',
          meta?.engagement_type ?? '',
        ])

        // Response rows — sorted by month then by canonical question order
        const accountResponses = (responsesMap[account.id] ?? []).slice().sort((a, b) => {
          const monthDiff = a.month.localeCompare(b.month)
          if (monthDiff !== 0) return monthDiff
          return (AH_QUESTION_ORDER[a.question_id] ?? 999) - (AH_QUESTION_ORDER[b.question_id] ?? 999)
        })

        for (const r of accountResponses) {
          const q = AH_QUESTION_MAP[r.question_id]
          const month = new Date(r.month + 'T12:00:00')
            .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
            .replace(' ', '-')
          rows.push([
            account.name,
            month,
            q?.category ?? r.question_id,
            q?.question ?? r.question_id,
            r.response ?? '',
            r.cs_lead_comment ?? '',
            r.client_partner_comment ?? '',
            '', '', '',
          ])
        }
      }

      // 4. Serialise + download (BOM for Excel UTF-8 compatibility)
      const csv = '﻿' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
      triggerDownload(csv, `account_health_${new Date().toISOString().slice(0, 10)}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExportingAH(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] text-text-secondary mb-4">
        Download all your tasks, notes, and comments as a CSV file.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting ? 'Exporting…' : 'Export to CSV'}
      </button>
      {accountHealthEnabled && (
        <>
          <hr className="border-border my-4" />
          <p className="text-[13px] text-text-secondary mb-4">
            Download all your Account Health data as a CSV file.
          </p>
          <button
            onClick={handleExportAccountHealth}
            disabled={exportingAH}
            className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exportingAH ? 'Exporting…' : 'Export Account Health to CSV'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SettingsView() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Settings</h1>
      <SectionCard title="Account Details">
        <AccountSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Projects">
        <ProjectsSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Team Management">
        <TeamManagementSection onToast={addToast} />
      </SectionCard>
      <AccountHealthSettingsBlock onToast={addToast} onEnabledChange={setAccountHealthEnabled} />
      <SectionCard title="Export Data">
        <ExportSection onToast={addToast} accountHealthEnabled={accountHealthEnabled} />
      </SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
