import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { ProjectTrackerComment } from '@/lib/supabase/types'

function mapCommentRow(row: any, userId: string | null): ProjectTrackerComment {
  const author = row.author as { first_name: string | null; last_name: string | null } | null
  const authorName = author
    ? [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Unknown'
    : 'Unknown'
  const { author: _a, ...rest } = row
  return {
    ...rest,
    author_name: row.created_by === userId ? 'You' : authorName,
  } as ProjectTrackerComment
}

interface Options {
  entryId: string | null
  userId: string | null
}

export function useProjectTrackerComments({ entryId, userId }: Options) {
  const queryClient = useQueryClient()
  const commentsKey = ['project-tracker-comments', entryId]

  const { data: comments = [], isLoading } = useQuery({
    queryKey: commentsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tracker_comments')
        .select('*, author:created_by(first_name, last_name)')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data.map((row) => mapCommentRow(row, userId))
    },
    enabled: !!entryId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: commentsKey })

  const createCommentMutation = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const { error } = await supabase
        .from('project_tracker_comments')
        .insert({
          entry_id: entryId!,
          content,
          created_by: userId,
        })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const { error } = await supabase
        .from('project_tracker_comments')
        .update({ content, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', commentId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('project_tracker_comments')
        .delete()
        .eq('id', commentId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    comments,
    isLoading,
    createComment: (content: string) => createCommentMutation.mutate({ content }),
    updateComment: (commentId: string, content: string) =>
      updateCommentMutation.mutate({ commentId, content }),
    deleteComment: (commentId: string) => deleteCommentMutation.mutate(commentId),
    isCreating: createCommentMutation.isPending,
    isUpdating: updateCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
  }
}
