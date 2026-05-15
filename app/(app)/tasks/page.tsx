import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import TasksView from '@/components/tasks/TasksView'
import { getCurrentWeekIndex, weekIndexToDateString } from '@/lib/weeks'

export default async function TasksPage() {
  const queryClient = new QueryClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (userId) {
    const todayIndex = getCurrentWeekIndex()
    const fromDate = weekIndexToDateString(Math.max(0, todayIndex - 26))
    const toDate = weekIndexToDateString(todayIndex + 4)

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['projects', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('projects')
            .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
            .eq('admin_user_id', userId)
            .is('deleted_at', null)
            .order('sort_order')
          if (error) throw error
          return data
        },
      }),
      queryClient.prefetchQuery({
        queryKey: ['tasks', 'own', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('tasks')
            .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name), task_comments(count)')
            .eq('admin_user_id', userId)
            .gte('week_start_date', fromDate)
            .lte('week_start_date', toDate)
            .order('week_start_date')
            .order('sort_order')
          if (error) throw error
          return data.map((row: any) => {
            const proj = row.projects as { name: string } | null
            const tc = row.task_comments as { count: number }[] | null
            const { projects: _p, task_comments: _tc, ...rest } = row
            return {
              ...rest,
              project_name: proj?.name ?? null,
              comment_count: Array.isArray(tc) ? (tc[0]?.count ?? 0) : 0,
            }
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
