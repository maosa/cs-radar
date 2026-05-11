import type { TaskWithProject } from '@/lib/supabase/types'

export type ViewMode = 'focused' | 'expanded'
export type AnyTask = TaskWithProject

export const PRODUCT_ORDER: Record<string, number> = { AH: 0, EH: 1, NURO: 2, 'N/A': 3 }
