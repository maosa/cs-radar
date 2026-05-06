import type { Product } from '@/lib/supabase/types'

const BADGE_STYLES: Record<Product, { bg: string; text: string; label: string }> = {
  AH: { bg: '#BDC7FF', text: '#0020BA', label: 'AH' },
  EH: { bg: '#FFF7CB', text: '#7F6900', label: 'EH' },
  NURO: { bg: '#B4AFE4', text: '#19153F', label: 'NURO' },
  'N/A': { bg: '#E8E8E8', text: '#595959', label: 'N/A' },
}

export default function ProductBadge({ product }: { product: Product }) {
  const { bg, text, label } = BADGE_STYLES[product]
  return (
    <span
      style={{ backgroundColor: bg, color: text }}
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium leading-none whitespace-nowrap select-none"
    >
      {label}
    </span>
  )
}
