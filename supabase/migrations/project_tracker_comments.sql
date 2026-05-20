-- Task 2: Create project_tracker_comments table, trigger, and RLS policies.
-- admin_user_id is denormalised from the parent entry row by the trigger
-- so Realtime subscriptions can filter by admin_user_id (Task 24).

CREATE TABLE IF NOT EXISTS public.project_tracker_comments (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id         uuid NOT NULL REFERENCES public.project_tracker_entries(id) ON DELETE CASCADE,
  admin_user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content          text NOT NULL CHECK (char_length(content) <= 5000),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ptc_entry_created_idx
  ON public.project_tracker_comments(entry_id, created_at);

CREATE INDEX IF NOT EXISTS ptc_admin_user_id_idx
  ON public.project_tracker_comments(admin_user_id);

ALTER TABLE public.project_tracker_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptc: owner full"
  ON public.project_tracker_comments FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "ptc: manager read-own-write"
  ON public.project_tracker_comments FOR ALL
  USING (
    auth.uid() = admin_user_id
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.manager_relationships mr
        WHERE mr.admin_user_id = project_tracker_comments.admin_user_id
          AND mr.manager_user_id = auth.uid()
          AND mr.status = 'accepted'
      )
    )
  );

-- Trigger: auto-populate admin_user_id from the parent entry row on INSERT
CREATE OR REPLACE FUNCTION public.set_ptc_admin_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT admin_user_id INTO NEW.admin_user_id
  FROM public.project_tracker_entries
  WHERE id = NEW.entry_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ptc_admin_user_id_trigger
BEFORE INSERT ON public.project_tracker_comments
FOR EACH ROW EXECUTE FUNCTION public.set_ptc_admin_user_id();
