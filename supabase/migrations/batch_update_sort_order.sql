-- Batch-update sort_order for a set of tasks in a single statement.
-- Called by the reorderTasks mutation instead of N parallel UPDATE calls.
create or replace function batch_update_sort_order(
  task_ids   uuid[],
  sort_orders int[],
  updated_by_user uuid
)
returns void
language sql
security definer
as $$
  update tasks
  set sort_order = u.sort_order,
      updated_at = now(),
      updated_by = updated_by_user
  from unnest(task_ids, sort_orders) as u(id, sort_order)
  where tasks.id = u.id;
$$;
