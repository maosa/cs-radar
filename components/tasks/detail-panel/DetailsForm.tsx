'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatWeekHeader } from '@/lib/weeks'
import type { Product, ProjectRow } from './types'

export interface DetailsFormProps {
  form: {
    description: string
    product: Product
    projectId: string | null
    weekIndex: number
  }
  projects: ProjectRow[]
  readOnly: boolean
  onProductChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onProjectChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onWeekStep: (delta: number) => void
}

export default function DetailsForm({
  form,
  projects,
  readOnly,
  onProductChange,
  onProjectChange,
  onWeekStep,
}: DetailsFormProps) {
  return (
    <div className={`p-4 border-b border-border${readOnly ? ' opacity-50' : ''}`}>
      <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-3">Details</h3>
      <div className="flex flex-col gap-3">

        {/* Product */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Product</span>
          <select
            value={form.product}
            onChange={onProductChange}
            disabled={readOnly}
            className={`flex-1 h-8 pl-2 pr-7 text-[13px] border border-border rounded-[6px] text-navy focus:outline-none focus:border-navy-mid ${readOnly ? 'bg-bg cursor-not-allowed' : 'bg-white'}`}
          >
            <option value="AH">Access Hub (AH)</option>
            <option value="NURO">NURO</option>
            <option value="EH">Evidence Hub (EH)</option>
            <option value="N/A">N/A (Not Applicable)</option>
          </select>
        </div>

        {/* Project */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Project</span>
          <select
            value={form.projectId ?? ''}
            onChange={onProjectChange}
            disabled={readOnly}
            className={`flex-1 h-8 pl-2 pr-7 text-[13px] border border-border rounded-[6px] text-navy focus:outline-none focus:border-navy-mid ${readOnly ? 'bg-bg cursor-not-allowed' : 'bg-white'}`}
          >
            <option value="">No project</option>
            {projects
              .filter((p) => p.product === form.product || p.product === null || p.id === form.projectId)
              .map((p) => {
                const isMismatch = p.id === form.projectId && p.product !== null && p.product !== form.product
                return (
                  <option key={p.id} value={p.id}>
                    {isMismatch ? `${p.name} (other product)` : p.name}
                  </option>
                )
              })}
          </select>
        </div>

        {/* Week */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-secondary w-16 flex-shrink-0">Week</span>
          <div className="flex items-center gap-1 flex-1">
            <button
              onClick={() => onWeekStep(-1)}
              disabled={readOnly || form.weekIndex <= 0}
              className="p-1 rounded text-text-secondary disabled:opacity-30 transition-colors"
              title="Previous week"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="flex-1 text-center text-[12px] text-navy">
              {formatWeekHeader(form.weekIndex)}
            </span>
            <button
              onClick={() => onWeekStep(1)}
              disabled={readOnly}
              className="p-1 rounded text-text-secondary disabled:opacity-30 transition-colors"
              title="Next week"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
