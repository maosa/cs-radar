-- C3: Text length constraints on important free-text fields.
-- Each block uses DO/EXCEPTION for idempotency so re-running is safe.

do $$ begin
  alter table public.projects
    add constraint projects_name_length_chk check (char_length(name) <= 200);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.client_accounts
    add constraint client_accounts_name_length_chk check (char_length(name) <= 200);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_description_length_chk check (char_length(description) <= 2000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.task_notes
    add constraint task_notes_content_length_chk check (char_length(content) <= 20000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.task_comments
    add constraint task_comments_content_length_chk check (char_length(content) <= 5000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.account_health_responses
    add constraint account_health_cs_comment_length_chk
    check (cs_lead_comment is null or char_length(cs_lead_comment) <= 5000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.account_health_responses
    add constraint account_health_cp_comment_length_chk
    check (client_partner_comment is null or char_length(client_partner_comment) <= 5000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.users
    add constraint users_first_name_length_chk
    check (first_name is null or char_length(first_name) <= 100);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.users
    add constraint users_last_name_length_chk
    check (last_name is null or char_length(last_name) <= 100);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.users
    add constraint users_role_length_chk
    check (role is null or char_length(role) <= 100);
exception when duplicate_object then null;
end $$;
