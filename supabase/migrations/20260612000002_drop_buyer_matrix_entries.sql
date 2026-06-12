-- buyer_matrix_entries (free-text columns per account) has been superseded by
-- buyer_matrix_contacts (structured per-person records). Data was exported to CSV
-- before this table was dropped. Dropping also removes it from the realtime
-- publication and any associated RLS policies automatically.

DROP TABLE IF EXISTS public.buyer_matrix_entries;
