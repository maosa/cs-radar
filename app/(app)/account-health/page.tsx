import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountHealthView from '@/components/account-health/AccountHealthView'

export default async function AccountHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (userId) {
    const { data } = await supabase
      .from('users')
      .select('account_health_enabled')
      .eq('id', userId)
      .single()
    if (!data?.account_health_enabled) redirect('/tasks')
  }

  return <AccountHealthView />
}
