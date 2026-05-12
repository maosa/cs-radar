-- Enable Realtime for task_comments so that comment insert/delete events are
-- broadcast to subscribed clients, keeping comment_count in sync across sessions.
ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
