-- REPLICA IDENTITY FULL is required so that DELETE event payloads include
-- all columns (including admin_user_id), enabling the realtime filter
-- admin_user_id=eq.${userId} to match on deletions.
ALTER TABLE public.project_tracker_comments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'project_tracker_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tracker_comments;
  END IF;
END $$;
