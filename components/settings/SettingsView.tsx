'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { DefaultLanding, ProjectRow } from '@/lib/supabase/types'
import { GripVertical, Pencil, Trash2, Check, X } from 'lucide-react'
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

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: string; message: string; type: 'success' | 'error' }

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
          <button onClick={() => onDismiss(t.id)} className="ml-1 opacity-60 hover:opacity-100 text-[11px] font-bold">✕</button>
        </div>
      ))}
    </div>
  )
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
        <p className="text-[13px] text-[#19153F] leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-[6px] text-[13px] font-medium border border-[#DADADA] text-[#595959] bg-white hover:border-[#AAAAAA]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-[6px] text-[13px] font-medium border border-transparent text-white ${
              dangerous ? 'bg-[#CC0015] hover:bg-[#AA0010]' : 'bg-[#19153F] hover:bg-[#2e2870]'
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
    <div className="bg-white rounded-[8px] border border-[#DADADA] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#DADADA]">
        <h2 className="text-[13px] font-medium text-[#19153F]">{title}</h2>
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
    return <p className="text-[13px] text-[#797979]">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#595959]">First name</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F]"
            placeholder="First name"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[#595959]">Last name</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F]"
            placeholder="Last name"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#595959]">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F]"
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[#595959]">Current role</span>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F]"
          placeholder="e.g. Product Manager"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-[#595959]">Default landing page</span>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="radio"
            name="default_landing"
            value="task_list"
            checked={defaultLanding === 'task_list'}
            onChange={() => setDefaultLanding('task_list')}
            className="accent-[#19153F]"
          />
          <span className="text-[13px] text-[#19153F]">My task list</span>
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
              className="accent-[#19153F]"
            />
            <span className="text-[13px] text-[#19153F]">Manager view</span>
          </label>
          {!hasManagerRole && (
            <p className="text-[12px] text-[#797979] ml-6">
              Manager view is available once you have an accepted manager relationship. Ask a colleague to invite you as their manager.
            </p>
          )}
        </div>
      </div>

      <div className="pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#19153F] text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Projects Section ─────────────────────────────────────────────────────────

interface SortableProjectRowProps {
  project: ProjectRow
  editingId: string | null
  editName: string
  editInputRef: React.RefObject<HTMLInputElement | null>
  onEditStart: (project: ProjectRow) => void
  onEditNameChange: (name: string) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  onDelete: (project: ProjectRow) => void
}

function SortableProjectRow({
  project,
  editingId,
  editName,
  editInputRef,
  onEditStart,
  onEditNameChange,
  onEditSave,
  onEditCancel,
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
      className="flex items-center gap-2 py-2.5 group border-b border-[#F2F2F2] last:border-b-0"
    >
      {/* Drag handle — hidden in edit mode */}
      <span
        {...(isEditing ? {} : { ...attributes, ...listeners })}
        className={`flex-shrink-0 text-[#DADADA] transition-colors ${
          isEditing
            ? 'invisible'
            : 'cursor-grab active:cursor-grabbing group-hover:text-[#797979]'
        }`}
      >
        <GripVertical size={14} />
      </span>

      {isEditing ? (
        <>
          <input
            ref={editInputRef}
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave(project.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="flex-1 px-2.5 py-1.5 rounded-[6px] border border-[#19153F] text-[13px] text-[#19153F] outline-none"
          />
          <button
            onClick={() => onEditSave(project.id)}
            className="p-1.5 rounded-[4px] text-[#19153F] hover:bg-[#F2F2F2]"
            title="Save"
          >
            <Check size={13} />
          </button>
          <button
            onClick={onEditCancel}
            className="p-1.5 rounded-[4px] text-[#797979] hover:bg-[#F2F2F2]"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-[13px] text-[#19153F]">{project.name}</span>
          <button
            onClick={() => onEditStart(project)}
            className="p-1.5 rounded-[4px] text-[#797979] opacity-0 group-hover:opacity-100 hover:bg-[#F2F2F2] hover:text-[#19153F]"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(project)}
            className="p-1.5 rounded-[4px] text-[#797979] opacity-0 group-hover:opacity-100 hover:bg-[#FFCDD3] hover:text-[#CC0015]"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}

function ProjectsSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
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
      .select('*')
      .eq('admin_user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
    setProjects((data as ProjectRow[]) ?? [])
    setLoading(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setAddError('A project with this name already exists.')
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
        sort_order: nextOrder,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
    setAdding(false)
    if (error || !data) {
      onToast('Failed to add project.', 'error')
    } else {
      // Append at end — preserve user's custom order
      setProjects((prev) => [...prev, data as ProjectRow])
      setNewName('')
      onToast('Project added.')
    }
  }

  const handleEditSave = async (id: string) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    if (projects.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
      onToast('A project with this name already exists.', 'error')
      return
    }
    const { error } = await supabase
      .from('projects')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      onToast('Failed to save project.', 'error')
    } else {
      // Keep current position — only the name changes
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
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
    setDeleteTaskCount(count ?? 0)
    setDeleteTarget(project)
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
      {deleteTarget && (
        <ConfirmDialog
          message={
            deleteTaskCount > 0
              ? `${deleteTaskCount} task${deleteTaskCount === 1 ? '' : 's'} reference this project. Deleting it will remove the project association from those tasks. This action cannot be undone.`
              : 'Are you sure you want to delete this project? This action cannot be undone.'
          }
          confirmLabel="Delete"
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-[13px] text-[#797979]">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-[13px] text-[#797979]">No projects yet. Add one below.</p>
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
                    editInputRef={editInputRef}
                    onEditStart={(p) => { setEditingId(p.id); setEditName(p.name) }}
                    onEditNameChange={setEditName}
                    onEditSave={handleEditSave}
                    onEditCancel={() => setEditingId(null)}
                    onDelete={initiateDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex flex-col gap-1 pt-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="New project name"
              className="flex-1 px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F] placeholder:text-[#797979]"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#19153F] text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-[12px] text-[#CC0015]">{addError}</p>}
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

const GreenDot = () => <span className="w-2 h-2 rounded-full bg-[#1B8C7A] flex-shrink-0 inline-block mt-[3px]" />
const AmberDot = () => <span className="w-2 h-2 rounded-full bg-[#B38600] flex-shrink-0 inline-block mt-[3px]" />
const RedDot = () => <span className="w-2 h-2 rounded-full bg-[#CC0015] opacity-60 flex-shrink-0 inline-block mt-[3px]" />

function TeamManagementSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
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
      window.dispatchEvent(new Event('sidebar:refresh'))
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
      window.dispatchEvent(new Event('sidebar:refresh'))
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
      if (refreshSidebar) window.dispatchEvent(new Event('sidebar:refresh'))
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
          <p className="text-[12px] font-medium text-[#595959]">Add your manager</p>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendInvitation() }}
                placeholder="manager@example.com"
                className="px-3 py-2 rounded-[6px] border border-[#DADADA] text-[13px] text-[#19153F] outline-none focus:border-[#19153F] placeholder:text-[#797979]"
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
              className="self-start px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#19153F] text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Invite manager'}
            </button>
          </div>
        </div>

        {loading && <p className="text-[13px] text-[#797979]">Loading…</p>}

        {showSeparator && <hr className="border-[#F2F2F2]" />}

        {/* ── Manager relationships ── */}
        {hasRelationships && (
          <div className="flex flex-col gap-3">
            {managing.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-[#595959]">You are managing</p>
                <div className="flex flex-col divide-y divide-[#F2F2F2]">
                  {managing.map((row) => {
                    const a = row.admin
                    const label = a ? personLabel(a.first_name, a.last_name, a.email) : row.admin_user_id
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <span className="text-[13px] text-[#19153F] truncate">{label}</span>
                        </div>
                        <button
                          disabled={acting === row.id}
                          onClick={() => setConfirmAction({
                            message: `Remove yourself as a manager for ${a?.email ?? row.admin_user_id}? You will lose access to their task list.`,
                            confirmLabel: 'Remove',
                            onConfirm: () => hardDelete(row.id, 'Removed from manager role.', true),
                          })}
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#797979] border border-[#DADADA] bg-white hover:border-[#FF0522] hover:text-[#CC0015] disabled:opacity-50"
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
                <p className="text-[12px] font-medium text-[#595959]">You are being managed by</p>
                <div className="flex flex-col divide-y divide-[#F2F2F2]">
                  {beingManaged.map((row) => {
                    const m = row.manager
                    const label = m ? personLabel(m.first_name, m.last_name, row.manager_email) : row.manager_email
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                        <div className="flex items-start gap-2 min-w-0">
                          <GreenDot />
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[13px] text-[#19153F] truncate">{label}</span>
                            {row.accepted_at && (
                              <span className="text-[11px] text-[#797979]">Since {fmtDate(row.accepted_at)}</span>
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
                          className="flex-shrink-0 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#797979] border border-[#DADADA] bg-white hover:border-[#FF0522] hover:text-[#CC0015] disabled:opacity-50"
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
                <p className="text-[12px] font-medium text-[#595959]">Pending</p>
                <div className="flex flex-col divide-y divide-[#F2F2F2]">
                  {allPending.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <AmberDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          {row.direction === 'incoming' ? (
                            <span className="text-[13px] text-[#19153F]">
                              {personLabel(row.admin?.first_name, row.admin?.last_name, row.admin?.email ?? row.admin_user_id)} wants you to manage their tasks
                            </span>
                          ) : (
                            <span className="text-[13px] text-[#19153F] truncate">{row.manager_email}</span>
                          )}
                          <span className="text-[11px] text-[#797979]">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {row.direction === 'incoming' ? (
                          <>
                            <button
                              onClick={() => handleAccept(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-[#19153F] text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleDecline(row.id)}
                              disabled={acting === row.id}
                              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#797979] border border-[#DADADA] bg-white hover:border-[#FF0522] hover:text-[#CC0015] disabled:opacity-50"
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
                            className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#797979] border border-[#DADADA] bg-white hover:border-[#FF0522] hover:text-[#CC0015] disabled:opacity-50"
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
                <p className="text-[12px] font-medium text-[#595959]">Declined</p>
                <div className="flex flex-col divide-y divide-[#F2F2F2]">
                  {declined.map((row) => (
                    <div key={row.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="flex items-start gap-2 min-w-0">
                        <RedDot />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[13px] text-[#19153F] truncate">{row.manager_email}</span>
                          <span className="text-[11px] text-[#797979]">Invited {fmtDate(row.invited_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleResend(row.id)}
                          disabled={acting === row.id}
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-[#19153F] text-white border border-transparent hover:bg-[#2e2870] disabled:opacity-50"
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
                          className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#797979] border border-[#DADADA] bg-white hover:border-[#FF0522] hover:text-[#CC0015] disabled:opacity-50"
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

// ─── Export section ───────────────────────────────────────────────────────────

function ExportSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { userId } = useAuth()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!userId) return
    setExporting(true)
    try {
      // 1. Fetch all tasks with project names
      const { data: tasksRaw, error: tasksErr } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('admin_user_id', userId)
        .order('week_start_date')
        .order('sort_order')
      if (tasksErr) throw tasksErr
      const tasks = tasksRaw ?? []
      const taskIds = tasks.map((t) => t.id)

      if (taskIds.length === 0) {
        // No tasks — still produce a headers-only CSV
        const csv = '﻿' + ['Week', 'Product', 'Project', 'Task Description', 'Notes', 'Comments', 'Status', 'Flagged'].join(',')
        triggerDownload(csv)
        return
      }

      // 2. Parallel fetch notes + comments
      const [notesRes, commentsRes] = await Promise.all([
        supabase.from('task_notes').select('*').in('task_id', taskIds),
        supabase.from('task_comments').select('*').in('task_id', taskIds).order('created_at'),
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
        const proj = task.projects as { name: string } | null
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
      triggerDownload(csv)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }

  function triggerDownload(csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tasks_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <p className="text-[13px] text-[#595959] mb-4">
        Download all your tasks, notes, and comments as a CSV file.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-2 text-[13px] font-medium bg-[#19153F] text-white rounded-[6px] border border-transparent hover:bg-[#2a2460] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting ? 'Exporting…' : 'Export to CSV'}
      </button>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SettingsView() {
  const [toasts, setToasts] = useState<Toast[]>([])

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
      <h1 className="text-base font-medium text-[#19153F]">Settings</h1>
      <SectionCard title="Account details">
        <AccountSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Projects">
        <ProjectsSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Team management">
        <TeamManagementSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Export data">
        <ExportSection onToast={addToast} />
      </SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
