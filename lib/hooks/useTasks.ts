import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { TaskWithProject, ProjectRow } from '@/lib/supabase/types'
import { dateStringToWeekIndex, weekIndexToDateString, formatWeekHeader } from '@/lib/weeks'

export function useProjectsQuery(adminUserId: string | null) {
  return useQuery({
    queryKey: ['projects', adminUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('admin_user_id', adminUserId)
        .is('deleted_at', null)
        .order('sort_order')
      if (error) throw error
      return data as ProjectRow[]
    },
    enabled: !!adminUserId,
  })
}

export function useTasksQuery(adminUserId: string | null) {
  return useQuery({
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
        return { ...rest, project_name: proj?.name ?? null } as TaskWithProject
      })
    },
    enabled: !!adminUserId,
  })
}

export function useTasks(userId: string | null, addToast: (msg: string, type?: 'success' | 'error') => void) {
  const queryClient = useQueryClient()
  const tasksKey = ['tasks', userId]

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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKey })
    },
  })

  const reorderTasks = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[]; weekDateStr: string }) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase
            .from('tasks')
            .update({ sort_order: idx, updated_at: new Date().toISOString(), updated_by: userId })
            .eq('id', id)
        )
      )
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
