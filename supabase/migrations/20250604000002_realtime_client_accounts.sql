-- Enable realtime on client_accounts so Buyer Matrix pages can react
-- to reordering, visibility changes, and additions without a page refresh.
ALTER TABLE public.client_accounts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'client_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_accounts;
  END IF;
END $$;
