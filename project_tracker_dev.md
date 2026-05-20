# Project Tracker — Development Task List

**Task Tracker · Access Infinity · May 2026**

> This file is the implementation checklist for the Project Tracker feature. Each task is self-contained and written so that an agentic AI coding tool can be asked to implement a single task by number (e.g., "implement task 3") without needing additional context beyond this file and `spec.md`. Tasks must be implemented in order — each depends on what came before it.
>
> Reference spec: `spec.md` Sections 15 (feature specification) and 16 (implementation guide).

---

## Task 1 — Create `project_tracker_entries` table

**Files to create/modify:** Supabase SQL migration (run directly in the Supabase SQL editor or via a migration file)

Create the `project_tracker_entries` table with all columns, indexes, RLS policies, and enable Realtime. Use the exact SQL in `spec.md` §16.2.1.

Key points:
- `project_id` uses `ON DELETE RESTRICT` (not cascade) — blocks project deletion if entries exist
- Unique index on `(admin_user_id, project_id, week_start_date)` — enforces one entry per project per week
- Two RLS policies: owner full access, manager read-only (via accepted `manager_relationships`)
- Do NOT enable Realtime on this table yet — that comes in Task 24

---

## Task 2 — Create `project_tracker_comments` table with trigger

**Files to create/modify:** Supabase SQL migration

Create the `project_tracker_comments` table, the `set_ptc_admin_user_id` trigger function, and all RLS policies. Use the exact SQL in `spec.md` §16.2.2.

Key points:
- The trigger auto-populates `admin_user_id` from the parent entry row on INSERT — this is required for Realtime scoping (Task 24)
- RLS: owner has full access; manager can read all and write their own comments (scoped by accepted relationship)
- Do NOT enable Realtime on this table yet — that comes in Task 24

---

## Task 3 — Migrate `projects.product` to NOT NULL

**Files to create/modify:** Supabase SQL migration

Run the migration in `spec.md` §16.2.3 in order:
1. Backfill `NULL` → `'N/A'` on existing rows
2. Add `NOT NULL` constraint and `DEFAULT 'N/A'`
3. Drop the old partial unique index (`projects_unique_active_name` — used `coalesce` for nullable product)
4. Recreate the partial unique index without `coalesce`

Verify after running: `SELECT COUNT(*) FROM projects WHERE product IS NULL;` should return 0.

---

## Task 4 — Add TypeScript types for Project Tracker

**Files to create/modify:** the project's main types file (find it by looking for where `Task`, `Project`, etc. are defined — likely `lib/types.ts`, `types/index.ts`, or similar)

Add `ProjectTrackerEntry` and `ProjectTrackerComment` types exactly as specified in `spec.md` §16.3. Include the joined fields (`project_name`, `comment_count`, `author_name`) as optional properties.

---

## Task 5 — Enforce product as required in `ProjectsSection`

**Files to create/modify:** `components/settings/ProjectsSection.tsx`

Update the Add and Edit project forms so that:
1. The product dropdown has no blank/auto-selected default on the Add form — starts in an unselected/empty state
2. The Add button is disabled until both product and project name are non-empty
3. An inline validation message "Please select a product" appears if the user blurs the product dropdown without selecting a value
4. The same required validation applies to the inline Edit form
5. No changes needed to the project list display or delete flow

---

## Task 6 — Add configurable props to `SharedToolbar`

**Files to create/modify:** `components/tasks/shared/SharedToolbar.tsx`

Add three optional props with backward-compatible defaults so existing task list usage is completely unaffected:

| Prop | Type | Default |
|---|---|---|
| `addButtonLabel` | `string` | `'Add task'` |
| `searchPlaceholder` | `string` | `'Search tasks…'` |
| `managerViewTitle` | `string \| undefined` | `undefined` |

When `managerViewTitle` is provided and `adminName` is also set, render `managerViewTitle` instead of the current hardcoded `{adminName}'s Task List` string.

Update the button label and input placeholder in the JSX to use the new props. No other behavior changes.

---

## Task 7 — Add `hideStatus` and `dragExclusive` props to `SharedFilterBar`

**Files to create/modify:** `components/tasks/shared/SharedFilterBar.tsx`

Add two optional boolean props:

| Prop | Type | Default | Effect |
|---|---|---|---|
| `hideStatus` | `boolean` | `false` | When `true`, do not render the `StatusDropdown` component |
| `dragExclusive` | `boolean` | `false` | When `true`, drag & drop and product/project sorts are mutually exclusive |

**`dragExclusive` sort logic** (only applied when `dragExclusive = true`):
- Clicking "Drag & drop": call `onSortMode('drag')` unconditionally, ignoring current product/project state
- Clicking "By product" while drag is active: call `onSortMode(buildSortMode(false, true, flags.project))`
- Clicking "By project" while drag is active: call `onSortMode(buildSortMode(false, flags.product, true))`
- Clicking "By product" / "By project" while drag is NOT active: existing behavior unchanged

When `dragExclusive = false` (default), all existing sort handler logic is unchanged. The task list should work identically to before after this change.

---

## Task 8 — Add Project Tracker nav item to Sidebar

**Files to create/modify:** `components/layout/Sidebar.tsx`

1. Import `ChartGantt` from `lucide-react`
2. Add a Project Tracker nav item to `mainNavItems` **unconditionally** (no conditional, always shown), positioned between My tasks and Account health:

```typescript
{ href: '/project-tracker', label: 'Project Tracker', icon: <ChartGantt size={20} /> }
```

3. The existing `isActive` logic (`pathname === href || pathname.startsWith(href + '/')`) already handles this correctly — no changes needed to `isActive`.

4. Also update the icons table in `spec.md` §9.5 to add `ChartGantt` at `size={20}` for sidebar navigation (same row as `ListTodo`, `Users`, `Settings`). *(The spec has already been updated in §5.1; this is just the icon reference table in §9.5.)*

---

## Task 9 — Create `useProjectTrackerEntries` hook

**Files to create:** `hooks/useProjectTrackerEntries.ts` (or wherever existing hooks live — mirror the location of the tasks hook)

Create a React Query hook that mirrors the tasks hook (`useTasks` or equivalent). Requirements:

- Cache key: `['project-tracker-entries', scope, userId]` where scope is `'own'` or `'manager'`
- Query: fetch `project_tracker_entries` with `projects(name)` and `project_tracker_comments(count)` joined, filtered by `admin_user_id` and `week_start_date` range
- Map the nested `project_tracker_comments` count aggregate to a flat `comment_count` field on each entry (same pattern as tasks)
- Week-window pagination: same initial window (`today − 26 weeks` to `today + 4 weeks`) and auto-expansion logic (expand by 13 weeks when within 4 weeks of either boundary) as the tasks hook
- Mutations (all with optimistic updates where appropriate):
  - `createEntry(data)` — invalidates query on success
  - `updateEntry(id, patch)` — optimistic update for `is_flagged` and `description` changes
  - `deleteEntry(id)` — optimistic removal
  - `batchUpdateSortOrder(orderedIds)` — single RPC call, mirrors `batch_update_sort_order` pattern; create a new RPC `batch_update_pte_sort_order` in Supabase if one doesn't exist yet (same structure as the tasks RPC)

---

## Task 10 — Create `useProjectTrackerComments` hook

**Files to create:** `hooks/useProjectTrackerComments.ts` (or equivalent location)

Create a hook for fetching and mutating project tracker comments. Mirror the task comments query pattern used in `DetailPanel.tsx`:

- Cache key: `['project-tracker-comments', entryId]`
- Query: `from('project_tracker_comments').select('*, author:created_by(first_name, last_name)').eq('entry_id', entryId).order('created_at', { ascending: true })`
- Map author name from `author.first_name + ' ' + author.last_name`
- Mutations: `createComment(entryId, content)`, `updateComment(commentId, content)`, `deleteComment(commentId)`
- Each mutation invalidates `['project-tracker-comments', entryId]`

---

## Task 11 — Create `AddProjectModal`

**Files to create:** `components/project-tracker/AddProjectModal.tsx`

Create the modal for adding a project tracker entry. Spec reference: §15.9.

Requirements:
- **Modal size:** wider and taller than `AddTaskModal` (e.g., `max-w-lg` vs `max-w-md`); use `w-full` inside
- **Header:** "Add project" as title; subtitle showing the target week (e.g., "Week of May 19, 2026")
- **Project dropdown:** single `<select>` populated with the user's non-hidden projects. Each `<option>` displays `PRODUCT - Project Name` (e.g., `AH - Pfizer - Vaccines`). Sort options by project `sort_order`. No blank option after initial unselected state — force the user to pick. On change: store `project_id` and derive `product` from the selected project data.
- **Description textarea:** placeholder *"What's happening with this project this week? Include progress, blockers, and anything you need help with."* `maxLength={5000}`. Height: at minimum 5 rows visible.
- **Duplicate validation:** check selected `project_id` against the `entries` array passed as a prop (entries already loaded for the target week); if a match is found, show inline error: *"An entry for [PRODUCT - Project Name] already exists this week. You can edit it using the pencil icon in the table."* Disable the Save button.
- **Buttons:** Cancel (calls `onClose`) | **Save project** (calls `onCreate` with `{ project_id, product, description, week_start_date }`; disabled while loading or duplicate)

Props: `{ isOpen, onClose, onCreate, targetWeek: Date, existingEntries: ProjectTrackerEntry[], projects: Project[] }`

---

## Task 12 — Create `ProjectTrackerRow` (sortable, owner)

**Files to create:** `components/project-tracker/ProjectTrackerRow.tsx`

Create the sortable owner row. Mirror `SortableTaskRow.tsx` in structure. Spec reference: §15.10.

Requirements:
- Uses `useSortable` from dnd-kit (same as `SortableTaskRow`)
- Renders three cells: product badge (`<ProductBadge product={entry.product} />`), project name, description
- **Description cell:** text wraps fully (`whitespace-pre-wrap` or `break-words`); no truncation; variable row height — the `<tr>` or row container expands to fit content
- **Hover actions (appear on hover):** `Pencil` (enter inline edit), `Flag`, `PanelRight`, `Trash2`
- **`MessageSquare` badge:** always visible when `entry.comment_count > 0` (not hover-only); clicking opens sidebar scrolled to comments
- **Inline edit mode:** clicking `Pencil` replaces the description text with a `<textarea>` pre-filled with current description; Enter or blur saves (calls `updateEntry`); Escape cancels and restores original text
- **Flagged state:** `bg-[#FFCDD3]` on the row, dark red text color (`text-red-dark` or `text-[#FF0522]`)
- **No checkbox**, **no move icon**

Props: `{ entry, onFlag, onDelete, onOpenPanel, onOpenComments, onDescriptionSave, isDragActive }`

---

## Task 13 — Create `ProjectTrackerTable` (editable, owner)

**Files to create:** `components/project-tracker/ProjectTrackerTable.tsx`

Create the editable table component. Mirror `EditableTaskTable.tsx`. Spec reference: §15.7.

Requirements:
- Wraps `ProjectTrackerRow` components in `DndContext` + `SortableContext` from dnd-kit
- DnD enabled only when `parseSortMode(sortMode).drag === true`; when DnD is disabled, rows are rendered without the sortable wrapper (or with DnD listeners disabled)
- On drag end: calls `batchUpdateSortOrder` with the new order
- Client-side filtering: apply `filterProducts` and `filterProjects` to entries before render
- Client-side sorting: when product and/or project sort is active, sort entries accordingly before render; when drag sort is active, respect `entry.sort_order`
- Table structure: sticky Product column (~84px), sticky Project column (~240px), one week column (expands to fill)
- Table header row matches task list style (same font size, border, background)

Props: `{ entries, sortMode, filterProducts, filterProjects, onFlag, onDelete, onOpenPanel, onOpenComments, onDescriptionSave, onSortOrderChange, weekLabel }`

---

## Task 14 — Create `ProjectDetails` sidebar (owner)

**Files to create:** `components/project-tracker/ProjectDetails.tsx`

Create the right sidebar for project details. Mirror `DetailPanel.tsx` in shell structure. Spec reference: §15.11.

Requirements:
- **Shell:** 360px wide, slides in from right, sits above content with a backdrop overlay; close on X icon, outside click, or Escape. Same transition and z-index as `DetailPanel`.
- **Project dropdown:** single `<select>` at the top showing `PRODUCT - Project Name` options (same as `AddProjectModal`). Changing it marks the panel as having unsaved changes.
- **Description textarea:** dynamic height — use `field-sizing: content` CSS (if browser support is sufficient) or a `useEffect` that sets `textarea.style.height = textarea.scrollHeight + 'px'` on value change. Minimum height ~120px. Editing marks as unsaved.
- **Comments section:** reuse or adapt `components/tasks/detail-panel/CommentsSection.tsx`. Pass `entryId` and use `useProjectTrackerComments`. Full read/write: add new comment (text input + Save), edit own comments, delete own comments.
- **Footer:** "Unsaved changes" label at bottom-left + "Discard" and "Save" buttons at bottom-right — only visible when there are unsaved changes. Reuse or adapt `DetailPanelFooter`. "Discard" resets to last-saved values. "Save" calls `updateEntry` and clears unsaved state.

Props: `{ entry, projects, isOpen, onClose, onUpdate, currentUserId, scope: 'own' | 'manager' }`

When `scope === 'manager'`: project dropdown and description textarea are rendered as read-only display elements (not interactive inputs). Footer is hidden. Comments section remains fully editable.

---

## Task 15 — Create `ProjectTrackerView` (main owner view)

**Files to create:** `components/project-tracker/ProjectTrackerView.tsx`

Wire everything together for the owner view. Mirror `TaskTableView.tsx`. Spec reference: §15.4–§15.8.

Requirements:
- Uses `useProjectTrackerEntries({ scope: 'own' })`
- Uses `useProjects` (or equivalent) to get the user's project list for modals and sidebar
- **Toolbar:** `<SharedToolbar>` with `addButtonLabel="Add project"`, `searchPlaceholder="Search…"`, `onAddTask={() => setModalOpen(true)}`
- **Filter bar:** `<SharedFilterBar>` with `hideStatus={true}`, `dragExclusive={true}`
- **Table:** `<ProjectTrackerTable>` — passes current week's entries, sort mode, filter state
- **Modal:** `<AddProjectModal>` — controlled open state; on save calls `createEntry` and closes
- **Sidebar:** `<ProjectDetails>` — opened by panel/comment icon on a row; passes selected entry and project list
- **State:** week window index, filter products, filter projects, sort mode, search query, modal open, selected entry id
- **Search:** filter displayed entries by `description.toLowerCase().includes(query.toLowerCase())` within the visible week(s); use the same debounce pattern (300ms) as the task list search
- **View modes:** Focused (1 column) and Expanded (3 columns), same as task list

---

## Task 16 — Create `/project-tracker` page route

**Files to create:**
- `app/(app)/project-tracker/page.tsx`
- `app/(app)/project-tracker/loading.tsx`

**`page.tsx`:** Server component. Mirror `app/(app)/tasks/page.tsx` exactly in structure:
1. Get the authenticated user server-side
2. Prefetch `project_tracker_entries` with `project_tracker_comments(count)` for the initial week window under cache key `['project-tracker-entries', 'own', userId]`
3. Return `<HydrationBoundary state={dehydrate(queryClient)}><ProjectTrackerView /></HydrationBoundary>`

**`loading.tsx`:** Lightweight skeleton with the same three-section structure as the task list loading skeleton (toolbar bar placeholder, filter bar placeholder, table row placeholders).

---

## Task 17 — Update `ManagerViewTabs` for three-tab structure

**Files to modify:** `components/manager/ManagerViewTabs.tsx`

Changes required:
1. Remove the `if (!accountHealthEnabled) return null` guard — the tab bar always renders now
2. Update the tab list to three tabs in this order:
   - **Project Tracker** — `href=/manager/${adminUserId}/project-tracker`, always shown
   - **Account Health** — `href=/manager/${adminUserId}/account-health`, only shown when `accountHealthEnabled === true`
   - **Task List** — `href=/manager/${adminUserId}/tasks`, always shown
3. Update active tab detection logic:
   - Project Tracker tab is active when `pathname.includes('/project-tracker')` OR when `pathname === /manager/${adminUserId}` (the redirect source)
   - Account Health tab is active when `pathname.includes('/account-health')`
   - Task List tab is active when `pathname.includes('/tasks')`

No changes to `TabLink` visual styling.

---

## Task 18 — Create read-only Project Tracker table and row components

**Files to create:**
- `components/project-tracker/ReadOnlyProjectTrackerRow.tsx`
- `components/project-tracker/ReadOnlyProjectTrackerTable.tsx`

These are the manager-view equivalents of Tasks 12 and 13. Mirror `ReadOnlyTaskRow.tsx` and `ReadOnlyTaskTable.tsx`.

**`ReadOnlyProjectTrackerRow.tsx`:**
- Renders product badge, project name, description (same wrapping + variable height as `ProjectTrackerRow`)
- Flag state rendered visually (light red background when `is_flagged`, but clicking does nothing)
- `MessageSquare` badge always visible when `comment_count > 0`; clicking opens sidebar scrolled to comments
- `PanelRight` icon on hover; clicking opens sidebar
- **No** pencil, drag handle, flag toggle, delete icon

**`ReadOnlyProjectTrackerTable.tsx`:**
- No DnD context
- Applies product/project sort and filters client-side
- Renders `ReadOnlyProjectTrackerRow` components
- Same table structure (sticky columns, week column) as `ProjectTrackerTable`

---

## Task 19 — Create `ManagerProjectTrackerView`

**Files to create:** `components/manager/ManagerProjectTrackerView.tsx`

Wire together the read-only table, sidebar, toolbar, and filter bar for the manager view. Mirror `ManagerTaskView.tsx`.

Requirements:
- Uses `useProjectTrackerEntries({ scope: 'manager', adminUserId })`
- **Toolbar:** `<SharedToolbar>` with `adminName={adminFirstName}`, `managerViewTitle={\`${adminFirstName}'s Project Tracker\`}` (no "Add project" button — `onAddTask` not passed)
- **Filter bar:** `<SharedFilterBar>` with `hideStatus={true}`, `hideDragSort={true}`, `dragExclusive={false}`
- **Table:** `<ReadOnlyProjectTrackerTable>` with filter and sort props
- **Sidebar:** `<ProjectDetails>` with `scope="manager"` — project and description are read-only; comments are editable

Props: `{ adminUserId: string, adminFirstName: string, accountHealthEnabled: boolean }`

---

## Task 20 — Create `/manager/[adminUserId]/project-tracker` route

**Files to create:**
- `app/(app)/manager/[adminUserId]/project-tracker/page.tsx`
- `app/(app)/manager/[adminUserId]/project-tracker/loading.tsx`

**`page.tsx`:** Server component. Mirror the structure of `app/(app)/manager/[adminUserId]/page.tsx` (the existing task list manager page):
1. Get authenticated user server-side; verify manager relationship exists
2. Fetch managed user's profile (for `adminFirstName` and `accountHealthEnabled`)
3. Prefetch `project_tracker_entries` with `project_tracker_comments(count)` under cache key `['project-tracker-entries', 'manager', adminUserId]`
4. Render `<ManagerViewTabs>` + `<HydrationBoundary>` wrapping `<ManagerProjectTrackerView>`

**`loading.tsx`:** Same skeleton structure as other manager loading pages.

---

## Task 21 — Move task list route and redirect root manager route

**Files to create/modify:**
- `app/(app)/manager/[adminUserId]/tasks/page.tsx` — **new file**
- `app/(app)/manager/[adminUserId]/tasks/loading.tsx` — **new file**
- `app/(app)/manager/[adminUserId]/page.tsx` — **replace content**

**Step 1 — copy first, then replace.** Read the full current content of `app/(app)/manager/[adminUserId]/page.tsx`. Copy it verbatim into `app/(app)/manager/[adminUserId]/tasks/page.tsx`. Make one change in the copy: update the `ManagerViewTabs` invocation to ensure the tab bar renders (it should already work with the Task 17 change).

**Step 2 — create `tasks/loading.tsx`.** Copy from the existing `app/(app)/manager/[adminUserId]/loading.tsx` — it can be identical.

**Step 3 — replace `page.tsx` with a redirect:**

```typescript
import { permanentRedirect } from 'next/navigation'

export default function ManagerAdminUserPage({ params }: { params: { adminUserId: string } }) {
  permanentRedirect(`/manager/${params.adminUserId}/project-tracker`)
}
```

After this change, `/manager/[adminUserId]` immediately redirects to the Project Tracker. The original task list is now at `/manager/[adminUserId]/tasks`.

---

## Task 22 — Create `/api/export/project-tracker` route handler

**Files to create:** `app/api/export/project-tracker/route.ts`

Mirror `app/api/export/tasks/route.ts`. Requirements:

- Authenticated `GET` handler — verify session; return 401 if unauthenticated
- Fetch all `project_tracker_entries` for the current user — **no week-window filter** (export all history)
- Join: `projects(name)` for the project name; `project_tracker_comments(content, created_at, author:created_by(first_name, last_name))` for comments
- Build CSV with UTF-8 BOM (`﻿`), columns in order: Week, Product, Project, Description, Flagged, Comments
  - **Week:** `Week of MMM D, YYYY` (e.g., `Week of May 19, 2026`)
  - **Flagged:** `true` or `false`
  - **Comments:** concatenated as `[Author Name on Mon D, YYYY] Content.` — space-separated; empty string if no comments
- Response headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="project_tracker_YYYY-MM-DD.csv"` (today's date)

---

## Task 23 — Add project tracker export to `ExportSection`

**Files to modify:** `components/settings/ExportSection.tsx`

Add a second export block below the existing task list export. Match the visual style of the existing export card exactly.

- Description text: *"Download all your project tracking notes and updates as a CSV file."*
- Button label: **Export Project Tracker to CSV**
- On button click: `window.location.href = '/api/export/project-tracker'`
- Button loading/disabled state while navigating (optional — match whatever pattern the task list export uses)

If the existing `ExportSection` uses a single `SectionCard` with one button, either add a second button within the same card or add a new `SectionCard` — use whichever approach matches the existing layout pattern more cleanly.

---

## Task 24 — Add Realtime subscription for `project_tracker_comments`

**Files to modify:**
- `components/project-tracker/ProjectDetails.tsx`
- Supabase dashboard: enable Realtime on `project_tracker_comments` table

**In the Supabase dashboard:** go to Database → Replication (or Table Editor → Realtime) and enable Realtime for `project_tracker_comments`. This is a one-time manual step, the same as was done for `task_comments`.

**In `ProjectDetails.tsx`:** add a Supabase Realtime Postgres changes subscription that mirrors the pattern used in `DetailPanel.tsx` for `task_comments`:

- Subscribe when the sidebar opens with a selected entry (`entryId` is set)
- Unsubscribe when the sidebar closes or `entryId` changes
- Channel filter: `admin_user_id=eq.${adminUserId}` — use the entry owner's `admin_user_id` (not the current user's ID), so managers also receive comment events when viewing someone else's entries
- On `INSERT`, `UPDATE`, or `DELETE` events: call `queryClient.invalidateQueries({ queryKey: ['project-tracker-comments', entryId] })`

This gives both the owner and the manager near-real-time comment updates (~1 second) without a manual refresh.

---

*All 24 tasks complete = Project Tracker feature fully implemented.*

*Reference: `spec.md` §15 (feature specification) and §16 (implementation guide)*
