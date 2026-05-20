-- Allow managers to read ALL comments on entries they manage, not just their own.
-- Previously "ptc: manager read-own-write" (FOR ALL) only granted read access when
-- created_by = auth.uid(), so owner-posted comments were invisible to managers.
-- This mirrors the "task_comments: manager read" policy pattern.

CREATE POLICY "ptc: manager read-all"
  ON public.project_tracker_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = project_tracker_comments.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );
