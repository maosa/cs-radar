-- Adds a shared person identity across buyer_matrix_contacts rows.
-- All rows for the same person (potentially spanning multiple buyer_type columns)
-- share one person_id. This allows editing data fields (name/email/role/notes)
-- once and having the change propagate to every column that person appears in.
-- DEFAULT gen_random_uuid() ensures existing rows each get a distinct person_id.

ALTER TABLE public.buyer_matrix_contacts
  ADD COLUMN person_id uuid NOT NULL DEFAULT gen_random_uuid();
