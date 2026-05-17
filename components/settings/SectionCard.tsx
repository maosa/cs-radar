'use client'

import type { Product } from '@/lib/supabase/types'
import ProductBadge from '@/components/tasks/ProductBadge'

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
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

export function ProjectProductBadge({ product }: { product: Product | null }) {
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
