create index if not exists tasks_admin_week_sort_idx
  on public.tasks(admin_user_id, week_start_date, sort_order);

create index if not exists projects_admin_deleted_sort_idx
  on public.projects(admin_user_id, deleted_at, sort_order);

create index if not exists client_accounts_admin_deleted_sort_idx
  on public.client_accounts(admin_user_id, deleted_at, sort_order);

create index if not exists manager_relationships_manager_status_idx
  on public.manager_relationships(manager_user_id, status);

create index if not exists manager_relationships_admin_status_idx
  on public.manager_relationships(admin_user_id, status);

create index if not exists manager_relationships_admin_email_status_idx
  on public.manager_relationships(admin_user_id, manager_email, status);

create index if not exists task_comments_task_created_idx
  on public.task_comments(task_id, created_at);

create index if not exists account_health_metadata_client_idx
  on public.account_health_metadata(client_account_id);

create index if not exists account_health_metadata_admin_idx
  on public.account_health_metadata(admin_user_id);

create index if not exists ahr_admin_month_idx
  on public.account_health_responses(admin_user_id, month);
