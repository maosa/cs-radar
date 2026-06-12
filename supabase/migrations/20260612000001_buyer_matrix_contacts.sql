-- Replaces free-text buyer_matrix_entries with structured per-person contact records.
-- One row per person: buyer_type categorises them into one of the six matrix columns,
-- full_name is required, all other fields are optional.
-- sort_order enables per-column drag-and-drop ordering.

CREATE TABLE public.buyer_matrix_contacts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid        NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_type        text        NOT NULL CHECK (
    buyer_type IN (
      'economic_buyer', 'technical_buyer', 'user_buyer',
      'coach_champion', 'gatekeeper', 'influencer'
    )
  ),
  full_name         text        NOT NULL,
  email             text,
  role              text,
  additional_details text,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  updated_by        uuid        REFERENCES auth.users(id)
);

ALTER TABLE public.buyer_matrix_contacts ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "owner_all" ON public.buyer_matrix_contacts
  FOR ALL USING (auth.uid() = admin_user_id);

-- Accepted managers can read
CREATE POLICY "manager_read" ON public.buyer_matrix_contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships
      WHERE admin_user_id  = buyer_matrix_contacts.admin_user_id
        AND manager_user_id = auth.uid()
        AND status          = 'accepted'
    )
  );

ALTER TABLE public.buyer_matrix_contacts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buyer_matrix_contacts;
