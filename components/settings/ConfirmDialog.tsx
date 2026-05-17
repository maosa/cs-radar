'use client'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  dangerous?: boolean
}

export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Confirm', dangerous = false }: ConfirmDialogProps) {
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
