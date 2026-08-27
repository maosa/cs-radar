-- Buyer Matrix: one row per stakeholder, with six boolean role flags.
--
-- Replaces buyer_matrix_contacts (one row per person-per-role, tied together by
-- a shared person_id). That shape existed only to support the old layout, where
-- each of the six buyer types was its own column of names and a person holding
-- three roles appeared as three separate cards. The page now renders one row per
-- person with a check/dash indicator per role, so the data matches the UI 1:1
-- and the person_id propagation layer is retired.
--
-- buyer_matrix_contacts is dropped in a separate later migration so this pivot
-- can be verified against live data first.

CREATE TABLE IF NOT EXISTS public.buyer_matrix_stakeholders (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id  uuid        NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          text        NOT NULL,
  email              text,
  role               text,
  additional_details text,
  economic_buyer     boolean     NOT NULL DEFAULT false,
  technical_buyer    boolean     NOT NULL DEFAULT false,
  user_buyer         boolean     NOT NULL DEFAULT false,
  coach_champion     boolean     NOT NULL DEFAULT false,
  gatekeeper         boolean     NOT NULL DEFAULT false,
  influencer         boolean     NOT NULL DEFAULT false,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz,
  updated_by         uuid        REFERENCES auth.users(id),
  -- Mirrors the "at least one column" rule enforced in AddEditContactModal.
  -- Without it a row with every flag false is reachable via a direct write and
  -- renders as a phantom all-dashes stakeholder.
  CONSTRAINT buyer_matrix_stakeholders_has_role CHECK (
    economic_buyer OR technical_buyer OR user_buyer
    OR coach_champion OR gatekeeper OR influencer
  )
);

-- Leading client_account_id serves both the page query
-- (admin_user_id = ? AND client_account_id = ? ORDER BY sort_order) and the
-- ON DELETE CASCADE from client_accounts, which would otherwise seq-scan.
CREATE INDEX IF NOT EXISTS buyer_matrix_stakeholders_account_idx
  ON public.buyer_matrix_stakeholders (client_account_id, sort_order);

ALTER TABLE public.buyer_matrix_stakeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.buyer_matrix_stakeholders
  FOR ALL USING (auth.uid() = admin_user_id);

CREATE POLICY "manager_read" ON public.buyer_matrix_stakeholders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships
      WHERE admin_user_id   = buyer_matrix_stakeholders.admin_user_id
        AND manager_user_id = auth.uid()
        AND status          = 'accepted'
    )
  );

-- REPLICA IDENTITY FULL is required: the client's realtime filter is
-- admin_user_id=eq.<uid>, and DELETE payloads only carry that column under FULL.
ALTER TABLE public.buyer_matrix_stakeholders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'buyer_matrix_stakeholders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.buyer_matrix_stakeholders;
  END IF;
END $$;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Pivots buyer_matrix_contacts by person_id: one output row per person, with a
-- role flag set for every buyer_type they appeared under.
--
-- Guarded on the target being empty so a retry or a replay of this file cannot
-- double every stakeholder (the INSERT has no natural key to conflict on), and
-- on the source table still existing so this runs cleanly on a fresh database.
--
-- CAVEAT: person_id was added in 20260612000003 as a bare
-- "ADD COLUMN person_id uuid NOT NULL DEFAULT gen_random_uuid()" with no
-- follow-up grouping pass, so every row predating that migration received its
-- own distinct person_id. Rows that represented the same human before then
-- pivot into separate single-role stakeholders with duplicate names. Grouping on
-- name/email instead was rejected: it would silently merge two genuinely
-- different people who share a name. Expect to merge duplicates by hand after
-- this runs, before dropping the source table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.buyer_matrix_stakeholders)
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'buyer_matrix_contacts'
     )
  THEN
    INSERT INTO public.buyer_matrix_stakeholders (
      client_account_id, admin_user_id, full_name, email, role, additional_details,
      economic_buyer, technical_buyer, user_buyer, coach_champion, gatekeeper, influencer,
      sort_order, created_at, updated_at, updated_by)
    SELECT
      client_account_id,
      admin_user_id,
      -- Data fields were kept identical across a person's rows by the old
      -- propagation logic, so the earliest row is representative.
      (array_agg(full_name          ORDER BY created_at))[1],
      (array_agg(email              ORDER BY created_at))[1],
      (array_agg(role               ORDER BY created_at))[1],
      (array_agg(additional_details ORDER BY created_at))[1],
      bool_or(buyer_type = 'economic_buyer'),
      bool_or(buyer_type = 'technical_buyer'),
      bool_or(buyer_type = 'user_buyer'),
      bool_or(buyer_type = 'coach_champion'),
      bool_or(buyer_type = 'gatekeeper'),
      bool_or(buyer_type = 'influencer'),
      min(sort_order),
      min(created_at),
      max(updated_at),
      (array_agg(updated_by ORDER BY created_at))[1]
    FROM public.buyer_matrix_contacts
    GROUP BY person_id, client_account_id, admin_user_id;

    -- Old sort_order was scoped per buyer_type, so min(sort_order) collides
    -- across people. Renumber densely within each account.
    WITH ranked AS (
      SELECT id, row_number() OVER (
        PARTITION BY client_account_id
        ORDER BY sort_order, created_at, full_name) - 1 AS rn
      FROM public.buyer_matrix_stakeholders
    )
    UPDATE public.buyer_matrix_stakeholders s
    SET sort_order = r.rn
    FROM ranked r
    WHERE s.id = r.id;
  END IF;
END $$;
