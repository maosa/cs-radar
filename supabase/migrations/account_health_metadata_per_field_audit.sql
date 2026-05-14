-- Add per-field audit columns to account_health_metadata
ALTER TABLE public.account_health_metadata
  ADD COLUMN IF NOT EXISTS renewal_date_updated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_date_updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_engagement_date_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_engagement_date_updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engagement_type_updated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS engagement_type_updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL;
