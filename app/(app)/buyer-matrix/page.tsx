import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BuyerMatrixView from '@/components/buyer-matrix/BuyerMatrixView'
import type { ClientAccountRow } from '@/lib/supabase/types'

export default async function BuyerMatrixPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (!userId) redirect('/login')

  const [{ data: userData }, { data: accountsData }] = await Promise.all([
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
  ])

  if (!(userData as any)?.buyer_matrix_enabled) redirect('/tasks')

  return (
    <div className="flex flex-col h-full min-w-0">
      <BuyerMatrixView
        initialAccounts={(accountsData as ClientAccountRow[]) ?? []}
      />
    </div>
  )
}
