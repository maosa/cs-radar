-- Harden batch_update_sort_order: use auth.uid() instead of trusting the
-- caller-supplied updated_by_user, restrict updates to owned tasks, validate
-- input lengths, and set a safe search path.
create or replace function public.batch_update_sort_order(
  task_ids    uuid[],
  sort_orders int[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller          uuid := auth.uid();
  requested_count int  := coalesce(array_length(task_ids, 1), 0);
  updated_count   int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if requested_count = 0 then
    return;
  end if;

  if requested_count <> coalesce(array_length(sort_orders, 1), 0) then
    raise exception 'task_ids and sort_orders must have the same length';
  end if;

  update public.tasks t
  set sort_order = u.sort_order,
      updated_at = now(),
      updated_by = caller
  from unnest(task_ids, sort_orders) as u(id, sort_order)
  where t.id = u.id
    and t.admin_user_id = caller;

  get diagnostics updated_count = row_count;

  if updated_count <> requested_count then
    raise exception 'One or more tasks are not accessible';
  end if;
end;
$$;

-- Drop the old 3-argument signature if it still exists
drop function if exists public.batch_update_sort_order(uuid[], int[], uuid);

revoke all on function public.batch_update_sort_order(uuid[], int[]) from public;
grant execute on function public.batch_update_sort_order(uuid[], int[]) to authenticated;
