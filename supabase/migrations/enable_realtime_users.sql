-- Enable Realtime on the users table so managers can receive live preference
-- updates (e.g. project tracker sort mode changes) without a page reload.
-- The existing RLS policy "users: read own or related" already restricts which
-- rows each subscriber can receive, so no additional security changes are needed.
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
