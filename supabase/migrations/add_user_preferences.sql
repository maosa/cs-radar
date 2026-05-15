-- Add a generic JSONB preferences column to store per-user UI preferences
-- (e.g. task_week_sort_modes). Existing rows get an empty object by default.
alter table public.users
  add column if not exists preferences jsonb not null default '{}';
