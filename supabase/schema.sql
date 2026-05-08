-- Task Tracker — Full Database Schema
-- Run against your Supabase project via the SQL editor or CLI.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- Extends auth.users. Populated via trigger on sign-up.
-- ============================================================
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text,
  last_name     text,
  email         text not null unique,
  role          text,
  default_landing text not null default 'task_list'
                  check (default_landing in ('task_list', 'manager_view')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- Auto-insert a users row when a new auth.users record is created.
-- first_name, last_name, and role are read from raw_user_meta_data so they
-- are persisted even when email confirmation is required (no session yet).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, first_name, last_name, role, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'role',
    now()
  )
  on conflict (id) do nothing;

  -- Link any pending invitations sent to this email before the user registered.
  update public.manager_relationships
  set manager_user_id = new.id
  where manager_email = new.email
    and status = 'pending'
    and manager_user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- PROJECTS
-- Each user owns their own project list (soft delete).
-- ============================================================
create table if not exists public.projects (
  id            uuid primary key default uuid_generate_v4(),
  admin_user_id uuid not null references public.users(id) on delete cascade,
  name          text not null,
  product       text check (product in ('AH', 'NURO', 'EH', 'N/A')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);

create index if not exists projects_admin_user_id_idx on public.projects(admin_user_id);

-- ============================================================
-- MANAGER RELATIONSHIPS
-- Tracks which manager is invited to view which admin's tasks.
-- ============================================================
create table if not exists public.manager_relationships (
  id              uuid primary key default uuid_generate_v4(),
  admin_user_id   uuid not null references public.users(id) on delete cascade,
  manager_user_id uuid references public.users(id) on delete set null,
  manager_email   text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'archived')),
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz
);

create index if not exists manager_relationships_admin_idx   on public.manager_relationships(admin_user_id);
create index if not exists manager_relationships_manager_idx on public.manager_relationships(manager_user_id);

-- ============================================================
-- TASKS
-- Core task data. One row per task.
-- ============================================================
create table if not exists public.tasks (
  id             uuid primary key default uuid_generate_v4(),
  admin_user_id  uuid not null references public.users(id) on delete cascade,
  product        text not null check (product in ('AH', 'NURO', 'EH', 'N/A')),
  project_id     uuid references public.projects(id) on delete set null,
  description    text not null,
  week_start_date date not null,
  status         text not null default 'open' check (status in ('open', 'complete')),
  is_flagged     boolean not null default false,
  sort_order     integer not null default 0,
  created_by     uuid not null references public.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  updated_by     uuid references public.users(id) on delete set null
);

create index if not exists tasks_admin_user_id_idx    on public.tasks(admin_user_id);
create index if not exists tasks_week_start_date_idx  on public.tasks(week_start_date);
create index if not exists tasks_project_id_idx       on public.tasks(project_id);

-- ============================================================
-- TASK NOTES
-- One note per task (upsert on task_id).
-- ============================================================
create table if not exists public.task_notes (
  id          uuid primary key default uuid_generate_v4(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  content     text not null,
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid references public.users(id) on delete set null,
  unique (task_id)
);

-- ============================================================
-- TASK COMMENTS
-- Multiple comments per task. Full audit trail.
-- ============================================================
create table if not exists public.task_comments (
  id          uuid primary key default uuid_generate_v4(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  content     text not null,
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid references public.users(id) on delete set null
);

create index if not exists task_comments_task_id_idx on public.task_comments(task_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Policies are defined now but enforcement is gated by the
-- NEXT_PUBLIC_AUTH_ENFORCED flag in application code.
-- Enable RLS on all tables.
-- ============================================================

alter table public.users               enable row level security;
alter table public.projects            enable row level security;
alter table public.manager_relationships enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_notes          enable row level security;
alter table public.task_comments       enable row level security;

-- Users: each user can see and edit only their own row; any authenticated user
-- can read basic profile info (needed to resolve admin names in pending invitations)
create policy "users: self read"          on public.users for select using (auth.uid() = id);
create policy "users: authenticated read" on public.users for select using (auth.uid() is not null);
create policy "users: self update"        on public.users for update using (auth.uid() = id);

-- Projects: owner full access
create policy "projects: owner read"   on public.projects for select using (auth.uid() = admin_user_id);
create policy "projects: manager read" on public.projects for select
  using (
    exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = projects.admin_user_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );
create policy "projects: owner insert" on public.projects for insert with check (auth.uid() = admin_user_id);
create policy "projects: owner update" on public.projects for update using (auth.uid() = admin_user_id);
create policy "projects: owner delete" on public.projects for delete using (auth.uid() = admin_user_id);

-- Manager relationships: admin can manage; manager can read their own rows
create policy "mgr_rel: admin read"   on public.manager_relationships for select
  using (auth.uid() = admin_user_id or auth.uid() = manager_user_id);
create policy "mgr_rel: admin insert" on public.manager_relationships for insert
  with check (auth.uid() = admin_user_id);
create policy "mgr_rel: admin update" on public.manager_relationships for update
  using (auth.uid() = admin_user_id or auth.uid() = manager_user_id);
create policy "mgr_rel: delete" on public.manager_relationships for delete
  using (auth.uid() = admin_user_id or auth.uid() = manager_user_id);

-- Tasks: owner full access; accepted managers read-only
create policy "tasks: owner full" on public.tasks for all
  using (auth.uid() = admin_user_id);
create policy "tasks: manager read" on public.tasks for select
  using (
    exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = tasks.admin_user_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );

-- Task notes: owner full access; managers read-only
create policy "task_notes: owner full" on public.task_notes for all
  using (
    exists (select 1 from public.tasks t where t.id = task_notes.task_id and t.admin_user_id = auth.uid())
  );
create policy "task_notes: manager read" on public.task_notes for select
  using (
    exists (
      select 1 from public.tasks t
      join public.manager_relationships mr on mr.admin_user_id = t.admin_user_id
      where t.id = task_notes.task_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );

-- Task comments: task owner full access (including other users' comments);
-- comment author can edit/delete their own; managers can insert/edit/delete their own
create policy "task_comments: task owner full" on public.task_comments for all
  using (
    exists (select 1 from public.tasks t where t.id = task_comments.task_id and t.admin_user_id = auth.uid())
  );
create policy "task_comments: author manage" on public.task_comments for all
  using (auth.uid() = created_by);
create policy "task_comments: manager read" on public.task_comments for select
  using (
    exists (
      select 1 from public.tasks t
      join public.manager_relationships mr on mr.admin_user_id = t.admin_user_id
      where t.id = task_comments.task_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );
create policy "task_comments: manager insert" on public.task_comments for insert
  with check (
    auth.uid() = created_by and
    exists (
      select 1 from public.tasks t
      join public.manager_relationships mr on mr.admin_user_id = t.admin_user_id
      where t.id = task_comments.task_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );
