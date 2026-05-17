-- C2: Database-level uniqueness constraints for active names and invitations.
-- Partial unique indexes cover only non-deleted / active rows so soft-deleted
-- names can be reused without violating the constraint.

create unique index if not exists projects_active_unique_name_product_idx
  on public.projects(admin_user_id, lower(name), coalesce(product, ''))
  where deleted_at is null;

create unique index if not exists client_accounts_active_unique_name_product_idx
  on public.client_accounts(admin_user_id, lower(name), coalesce(product, ''))
  where deleted_at is null;

create unique index if not exists manager_relationships_active_invite_unique_idx
  on public.manager_relationships(admin_user_id, lower(manager_email))
  where status in ('pending', 'accepted');
