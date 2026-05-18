import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { TaskWithProject, ProjectRow } from '@/lib/supabase/types'
import { dateStringToWeekIndex, weekIndexToDateString, formatWeekHeader } from '@/lib/weeks'

// Converts a raw Supabase tasks row (with joined `projects` and `task_comments`)
// into the TaskWithProject shape used throughout the app. Used both in the hook
// queryFn and in server-side prefetch queries so the shapes always match.
export function mapTaskRow(row: any): TaskWithProject {
  const proj = row.projects as { name: string } | null
  const tc = row.task_comments as { count: number }[] | null
  const { projects: _p, task_comments: _tc, ...rest } = row
  return {
    ...rest,
    project_name: proj?.name ?? null,
    comment_count: Array.isArray(tc) ? (tc[0]?.count ?? 0) : 0,
  } as TaskWithProject
}

export function useProjectsQuery(adminUserId: string | null) {
  return useQuery({
    queryKey: ['projects', adminUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, admin_user_id, name, product, sort_order, is_visible, created_at, updated_at, deleted_at')
        .eq('admin_user_id', adminUserId)
        .is('deleted_at', null)
        .order('sort_order')
      if (error) throw error
      return data as ProjectRow[]
    },
    enabled: !!adminUserId,
  })
}

export function useTasksQuery(
  adminUserId: string | null,
  scope: 'own' | 'managed' = 'managed',
  weekRange?: { from: string; to: string },
) {
  const queryClient = useQueryClient()

  // Pass the current range to queryFn via ref — keeps the cache key stable so
  // mutations (which use the same key) continue to work with optimistic updates.
  const weekRangeRef = useRef(weekRange)
  weekRangeRef.current = weekRange

  // Live updates for manager view — invalidate cache whenever the admin's tasks change
  useEffect(() => {
    if (scope !== 'managed' || !adminUserId) return
    const channel = supabase
      .channel(`tasks:managed:${adminUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `admin_user_id=eq.${adminUserId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['tasks', 'managed', adminUserId] }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [scope, adminUserId, queryClient])

  // Live updates when comments are added or deleted by any party — keeps comment_count
  // in sync across both the owner's and manager's views without a page refresh.
  // Filtered by admin_user_id so only events for this user's tasks arrive.
  useEffect(() => {
    if (!adminUserId) return
    const channel = supabase
      .channel(`task_comments:${scope}:${adminUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `admin_user_id=eq.${adminUserId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['tasks', scope, adminUserId] }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [scope, adminUserId, queryClient])

  // Refetch when the week window expands so newly visible weeks are loaded
  const prevFromRef = useRef<string | undefined>(undefined)
  const prevToRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prevFrom = prevFromRef.current
    const prevTo = prevToRef.current
    prevFromRef.current = weekRange?.from
    prevToRef.current = weekRange?.to
    if (!weekRange || (prevFrom === undefined && prevTo === undefined)) return
    if (
      (prevFrom !== undefined && weekRange.from < prevFrom) ||
      (prevTo !== undefined && weekRange.to > prevTo)
    ) {
      queryClient.invalidateQueries({ queryKey: ['tasks', scope, adminUserId], exact: true })
    }
  }, [weekRange?.from, weekRange?.to, scope, adminUserId, queryClient])

  return useQuery({
    queryKey: ['tasks', scope, adminUserId],
    queryFn: async () => {
      const range = weekRangeRef.current
      let query = supabase
        .from('tasks')
        .select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name), task_comments(count)')
        .eq('admin_user_id', adminUserId)
        .order('week_start_date')
        .order('sort_order')
      if (range) {
        query = query.gte('week_start_date', range.from).lte('week_start_date', range.to)
      }
      const { data, error } = await query
      if (error) throw error
      return data.map(mapTaskRow)
    },
    enabled: !!adminUserId,
  })
}

export function useTasks(userId: string | null, addToast: (msg: string, type?: 'success' | 'error') => void) {
  const queryClient = useQueryClient()
  const tasksKey = ['tasks', 'own', userId]

  const updateCache = (id: string, updater: (t: TaskWithProject) => TaskWithProject) => {
    queryClient.setQueryData<TaskWithProject[]>(tasksKey, (old) => {
      if (!old) return old
      return old.map((t) => (t.id === id ? updater(t) : t))
    })
  }

  const toggleComplete = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      const task = previousTasks?.find((t) => t.id === id)
      if (task) {
        updateCache(id, (t) => ({ ...t, status: t.status === 'complete' ? 'open' : 'complete' }))
      }
      return { previousTasks }
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
      addToast('Failed to update task.', 'error')
    },
  })

  const toggleFlag = useMutation({
    mutationFn: async ({ id, newFlag }: { id: string; newFlag: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ is_flagged: newFlag, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      const task = previousTasks?.find((t) => t.id === id)
      if (task) {
        updateCache(id, (t) => ({ ...t, is_flagged: !t.is_flagged }))
      }
      return { previousTasks }
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
      addToast('Failed to update task.', 'error')
    },
  })

  const moveTask = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ week_start_date: newDate, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, newDate }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      updateCache(id, (t) => ({ ...t, week_start_date: newDate }))
      const newIndex = dateStringToWeekIndex(newDate)
      addToast(`Task moved to ${formatWeekHeader(newIndex)}.`)
      return { previousTasks }
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
      addToast('Failed to move task.', 'error')
    },
  })

  const editDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ description, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, description }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      updateCache(id, (t) => ({ ...t, description }))
      return { previousTasks }
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
      addToast('Failed to update task.', 'error')
    },
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      queryClient.setQueryData<TaskWithProject[]>(tasksKey, (old) => old?.filter((t) => t.id !== id))
      return { previousTasks }
    },
    onSuccess: () => {
      addToast('Task deleted.')
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
      addToast('Failed to delete task.', 'error')
    },
  })

  const reorderTasks = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[]; weekDateStr: string }) => {
      const { error } = await supabase.rpc('batch_update_sort_order', {
        task_ids: orderedIds,
        sort_orders: orderedIds.map((_, i) => i),
      })
      if (error) throw error
    },
    onMutate: async ({ orderedIds, weekDateStr }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey })
      const previousTasks = queryClient.getQueryData<TaskWithProject[]>(tasksKey)
      queryClient.setQueryData<TaskWithProject[]>(tasksKey, (old) => {
        if (!old) return old
        const otherTasks = old.filter((t) => t.week_start_date !== weekDateStr)
        const weekTasks = old.filter((t) => t.week_start_date === weekDateStr)
        const reordered = orderedIds
          .map((id) => weekTasks.find((t) => t.id === id))
          .filter((t): t is TaskWithProject => Boolean(t))
          .map((t, idx) => ({ ...t, sort_order: idx }))

        return [...otherTasks, ...reordered].sort((a, b) => {
          const wA = dateStringToWeekIndex(a.week_start_date)
          const wB = dateStringToWeekIndex(b.week_start_date)
          return wA !== wB ? wA - wB : a.sort_order - b.sort_order
        })
      })
      return { previousTasks }
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) queryClient.setQueryData(tasksKey, context.previousTasks)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
    },
  })

  return {
    toggleComplete: (id: string) => {
      const task = queryClient.getQueryData<TaskWithProject[]>(tasksKey)?.find((t) => t.id === id)
      if (task) toggleComplete.mutate({ id, newStatus: task.status === 'complete' ? 'open' : 'complete' })
    },
    toggleFlag: (id: string) => {
      const task = queryClient.getQueryData<TaskWithProject[]>(tasksKey)?.find((t) => t.id === id)
      if (task) toggleFlag.mutate({ id, newFlag: !task.is_flagged })
    },
    moveTask: (id: string, weeks: number) => {
      const task = queryClient.getQueryData<TaskWithProject[]>(tasksKey)?.find((t) => t.id === id)
      if (task) {
        const oldIndex = dateStringToWeekIndex(task.week_start_date)
        const newIndex = Math.max(0, oldIndex + weeks)
        if (newIndex !== oldIndex) {
          moveTask.mutate({ id, newDate: weekIndexToDateString(newIndex) })
        }
      }
    },
    editDescription: (id: string, description: string) => editDescription.mutate({ id, description }),
    deleteTask: (id: string, onDone: () => void) => deleteTask.mutate(id, { onSettled: onDone }),
    reorderTasks: (orderedIds: string[], weekDateStr: string) =>
      reorderTasks.mutate({ orderedIds, weekDateStr }),
    taskCreated: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
      addToast('Task created.')
    },
    updateTaskLocally: (id: string, fields: Partial<TaskWithProject>) => {
      queryClient.setQueryData<TaskWithProject[]>(tasksKey, (old) => {
        if (!old) return old
        return old.map((t) => (t.id === id ? { ...t, ...fields } : t))
      })
    },
  }
}
