'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { ProjectRow, ProjectTrackerEntry } from '@/lib/supabase/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: {
    project_id: string
    product: string
    description: string
    week_start_date: string
  }) => void
  targetWeek: Date
  existingEntries: ProjectTrackerEntry[]
  projects: ProjectRow[]
}

function toISODateString(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AddProjectModal({
  isOpen,
  onClose,
  onCreate,
  targetWeek,
  existingEntries,
  projects,
}: Props) {
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset form each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setProjectId('')
      setDescription('')
      setSaving(false)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const weekDateStr = toISODateString(targetWeek)
  const weekLabel = `Week of ${targetWeek.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`

  const visibleProjects = [...projects]
    .filter((p) => p.is_visible !== false)
    .sort((a, b) => a.sort_order - b.sort_order)

  const selectedProject = visibleProjects.find((p) => p.id === projectId) ?? null

  const duplicate = projectId
    ? existingEntries.find((e) => e.project_id === projectId) ?? null
    : null

  const duplicateLabel = duplicate && selectedProject
    ? `${selectedProject.product ?? 'N/A'} - ${selectedProject.name}`
    : null

  const canSave = !!projectId && !!description.trim() && !duplicate && !saving

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave || !selectedProject) return
    setSaving(true)
    onCreate({
      project_id: projectId,
      product: selectedProject.product ?? 'N/A',
      description: description.trim(),
      week_start_date: weekDateStr,
    })
  }

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={handleBackdrop}
    >
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-lg mx-4 p-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-[15px] font-medium text-navy">Add project</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg text-text-muted hover:text-navy transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <p className="text-[12px] text-text-muted mb-5">{weekLabel}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Project dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              autoFocus
              className="pl-3 pr-7 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy-mid"
            >
              <option value="">Select project…</option>
              {visibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product ?? 'N/A'} - {p.name}
                </option>
              ))}
            </select>
            {duplicateLabel && (
              <p className="text-[12px] text-red-dark">
                An entry for {duplicateLabel} already exists this week. You can edit it using the pencil icon in the table.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening with this project this week? Include progress, blockers, and anything you need help with."
              maxLength={5000}
              rows={6}
              className="px-3 py-2 text-[13px] border border-border rounded-[6px] bg-white text-navy focus:outline-none focus:border-navy-mid placeholder:text-text-muted resize-none leading-relaxed"
            />
            <p className="text-[11px] text-text-muted text-right">
              {description.length.toLocaleString()}/5,000
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy transition-colors bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="px-4 py-2 text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save project'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
