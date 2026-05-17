import type { Product } from '@/lib/supabase/types'

export interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string | null
  default_landing: import('@/lib/supabase/types').DefaultLanding
}

export interface ManagingRow {
  id: string
  admin_user_id: string
  admin: { first_name: string | null; last_name: string | null; email: string } | null
}

export interface BeingManagedRow {
  id: string
  manager_email: string
  manager_user_id: string | null
  accepted_at: string | null
  manager: { first_name: string | null; last_name: string | null } | null
}

export interface PendingIncomingRow {
  id: string
  admin_user_id: string
  manager_email: string
  invited_at: string
  admin: { first_name: string | null; last_name: string | null; email: string } | null
}

export interface PendingOutgoingRow {
  id: string
  manager_email: string
  invited_at: string
}

export interface DeclinedRow {
  id: string
  manager_email: string
  invited_at: string
}

export const PRODUCTS: { value: Product; label: string }[] = [
  { value: 'AH', label: 'Access Hub (AH)' },
  { value: 'NURO', label: 'NURO' },
  { value: 'EH', label: 'Evidence Hub (EH)' },
  { value: 'N/A', label: 'N/A' },
]
