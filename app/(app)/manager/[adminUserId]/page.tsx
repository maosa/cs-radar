import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerTaskView from '@/components/manager/ManagerTaskView'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ManagerTaskPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>
}) {
  const { adminUserId } = await params

  if (!UUID_RE.test(adminUserId)) redirect('/manager')

  const queryClient = new QueryClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (!userId) redirect('/login')

  // Verify the logged-in user is an accepted manager for this admin
  const { data: rel } = await supabase
    .from('manager_relationships')
    .select('id')
    .eq('admin_user_id', adminUserId)
    .eq('manager_user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!rel) redirect('/manager')

  await queryClient.prefetchQuery({
    queryKey: ['tasks', 'managed', adminUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('admin_user_id', adminUserId)
        .order('week_start_date')
        .order('sort_order')
      if (error) throw error
      return data.map((row: any) => {
        const proj = row.projects as { name: string } | null
        const { projects: _p, ...rest } = row
        return { ...rest, project_name: proj?.name ?? null }
      })
    },
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ManagerTaskView adminUserId={adminUserId} />
    </HydrationBoundary>
  )
}
