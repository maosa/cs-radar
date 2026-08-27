-- Batch-update sort_order for buyer_matrix_stakeholders in a single statement.
--
-- Follows the hardened batch_update_sort_order (tasks) pattern rather than the
-- older loose ones: trusts auth.uid() instead of a caller-supplied user id,
-- restricts the update to rows the caller owns, validates input lengths, and
-- pins search_path.
--
-- One statement matters here beyond efficiency: N parallel single-row UPDATEs
-- each echo back through the realtime channel, and interleaved echoes can
-- deliver a row still carrying its pre-update sort_order after the new one has
-- already been applied locally, making dragged rows jump back.

CREATE OR REPLACE FUNCTION public.batch_update_bms_sort_order(
  stakeholder_ids uuid[],
  sort_orders     int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller          uuid := auth.uid();
  requested_count int  := coalesce(array_length(stakeholder_ids, 1), 0);
  updated_count   int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF requested_count = 0 THEN
    RETURN;
  END IF;

  IF requested_count <> coalesce(array_length(sort_orders, 1), 0) THEN
    RAISE EXCEPTION 'stakeholder_ids and sort_orders must have the same length';
  END IF;

  UPDATE public.buyer_matrix_stakeholders s
  SET sort_order = u.sort_order,
      updated_at = now(),
      updated_by = caller
  FROM unnest(stakeholder_ids, sort_orders) AS u(id, sort_order)
  WHERE s.id = u.id
    AND s.admin_user_id = caller;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> requested_count THEN
    RAISE EXCEPTION 'One or more stakeholders are not accessible';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_update_bms_sort_order(uuid[], int[]) FROM public;
GRANT EXECUTE ON FUNCTION public.batch_update_bms_sort_order(uuid[], int[]) TO authenticated;
