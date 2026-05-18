import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerTaskView from '@/components/manager/ManagerTaskView'
import { getCurrentWeekIndex, weekIndexToDateString } from '@/lib/weeks'
import { mapTaskRow } from '@/lib/hooks/useTasks'

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

  const { data: adminUserData } = await supabase
    .from('users')
    .select('account_health_enabled')
    .eq('id', adminUserId)
    .single()
  const accountHealthEnabled = adminUserData?.account_health_enabled ?? false

  // Match the same initial window used by TaskTableView so the prefetched data
  // is consumed directly by the client query without a redundant refetch.
  const todayIndex = getCurrentWeekIndex()
  const fromDate = weekIndexToDateString(Math.max(0, todayIndex - 26))
  const toDate = weekIndexToDateString(todayIndex + 4)

  await queryClient.prefetchQuery({
    queryKey: ['tasks', 'managed', adminUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name), task_comments(count)')
        .eq('admin_user_id', adminUserId)
        .gte('week_start_date', fromDate)
        .lte('week_start_date', toDate)
        .order('week_start_date')
        .order('sort_order')
      if (error) throw error
      return data.map(mapTaskRow)
    },
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ManagerTaskView adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} />
    </HydrationBoundary>
  )
}
