import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountHealthView from '@/components/account-health/AccountHealthView'
import type { ClientAccountRow } from '@/lib/supabase/types'

export default async function AccountHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (!userId) redirect('/login')

  const [{ data: userData }, { data: accountsData }] = await Promise.all([
    supabase
      .from('users')
      .select('account_health_enabled')
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

  if (!userData?.account_health_enabled) redirect('/tasks')

  return <AccountHealthView initialAccounts={(accountsData as ClientAccountRow[]) ?? []} />
}
