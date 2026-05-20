import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { ProjectTrackerEntry } from '@/lib/supabase/types'
import { getCurrentWeekIndex, weekIndexToDateString } from '@/lib/weeks'

function mapPTERow(row: any): ProjectTrackerEntry {
  const proj = row.projects as { name: string } | null
  const ptc = row.project_tracker_comments as { count: number }[] | null
  const { projects: _p, project_tracker_comments: _ptc, ...rest } = row
  return {
    ...rest,
    project_name: proj?.name ?? undefined,
    comment_count: Array.isArray(ptc) ? (ptc[0]?.count ?? 0) : 0,
  } as ProjectTrackerEntry
}

const WINDOW_BACK = 26
const WINDOW_FORWARD = 4
const EXPAND_THRESHOLD = 4
const EXPAND_BY = 13

type EntryPatch = Partial<Pick<ProjectTrackerEntry, 'description' | 'project_id' | 'product' | 'is_flagged'>>

interface Options {
  scope: 'own' | 'manager'
  userId: string | null
  addToast?: (msg: string, type?: 'success' | 'error') => void
}

export function useProjectTrackerEntries({ scope, userId, addToast }: Options) {
  const queryClient = useQueryClient()
  const entriesKey = ['project-tracker-entries', scope, userId]

  const todayWeekIndex = getCurrentWeekIndex()
  const [centerWeekIndex, setCenterWeekIndex] = useState(todayWeekIndex)
  const [windowStart, setWindowStart] = useState(() => Math.max(0, todayWeekIndex - WINDOW_BACK))
  const [windowEnd, setWindowEnd] = useState(() => todayWeekIndex + WINDOW_FORWARD)

  const weekRange = useMemo(() => ({
    from: weekIndexToDateString(windowStart),
    to: weekIndexToDateString(windowEnd),
  }), [windowStart, windowEnd])

  // Auto-expand window when within EXPAND_THRESHOLD weeks of either edge
  useEffect(() => {
    if (windowStart > 0 && centerWeekIndex <= windowStart + EXPAND_THRESHOLD) {
      setWindowStart((s) => Math.max(0, s - EXPAND_BY))
    }
    if (centerWeekIndex >= windowEnd - EXPAND_THRESHOLD) {
      setWindowEnd((e) => e + EXPAND_BY)
    }
  }, [centerWeekIndex, windowStart, windowEnd])

  // Pass range to queryFn via ref so the cache key stays stable across expansions
  const weekRangeRef = useRef(weekRange)
  weekRangeRef.current = weekRange

  // Invalidate when the window expands so the new boundary weeks are fetched
  const prevFromRef = useRef<string | undefined>(undefined)
  const prevToRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prevFrom = prevFromRef.current
    const prevTo = prevToRef.current
    prevFromRef.current = weekRange.from
    prevToRef.current = weekRange.to
    if (prevFrom === undefined && prevTo === undefined) return
    if (
      (prevFrom !== undefined && weekRange.from < prevFrom) ||
      (prevTo !== undefined && weekRange.to > prevTo)
    ) {
      queryClient.invalidateQueries({ queryKey: entriesKey, exact: true })
    }
  }, [weekRange.from, weekRange.to])

  const { data: entries = [], isLoading } = useQuery({
    queryKey: entriesKey,
    queryFn: async () => {
      const range = weekRangeRef.current
      const { data, error } = await supabase
        .from('project_tracker_entries')
        .select('*, projects(name), project_tracker_comments(count)')
        .eq('admin_user_id', userId)
        .gte('week_start_date', range.from)
        .lte('week_start_date', range.to)
        .order('week_start_date')
        .order('sort_order')
      if (error) throw error
      return data.map(mapPTERow)
    },
    enabled: !!userId,
  })

  const updateCache = (id: string, updater: (e: ProjectTrackerEntry) => ProjectTrackerEntry) => {
    queryClient.setQueryData<ProjectTrackerEntry[]>(entriesKey, (old) => {
      if (!old) return old
      return old.map((e) => (e.id === id ? updater(e) : e))
    })
  }

  // ── createEntry ──────────────────────────────────────────────────────────────

  const createEntryMutation = useMutation({
    mutationFn: async (payload: {
      project_id: string
      product: string
      description: string
      week_start_date: string
    }) => {
      const { error } = await supabase
        .from('project_tracker_entries')
        .insert({ admin_user_id: userId!, created_by: userId!, ...payload })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entriesKey })
      addToast?.('Project added.')
    },
    onError: () => {
      addToast?.('Failed to add project.', 'error')
    },
  })

  // ── updateEntry ──────────────────────────────────────────────────────────────

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EntryPatch }) => {
      const { error } = await supabase
        .from('project_tracker_entries')
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previousEntries = queryClient.getQueryData<ProjectTrackerEntry[]>(entriesKey)
      updateCache(id, (e) => ({ ...e, ...patch }))
      return { previousEntries }
    },
    onError: (err, variables, context) => {
      if (context?.previousEntries) queryClient.setQueryData(entriesKey, context.previousEntries)
      addToast?.('Failed to update entry.', 'error')
    },
  })

  // ── deleteEntry ──────────────────────────────────────────────────────────────

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_tracker_entries').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previousEntries = queryClient.getQueryData<ProjectTrackerEntry[]>(entriesKey)
      queryClient.setQueryData<ProjectTrackerEntry[]>(entriesKey, (old) => old?.filter((e) => e.id !== id))
      return { previousEntries }
    },
    onSuccess: () => {
      addToast?.('Project deleted.')
    },
    onError: (err, variables, context) => {
      if (context?.previousEntries) queryClient.setQueryData(entriesKey, context.previousEntries)
      addToast?.('Failed to delete project.', 'error')
    },
  })

  // ── batchUpdateSortOrder ─────────────────────────────────────────────────────

  const batchUpdateSortOrderMutation = useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[] }) => {
      const { error } = await supabase.rpc('batch_update_pte_sort_order', {
        entry_ids: orderedIds,
        sort_orders: orderedIds.map((_, i) => i),
      })
      if (error) throw error
    },
    onMutate: async ({ orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: entriesKey })
      const previousEntries = queryClient.getQueryData<ProjectTrackerEntry[]>(entriesKey)
      queryClient.setQueryData<ProjectTrackerEntry[]>(entriesKey, (old) => {
        if (!old) return old
        const weekDateStr = old.find((e) => e.id === orderedIds[0])?.week_start_date
        if (!weekDateStr) return old
        const otherEntries = old.filter((e) => e.week_start_date !== weekDateStr)
        const weekEntries = old.filter((e) => e.week_start_date === weekDateStr)
        const reordered = orderedIds
          .map((id) => weekEntries.find((e) => e.id === id))
          .filter((e): e is ProjectTrackerEntry => Boolean(e))
          .map((e, idx) => ({ ...e, sort_order: idx }))
        return [...otherEntries, ...reordered].sort((a, b) => {
          if (a.week_start_date !== b.week_start_date) {
            return a.week_start_date.localeCompare(b.week_start_date)
          }
          return a.sort_order - b.sort_order
        })
      })
      return { previousEntries }
    },
    onError: (err, variables, context) => {
      if (context?.previousEntries) queryClient.setQueryData(entriesKey, context.previousEntries)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: entriesKey })
    },
  })

  return {
    entries,
    isLoading,
    centerWeekIndex,
    setCenterWeekIndex,
    windowStart,
    windowEnd,
    weekRange,
    todayWeekIndex,
    createEntry: (payload: Parameters<typeof createEntryMutation.mutate>[0]) =>
      createEntryMutation.mutate(payload),
    updateEntry: (id: string, patch: EntryPatch) =>
      updateEntryMutation.mutate({ id, patch }),
    deleteEntry: (id: string) => deleteEntryMutation.mutate(id),
    batchUpdateSortOrder: (orderedIds: string[]) =>
      batchUpdateSortOrderMutation.mutate({ orderedIds }),
  }
}
