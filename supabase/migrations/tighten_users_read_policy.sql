-- Tighten users read policy
-- Previously: any authenticated user could read ALL users' profiles (email, role, name).
-- Now: users can only read their own row, plus rows of people they share an accepted
-- manager relationship with, plus rows matched by pending invitations they sent.
--
-- Use cases covered:
--   • TopBar: reads own profile                          → auth.uid() = id
--   • ManagerLandingView: reads admin user names         → accepted relationship (manager→admin)
--   • Settings team section: reads manager details       → accepted relationship (admin→manager)
--   • Settings pending invite: reads invited user info   → pending invite sent by this user
--
-- Run in Supabase Dashboard → SQL Editor.

drop policy if exists "users: authenticated read" on public.users;

create policy "users: read own or related"
  on public.users for select
  using (
    -- Always allowed to read own row
    auth.uid() = id

    -- Read admins I am managing (accepted)
    or exists (
      select 1 from public.manager_relationships mr
      where mr.status = 'accepted'
        and mr.manager_user_id = auth.uid()
        and mr.admin_user_id = users.id
    )

    -- Read managers who manage me (accepted)
    or exists (
      select 1 from public.manager_relationships mr
      where mr.status = 'accepted'
        and mr.admin_user_id = auth.uid()
        and mr.manager_user_id = users.id
    )

    -- Read users I have a pending outgoing invitation for
    or exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = auth.uid()
        and mr.manager_email = users.email
        and mr.status = 'pending'
    )
  );
