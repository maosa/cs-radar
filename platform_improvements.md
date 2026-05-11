# Platform Improvements Backlog

Findings from a full codebase audit (May 2026). Items are grouped into tiers by impact vs. effort.
Each item is written so a fresh Claude Code session can implement it directly — just say "implement items X, Y, Z from platform_improvements.md".

---

## TIER 1 — Critical Bugs & Security Issues

### Item 1 · Rename `proxy.ts` → `middleware.ts` (auth redirect broken)
**Category:** Security / Bug | **Effort:** Easy (< 30 min)

**Problem:** Next.js only loads middleware from a file literally named `middleware.ts` in the project root. The current file is named `proxy.ts`, so it is **never invoked**. This means unauthenticated users are not redirected to `/login` — any URL is accessible without an auth check.

**Fix:**
- Rename `/proxy.ts` → `/middleware.ts`
- Change the exported function name from `proxy` to `middleware` (Next.js requires this exact name)
- The `config` export and all internal logic are correct and can stay as-is

```ts
// middleware.ts
export async function middleware(request: NextRequest) { ... }
export const config = { matcher: [...] }
```

**Verify:** Start dev server, log out, navigate to `/tasks` — should redirect to `/login`. Navigate to `/login` — should render normally.

---

### Item 2 · Authorization check on manager task route
**Category:** Security | **Effort:** Medium (1–2 h)

**Problem:** `app/(app)/manager/[adminUserId]/page.tsx` accepts any UUID in the URL and prefetches tasks for that user with no check that the logged-in user is actually an accepted manager for that admin. Any authenticated user can view another user's tasks by knowing/guessing their UUID.

**Fix:** In `app/(app)/manager/[adminUserId]/page.tsx`, before the task prefetch, add:

```ts
// Verify the logged-in user is an accepted manager for this admin
const { data: rel } = await supabase
  .from('manager_relationships')
  .select('id')
  .eq('admin_user_id', adminUserId)
  .eq('manager_user_id', userId)
  .eq('status', 'accepted')
  .maybeSingle()

if (!rel) redirect('/manager')
```

Also add UUID format validation for `adminUserId` before it is used in any query:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_RE.test(adminUserId)) redirect('/manager')
```

**Verify:** Log in as a non-manager user, manually visit `/manager/<someone-elses-uuid>` — should redirect to `/manager`.

---

### Item 3 · Tighten RLS policy: users table read access
**Category:** Security | **Effort:** Medium (1–2 h)

**Problem:** `supabase/auth_enforcement.sql` contains `"users: authenticated read"` which allows **any logged-in user** to read `first_name`, `last_name`, `email`, and `role` for **all users** in the system. This leaks email addresses and roles to every user.

**Fix:** Replace the permissive policy with a scoped one that only allows users to read their own row, or rows belonging to their manager relationships:

```sql
-- Run in Supabase SQL editor
DROP POLICY IF EXISTS "users: authenticated read" ON public.users;

CREATE POLICY "users: read own or related"
  ON public.users FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.status = 'accepted'
        AND (
          (mr.admin_user_id = auth.uid() AND mr.manager_user_id = users.id)
          OR (mr.manager_user_id = auth.uid() AND mr.admin_user_id = users.id)
        )
    )
    -- Allow reading rows matched by pending invitation email
    OR EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = auth.uid()
        AND mr.manager_email = users.email
        AND mr.status = 'pending'
    )
  );
```

**Verify:** Log in as User A, open browser console, run `supabase.from('users').select('*')` — should return only User A's own row (and any rows of their managers/admins). Should not return all users.

---

### Item 4 · Filter manager relationship queries by `status = 'accepted'`
**Category:** Security | **Effort:** Easy (30 min)

**Problem:** In `app/(app)/manager/[adminUserId]/page.tsx` and `components/manager/ManagerLandingView.tsx`, queries on `manager_relationships` do not filter by `status = 'accepted'`. While RLS should block this, defense-in-depth requires the application layer to also filter explicitly.

**Fix:** In every query against `manager_relationships` in the application code (not just RLS), add `.eq('status', 'accepted')` where the intent is to fetch active relationships. Specifically check:
- `app/(app)/manager/[adminUserId]/page.tsx` — any relationship check
- `components/manager/ManagerLandingView.tsx` — the list of admins the manager can view
- `components/layout/Sidebar.tsx` — the manager count badge / relationship fetch

**Verify:** Create a pending invitation (not yet accepted). The pending admin should not appear in the manager's sidebar or landing page list.

---

## TIER 2 — High Impact, Easy Wins

### Item 5 · Remove redundant `invalidateQueries` after optimistic mutations
**Category:** Performance | **Effort:** Easy (1 h)

**Problem:** In `lib/hooks/useTasks.ts`, every mutation (`toggleComplete`, `toggleFlag`, `moveTask`, `deleteTask`) calls `queryClient.invalidateQueries` in `onSettled`, which throws away the entire task cache and triggers a full refetch from Supabase — even though each mutation already applies a correct optimistic update in `onMutate`. This means every checkbox click, flag toggle, or task move causes an unnecessary network round-trip.

**Fix:** Remove `onSettled` from `toggleComplete`, `toggleFlag`, `moveTask`, and `deleteTask`. Keep the invalidation only in `onError` to restore correct state after a failure, and keep it in `deleteTask` since removing an item requires reconciling the list. For `reorderTasks`, keep the invalidation since sort_order precision matters.

```ts
// BEFORE (each mutation)
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: tasksKey })
},

// AFTER — only invalidate on error (already done via context rollback)
// Remove onSettled entirely from toggleComplete, toggleFlag, moveTask
// Keep onSettled only for deleteTask and reorderTasks
```

**Verify:** Toggle a task's complete status — network tab should show only the UPDATE request, no subsequent SELECT. Toggling offline and back online should still show correct state after reconnect.

---

### Item 6 · Extract duplicate task utility functions to shared file
**Category:** Code Quality | **Effort:** Easy (1 h)

**Problem:** `components/tasks/TasksView.tsx` and `components/manager/ManagerTaskView.tsx` both define identical (or near-identical) utility functions: `taskBg()`, `descClass()`, and `projectName()`. These are copy-pasted and will drift over time.

**Fix:**
1. Create `/lib/taskUtils.ts`
2. Move the three functions there with proper TypeScript types (`TaskWithProject` instead of `any`)
3. Replace the local definitions in both files with imports from `@/lib/taskUtils`

**Verify:** Both task views render correctly. TypeScript compiler reports no errors.

---

### Item 7 · Memoize expensive list row components
**Category:** Performance | **Effort:** Easy (30 min)

**Problem:** `SortableTaskRow` (in `TasksView.tsx`) and `SortableProjectRow` (in `SettingsView.tsx`) re-render on every parent state change, even when the row's own data hasn't changed. In a list of 50+ tasks, this causes significant unnecessary renders when, e.g., the search box is typed into.

**Fix:** Wrap both with `React.memo`:

```ts
// At the bottom of the component definition:
export default React.memo(SortableTaskRow)
// and
export default React.memo(SortableProjectRow)
```

For callbacks passed as props, ensure they are wrapped in `useCallback` in the parent to prevent memo from being invalidated on every render.

**Verify:** In React DevTools Profiler, toggle a task complete — only that row should highlight as re-rendered, not the entire list.

---

### Item 8 · Extract `ToastContainer` to a shared UI component
**Category:** Code Quality | **Effort:** Easy (30 min)

**Problem:** The `ToastContainer` component (the floating notification stack) is defined independently in both `TasksView.tsx` and `SettingsView.tsx`. Any styling or behavior change needs to be applied in two places.

**Fix:**
1. Create `/components/ui/ToastContainer.tsx` with the shared component
2. Replace both local definitions with an import

**Verify:** Both task and settings pages show toasts correctly.

---

### Item 9 · Add `gcTime` to React Query global config
**Category:** Performance | **Effort:** Easy (10 min)

**Problem:** `components/QueryProvider.tsx` sets `staleTime: 5 * 60 * 1000` but never sets `gcTime` (garbage collection time). Queries that go stale sit in memory indefinitely, which can accumulate to a memory leak in long-running sessions.

**Fix:** In `components/QueryProvider.tsx`, add `gcTime` to the `defaultOptions`:

```ts
defaultOptions: {
  queries: {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,  // Remove from cache 10 min after going stale
    refetchOnWindowFocus: false,
  },
},
```

**Verify:** No visual change. Memory profiling should show query cache entries being freed after 10 minutes of inactivity.

---

### Item 10 · Add startup environment variable validation
**Category:** Reliability | **Effort:** Easy (1 h)

**Problem:** `lib/supabase/client.ts` and `lib/supabase/server.ts` use `!` non-null assertions on environment variables. If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, the app crashes at runtime with a cryptic error rather than a clear message at startup.

**Fix:**
1. Create `/lib/env.ts`:

```ts
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}. Check .env.local.`)
  }
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
}
```

2. Import `env` in `lib/supabase/client.ts` and `lib/supabase/server.ts` instead of accessing `process.env` directly.

3. Create `.env.example` in project root:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (for scripts only, never commit)
```

**Verify:** Remove `NEXT_PUBLIC_SUPABASE_URL` from `.env.local`, start dev server — should throw a descriptive error immediately.

---

### Item 11 · Fix email enumeration in signup
**Category:** Security | **Effort:** Easy (30 min)

**Problem:** `app/(auth)/signup/page.tsx` detects when an email is already registered via `identities.length === 0` and shows "An account with this email already exists." This lets an attacker enumerate valid email addresses in the system by repeatedly attempting signups.

**Fix:** Instead of showing a different message for existing emails, show the same "check your email" confirmation for all signup attempts. This is the standard Supabase pattern for invite-based or email-confirmed flows:

```ts
// Replace the identities check with:
setStep('confirm') // Always show the same confirmation screen
```

Or if Supabase email confirmation is on, Supabase itself sends the correct email (a "confirm" or "already exists" email to the address) without leaking status to the client.

**Verify:** Attempt signup with an existing email — should show same "check your email" screen as a new signup, not an error.

---

### Item 12 · Add `npm run` scripts for data import
**Category:** DX | **Effort:** Easy (10 min)

**Problem:** `package.json` has no script for running the data import. Developers must know to run `node scripts/import-tasks.mjs` manually.

**Fix:** Add to `package.json` scripts:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "import": "node scripts/import-tasks.mjs"
}
```

**Verify:** `npm run import` executes the import script.

---

### Item 13 · Archive `scripts/replace_colors.js` (one-off, obsolete)
**Category:** Code Cleanup | **Effort:** Easy (5 min)

**Problem:** `scripts/replace_colors.js` was a one-off utility to replace hex color values with Tailwind tokens. The migration is complete, colors now live in `globals.css`. The script modifies files in-place without backups and would corrupt files if run again accidentally.

**Fix:** Delete the file. It has no ongoing purpose and the functionality is in git history if ever needed again. Alternatively move to `.claude/scripts/` if you want to keep it accessible.

**Verify:** Project still builds. No references to `replace_colors` in package.json scripts.

---

## TIER 3 — Medium Impact, Medium Effort

### Item 14 · Batch `reorderTasks` DB calls (N mutations → 1)
**Category:** Performance | **Effort:** Medium (2–3 h)

**Problem:** In `lib/hooks/useTasks.ts`, the `reorderTasks` mutation fires one `UPDATE` query per task in the reordered week. A week with 20 tasks = 20 individual Supabase calls on every drag-and-drop. This can trigger Supabase rate limits and causes noticeable lag on large lists.

**Fix:** Create a Supabase database function (RPC) that accepts a list of `{id, sort_order}` pairs and updates them atomically:

```sql
-- Add to supabase/migrations/batch_reorder_tasks.sql
CREATE OR REPLACE FUNCTION batch_update_sort_order(
  updates jsonb  -- array of {id: uuid, sort_order: int}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE tasks
    SET sort_order = (item->>'sort_order')::int
    WHERE id = (item->>'id')::uuid
      AND admin_user_id = auth.uid();
  END LOOP;
END;
$$;
```

Then in `useTasks.ts`:

```ts
const { error } = await supabase.rpc('batch_update_sort_order', {
  updates: reorderedTasks.map((t, i) => ({ id: t.id, sort_order: i }))
})
```

**Verify:** Drag tasks to reorder — network tab should show a single RPC call instead of N UPDATE calls.

---

### Item 15 · Fix N+1 query in `DetailPanel` comments section
**Category:** Performance | **Effort:** Medium (1–2 h)

**Problem:** `components/tasks/DetailPanel.tsx` fetches comments for a task, then makes a **separate query to fetch user display names** for each unique commenter. This is a classic N+1 pattern: 1 comments query + N user queries.

**Fix:** Use a Supabase join to fetch comments with user display names in a single query:

```ts
const { data } = await supabase
  .from('task_comments')
  .select('*, users(first_name, last_name)')
  .eq('task_id', taskId)
  .order('created_at')
```

Adjust the TypeScript type for the result to include the nested `users` object.

**Verify:** Open a task detail panel with comments — network tab should show one query, not multiple.

---

### Item 16 · Separate React Query keys for own vs managed tasks
**Category:** Correctness | **Effort:** Medium (2 h)

**Problem:** Both the user's own tasks and the tasks the user is managing as a manager use the query key `['tasks', userId]`. If a manager views an admin's tasks and then navigates back to their own tasks, the cache serves the wrong data until it goes stale.

**Fix:** In `lib/hooks/useTasks.ts` and wherever `useTasksQuery` / `useProjectsQuery` are called, add a scope discriminator to the key:

```ts
// Own tasks
queryKey: ['tasks', 'own', userId]

// Managed tasks (in ManagerTaskView)
queryKey: ['tasks', 'managed', adminUserId]
```

Update all `queryClient.invalidateQueries` and `queryClient.setQueryData` calls to use the appropriate key.

**Verify:** As a manager, view Admin A's tasks. Navigate to your own tasks. The task list should immediately show your tasks, not a flash of Admin A's tasks.

---

### Item 17 · Replace `window` custom event for sidebar refresh with Context
**Category:** Architecture | **Effort:** Medium (2–3 h)

**Problem:** `components/layout/Sidebar.tsx` and `components/settings/SettingsView.tsx` communicate via a custom `window` event (`sidebar:refresh`). This is fragile: multiple listeners can accumulate if the component re-mounts, there's no TypeScript typing, and it bypasses React's data flow.

**Fix:** Create a `SidebarContext` (or reuse the existing `AuthContext`) that exposes a `refreshSidebar()` function and triggers a re-fetch of sidebar data. Components that need to trigger a refresh call this context method instead of dispatching a window event.

```ts
// lib/sidebar-context.tsx
const SidebarContext = createContext<{ refresh: () => void }>({ refresh: () => {} })

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  return (
    <SidebarContext.Provider value={{ refresh: () => setVersion(v => v + 1) }}>
      {children}
    </SidebarContext.Provider>
  )
}
```

**Verify:** After accepting a manager invitation in Settings, the sidebar badge count updates without a page reload.

---

### Item 18 · Add error states to Sidebar relationship queries
**Category:** UX | **Effort:** Medium (1 h)

**Problem:** `components/layout/Sidebar.tsx` makes two Supabase queries (manager relationships data) with no error handling. If Supabase is unreachable or returns an error, the sidebar silently shows empty/incorrect data with no indication to the user.

**Fix:** Capture errors from both queries and display a subtle indicator in the sidebar (e.g., a "!" icon or a muted "Unable to load" text next to the affected section).

**Verify:** Temporarily use an invalid Supabase URL or disable network — sidebar should show an error indicator rather than silently showing nothing.

---

### Item 19 · Batch `import-tasks.mjs` sequential DB inserts
**Category:** Performance (Scripts) | **Effort:** Medium (2 h)

**Problem:** `scripts/import-tasks.mjs` inserts tasks one-by-one in a sequential loop. For a CSV with 200 rows, this means 200+ sequential round-trips to Supabase. Project inserts are also sequential.

**Fix:**
1. Collect all project names, deduplicate, batch-insert with `supabase.from('projects').insert(allProjects)`
2. Collect all tasks into an array, then insert in a single call: `supabase.from('tasks').insert(allTasks)`
3. If notes/comments exist, do a second and third batch insert after tasks are created

**Verify:** Import a 100-row CSV — should complete significantly faster. Network tab shows ~3 INSERT calls instead of 100+.

---

### Item 20 · Expand README with setup instructions and `.env.example`
**Category:** DX | **Effort:** Easy (30 min)

**Problem:** `README.md` is nearly empty. A new developer joining the project has no instructions for local setup, no list of required environment variables, and no reference to SPEC.md.

**Fix:** Expand README to include:
- Prerequisites (Node.js version, Supabase CLI)
- Local setup: `npm install`, copy `.env.example` → `.env.local`, fill in values
- Running dev: `npm run dev`
- Link to SPEC.md for full product requirements
- Deployment notes (Vercel, environment variables to set)

Also create `.env.example` (see Item 10).

**Verify:** A developer who has never seen the codebase can follow README to get a working local dev environment.

---

## TIER 4 — Significant Refactors (High Effort)

### Item 21 · Unify `TasksView` and `ManagerTaskView` into one component
**Category:** Architecture | **Effort:** Hard (1–2 days)

**Problem:** `components/tasks/TasksView.tsx` and `components/manager/ManagerTaskView.tsx` are largely copy-paste duplicates. The only real difference is that `ManagerTaskView` is read-only (no editing, no drag-and-drop). State management, filtering logic, search, the table structure, and toolbar patterns are all duplicated.

**Fix:** Create a single `<TaskTableView readOnly={boolean} adminUserId={string}>` component. Pass `readOnly` to child row components to conditionally render edit controls. Merge the two files' logic with this one boolean gate.

**Verify:** Both `/tasks` (own view) and `/manager/:id` (manager view) render correctly. Manager view is still read-only. Tests (if any) still pass.

---

### Item 22 · Split `DetailPanel` into focused sub-components
**Category:** Architecture | **Effort:** Hard (1 day)

**Problem:** `components/tasks/DetailPanel.tsx` is ~500+ lines handling: task form state, dirty detection, notes fetching, notes editing, comments fetching, comments CRUD, footer save/cancel logic, and section navigation. It is hard to reason about and difficult to change safely.

**Fix:** Extract into:
- `<DetailsForm>` — form fields, dirty detection, save/cancel
- `<NotesSection>` — notes fetch, display, edit
- `<CommentsSection>` — comments fetch, add comment, delete comment
- `<DetailPanelFooter>` — save/cancel/delete buttons

Keep `DetailPanel` as the orchestrator that composes the above.

**Verify:** All DetailPanel functionality (notes edit, comments, save, delete) still works. No regressions.

---

### Item 23 · Split `TasksView` into focused sub-components
**Category:** Architecture | **Effort:** Hard (1 day)

**Problem:** `components/tasks/TasksView.tsx` handles filter state, search with dropdown, drag-and-drop reordering, the detail panel lifecycle, toast notifications, the add-task modal, and the full table render — all in one ~900-line file.

**Fix:** Extract:
- `<TaskSearchBar>` — search input, dropdown, result selection
- `<TaskTable>` — the DnD-enabled table (pure render from props)
- `<TaskModals>` — AddTaskModal and any future modals
- `<TasksPageLayout>` — top-level orchestrator

**Verify:** All TasksView functionality (search, filters, drag-drop, add task, detail panel) still works. No regressions.

---

### Item 24 · Implement Supabase Realtime subscriptions for task updates
**Category:** Feature / Architecture | **Effort:** Hard (1–2 days)

**Problem:** The manager task view does not update when an admin modifies a task. A manager must manually refresh to see changes. The SPEC implies real-time or near-real-time updates.

**Fix:** In `lib/hooks/useTasks.ts`, add a Supabase Realtime subscription alongside the query:

```ts
useEffect(() => {
  if (!adminUserId) return
  const channel = supabase
    .channel(`tasks:${adminUserId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: `admin_user_id=eq.${adminUserId}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'managed', adminUserId] })
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [adminUserId, queryClient])
```

**Verify:** Open manager view for an admin in one browser tab, edit a task in another tab logged in as the admin — the manager view should update within ~1 second without a manual refresh.

---

### Item 25 · Add pagination to tasks query
**Category:** Performance / Scalability | **Effort:** Hard (2 days)

**Problem:** `useTasksQuery` fetches ALL tasks for a user with no pagination. A user with 2+ years of weekly tasks (100+ weeks × 10 tasks = 1000+ rows) will see slow initial loads and a growing memory footprint. This also loads all historical weeks the user never looks at.

**Fix:** Implement week-range based fetching: only fetch tasks for weeks within a visible window (e.g., current week ± 12 weeks). Add navigation to load earlier/later ranges. Alternatively, implement cursor-based pagination with React Query's `useInfiniteQuery`.

**Verify:** A user with 500+ tasks sees the initial page load in under 1 second. Scrolling to older weeks triggers an additional fetch.

---

## Items Requiring Verification Before Acting

### Verify A · `lib/weeks.ts` — confirm FIRST_WEEK_MS is intentional
**Category:** Potential Bug | **Effort:** Verification only

`FIRST_WEEK_MS` is set to `2025-07-21` (July 21, 2025). `SPEC.md` mentions a different start date. However, since the app has been running since mid-2025 and tasks in the database reference dates starting from that week, **changing this value would break all existing task-week mappings**.

**Before acting:** Query Supabase directly: `SELECT MIN(week_start_date) FROM tasks`. If the earliest task date is `2025-07-21`, the constant is correct and the SPEC is simply aspirational/outdated. If it's different, update `FIRST_WEEK_MS` to match.

**Do not implement this as a code change without first verifying the database.**

---

## Priority Summary

| # | Item | Category | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Rename proxy.ts → middleware.ts | Security/Bug | Easy | Critical |
| 2 | Manager route authorization check | Security | Medium | Critical |
| 3 | Tighten RLS users read policy | Security | Medium | High |
| 4 | Filter manager queries by status=accepted | Security | Easy | High |
| 5 | Remove redundant cache invalidation | Performance | Easy | High |
| 6 | Extract duplicate task utility functions | Code Quality | Easy | Medium |
| 7 | Memoize SortableTaskRow / SortableProjectRow | Performance | Easy | Medium |
| 8 | Extract ToastContainer to shared component | Code Quality | Easy | Low |
| 9 | Add gcTime to React Query config | Performance | Easy | Low |
| 10 | Add env variable validation + .env.example | Reliability | Easy | Medium |
| 11 | Fix email enumeration in signup | Security | Easy | Medium |
| 12 | Add npm run scripts for data import | DX | Easy | Low |
| 13 | Archive replace_colors.js | Cleanup | Easy | Low |
| 14 | Batch reorderTasks DB calls via RPC | Performance | Medium | High |
| 15 | Fix N+1 query in DetailPanel comments | Performance | Medium | Medium |
| 16 | Separate query keys own vs managed tasks | Correctness | Medium | Medium |
| 17 | Replace window events with Context for sidebar | Architecture | Medium | Medium |
| 18 | Add error states to Sidebar queries | UX | Medium | Low |
| 19 | Batch import-tasks.mjs sequential inserts | DX/Perf | Medium | Low |
| 20 | Expand README + .env.example | DX | Easy | Low |
| 21 | Unify TasksView + ManagerTaskView | Architecture | Hard | Medium |
| 22 | Split DetailPanel into sub-components | Architecture | Hard | Medium |
| 23 | Split TasksView into sub-components | Architecture | Hard | Low |
| 24 | Supabase Realtime subscriptions | Feature | Hard | High |
| 25 | Pagination for tasks query | Scalability | Hard | Medium |
| A | Verify weeks.ts FIRST_WEEK_MS | Verification | — | — |
