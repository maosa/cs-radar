-- Allow stakeholders with no roles assigned yet.
--
-- 20260612000004 added buyer_matrix_stakeholders_has_role to mirror the
-- "at least one column" rule the modal enforced at the time. That rule is being
-- dropped: a stakeholder who matters but has not been classified yet is a real
-- state worth representing, and renders as a row of six dashes.
--
-- The old restriction was inherited from buyer_matrix_contacts, where a person
-- with no roles could not exist at all — no row meant they vanished from the
-- page. One row per stakeholder represents them fine, so the rule is now
-- arbitrary.
--
-- Purely permissive: no existing row can violate the looser constraint, so this
-- cannot fail on live data.

ALTER TABLE public.buyer_matrix_stakeholders
  DROP CONSTRAINT IF EXISTS buyer_matrix_stakeholders_has_role;
