import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import ManagerTaskView from '@/components/manager/ManagerTaskView'

export default async function ManagerTaskPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>
}) {
  const { adminUserId } = await params
  
  const queryClient = new QueryClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (userId) {
    await queryClient.prefetchQuery({
      queryKey: ['tasks', adminUserId],
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
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ManagerTaskView adminUserId={adminUserId} />
    </HydrationBoundary>
  )
}
