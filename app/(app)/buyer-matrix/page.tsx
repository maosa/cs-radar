import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BuyerMatrixView from '@/components/buyer-matrix/BuyerMatrixView'
import type { ClientAccountRow, BuyerMatrixEntry } from '@/lib/supabase/types'

export default async function BuyerMatrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (!userId) redirect('/login')

  const [{ data: userData }, { data: accountsData }, { data: entriesData }] = await Promise.all([
    supabase
      .from('users')
      .select('buyer_matrix_enabled')
      .eq('id', userId)
      .single(),
    supabase
      .from('client_accounts')
      .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
      .eq('admin_user_id', userId)
      .eq('is_visible', true)
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('buyer_matrix_entries')
      .select('id, client_account_id, admin_user_id, economic_buyer, technical_buyer, user_buyer, coach_champion, gatekeeper, influencer, created_at, updated_at, updated_by')
      .eq('admin_user_id', userId),
  ])

  if (!(userData as any)?.buyer_matrix_enabled) redirect('/tasks')

  return (
    <BuyerMatrixView
      initialAccounts={(accountsData as ClientAccountRow[]) ?? []}
      initialEntries={(entriesData as BuyerMatrixEntry[]) ?? []}
    />
  )
}
