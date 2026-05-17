import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerLandingView from '@/components/manager/ManagerLandingView'

export default async function ManagerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: relationships, error } = await supabase
    .from('manager_relationships')
    .select('id, admin_user_id, is_favorite, is_archived')
    .eq('manager_user_id', user.id)
    .eq('status', 'accepted')

  if (error || !relationships || relationships.length === 0) {
    redirect('/tasks')
  }

  const adminUserIds = relationships.map((r) => r.admin_user_id as string)

  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, role, account_health_enabled')
    .in('id', adminUserIds)

  const usersMap = new Map((users ?? []).map((u) => [u.id, u]))

  const initialPeople = relationships.map((rel) => {
    const u = usersMap.get(rel.admin_user_id)
    return {
      id: rel.id as string,
      adminUserId: rel.admin_user_id as string,
      firstName: (u?.first_name ?? '') as string,
      lastName: (u?.last_name ?? '') as string,
      email: (u?.email ?? '') as string,
      role: (u?.role ?? '') as string,
      isFavorite: !!(rel as any).is_favorite,
      isArchived: !!(rel as any).is_archived,
      accountHealthEnabled: !!(u as any)?.account_health_enabled,
    }
  })

  return <ManagerLandingView initialPeople={initialPeople} />
}
