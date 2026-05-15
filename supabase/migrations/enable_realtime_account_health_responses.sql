-- Enable full replica identity so realtime payloads include the complete row
-- (required for column-level filters and DELETE event payloads).
ALTER TABLE public.account_health_responses REPLICA IDENTITY FULL;

-- Add to realtime publication if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'account_health_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_health_responses;
  END IF;
END $$;
