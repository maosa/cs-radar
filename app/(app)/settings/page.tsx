import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsView from '@/components/settings/SettingsView'
import type { DefaultLanding } from '@/lib/supabase/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: userData }, { data: relData }] = await Promise.all([
    supabase
      .from('users')
      .select('id, first_name, last_name, email, role, default_landing, account_health_enabled, buyer_matrix_enabled')
      .eq('id', user.id)
      .single(),
    supabase
      .from('manager_relationships')
      .select('id')
      .eq('manager_user_id', user.id)
      .eq('status', 'accepted')
      .limit(1),
  ])

  const initialProfile = userData
    ? {
        id: userData.id as string,
        first_name: userData.first_name as string | null,
        last_name: userData.last_name as string | null,
        email: userData.email as string,
        role: userData.role as string | null,
        default_landing: (userData.default_landing ?? 'task_list') as DefaultLanding,
        account_health_enabled: !!(userData as any).account_health_enabled,
        buyer_matrix_enabled: !!(userData as any).buyer_matrix_enabled,
      }
    : null

  const initialHasManagerRole = Array.isArray(relData) && relData.length > 0

  return (
    <SettingsView
      initialProfile={initialProfile}
      initialHasManagerRole={initialHasManagerRole}
    />
  )
}
