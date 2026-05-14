-- account_health_metadata table
CREATE TABLE IF NOT EXISTS public.account_health_metadata (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id    uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  renewal_date         date,
  last_engagement_date date,
  engagement_type      text CHECK (engagement_type IN (
                         'monthly_review', 'qbr', 'training',
                         'project_call', 'spontaneous', 'other'
                       )),
  updated_at           timestamptz,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id)
);

-- RLS
ALTER TABLE public.account_health_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ah_metadata: owner full"
  ON public.account_health_metadata FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "ah_metadata: manager read"
  ON public.account_health_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = account_health_metadata.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );
