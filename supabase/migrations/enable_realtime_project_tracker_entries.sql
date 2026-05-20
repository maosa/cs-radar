-- REPLICA IDENTITY FULL ensures DELETE event payloads include admin_user_id
-- so the realtime filter admin_user_id=eq.${userId} matches on row deletions.
ALTER TABLE public.project_tracker_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'project_tracker_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tracker_entries;
  END IF;
END $$;
