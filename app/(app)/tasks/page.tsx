import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import TasksView from '@/components/tasks/TasksView'

export default async function TasksPage() {
  const queryClient = new QueryClient()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (userId) {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['projects', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('admin_user_id', userId)
            .is('deleted_at', null)
            .order('sort_order')
          if (error) throw error
          return data
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['tasks', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('tasks')
            .select('*, projects(name)')
            .eq('admin_user_id', userId)
            .order('week_start_date')
            .order('sort_order')
          if (error) throw error
          return data.map((row: any) => {
            const proj = row.projects as { name: string } | null
            const { projects: _p, ...rest } = row
            return { ...rest, project_name: proj?.name ?? null }
          })
        },
      }),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TasksView />
    </HydrationBoundary>
  )
}
