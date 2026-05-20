-- Task 1: Create project_tracker_entries table
-- One row per product-project entry per week per user.
-- project_id uses ON DELETE RESTRICT — blocks project deletion if entries exist.

CREATE TABLE IF NOT EXISTS public.project_tracker_entries (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  product          text NOT NULL CHECK (product IN ('AH', 'NURO', 'EH', 'N/A')),
  description      text NOT NULL CHECK (char_length(description) <= 5000),
  week_start_date  date NOT NULL,
  is_flagged       boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL
);

-- Enforce one entry per project per week per user
CREATE UNIQUE INDEX IF NOT EXISTS pte_unique_project_week
  ON public.project_tracker_entries(admin_user_id, project_id, week_start_date);

-- Query index (mirrors tasks index pattern)
CREATE INDEX IF NOT EXISTS pte_admin_week_sort_idx
  ON public.project_tracker_entries(admin_user_id, week_start_date, sort_order);

ALTER TABLE public.project_tracker_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pte: owner full"
  ON public.project_tracker_entries FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "pte: manager read"
  ON public.project_tracker_entries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.manager_relationships mr
    WHERE mr.admin_user_id = project_tracker_entries.admin_user_id
      AND mr.manager_user_id = auth.uid()
      AND mr.status = 'accepted'
  ));
