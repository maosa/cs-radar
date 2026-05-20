import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/server'
import ProjectTrackerView from '@/components/project-tracker/ProjectTrackerView'
import { getCurrentWeekIndex, weekIndexToDateString } from '@/lib/weeks'
import { mapPTERow } from '@/lib/supabase/utils'

export default async function ProjectTrackerPage() {
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
        queryKey: ['project-tracker-entries', 'own', userId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('project_tracker_entries')
            .select('*, projects(name), project_tracker_comments(count)')
            .eq('admin_user_id', userId)
            .gte('week_start_date', fromDate)
            .lte('week_start_date', toDate)
            .order('week_start_date')
            .order('sort_order')
          if (error) throw error
          return data.map(mapPTERow)
        },
      }),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectTrackerView />
    </HydrationBoundary>
  )
}
