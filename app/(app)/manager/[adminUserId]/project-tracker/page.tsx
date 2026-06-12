import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerViewTabs from '@/components/manager/ManagerViewTabs'
import ManagerProjectTrackerView from '@/components/manager/ManagerProjectTrackerView'
import { getCurrentWeekIndex, weekIndexToDateString } from '@/lib/weeks'
import { mapPTERow } from '@/lib/supabase/utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ManagerProjectTrackerPage({
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
    .select('first_name, last_name, account_health_enabled, buyer_matrix_enabled')
    .eq('id', adminUserId)
    .single()

  const adminFirstName = (adminUserData?.first_name as string | null) ?? ''
  const adminLastName = (adminUserData?.last_name as string | null) ?? ''
  const adminFullName = [adminFirstName, adminLastName].filter(Boolean).join(' ')
  const accountHealthEnabled = adminUserData?.account_health_enabled ?? false
  const buyerMatrixEnabled = (adminUserData as any)?.buyer_matrix_enabled ?? false

  const todayIndex = getCurrentWeekIndex()
  const fromDate = weekIndexToDateString(Math.max(0, todayIndex - 26))
  const toDate = weekIndexToDateString(todayIndex + 4)

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['projects', adminUserId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('projects')
          .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
          .eq('admin_user_id', adminUserId)
          .is('deleted_at', null)
          .order('sort_order')
        if (error) throw error
        return data
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ['project-tracker-entries', 'manager', adminUserId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('project_tracker_entries')
          .select('*, projects(name), project_tracker_comments(count)')
          .eq('admin_user_id', adminUserId)
          .gte('week_start_date', fromDate)
          .lte('week_start_date', toDate)
          .order('week_start_date')
          .order('sort_order')
        if (error) throw error
        return data.map(mapPTERow)
      },
    }),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ManagerProjectTrackerView
          adminUserId={adminUserId}
          adminFirstName={adminFirstName}
          adminFullName={adminFullName}
          accountHealthEnabled={accountHealthEnabled}
          tabBar={<ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} buyerMatrixEnabled={buyerMatrixEnabled} />}
        />
      </HydrationBoundary>
    </div>
  )
}
