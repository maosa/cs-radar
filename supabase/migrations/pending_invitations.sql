-- ============================================================
-- Migration: Manager invitation accept/decline flow
-- Run in the Supabase SQL editor.
-- ============================================================
-- NOTE: "users: authenticated read" policy already exists — skipped.

-- Extend handle_new_user() to back-fill manager_user_id on any
-- pending invitations that were sent before the manager registered.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, first_name, last_name, role, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'role',
    now()
  )
  on conflict (id) do nothing;

  -- Link any pending invitations sent to this email before the user registered.
  update public.manager_relationships
  set manager_user_id = new.id
  where manager_email = new.email
    and status = 'pending'
    and manager_user_id is null;

  return new;
end;
$$;
