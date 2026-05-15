# Task Tracker Backend, Security, and Performance Improvements

This document is an implementation-ready plan for improving the app without changing its visible UI or intended functionality. Each phase can be assigned independently to an agentic coding tool.

## Ground Rules For Implementers

1. Do not redesign the UI or change user-facing workflows.
2. Preserve current behavior unless an item explicitly identifies a bug or security risk.
3. Prefer small, reviewable changes with focused verification.
4. Keep the current stack: Next.js App Router, Supabase SSR/browser clients, React Query, and Supabase SQL migrations.
5. For Next.js changes, read the local Next.js guidance first: `node_modules/next/dist/docs/`.
6. Do not use service-role keys in browser/client code.
7. Add or update Supabase migrations for database changes. Keep migrations idempotent where possible.
8. After each item, run at minimum:
   - `npm run build`
   - Any affected manual smoke test described under that item

---

## Phase A - Critical Security Hardening

### A1. Harden the `batch_update_sort_order` RPC

**Priority:** Critical  
**Difficulty:** Medium  
**Primary files:**
- `supabase/migrations/batch_update_sort_order.sql`
- Add a new migration under `supabase/migrations/`, for example `harden_batch_update_sort_order.sql`
- `lib/hooks/useTasks.ts`

**Problem**

The current function is defined as `security definer` and updates any task id passed to it:

```sql
create or replace function batch_update_sort_order(
  task_ids uuid[],
  sort_orders int[],
  updated_by_user uuid
)
returns void
language sql
security definer
as $$
  update tasks
  set sort_order = u.sort_order,
      updated_at = now(),
      updated_by = updated_by_user
  from unnest(task_ids, sort_orders) as u(id, sort_order)
  where tasks.id = u.id;
$$;
```

Because `security definer` functions can bypass row-level security depending on owner and privileges, a malicious caller could attempt to pass task ids they do not own. The caller also passes `updated_by_user`, which should not be trusted from the client.

**Required change**

Replace the function with a hardened version that:

1. Uses `auth.uid()` as the actor instead of trusting `updated_by_user`.
2. Validates `auth.uid()` is not null.
3. Validates `array_length(task_ids, 1) = array_length(sort_orders, 1)`.
4. Updates only tasks where `tasks.admin_user_id = auth.uid()`.
5. Raises an exception if any requested task id is not owned by the caller or was not updated.
6. Sets a safe search path: `set search_path = public, pg_temp`.
7. Restricts execute permissions to authenticated users only.

**Suggested SQL shape**

```sql
create or replace function public.batch_update_sort_order(
  task_ids uuid[],
  sort_orders int[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  requested_count int := coalesce(array_length(task_ids, 1), 0);
  updated_count int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if requested_count = 0 then
    return;
  end if;

  if requested_count <> coalesce(array_length(sort_orders, 1), 0) then
    raise exception 'task_ids and sort_orders must have the same length';
  end if;

  update public.tasks t
  set sort_order = u.sort_order,
      updated_at = now(),
      updated_by = caller
  from unnest(task_ids, sort_orders) as u(id, sort_order)
  where t.id = u.id
    and t.admin_user_id = caller;

  get diagnostics updated_count = row_count;

  if updated_count <> requested_count then
    raise exception 'One or more tasks are not accessible';
  end if;
end;
$$;

revoke all on function public.batch_update_sort_order(uuid[], int[]) from public;
grant execute on function public.batch_update_sort_order(uuid[], int[]) to authenticated;
```

**App code update**

In `lib/hooks/useTasks.ts`, update the RPC call:

Current:

```ts
supabase.rpc('batch_update_sort_order', {
  task_ids: orderedIds,
  sort_orders: orderedIds.map((_, i) => i),
  updated_by_user: userId,
})
```

Target:

```ts
supabase.rpc('batch_update_sort_order', {
  task_ids: orderedIds,
  sort_orders: orderedIds.map((_, i) => i),
})
```

**Acceptance criteria**

1. Owner can reorder their own tasks.
2. Manager/read-only views cannot reorder tasks.
3. Calling the RPC with another user's task id fails.
4. Calling the RPC while unauthenticated fails.
5. `npm run build` passes.

---

### A2. Fail Closed For Protected Routes In Production Middleware

**Priority:** High  
**Difficulty:** Easy  
**Primary file:** `middleware.ts`

**Problem**

The middleware currently allows requests through if Supabase env vars are missing or if `supabase.auth.getUser()` throws:

```ts
if (!supabaseUrl || !supabaseAnonKey) {
  return NextResponse.next()
}

try {
  const { data } = await supabase.auth.getUser()
  user = data.user
} catch {
  return supabaseResponse
}
```

This is operationally forgiving, but for protected routes it means a misconfigured deployment or Supabase outage can expose app pages.

**Required change**

1. Keep auth pages and static assets publicly reachable.
2. For protected app routes in production, fail closed if Supabase env vars are missing.
3. For protected app routes in production, redirect to `/login` or return a controlled error if `getUser()` fails.
4. It is acceptable to keep fail-open behavior in local development if desired, but production must fail closed.

**Implementation notes**

Restructure middleware so `pathname` is computed before Supabase setup. Define a helper:

```ts
function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  )
}
```

For missing env vars:

```ts
if (!supabaseUrl || !supabaseAnonKey) {
  if (isPublicPath(pathname) || process.env.NODE_ENV !== 'production') {
    return NextResponse.next()
  }
  return NextResponse.redirect(new URL('/login', request.url))
}
```

For `getUser()` failures on protected paths:

```ts
catch {
  if (isPublicPath(pathname) || process.env.NODE_ENV !== 'production') {
    return supabaseResponse
  }
  return NextResponse.redirect(new URL('/login', request.url))
}
```

**Acceptance criteria**

1. Auth pages remain accessible when signed out.
2. Protected pages redirect to `/login` when signed out.
3. In production mode, missing Supabase env vars do not allow protected app pages through.
4. `npm run build` passes.

---

### A3. Add Security Headers

**Priority:** High  
**Difficulty:** Medium  
**Primary file:** `next.config.ts`

**Problem**

`next.config.ts` currently has no security headers. This leaves the app without baseline browser protections such as clickjacking protection, MIME sniffing protection, and a Content Security Policy.

**Required change**

Add an async `headers()` config that applies security headers to all routes.

**Recommended initial headers**

Use a conservative CSP compatible with Next.js and Supabase. Adjust if local testing identifies required sources.

```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    ].join('; '),
  },
]
```

Then:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}
```

**Important note**

Next.js development often needs `'unsafe-eval'`. If production works without it, remove `'unsafe-eval'` for production by building the CSP conditionally.

**Acceptance criteria**

1. App builds successfully.
2. Login, task list, manager view, settings, and account health pages still load.
3. Supabase HTTP and realtime connections still work.
4. Browser console shows no CSP violations during normal app usage.

---

## Phase B - Fix Query Hydration And Avoid Duplicate Data Fetching

### B1. Align `/tasks` Server Prefetch With Client Query

**Priority:** High  
**Difficulty:** Easy  
**Primary files:**
- `app/(app)/tasks/page.tsx`
- `lib/hooks/useTasks.ts`

**Problem**

The tasks page prefetches:

```ts
queryKey: ['tasks', userId]
```

But the client consumes:

```ts
queryKey: ['tasks', 'own', userId]
```

Also, the server prefetch currently fetches all tasks for the user with no week range, while the client query uses a rolling week window. This can cause:

1. A duplicate client-side fetch after hydration.
2. Larger initial payload than needed.
3. Inconsistent data shape because the client query includes `task_comments(count)` but the server prefetch does not.

**Required change**

In `app/(app)/tasks/page.tsx`:

1. Import `getCurrentWeekIndex` and `weekIndexToDateString`.
2. Compute the same initial range used in `TaskTableView`:

```ts
const todayIndex = getCurrentWeekIndex()
const fromDate = weekIndexToDateString(Math.max(0, todayIndex - 26))
const toDate = weekIndexToDateString(todayIndex + 4)
```

3. Change query key to:

```ts
['tasks', 'own', userId]
```

4. Change task select to include comment count:

```ts
.select('id, admin_user_id, product, project_id, description, week_start_date, status, is_flagged, sort_order, created_by, created_at, updated_at, updated_by, projects(name), task_comments(count)')
```

5. Add:

```ts
.gte('week_start_date', fromDate)
.lte('week_start_date', toDate)
```

6. Map `comment_count` the same way as `useTasksQuery`.

**Acceptance criteria**

1. Initial `/tasks` load hydrates React Query without an immediate duplicate tasks fetch.
2. Comment badges render correctly on first load.
3. Historical tasks outside the initial range are not included in the initial RSC payload.
4. Navigating near the week window edge still expands/refetches as before.
5. `npm run build` passes.

---

### B2. Align Manager Task Prefetch Data Shape With Client Query

**Priority:** High  
**Difficulty:** Easy  
**Primary file:** `app/(app)/manager/[adminUserId]/page.tsx`

**Problem**

The manager task page correctly uses query key:

```ts
['tasks', 'managed', adminUserId]
```

But it prefetches task rows without `task_comments(count)`, while the client query expects `comment_count`. This can cause comment badges to be missing or stale until a refetch.

**Required change**

Update the manager prefetch select from:

```ts
.select('*, projects(name)')
```

to an explicit column list with:

```ts
task_comments(count)
```

Then map `comment_count` exactly like `useTasksQuery`.

**Acceptance criteria**

1. Manager task comment badges render correctly immediately after page load.
2. No duplicate refetch is needed solely to populate `comment_count`.
3. Manager auth/relationship checks remain unchanged.
4. `npm run build` passes.

---

### B3. Use Explicit Column Lists Instead Of `select('*')` In Hot Paths

**Priority:** Medium  
**Difficulty:** Easy  
**Primary files:**
- `lib/hooks/useTasks.ts`
- `app/(app)/tasks/page.tsx`
- `app/(app)/manager/[adminUserId]/page.tsx`
- `components/manager/ManagerLandingView.tsx`
- `components/settings/SettingsView.tsx`
- `components/account-health/AccountHealthView.tsx`
- `components/account-health/RiskAssessmentTable.tsx`
- `components/tasks/DetailPanel.tsx`

**Problem**

Several hot paths use `select('*')`. This increases payload size, parsing cost, and risk of accidentally exposing future columns.

Examples:

```ts
supabase.from('projects').select('*')
supabase.from('tasks').select('*, projects(name), task_comments(count)')
supabase.from('manager_relationships').select('*')
supabase.from('account_health_responses').select('*')
```

**Required change**

Replace `select('*')` with explicit columns based on fields actually used by the component.

**Suggested task columns**

```ts
id,
admin_user_id,
product,
project_id,
description,
week_start_date,
status,
is_flagged,
sort_order,
created_by,
created_at,
updated_at,
updated_by
```

**Suggested project columns**

```ts
id,
admin_user_id,
name,
product,
sort_order,
is_visible,
created_at,
updated_at,
deleted_at
```

**Suggested manager relationship columns for landing page**

```ts
id,
admin_user_id,
is_favorite,
is_archived
```

**Suggested account health response columns**

```ts
id,
client_account_id,
admin_user_id,
month,
question_id,
response,
cs_lead_comment,
cs_lead_updated_at,
cs_lead_updated_by,
client_partner_comment,
client_partner_updated_at,
client_partner_updated_by,
created_at,
updated_at,
updated_by
```

**Acceptance criteria**

1. No user-facing behavior changes.
2. TypeScript still compiles.
3. Pages using changed queries still render the same data.
4. `npm run build` passes.

---

## Phase C - Database Indexes And Constraints

### C1. Add Composite Indexes For Common Query Patterns

**Priority:** High  
**Difficulty:** Easy  
**Primary files:**
- Add a new migration under `supabase/migrations/`, for example `performance_indexes.sql`
- `supabase/schema.sql` may optionally be updated to reflect the latest schema snapshot

**Problem**

The schema has mostly single-column indexes, but the app frequently filters and sorts by multiple columns together.

**Required indexes**

Add idempotent indexes:

```sql
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
```

**Acceptance criteria**

1. Migration runs successfully on a database where the existing migrations have already been applied.
2. Existing queries continue to work.
3. `npm run build` passes.

---

### C2. Add Data Integrity Constraints For Active Names And Invitations

**Priority:** Medium  
**Difficulty:** Medium  
**Primary file:** new Supabase migration

**Problem**

The app currently checks duplicate project/client account names in client code. This can race under concurrent usage. Manager invitations can also duplicate unless constrained.

**Required change**

Add database-level uniqueness. Because projects and client accounts are soft deleted, use partial unique indexes.

**Suggested SQL**

```sql
create unique index if not exists projects_active_unique_name_product_idx
  on public.projects(admin_user_id, lower(name), coalesce(product, ''))
  where deleted_at is null;

create unique index if not exists client_accounts_active_unique_name_product_idx
  on public.client_accounts(admin_user_id, lower(name), coalesce(product, ''))
  where deleted_at is null;

create unique index if not exists manager_relationships_active_invite_unique_idx
  on public.manager_relationships(admin_user_id, lower(manager_email))
  where status in ('pending', 'accepted');
```

**Implementation notes**

1. Before adding these indexes to production, check for duplicate existing rows and clean them up.
2. Keep existing client-side duplicate checks for immediate user feedback.
3. Update error handling in affected insert/update flows to show the existing generic failure toast or duplicate message.

**Acceptance criteria**

1. Concurrent duplicate inserts are rejected by the database.
2. Soft-deleted project/client account names can be reused.
3. Existing UI validation still works.
4. `npm run build` passes.

---

### C3. Add Text Length Constraints

**Priority:** Medium  
**Difficulty:** Medium  
**Primary file:** new Supabase migration

**Problem**

Important text fields have no explicit length limits. This can increase storage, export payloads, render cost, and abuse potential.

**Required change**

Add reasonable `check` constraints for fields such as:

1. `projects.name`
2. `client_accounts.name`
3. `tasks.description`
4. `task_notes.content`
5. `task_comments.content`
6. `account_health_responses.cs_lead_comment`
7. `account_health_responses.client_partner_comment`
8. `users.first_name`, `users.last_name`, `users.role`

**Suggested limits**

```sql
alter table public.projects
  add constraint projects_name_length_chk check (char_length(name) <= 200);

alter table public.client_accounts
  add constraint client_accounts_name_length_chk check (char_length(name) <= 200);

alter table public.tasks
  add constraint tasks_description_length_chk check (char_length(description) <= 2000);

alter table public.task_notes
  add constraint task_notes_content_length_chk check (char_length(content) <= 20000);

alter table public.task_comments
  add constraint task_comments_content_length_chk check (char_length(content) <= 5000);

alter table public.account_health_responses
  add constraint account_health_cs_comment_length_chk
  check (cs_lead_comment is null or char_length(cs_lead_comment) <= 5000);

alter table public.account_health_responses
  add constraint account_health_cp_comment_length_chk
  check (client_partner_comment is null or char_length(client_partner_comment) <= 5000);
```

**Implementation notes**

1. Use `not valid` followed by `validate constraint` if applying to a large production database.
2. Consider adding matching `maxLength` attributes in UI inputs later. That would be a minor UI behavior change, so keep it separate unless requested.

**Acceptance criteria**

1. Migration succeeds after checking existing data.
2. Normal app usage is unaffected.
3. Oversized values are rejected by the database.
4. `npm run build` passes.

---

## Phase D - Realtime And Cache Efficiency

### D1. Narrow Task Comment Realtime Invalidations

**Priority:** Medium  
**Difficulty:** Medium  
**Primary files:**
- `lib/hooks/useTasks.ts`
- Supabase migration if adding a column or trigger

**Problem**

Current code subscribes to all `task_comments` changes and invalidates task queries for the active user/admin:

```ts
supabase
  .channel(`task_comments:${scope}:${adminUserId}`)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'task_comments' },
    () => { queryClient.invalidateQueries({ queryKey: ['tasks', scope, adminUserId] }) }
  )
```

This means a comment on any task in the database can trigger invalidations for every active task list client.

**Preferred implementation**

Add `admin_user_id` to `task_comments`, populate it from the parent task, index it, and filter realtime by that column.

**Database migration outline**

```sql
alter table public.task_comments
  add column if not exists admin_user_id uuid references public.users(id) on delete cascade;

update public.task_comments c
set admin_user_id = t.admin_user_id
from public.tasks t
where t.id = c.task_id
  and c.admin_user_id is null;

alter table public.task_comments
  alter column admin_user_id set not null;

create index if not exists task_comments_admin_user_id_idx
  on public.task_comments(admin_user_id);
```

Add a trigger to keep `admin_user_id` correct on insert:

```sql
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
```

Update insert code in `components/tasks/DetailPanel.tsx` if necessary. If the trigger handles the column, client code does not need to send `admin_user_id`.

Update realtime subscription:

```ts
filter: `admin_user_id=eq.${adminUserId}`
```

**Alternative implementation**

If schema change is not desired, invalidate only when the payload's `task_id` is in the currently loaded task ids. This is easier but still receives all realtime events.

**Acceptance criteria**

1. Adding/editing/deleting a comment updates comment counts for affected users.
2. Comments on unrelated users' tasks do not invalidate the current user's task query.
3. RLS still prevents unauthorized comment reads/writes.
4. `npm run build` passes.

---

### D2. Use More Targeted React Query Invalidations

**Priority:** Medium  
**Difficulty:** Easy  
**Primary files:**
- `components/tasks/DetailPanel.tsx`
- `lib/hooks/useTasks.ts`

**Problem**

Some invalidations are broad:

```ts
queryClient.invalidateQueries({ queryKey: ['tasks'] })
```

This can refetch owner and manager task queries unnecessarily.

**Required change**

Where possible, invalidate exact task query keys:

1. Owner task list: `['tasks', 'own', userId]`
2. Managed task list: `['tasks', 'managed', adminUserId]`

For `DetailPanel`, add enough props to know the relevant query key, for example:

```ts
taskOwnerUserId: string
taskScope: 'own' | 'managed'
```

Then:

```ts
queryClient.invalidateQueries({
  queryKey: ['tasks', taskScope, taskOwnerUserId],
  exact: true,
})
```

**Acceptance criteria**

1. Comment count still updates after adding/deleting comments.
2. Unrelated task queries are not invalidated.
3. Owner and manager detail panels both behave correctly.
4. `npm run build` passes.

---

## Phase E - Client Bundle And Render Performance

### E1. Remove React Query Devtools From Production Bundle

**Priority:** Medium  
**Difficulty:** Easy  
**Primary file:** `components/QueryProvider.tsx`

**Problem**

`ReactQueryDevtools` is always imported and rendered:

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
...
<ReactQueryDevtools initialIsOpen={false} />
```

This adds development-only code to production.

**Required change**

Render devtools only in development.

Simplest acceptable implementation:

```tsx
{process.env.NODE_ENV === 'development' && (
  <ReactQueryDevtools initialIsOpen={false} />
)}
```

Better implementation:

Use a dynamic import/lazy client component so the devtools package is not included in the production path.

**Acceptance criteria**

1. Devtools appear during `next dev`.
2. Devtools do not render in production.
3. App behavior is unchanged.
4. `npm run build` passes.

---

### E2. Move `QueryProvider` Out Of Public Auth Routes If Practical

**Priority:** Low  
**Difficulty:** Medium  
**Primary files:**
- `app/layout.tsx`
- `app/(app)/layout.tsx`
- Auth pages under `app/(auth)/`

**Problem**

`QueryProvider` currently wraps the entire app in the root layout:

```tsx
<QueryProvider>{children}</QueryProvider>
```

Public auth pages do not appear to need React Query. Keeping the provider in the root layout makes even auth routes client-hydrate that provider.

**Required change**

Move `QueryProvider` from `app/layout.tsx` into `app/(app)/layout.tsx`, wrapping only authenticated app routes.

**Implementation notes**

1. Confirm no auth page uses React Query.
2. In `app/layout.tsx`, render `{children}` directly.
3. In `app/(app)/layout.tsx`, wrap the existing providers:

```tsx
<QueryProvider>
  <AuthProvider>
    <SidebarProvider>
      ...
    </SidebarProvider>
  </AuthProvider>
</QueryProvider>
```

4. Ensure `QueryProvider` remains a client component.

**Acceptance criteria**

1. Login/signup/reset pages still work.
2. App pages still have React Query available.
3. Hydration errors do not appear.
4. `npm run build` passes.

---

### E3. Split The Large Settings Client Component

**Priority:** Medium  
**Difficulty:** Medium  
**Primary file:** `components/settings/SettingsView.tsx`

**Problem**

`SettingsView.tsx` is about 2,000 lines and contains unrelated sections:

1. Account details
2. Projects
3. Team management
4. Account Health settings
5. Client accounts
6. CSV export

Because it is a single client component, all of this code is part of the settings route bundle even if the user only needs one section.

**Required change**

Split the file into smaller components while preserving identical UI:

Suggested new files:

```text
components/settings/AccountSection.tsx
components/settings/ProjectsSection.tsx
components/settings/TeamManagementSection.tsx
components/settings/AccountHealthSection.tsx
components/settings/ClientAccountsSection.tsx
components/settings/ExportSection.tsx
components/settings/SectionCard.tsx
components/settings/ConfirmDialog.tsx
components/settings/settings-utils.ts
components/settings/settings-types.ts
```

**Implementation notes**

1. Move code without changing markup/classes unless necessary.
2. Keep shared helpers such as `csvEscape`, `formatExportDate`, and `triggerDownload` in `settings-utils.ts`.
3. Keep shared row types in `settings-types.ts`.
4. Consider `next/dynamic` for heavier sections such as team management, client accounts, and export, but only if it does not alter layout noticeably.
5. Do not change labels, copy, spacing, or behavior.

**Acceptance criteria**

1. Settings page looks and behaves the same.
2. Account details save still works.
3. Project CRUD/reorder still works.
4. Team invitation accept/decline/resend/delete still works.
5. Account Health enable/disable still works.
6. Client account CRUD/reorder still works when Account Health is enabled.
7. CSV exports still download.
8. `npm run build` passes.

---

### E4. Memoize Visible And Sorted Task Lists

**Priority:** Low  
**Difficulty:** Easy  
**Primary files:**
- `components/tasks/task-table/EditableTaskTable.tsx`
- `components/tasks/task-table/ReadOnlyTaskTable.tsx`

**Problem**

Both table components recompute visible week sets, filter tasks, and sort tasks on every render:

```ts
const visibleWeekStrings = new Set(visibleWeekIndices.map(weekIndexToDateString))
const visibleTasks = tasks
  .filter(...)
  .sort(...)
```

The current rolling window makes this manageable, but memoization is still a clean render improvement.

**Required change**

Wrap `visibleWeekStrings` and `visibleTasks` in `useMemo`.

Example:

```ts
const visibleWeekStrings = useMemo(
  () => new Set(visibleWeekIndices.map(weekIndexToDateString)),
  [visibleWeekIndices],
)

const visibleTasks = useMemo(() => {
  return tasks
    .filter(...)
    .slice()
    .sort(...)
}, [tasks, visibleWeekStrings, weekSortModes, defaultSortMode])
```

Important: use `.slice().sort(...)` if there is any chance `tasks` should not be mutated in place.

**Acceptance criteria**

1. Table ordering remains identical.
2. Drag and drop still works.
3. Read-only manager table still works.
4. `npm run build` passes.

---

## Phase F - Account Health Performance And Permissions

### F1. Remove Or Batch Per-Cell User Lookups In `CommentCell`

**Priority:** Medium  
**Difficulty:** Easy  
**Primary files:**
- `components/account-health/CommentCell.tsx`
- `components/account-health/RiskAssessmentTable.tsx`

**Problem**

`CommentCell` fetches `first_name` and `last_name` for each `updatedByUserId`, but `userName`, `updatedAt`, and `formatDateTime` are not rendered in the current component. This creates unnecessary queries.

**Required change Option 1: Remove unused lookup**

If the UI does not display updated-by metadata, delete:

1. `supabase` import
2. `updatedAt` prop if unused by callers
3. `updatedByUserId` prop if unused by callers
4. `formatDateTime`
5. `userName`, `fetchedUserIdRef`, and the lookup `useEffect`

Update `RiskAssessmentTable` callers accordingly.

**Required change Option 2: Batch lookup and display metadata**

If metadata should be displayed, fetch all needed users once in `RiskAssessmentTable`:

1. Collect `cs_lead_updated_by` and `client_partner_updated_by` from response rows.
2. Query `users` once with `.in('id', ids)`.
3. Pass `updatedByName` into each `CommentCell`.
4. Render metadata consistently.

Option 1 is preferred because it preserves current visible UI exactly.

**Acceptance criteria**

1. Account Health table renders the same if Option 1 is used.
2. Selecting accounts/months no longer causes per-cell user lookup queries.
3. Editing comments still works.
4. `npm run build` passes.

---

### F2. Clarify Manager Write Permissions For Account Health Comments

**Priority:** Medium  
**Difficulty:** Easy to Medium  
**Primary files:**
- `components/account-health/RiskAssessmentTable.tsx`
- `supabase/migrations/account_health_phase_c.sql`
- New Supabase migration if changing RLS

**Problem**

The manager account-health route passes:

```tsx
<AccountHealthView
  viewAsUserId={adminUserId}
  readOnly={true}
  managerUserId={userId}
/>
```

Most controls are read-only, but the Client Partner comment cell uses:

```tsx
readOnly={readOnly && actorUserId === adminUserId}
```

For a manager viewing another user's account health, `readOnly` is true and `actorUserId !== adminUserId`, so that cell can appear editable. However, RLS currently grants managers only `select` on `account_health_responses`, not update/insert.

**Decision required**

Choose one of these two paths:

#### Option A: Make manager view fully read-only

Set both comment cells to `readOnly={readOnly}`.

This is easiest and matches the route's "Read only" badge.

#### Option B: Allow managers to edit only Client Partner comments

Add narrow RLS policies for accepted managers to insert/update account health response rows for admins they manage.

Because Postgres RLS cannot easily restrict which columns are updated by policy alone, this option may require a dedicated RPC such as:

```sql
public.update_account_health_client_partner_comment(
  p_client_account_id uuid,
  p_month date,
  p_question_id text,
  p_comment text
)
```

The RPC should:

1. Use `auth.uid()` as actor.
2. Verify the caller is an accepted manager for the target `admin_user_id`.
3. Upsert only `client_partner_comment`, `client_partner_updated_at`, `client_partner_updated_by`, `updated_at`, and `updated_by`.
4. Not allow editing risk responses or CS lead comments.

**Preferred recommendation**

Option A unless the product explicitly intends managers to write Client Partner comments.

**Acceptance criteria for Option A**

1. Manager account-health view is fully read-only.
2. Owner account-health view remains editable.
3. No failed Supabase writes from manager read-only pages.
4. `npm run build` passes.

**Acceptance criteria for Option B**

1. Managers can edit only Client Partner comments.
2. Managers cannot edit responses, CS Lead comments, metadata, or unrelated users' rows.
3. Owners retain existing edit behavior.
4. RPC rejects unauthenticated or unrelated users.
5. `npm run build` passes.

---

## Phase G - Server-Side Data Consolidation

### G1. Consolidate Sidebar/User Bootstrap Reads

**Priority:** Medium  
**Difficulty:** Medium  
**Primary files:**
- `app/(app)/layout.tsx`
- `components/layout/Sidebar.tsx`
- `lib/auth-context.tsx`
- Potential new server helper under `lib/`

**Problem**

On app load, several client-side effects independently fetch user-related data:

1. `AuthProvider` gets the session.
2. `Sidebar` fetches manager relationship existence, pending invite count, account health enabled, and profile name/email.
3. Task/settings pages fetch preferences/profile again.

This produces extra round trips and loading states.

**Required change**

Move initial sidebar bootstrap data to the server layout and pass it into client providers/components.

**Suggested server data**

```ts
type AppBootstrap = {
  userId: string
  profile: {
    first_name: string | null
    last_name: string | null
    email: string
    account_health_enabled: boolean
    default_landing: string
    preferences: unknown
  }
  sidebar: {
    hasManagerRelationships: boolean
    pendingInviteCount: number
  }
}
```

In `app/(app)/layout.tsx`:

1. Create Supabase server client.
2. Get user.
3. Redirect to `/login` if missing.
4. Fetch profile and sidebar counts in parallel.
5. Pass initial values to `AuthProvider` and `Sidebar`.

**Implementation notes**

1. Keep realtime/client refresh logic for after invitation changes.
2. Do not remove middleware; server layout auth is defense in depth.
3. Ensure auth pages are unaffected.

**Acceptance criteria**

1. Sidebar renders profile/nav state without extra initial client fetches.
2. Invitation accept/decline still refreshes sidebar.
3. Sign out still works.
4. `npm run build` passes.

---

### G2. Server-Prefetch Manager Landing Data

**Priority:** Medium  
**Difficulty:** Medium  
**Primary files:**
- `app/(app)/manager/page.tsx`
- `components/manager/ManagerLandingView.tsx`

**Problem**

`ManagerLandingView` is fully client-loaded and performs:

1. Fetch accepted manager relationships.
2. If none, update default landing and redirect.
3. Fetch users by admin ids.

This delays first useful render and duplicates auth work already done elsewhere.

**Required change**

Move initial manager landing data fetch into `app/(app)/manager/page.tsx`.

**Implementation outline**

1. In server page, get authenticated user.
2. Fetch relationships for `manager_user_id = user.id` and `status = accepted`.
3. If none:
   - Optionally update `users.default_landing = 'task_list'`.
   - Redirect to `/tasks`.
4. Fetch user rows for relationship `admin_user_id`s.
5. Build `PersonCard[]` server-side.
6. Pass `initialPeople` into `ManagerLandingView`.
7. Keep client-side optimistic favorite/archive/unarchive handlers.

**Acceptance criteria**

1. Manager landing page renders cards from server-provided data.
2. Favorite/archive/unarchive still works.
3. Search/sort/tabs still work.
4. Redirect when no manager relationships still works.
5. `npm run build` passes.

---

## Phase H - Export Scalability

### H1. Move CSV Export Generation To Server Route Or Server Action

**Priority:** Medium  
**Difficulty:** Medium to Hard  
**Primary files:**
- `components/settings/SettingsView.tsx` or split `ExportSection`
- New route handlers, for example:
  - `app/api/export/tasks/route.ts`
  - `app/api/export/account-health/route.ts`

**Problem**

CSV export currently runs entirely in the browser:

1. Fetches all tasks.
2. Fetches all notes/comments for task ids.
3. Fetches all author names.
4. Builds CSV in client memory.
5. Downloads via Blob.

For large datasets this can be slow, memory-heavy, and exposes more raw data to the browser than necessary.

**Required change**

Create authenticated route handlers that generate CSV server-side and stream/return the file.

**Implementation outline**

1. Add `GET /api/export/tasks`.
2. In route handler:
   - Create Supabase server client.
   - Require authenticated user.
   - Query only that user's rows.
   - Build CSV server-side.
   - Return `new Response(csv, { headers })`.
3. Add `GET /api/export/account-health`.
4. In UI, replace direct Supabase export queries with:

```ts
window.location.href = '/api/export/tasks'
```

or fetch the blob and trigger download.

**Required headers**

```ts
{
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': `attachment; filename="tasks_${date}.csv"`,
  'Cache-Control': 'no-store',
}
```

**Security requirements**

1. Use `supabase.auth.getUser()` server-side.
2. Filter by `admin_user_id = user.id`.
3. Do not accept arbitrary user ids from query params.
4. Keep `Cache-Control: no-store`.

**Acceptance criteria**

1. Task export downloads the same CSV columns as before.
2. Account Health export downloads the same CSV columns as before.
3. Unauthenticated requests redirect or return 401.
4. Users cannot export another user's data.
5. `npm run build` passes.

---

## Phase I - Invite And Profile Privacy

### I1. Reduce Email Enumeration In Manager Invite Validation

**Priority:** Medium  
**Difficulty:** Medium  
**Primary files:**
- `components/settings/SettingsView.tsx` or split `TeamManagementSection`
- New route handler or server action
- Supabase policies may need adjustment depending on final approach

**Problem**

The invite form checks whether a typed email exists:

```ts
supabase.from('users').select('id').eq('email', email).single()
```

This can reveal whether an email is registered. The `tighten_users_read_policy.sql` migration helps limit reads, but this flow still intentionally probes by email for invitations.

**Required change**

Move invite validation and invite creation to a server route/action with generic user-facing responses.

**Recommended behavior**

1. User enters manager email.
2. Client does only local email format validation.
3. Server handles:
   - Normalize email.
   - Check duplicate active invite.
   - Find existing user id if available.
   - Insert pending relationship.
4. UI shows a generic success message: "Invitation sent." Do not reveal whether the target already has an account, except for duplicate invite cases owned by the current user.

**Optional**

Add basic rate limiting later. If no rate-limit infrastructure exists, at least debounce and avoid repeated existence checks.

**Acceptance criteria**

1. Manager invitations still work for registered and unregistered emails.
2. UI no longer reveals registered/not-registered status during typing.
3. Duplicate active invitation for the same admin/email is still blocked.
4. Unauthenticated requests fail.
5. `npm run build` passes.

---

## Phase J - Optional Next.js App Router Cleanup

### J1. Add Route-Level Loading And Error Boundaries

**Priority:** Low  
**Difficulty:** Easy  
**Primary files:**
- `app/(app)/tasks/loading.tsx`
- `app/(app)/manager/loading.tsx`
- `app/(app)/settings/loading.tsx`
- `app/(app)/account-health/loading.tsx`
- Optional `error.tsx` files

**Problem**

Most loading states are client-side. Route-level loading files can improve perceived responsiveness during server rendering and navigation.

**Required change**

Add simple route-level loading components that match existing app styling without changing UI design.

**Acceptance criteria**

1. Navigation shows lightweight loading states.
2. No layout shift or visual redesign.
3. `npm run build` passes.

---

### J2. Use Server Components For Read-Only Initial Data Where Practical

**Priority:** Low  
**Difficulty:** Medium  
**Primary files:**
- `app/(app)/account-health/page.tsx`
- `components/account-health/AccountHealthView.tsx`
- `app/(app)/settings/page.tsx`
- `components/settings/SettingsView.tsx`

**Problem**

Several pages render client components that fetch initial data in effects. This is functional but delays first meaningful paint and increases loading flashes.

**Required change**

Over time, move initial data reads into server pages and pass data as props:

1. Account Health enabled status.
2. Account list for Account Health.
3. Initial settings profile data.
4. Initial projects/client accounts.

Keep client mutations and interactivity where they are needed.

**Acceptance criteria**

1. Existing UI and behavior remain the same.
2. Initial page render has fewer client-side loading fetches.
3. `npm run build` passes.

---

## Recommended Execution Order

1. **Phase A**: Security first. Harden RPC, fail closed in production middleware, add headers.
2. **Phase B**: Fix React Query hydration and payload shape for task pages.
3. **Phase C1**: Add performance indexes.
4. **Phase E1**: Remove React Query Devtools from production.
5. **Phase F1/F2**: Clean Account Health unnecessary queries and permission mismatch.
6. **Phase D**: Narrow realtime invalidations and cache refreshes.
7. **Phase C2/C3**: Add uniqueness and length constraints after checking existing production data.
8. **Phase E3/E4**: Split settings bundle and memoize task table computations.
9. **Phase G/H/I/J**: Server-side consolidation, export scalability, invite privacy, and App Router polish.

## Quick Verification Checklist

After each phase, verify:

1. `npm run build` passes.
2. Sign up/login/logout still work.
3. `/tasks` loads and task CRUD still works.
4. Drag reorder still works for owners.
5. Manager view remains read-only for tasks.
6. Manager relationship invite/accept/decline flows still work.
7. Account Health enable/disable still works.
8. Account Health responses/comments work according to the chosen permission model.
9. CSV export still works if affected.
10. Browser console has no new runtime or CSP errors.

---

## Copy-Paste Prompts For Agentic Coding Tools

Use these prompts with another coding agent. Each prompt assumes the agent can read this repository and the full `improvements.md` file.

### Phase A Prompt

Implement Phase A from `improvements.md`. Complete A1, A2, and A3 exactly as described: harden the task reorder RPC, make protected middleware fail closed in production, and add security headers. Do not change UI or app functionality. Add any required Supabase migrations, update app code, and run `npm run build`.

### A1 Prompt

Implement item A1 from `improvements.md`: harden the `batch_update_sort_order` Supabase RPC and update the client RPC call. Add an idempotent migration, stop trusting `updated_by_user`, use `auth.uid()`, restrict updates to owned tasks, validate input arrays, set a safe search path, and verify task reordering still works. Run `npm run build`.

### A2 Prompt

Implement item A2 from `improvements.md`: update `middleware.ts` so protected routes fail closed in production when Supabase env/auth is unavailable, while public auth/static routes still work. Do not change route behavior beyond the described security hardening. Run `npm run build`.

### A3 Prompt

Implement item A3 from `improvements.md`: add baseline security headers in `next.config.ts`, including CSP, frame protection, MIME sniffing protection, referrer policy, and permissions policy. Keep Supabase HTTP/realtime working and do not alter UI. Run `npm run build`.

### Phase B Prompt

Implement Phase B from `improvements.md`. Align task page and manager task page React Query prefetch keys/data shapes with the client queries, and replace broad `select('*')` calls in hot paths with explicit columns. Preserve all current functionality and run `npm run build`.

### B1 Prompt

Implement item B1 from `improvements.md`: align `/tasks` server prefetch with `useTasksQuery`, including the correct query key, initial week window, explicit task columns, `task_comments(count)`, and `comment_count` mapping. Preserve current task behavior and run `npm run build`.

### B2 Prompt

Implement item B2 from `improvements.md`: align the manager task page prefetch data shape with the client query by adding `task_comments(count)` and mapping `comment_count`. Do not change manager permissions or UI. Run `npm run build`.

### B3 Prompt

Implement item B3 from `improvements.md`: replace broad `select('*')` queries in the listed hot paths with explicit column lists. Keep the returned data shape compatible with existing TypeScript/components and do not change UI behavior. Run `npm run build`.

### Phase C Prompt

Implement Phase C from `improvements.md`. Add the proposed database performance indexes, active-name/invitation uniqueness constraints, and text length constraints using Supabase migrations. Keep migrations idempotent where practical and run `npm run build`.

### C1 Prompt

Implement item C1 from `improvements.md`: add a Supabase migration with the recommended composite indexes for tasks, projects, client accounts, manager relationships, task comments, and account health tables. Do not change app behavior. Run `npm run build`.

### C2 Prompt

Implement item C2 from `improvements.md`: add database-level uniqueness constraints for active project names, active client account names, and active manager invitations. Keep existing client-side validation and update error handling only if needed. Run `npm run build`.

### C3 Prompt

Implement item C3 from `improvements.md`: add reasonable database text length constraints for project/client account names, task descriptions, notes, comments, account health comments, and user profile fields. Avoid UI redesign or workflow changes. Run `npm run build`.

### Phase D Prompt

Implement Phase D from `improvements.md`. Narrow realtime invalidations for task comments and make React Query invalidations more targeted. Preserve live comment count behavior and run `npm run build`.

### D1 Prompt

Implement item D1 from `improvements.md`: narrow task comment realtime invalidations, preferably by adding `admin_user_id` to `task_comments` with a trigger and filtering realtime subscriptions by that column. Preserve comment count updates and RLS behavior. Run `npm run build`.

### D2 Prompt

Implement item D2 from `improvements.md`: replace broad task query invalidations with exact owner/managed task query keys where possible, especially in `DetailPanel`. Preserve comment count refresh behavior for owners and managers. Run `npm run build`.

### Phase E Prompt

Implement Phase E from `improvements.md`. Remove React Query Devtools from production, move `QueryProvider` out of auth routes if practical, split the large settings component, and memoize task table computations. Do not change visible UI or workflows. Run `npm run build`.

### E1 Prompt

Implement item E1 from `improvements.md`: ensure React Query Devtools only load/render in development and are not part of the production path. Do not change React Query behavior. Run `npm run build`.

### E2 Prompt

Implement item E2 from `improvements.md`: move `QueryProvider` from the root layout to authenticated app routes if practical, confirming auth pages do not need React Query. Preserve all app route behavior and run `npm run build`.

### E3 Prompt

Implement item E3 from `improvements.md`: split `components/settings/SettingsView.tsx` into smaller focused components/util files without changing markup, styling, labels, or behavior. Verify all settings sections still work and run `npm run build`.

### E4 Prompt

Implement item E4 from `improvements.md`: memoize visible/sorted task list computations in editable and read-only task table components. Preserve ordering, filtering, highlighting, and drag/drop behavior. Run `npm run build`.

### Phase F Prompt

Implement Phase F from `improvements.md`. Clean up Account Health per-cell user lookups and resolve the manager comment permission mismatch. Prefer preserving the current visible UI unless the file explicitly says otherwise. Run `npm run build`.

### F1 Prompt

Implement item F1 from `improvements.md`: remove the unused per-cell user lookup in `CommentCell` and update `RiskAssessmentTable` callers accordingly, preserving the current visible Account Health UI and edit behavior. Run `npm run build`.

### F2 Prompt

Implement item F2 from `improvements.md`: resolve the Account Health manager permission mismatch. Prefer Option A unless instructed otherwise: make manager Account Health view fully read-only by setting both comment cells read-only when `readOnly` is true. Run `npm run build`.

### Phase G Prompt

Implement Phase G from `improvements.md`. Consolidate initial app/sidebar bootstrap reads into server-provided data and server-prefetch manager landing data. Preserve current client interactivity, redirects, and UI. Run `npm run build`.

### G1 Prompt

Implement item G1 from `improvements.md`: consolidate sidebar/user bootstrap data by fetching initial profile/sidebar state in the app server layout and passing it to client providers/components. Keep sign-out and sidebar refresh behavior working. Run `npm run build`.

### G2 Prompt

Implement item G2 from `improvements.md`: server-prefetch manager landing data in `app/(app)/manager/page.tsx` and pass initial people data to `ManagerLandingView`, while preserving search, sort, tabs, favorite/archive actions, and redirects. Run `npm run build`.

### Phase H Prompt

Implement Phase H from `improvements.md`: move CSV export generation from the browser to authenticated server route handlers for tasks and Account Health. Preserve the CSV columns and filenames, protect user data, and run `npm run build`.

### H1 Prompt

Implement item H1 from `improvements.md`: create authenticated server routes/actions for task and Account Health CSV exports, move export querying/CSV generation server-side, and update the settings export UI to download from those endpoints. Preserve CSV output format and run `npm run build`.

### Phase I Prompt

Implement Phase I from `improvements.md`: reduce email enumeration in manager invite validation by moving invite validation/creation server-side with generic user-facing responses. Preserve the invitation workflow and run `npm run build`.

### I1 Prompt

Implement item I1 from `improvements.md`: replace client-side registered-email probing in manager invite validation with a server route/action that normalizes email, checks duplicates, creates invitations, and returns generic responses. Preserve invitation behavior and run `npm run build`.

### Phase J Prompt

Implement Phase J from `improvements.md`: add route-level loading/error polish and move read-only initial data into Server Components where practical. Preserve UI design and existing behavior. Run `npm run build`.

### J1 Prompt

Implement item J1 from `improvements.md`: add lightweight route-level `loading.tsx` files, and optional `error.tsx` files, for the app routes listed. Match existing styling and avoid redesigning the UI. Run `npm run build`.

### J2 Prompt

Implement item J2 from `improvements.md`: move practical read-only initial data fetches from client effects into server pages and pass them as props, while preserving existing client mutations/interactivity and visible UI. Run `npm run build`.
