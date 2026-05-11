'use client'

export interface DetailPanelFooterProps {
  isDirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

export default function DetailPanelFooter({ isDirty, saving, onSave, onDiscard }: DetailPanelFooterProps) {
  if (!isDirty) return null

  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-white">
      <span className="text-[12px] text-text-muted">Unsaved changes</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onDiscard}
          disabled={saving}
          className="px-2.5 py-1 text-[12px] font-medium border border-border rounded-[6px] text-text-secondary hover:border-border-hover hover:text-navy bg-white disabled:opacity-40 transition-colors"
        >
          Discard
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-2.5 py-1 text-[12px] font-medium bg-navy text-white rounded-[6px] hover:bg-navy-hover disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
