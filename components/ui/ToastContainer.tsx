'use client'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-[6px] text-[13px] font-medium shadow-lg border ${
            t.type === 'error'
              ? 'bg-white border-red-flag text-red-dark'
              : 'bg-navy border-transparent text-white'
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
