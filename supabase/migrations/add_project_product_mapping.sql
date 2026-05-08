-- Add product mapping to projects table.
-- Existing projects default to null (appear in all product dropdowns for backward compatibility).
alter table public.projects
  add column if not exists product text
  check (product in ('AH', 'NURO', 'EH', 'N/A'));
