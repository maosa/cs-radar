-- Add buyer_matrix_enabled flag to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS buyer_matrix_enabled boolean NOT NULL DEFAULT false;

-- Buyer matrix entries (one row per client account)
CREATE TABLE IF NOT EXISTS public.buyer_matrix_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  economic_buyer    text,
  technical_buyer   text,
  user_buyer        text,
  coach_champion    text,
  gatekeeper        text,
  influencer        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  updated_by        uuid,
  UNIQUE (client_account_id)
);

ALTER TABLE public.buyer_matrix_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.buyer_matrix_entries
  FOR ALL USING (auth.uid() = admin_user_id);

CREATE POLICY "manager_read" ON public.buyer_matrix_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships
      WHERE admin_user_id = buyer_matrix_entries.admin_user_id
        AND manager_user_id = auth.uid()
        AND status = 'accepted'
    )
  );

-- Enable realtime
ALTER TABLE public.buyer_matrix_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'buyer_matrix_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.buyer_matrix_entries;
  END IF;
END $$;
