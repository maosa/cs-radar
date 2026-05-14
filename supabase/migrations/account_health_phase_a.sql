-- 1. Add account_health_enabled to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_health_enabled boolean NOT NULL DEFAULT false;

-- 2. Create client_accounts table
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  product       text CHECK (product IN ('AH', 'NURO', 'EH', 'N/A')),
  sort_order    integer NOT NULL DEFAULT 0,
  is_visible    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS client_accounts_admin_user_id_idx
  ON public.client_accounts(admin_user_id);

-- 3. RLS for client_accounts
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_accounts: owner read"
  ON public.client_accounts FOR SELECT
  USING (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: manager read"
  ON public.client_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = client_accounts.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );

CREATE POLICY "client_accounts: owner insert"
  ON public.client_accounts FOR INSERT
  WITH CHECK (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: owner update"
  ON public.client_accounts FOR UPDATE
  USING (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: owner delete"
  ON public.client_accounts FOR DELETE
  USING (auth.uid() = admin_user_id);
