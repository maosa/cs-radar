'use client'

import { useEffect } from 'react'

interface DeleteConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
  title?: string
  message?: string
}

export default function DeleteConfirmModal({
  onConfirm,
  onCancel,
  deleting,
  title = 'Delete task?',
  message = 'Are you sure you want to delete this task? This action cannot be undone.',
}: DeleteConfirmModalProps) {
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
        <h2 className="text-[15px] font-medium text-navy mb-2">{title}</h2>
        <p className="text-[13px] text-text-secondary mb-6">{message}</p>
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
