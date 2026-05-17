-- D1: Add admin_user_id to task_comments so realtime subscriptions can be
-- filtered by admin_user_id instead of receiving every comment event globally.

alter table public.task_comments
  add column if not exists admin_user_id uuid references public.users(id) on delete cascade;

-- Backfill existing rows from the parent task
update public.task_comments c
set admin_user_id = t.admin_user_id
from public.tasks t
where t.id = c.task_id
  and c.admin_user_id is null;

alter table public.task_comments
  alter column admin_user_id set not null;

create index if not exists task_comments_admin_user_id_idx
  on public.task_comments(admin_user_id);

-- Trigger to auto-populate admin_user_id on insert (and on task_id change)
create or replace function public.set_task_comment_admin_user_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select t.admin_user_id
  into new.admin_user_id
  from public.tasks t
  where t.id = new.task_id;

  if new.admin_user_id is null then
    raise exception 'Invalid task_id';
  end if;

  return new;
end;
$$;

drop trigger if exists set_task_comment_admin_user_id on public.task_comments;
create trigger set_task_comment_admin_user_id
before insert or update of task_id on public.task_comments
for each row execute function public.set_task_comment_admin_user_id();
