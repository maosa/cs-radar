-- Allow an authenticated user to insert their own row into public.users.
-- This is needed as a defensive fallback in the login flow: if the
-- handle_new_user trigger failed to create the row at signup time, the
-- login page can upsert it directly from the client.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'users'
      and policyname = 'users: self insert'
  ) then
    create policy "users: self insert"
      on public.users for insert
      with check (auth.uid() = id);
  end if;
end;
$$;

-- Backfill any auth.users rows that are missing from public.users
-- (covers accounts created before the trigger was in place).
insert into public.users (id, email, first_name, last_name, role, created_at)
select
  au.id,
  au.email,
  au.raw_user_meta_data->>'first_name',
  au.raw_user_meta_data->>'last_name',
  au.raw_user_meta_data->>'role',
  au.created_at
from auth.users au
left join public.users pu on au.id = pu.id
where pu.id is null
on conflict (id) do nothing;
