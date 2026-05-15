-- Allows accepted managers to upsert only the client_partner_comment field on
-- account_health_responses for admins they manage.
--
-- A direct UPDATE policy would be too permissive (managers could modify every
-- column). Using a security-definer RPC restricts writes to the three
-- client-partner fields plus the shared updated_at/updated_by audit columns.

create or replace function public.upsert_client_partner_comment(
  p_client_account_id uuid,
  p_admin_user_id       uuid,
  p_month               text,
  p_question_id         text,
  p_comment             text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be the admin themselves or an accepted manager for that admin.
  if caller <> p_admin_user_id then
    if not exists (
      select 1 from public.manager_relationships mr
      where mr.manager_user_id = caller
        and mr.admin_user_id   = p_admin_user_id
        and mr.status          = 'accepted'
    ) then
      raise exception 'Not authorised to edit this comment';
    end if;
  end if;

  insert into public.account_health_responses (
    client_account_id,
    admin_user_id,
    month,
    question_id,
    client_partner_comment,
    client_partner_updated_at,
    client_partner_updated_by,
    updated_at,
    updated_by
  )
  values (
    p_client_account_id,
    p_admin_user_id,
    p_month::date,
    p_question_id,
    p_comment,
    now(),
    caller,
    now(),
    caller
  )
  on conflict (client_account_id, month, question_id)
  do update set
    client_partner_comment    = excluded.client_partner_comment,
    client_partner_updated_at = excluded.client_partner_updated_at,
    client_partner_updated_by = excluded.client_partner_updated_by,
    updated_at                = excluded.updated_at,
    updated_by                = excluded.updated_by;
end;
$$;

revoke all   on function public.upsert_client_partner_comment(uuid, uuid, text, text, text) from public;
grant execute on function public.upsert_client_partner_comment(uuid, uuid, text, text, text) to authenticated;
