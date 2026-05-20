-- Batch-update sort_order for a set of project_tracker_entries in a single statement.
-- Mirrors batch_update_sort_order for tasks.
CREATE OR REPLACE FUNCTION batch_update_pte_sort_order(
  entry_ids   uuid[],
  sort_orders int[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE project_tracker_entries
  SET sort_order = u.sort_order,
      updated_at = now()
  FROM unnest(entry_ids, sort_orders) AS u(id, sort_order)
  WHERE project_tracker_entries.id = u.id;
$$;
