# Task Tracker — Product Design & Engineering Specification

**Access Infinity · Version 1.2 · May 2026**

> This document is the authoritative reference for the Task Tracker web application. It is written to be self-contained so that any agentic AI coding tool or developer can pick up the project at any point and continue development without additional context.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Technology Stack](#3-technology-stack)
4. [Database Schema](#4-database-schema)
5. [Main Task Tracker View (Admin)](#5-main-task-tracker-view-admin)
6. [Task Management](#6-task-management)
7. [Settings Page](#7-settings-page)
8. [Manager Experience](#8-manager-experience)
9. [UI Design System](#9-ui-design-system)
10. [Phased Development Plan](#10-phased-development-plan)
11. [Resolved Decisions & Notes for Developers](#11-resolved-decisions--notes-for-developers)
12. [Data Loading & Performance](#12-data-loading--performance)

---

## 1. Project Overview

Task Tracker is a personal productivity web application built for internal use at Access Infinity. It replaces ad-hoc use of Notion and Excel with a purpose-built, week-oriented task management tool that supports structured review between a team member (Admin user) and their manager (Manager user).

Every user has a single account with two contexts: their own task list (where they are the owner) and a manager view (where they see task lists of people who have invited them). A user can be both simultaneously — for example, a manager who has their own personal task list and also reviews their direct reports' lists. The architecture is designed to scale to hundreds or thousands of users with minimal refactoring.

| | |
|---|---|
| **Hosting** | Vercel (frontend + serverless functions) |
| **Database** | Supabase (PostgreSQL + Auth + Row Level Security) |
| **Week navigation** | Open in both directions — no fixed start or end date |
| **Calendar week** | Monday – Sunday |
| **Initial users** | 1 Admin + 1 invited Manager |
| **Target scale** | Hundreds to thousands of users |

---

## 2. User Roles & Permissions

### 2.1 Dual-Role Model

Every user has a single account with access to two contexts. There is no separate "admin account type" or "manager account type" — every registered user can operate in both roles simultaneously.

| Context | Description |
|---|---|
| **Owner context** | Every user has their own task list, which they own and fully control. In this context they are the "owner" of their tasks. |
| **Manager context** | If another user has invited them as a manager, they can view and comment on that user's task list. A user can be a manager to multiple people simultaneously. |

A typical example: a team lead has their own task list (owner context) and also reviews two direct reports' task lists (manager context for each).

### 2.2 Permissions in Owner Context

When a user is viewing and managing their own task list:

- Create, edit, and delete tasks
- Tick tasks as complete or reopen them
- Flag tasks for manager attention
- Move tasks to future weeks
- Add and edit notes on any task
- Add, edit, and delete comments on any task (including comments written by their manager)
- Configure account settings and project list
- Invite managers via email

### 2.3 Permissions in Manager Context

When a user is viewing someone else's task list (having been invited as their manager):

- View all tasks, including completed and flagged tasks
- View notes written by the task list owner
- Add, edit, and delete their own comments on individual tasks
- Cannot create, edit, delete, or move tasks
- Cannot tick or untick tasks
- Cannot flag or unflag tasks

### 2.4 Authentication Architecture

Supabase Auth handles all authentication. Row Level Security (RLS) policies enforce permissions at the database level. Auth is fully enforced.

**Current state:** Users must sign in. The Next.js middleware unconditionally redirects unauthenticated users to `/login`. Four auth pages are implemented: Login (`/login`), Sign-up (`/signup`), Forgot password (`/forgot-password`), and Reset password (`/reset-password`). All use Supabase `signInWithPassword` / `signUp` / `resetPasswordForEmail`. On successful login the user is redirected to their `default_landing` page (`'task_list'` or `'manager_view'`). A `handle_new_user` Supabase trigger creates the `users` row at signup; the login page defensively backfills it if the row is absent.

---

## 3. Technology Stack

| | |
|---|---|
| **Frontend framework** | Next.js (React) — App Router |
| **Styling** | Tailwind CSS |
| **Backend / DB** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Hosting** | Vercel |
| **ORM / queries** | Supabase JS client (supabase-js v2) |
| **Email** | Supabase Auth email templates + transactional email (Resend or SendGrid) |
| **State management** | React Context + TanStack Query v5 (React Query) — client-side data fetching, caching, and optimistic updates |
| **Drag and drop** | dnd-kit |
| **Language** | TypeScript throughout |

---

## 4. Database Schema

All tables live in Supabase (PostgreSQL). RLS policies are defined on every table. The schema below represents the full target state including auth fields that are inactive in launch mode.

### 4.1 `users`

Extends Supabase `auth.users`. One row per registered user.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key, references `auth.users` |
| `first_name` | `text` |
| `last_name` | `text` |
| `email` | `text` — unique |
| `role` | `text` — reserved for future use. All users can operate in both owner and manager contexts; role is not used to gate access in v1. |
| `default_landing` | `text` — `'task_list'` \| `'manager_view'`. Default: `'task_list'`. Controls which view the user lands on after sign-in. `'manager_view'` is only selectable if the user has at least one accepted `manager_relationships` record. |
| `created_at` | `timestamptz` — default `now()` |
| `updated_at` | `timestamptz` |

### 4.2 `projects`

Admin-configurable project list. Each Admin has their own set of projects.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `admin_user_id` | `uuid` — references `users(id)` |
| `name` | `text` |
| `product` | `text` — optional product association (`'AH'` \| `'NURO'` \| `'EH'` \| `'N/A'`), nullable. Used to pre-filter the project dropdown when a product is selected in a task form. |
| `sort_order` | `integer` — drag-and-drop ordering within the user's project list |
| `is_visible` | `boolean` — default `true`. Hidden projects are excluded from the filter bar and project dropdowns; tasks that already reference them remain unaffected. |
| `created_at` | `timestamptz` |
| `updated_at` | `timestamptz` |
| `deleted_at` | `timestamptz` — soft delete |

### 4.3 `manager_relationships`

Tracks which manager has been invited to view which admin's task list.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `admin_user_id` | `uuid` — references `users(id)` |
| `manager_user_id` | `uuid` — references `users(id)`, nullable until accepted |
| `manager_email` | `text` — email used for the invitation |
| `status` | `text` — `'pending'` \| `'accepted'` \| `'archived'` |
| `invited_at` | `timestamptz` |
| `accepted_at` | `timestamptz` |
| `is_favorite` | `boolean` — default `false`. Set by the manager to pin the card to the top of their Manager landing page. |
| `is_archived` | `boolean` — default `false`. Set by the manager to move a card to the Archive tab on their Manager landing page. |

### 4.4 `tasks`

Core data model. One row per task.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `admin_user_id` | `uuid` — references `users(id)` |
| `product` | `text` — `'AH'` \| `'NURO'` \| `'EH'` \| `'N/A'` |
| `project_id` | `uuid` — references `projects(id)`, nullable |
| `description` | `text` |
| `week_start_date` | `date` — always a Monday, e.g. `2026-01-05` |
| `status` | `text` — `'open'` \| `'complete'` |
| `is_flagged` | `boolean` — default `false` |
| `sort_order` | `integer` — per-week ordering for drag-and-drop |
| `created_by` | `uuid` — references `users(id)` |
| `created_at` | `timestamptz` |
| `updated_at` | `timestamptz` |
| `updated_by` | `uuid` — references `users(id)` |

### 4.5 `task_notes`

Free-text notes written by the Admin for a task. One row per task (upsert pattern).

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `task_id` | `uuid` — references `tasks(id)` |
| `content` | `text` |
| `created_by` | `uuid` — references `users(id)` |
| `created_at` | `timestamptz` |
| `updated_at` | `timestamptz` |
| `updated_by` | `uuid` — references `users(id)` |

### 4.6 `task_comments`

Comments on tasks, typically written by the Manager. Full audit trail captured.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `task_id` | `uuid` — references `tasks(id)` |
| `content` | `text` |
| `created_by` | `uuid` — references `users(id)` |
| `created_at` | `timestamptz` |
| `updated_at` | `timestamptz` |
| `updated_by` | `uuid` — references `users(id)` |

---

## 5. Main Task Tracker View

This is the primary screen for all users when viewing their own task list.

### 5.1 Left Sidebar Navigation

A collapsible left sidebar provides navigation between the user's two contexts. It is present on all pages.

**Collapsed state (default):** A narrow icon rail (~52px wide). Icons only, no labels. Hovering an icon shows a tooltip label.

**Expanded state:** Triggered by clicking an expand/chevron icon at the top of the rail. Expands to ~220px. Shows icons and text labels.

**Navigation items:**

| Icon | Label | Behaviour |
|---|---|---|
| Task list icon | My tasks | Navigates to the user's own task list (owner context). Always visible. |
| People icon | Manager view | Navigates to the Manager landing page. **Only visible if the user has at least one accepted `manager_relationships` record.** Hidden entirely otherwise. |
| Settings icon | Settings | Navigates to the Settings page. Always visible, pinned to bottom of rail. |

The sidebar state (collapsed / expanded) is persisted to `localStorage` so it remembers the user's preference across sessions.

### 5.2 Layout Structure

- Left sidebar (see 5.1)
- Top bar — app logo/name, user avatar/initials
- Toolbar row — Add Task button, week navigation controls, view toggle, search input
- Filter/sort bar — filter chips (by product, by project), sort mode selector
- Table — scrollable horizontally, with two sticky left columns and dynamic week columns

### 5.3 Table Structure

Each row represents a single task. The product and project columns are sticky (`position: sticky`) so they remain visible during horizontal scroll.

| Column | Spec |
|---|---|
| **Column 1 — Product** | Sticky. Single-select badge: AH (blue), EH (yellow/gold), NURO (navy-purple), N/A (grey). Width ~84px. |
| **Column 2 — Project** | Sticky. Displays the project name from the admin's project list. Width ~240px. |
| **Week columns** | One column per week, minimum 200px wide. Header shows `Week of [Month] [Day], [Year]`. |

Week columns have no fixed start or end date. Navigation is open in both directions — users can scroll backward to any historical week and forward indefinitely. The initial view loads approximately 30 weeks centred on today; additional weeks are fetched automatically as the user navigates (see Section 12).

### 5.4 Week Navigation

- Left arrow button — navigate to previous set of weeks
- Right arrow button — navigate to next set of weeks
- Today button — jump back to the current week, always visible
- In Focused view: one column visible (current week)
- In Expanded view: three columns visible (previous, current, next week). The current week column header is highlighted with a teal underline indicator and a `current` label badge.

### 5.5 View Modes

| Mode | Behaviour |
|---|---|
| **Focused** | Shows only the current week column. Clean, minimal view for daily use. |
| **Expanded** | Shows three columns: previous week, current week, next week. Current week is visually distinguished by a teal underline on its column header and a small `current` badge. |

### 5.6 Filter Bar

A lightweight filter bar sits between the toolbar and the table. It filters which rows are visible — it does not paginate or hide week columns.

- **Filter by product:** chip buttons for AH, EH, NURO, N/A. Multiple can be active simultaneously. Clicking an active chip deactivates it.
- **Filter by project:** chip buttons for each visible project in the admin's project list that has at least one task in the loaded window. Multiple can be active.
- **Filter by status:** a "Status" dropdown chip showing checkboxes for Open, Completed, and Flagged. Multiple statuses can be active simultaneously.
- When no filters are active, all tasks are shown.
- Active filter chips are visually distinct (navy background, white text). The Status chip shows a count badge when one or more status filters are active.

### 5.7 Sort Modes

Sort is applied per-week (within each week column independently). Sort chips appear on the right side of the filter/sort bar.

| Mode | Behaviour |
|---|---|
| **Drag & drop** | User can drag rows to reorder tasks within a week. Sort order is persisted to `tasks.sort_order`. Default mode. Hidden in the manager read-only view. |
| **By product** | Tasks within each week are grouped and ordered: AH → EH → NURO → N/A. |
| **By project** | Tasks within each week are grouped alphabetically by project name. |
| **By product + project** | Both "By product" and "By project" are active simultaneously. Tasks are first grouped by product, then alphabetically by project within each product group. |

"By product" and "By project" are toggles that can be independently activated or combined. Drag-and-drop is disabled when either or both non-default sort modes are active. Activating "By product" while "By project" is already active (or vice-versa) enables the combined `product_project` mode.

### 5.8 Global Search

A search input in the toolbar provides global search across all tasks, all weeks.

- Searches across: task description, product name, project name
- Results appear in a dropdown below the search input
- Results are ordered most recent first (by `week_start_date` descending)
- Up to 8 results shown
- Each result shows: task description, product badge, project name, week label
- Clicking a result navigates to that week, clears all active filters, and briefly highlights the task row (2-second ring highlight)
- Search is debounced (300ms). Minimum 2 characters to trigger.

---

## 6. Task Management

### 6.1 Adding a Task

Clicking **Add task** (primary button in the toolbar, or the inline "Add task" link at the bottom of any week column) opens a modal dialog.

The modal contains:
- **Product** — single-select dropdown: Access Hub (AH), NURO, Evidence Hub (EH), N/A (Not Applicable). Required.
- **Project** — single-select dropdown, populated from the admin's project list. Required.
- **Task description** — free-text input. Required. As the user types, an autocomplete suggestion dropdown appears (see Section 6.7).
- Save and Cancel buttons.

New tasks are always created in the current week when opened via the toolbar button. When opened via the inline "Add task" link in a week column footer, the task is created in that specific week.

### 6.2 Task Row Actions

Each task row has a set of action icons. The checkbox is always visible. All other icons appear on hover, except the comment badge which is always visible when the task has comments.

| Action | Behaviour |
|---|---|
| **Checkbox** | Tick/untick to mark complete. Always visible. |
| **Pencil icon** | Inline edit the task description. Clicking the icon enters edit mode — a text input replaces the description. Press Enter or blur to save; press Escape to cancel. Appears on hover. |
| **Flag icon** | Toggle flagged state. Click once to flag, again to unflag. Appears on hover. |
| **Move icon (`ChevronsLeftRight`)** | Opens a combined dropdown for moving the task to any adjacent week. The dropdown has two groups separated by a divider: forward options (Next week +1 / +2 / +3 / +4 weeks) and backward options (Previous week −1 / −2 / −3 / −4 weeks). Appears on hover. |
| **Panel icon (`PanelRight`)** | Opens the detail panel (right-side). Appears on hover. |
| **Comment badge (`MessageSquare`)** | Visible (not hover-only) when `comment_count > 0`. Opens the detail panel scrolled to the Comments section. |
| **Delete icon** | Opens a confirmation dialog: "Are you sure you want to delete this task? This action cannot be undone." Confirm / Cancel. Appears on hover. |

### 6.3 Task States & Visual Treatment

| State | Visual |
|---|---|
| **Default** | White background, standard text. |
| **Flagged** | Light red background (`#FFCDD3`). Task text in dark red. Visible to both Admin and Manager. |
| **Complete** | Teal-green background (`#C3FFF8`). Task text struck through and muted. Teal checkbox. |
| **Flagged + Complete** | Complete styling takes precedence; flag indicator remains visible. |

### 6.4 Moving a Task

Selecting a move option immediately moves the task: it disappears from its current week and reappears in the target week. No placeholder is left in the original week. The move is reversible — the admin can move it forward or backward manually using the arrow icons.

### 6.5 Deleting a Task

On confirm, the task and all associated notes and comments are permanently deleted. A toast notification confirms the deletion. This action cannot be undone.

### 6.6 Detail Panel (Notes & Comments)

The detail panel is a right-side slide-in panel (360px wide). It is **not** triggered by clicking a task row. It opens via:
- The Panel icon (`PanelRight`) on a task row — opens with Notes as the default section
- The Comment badge (`MessageSquare`) on a task row — opens scrolled to the Comments section

Panel contents:
- Task description and product/project metadata at the top
- **Notes section** — free-text area editable by the Admin. Auto-saved on blur. Last-updated timestamp shown.
- **Comments section** — chronological list of comments. Each comment shows author name, timestamp, and text. Edit and delete buttons appear on hover for comments the current user is permitted to modify.
- A text input at the bottom of the Comments section to add a new comment with a Save button.

The panel closes by clicking the toggle icon, clicking outside, or pressing Escape.

### 6.7 Task Autocomplete

When typing in the task description field of the Add Task modal, an autocomplete dropdown appears after 2+ characters.

- Searches previous task descriptions belonging to the same Admin user only
- Scoped to the selected product if one has already been chosen in the modal; across all products if not
- Keyword-based `ilike` matching (case-insensitive substring). Results ranked by `created_at` descending (most recent first).
- Up to 5 unique suggestions shown (de-duplicated)
- Selecting a suggestion populates the description field; user can edit freely
- Debounced at 300ms

---

## 7. Settings Page

Accessible from the left sidebar (Settings icon, pinned to bottom). Available to all users.

### 7.1 Account Details

- First name — editable text input
- Last name — editable text input
- Email — editable text input
- **Current role** — editable text input (free text, e.g. "Product Manager"). Stored in `users.role`. Used to display role text on manager landing cards.
- **Default landing page** — radio with two options:
  - `My task list` (default for all users)
  - `Manager view` — only selectable if the user has at least one accepted `manager_relationships` record. If not, this option is greyed out with a note beneath it: *"Manager view is available once you have an accepted manager relationship. Ask a colleague to invite you as their manager."*
- Save button — updates the `users` table (`first_name`, `last_name`, `email`, `role`, `default_landing`)

### 7.2 Projects Configuration

Admin users manage their project list here. Changes are reflected immediately in the task table's Project dropdown.

- List of current projects — each row shows a product badge and project name, with drag handle (for reordering), visibility toggle (`Eye`/`EyeOff`), Edit (pencil), and Delete (trash) icons on hover.
- **Drag to reorder** — projects can be dragged to change their `sort_order`, which controls display order in all dropdowns.
- **Visibility toggle** — hidden projects (`is_visible = false`) are excluded from the filter bar and the project dropdowns in task forms. Tasks that already reference hidden projects are unaffected. The `EyeOff` icon is always visible for hidden projects; the `Eye` icon only appears on hover for visible ones.
- **Product association** — each project has an optional product field. When adding or editing a project, a product select dropdown and a name text input are shown. Duplicate (name + product) pairs are rejected with an inline error.
- Add new project — product dropdown + name input + Add button.
- Edit project — inline edit on the existing row (product dropdown + name input), Save (`Check`) / Cancel (`X`).
- Delete project — if the project has no tasks: confirmation dialog. If tasks reference the project: a blocking dialog explains that the project cannot be deleted until all tasks are reassigned. Soft-deletes via `deleted_at`.

### 7.3 Team Management

The "Team management" section handles the full bidirectional manager relationship lifecycle. It is split into several subsections:

**Add your manager** — An email input lets the current user invite someone to manage their task list:
- On blur/Enter, debounced live validation fires:
  - Email found in `users` → green message: "Registered user — invitation will be sent and they can accept it in Settings."
  - Email not found → amber message: "User not found. You can still invite this email — the invitation will appear once they register."
- **Invite manager button** — inserts a `manager_relationships` record (`status = 'pending'`, `admin_user_id = current user`, `manager_email = input`). If the email belongs to a known `users` row the `manager_user_id` is also set.
- Duplicate or archived invitations are rejected with an error toast.

**Accepted relationships** (shown when at least one exists):
- *"You are managing"* — lists task lists this user has accepted an invitation to manage. Each row has a **Remove** button which hard-deletes the record and triggers a sidebar refresh.
- *"You are being managed by"* — lists accepted managers for this user's own task list. Each row shows the manager's name, email, and acceptance date. Has a **Sever** button which hard-deletes the record.

**Pending** (shown when invitations are in-flight):
- *Incoming* — someone invited this user to be their manager. Shows the inviter's name/email and date. Actions: **Accept** (sets `status = 'accepted'`) and **Decline** (sets `status = 'archived'`).
- *Outgoing* — this user sent an invitation that hasn't been accepted yet. Shows the invitee email and date. Action: **Delete** (hard-deletes record after confirmation).

**Declined** — outgoing invitations that were declined (`status = 'archived'` from the invited person's perspective). Shows email and date. Actions: **Re-send** (sets `status = 'pending'` again) and **Delete** (hard-deletes after confirmation).

### 7.4 Export Data

Users can export all their tasks, notes, and comments as a CSV file.

- A single **Export to CSV** button fetches all tasks for the current user (no week-window filter — all historical data), joined with notes and comments.
- The downloaded file is named `tasks_YYYY-MM-DD.csv`.
- Columns: Week, Product, Project, Task Description, Notes, Comments, Status, Flagged.
- Comments are concatenated into a single cell in the format `[Author on Date] Text.` with multiple comments space-separated.
- The file includes a UTF-8 BOM for Excel compatibility.

---

## 8. Manager Experience

### 8.1 Manager Landing Page

Accessible via the Manager view item in the left sidebar. This item is hidden entirely if the user has no accepted `manager_relationships` records. When a user with accepted relationships clicks Manager view, they land on a page showing all the users whose task lists they manage.

If the user navigates to `/manager` but has no accepted relationships, they are automatically redirected to `/tasks` and their `default_landing` is reset to `'task_list'`.

Each Admin is shown as a card containing:
- Admin's full name and initials avatar
- Admin's role/title (if set in `users.role`)
- **Favourite star** (top-left) — toggles `is_favorite` on the `manager_relationships` row. Filled gold star = pinned to top.
- **Archive / Unarchive button** (top-right, appears on hover) — `ArchiveX` icon on Home tab archives the card (`is_archived = true`); `ArchiveRestore` icon on Archive tab unarchives it.

Clicking a card navigates to that admin's task list at `/manager/[adminUserId]`.

Page controls:
- **Search bar** — filters cards by name, role, or email in real time
- **Sort controls** — chip buttons: "Favourites first" (default), "Name A–Z", "By role"
- **Home / Archive tabs** — Home shows non-archived cards; Archive shows archived cards

> Cards are populated automatically from accepted `manager_relationships` records. There is no manual "Add person" button — the relationship is always initiated by the Admin from their Settings page.

### 8.2 Manager Task View

Clicking a card navigates to that user's task list. The view is identical to the owner's main task view with the following differences:

- No "Add task" button
- Task action icons (flag, move, delete) are hidden
- Checkbox is visible but non-interactive (display only)
- Flag and completion states are rendered exactly as the task owner sees them
- Notes icon and Comment icon are visible. Notes are read-only. Comments can be added, edited, or deleted by the manager.
- The left sidebar remains visible and functional — the manager can switch back to their own task list at any time without using the Back button
- A Back button in the top bar also returns to the Manager landing page
- **Live updates via Supabase Realtime** — the manager view subscribes to Postgres change events on the `tasks` table filtered to the task owner's records. Any task created, updated, or deleted by the owner is reflected in the manager's view within approximately one second, without a manual page reload. This requires Realtime to be enabled for the `tasks` table in the Supabase dashboard.

---

## 9. UI Design System

### 9.1 Color Palette

Colors are drawn from Access Infinity's PowerPoint brand palette. The application uses a muted professional dashboard aesthetic: light background, white surfaces, navy primary, teal accent.

| Token | Hex | Usage |
|---|---|---|
| Navy (primary) | `#19153F` | Top navigation, primary buttons, heading text |
| Navy mid | `#38308F` | Secondary nav elements, badge backgrounds |
| Navy light | `#B4AFE4` | NURO badge background |
| Teal (accent) | `#00D1BA` | Current week indicator, Today button, complete task fill |
| Teal light | `#C3FFF8` | Complete task row background, info boxes |
| Blue | `#0020BA` | AH badge text |
| Blue light | `#BDC7FF` | AH badge background |
| Yellow | `#FFD300` | EH badge accent |
| Yellow light | `#FFF7CB` | EH badge background |
| Red flag | `#FF0522` | Flagged task accent |
| Red flag light | `#FFCDD3` | Flagged task row background |
| Surface | `#FFFFFF` | Card and table cell background |
| Background | `#F2F2F2` | Page background, table header row |
| Border | `#DADADA` | All borders |
| Text primary | `#19153F` | Headings and labels |
| Text secondary | `#595959` | Body text |
| Text muted | `#797979` | Placeholders, minor labels |

### 9.2 Product Badge Colors

| Product | Background | Text |
|---|---|---|
| AH (Access Hub) | `#BDC7FF` | `#0020BA` |
| EH (Evidence Hub) | `#FFF7CB` | `#7F6900` |
| NURO | `#B4AFE4` | `#19153F` |
| N/A | `#E8E8E8` | `#595959` |

### 9.3 Typography

| | |
|---|---|
| **Font** | System UI stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| **Weights** | 400 (regular) and 500 (medium) only |
| **Base size** | 13–14px for table content, 12px for badges and labels |
| **Case** | Sentence case throughout. Never title case or all caps in UI. |

### 9.4 Component Patterns

- **Buttons:** 6px border-radius, 0.5px border, hover state with slightly darker border
- **Primary button:** navy background (`#19153F`), white text
- **Secondary buttons:** white background, light border, navy text on hover
- **Badges:** 4px border-radius, product-specific colors (see Section 9.2)
- **Table borders:** 0.5px, `#DADADA`
- **Sticky column shadow:** subtle right-side box-shadow to indicate scroll separation
- **Modals:** centered, white card, 12px border-radius, backdrop overlay
- **Toasts:** bottom-right, auto-dismiss after 3 seconds
- **Detail panel:** 360px wide, slides in from right, sits above content with backdrop

### 9.5 Icons

All icons throughout the application use **[Lucide React](https://lucide.dev)** (`lucide-react` package). No custom SVG icon functions should be added; always source from Lucide instead.

| Context | Size | Notes |
|---|---|---|
| Sidebar navigation | `size={20}` | `ListTodo`, `Users`, `Settings` |
| Sidebar collapse/expand chevrons | `size={16}` | `ChevronLeft`, `ChevronRight` |
| Toolbar buttons (tasks & manager views) | `size={14}–size={16}` | `Plus`, `Search`, `ChevronLeft`, `ChevronRight`, `ArrowLeft` (Back button) |
| Task row action icons | `size={14}` | `Pencil` (edit), `Flag`, `ChevronsLeftRight` (move), `PanelRight` (open panel), `MessageSquare` (comments), `Trash2` |
| Drag handle | `size={12}` | `GripVertical` |
| Detail panel | `size={12}–size={14}` | `X`, `Pencil`, `Trash2` |
| Manager view cards | `size={13}–size={16}` | `Star`, `ArchiveX`, `ArchiveRestore` |
| Manager view empty state | `size={28}` | `UserRound` |
| Settings — projects list | `size={13}–size={14}` | `GripVertical`, `Eye`, `EyeOff`, `Pencil`, `Trash2`, `Check`, `X` |
| Filter bar status dropdown | `size={11}` | `ChevronDown`, `X` |

**Fill states:** Icons that toggle between filled and unfilled (e.g. flag, star) use Tailwind's `fill-` utility class directly on the Lucide component — e.g. `className="text-[#FF0522] fill-[#FF0522]"`. No separate filled/unfilled SVG variants are needed.

### 9.6 Responsive Behaviour

Primary target is desktop browser. Week columns have a minimum width of 200px and expand to fill available space. The two sticky columns (Product 110px, Project 130px) are always visible. On narrower screens, horizontal scrolling is enabled on the table only (not the full page).

---

## 10. Phased Development Plan

Phases are ordered by dependency. Each phase is independently shippable to Vercel. **Phases 1–8 are complete as of May 2026.**

### Phase 1 — Project Scaffolding & Infrastructure ✓

- [x] Initialise Next.js project with TypeScript and Tailwind CSS
- [x] Connect Supabase project; configure environment variables
- [x] Create full database schema (all tables from Section 4) with RLS policies
- [x] Set up Vercel project and confirm CI/CD pipeline from GitHub
- [x] Configure Supabase Auth (email provider)
- [x] Implement base layout: left sidebar (collapsed rail, expandable), top bar, page shell
- [x] Implement sidebar navigation logic: My tasks always visible; Manager view hidden until accepted `manager_relationships` exist; Settings pinned to bottom; pending invite badge on Settings

### Phase 2 — Core Task Table ✓

- [x] Build the week-column table component with dynamic week generation
- [x] Implement sticky Product and Project columns
- [x] Implement Focused and Expanded view modes
- [x] Implement week navigation (prev/next arrows, Today button)
- [x] Apply full design system: colors, typography, badge styles, row heights

### Phase 3 — Task CRUD ✓

- [x] Wire table to Supabase: fetch real tasks (with rolling week-window)
- [x] Implement Add Task modal (product, project, description fields)
- [x] Implement task autocomplete (keyword search on description, scoped by product)
- [x] Implement inline task completion (checkbox toggle)
- [x] Implement inline task description editing (pencil icon)
- [x] Implement task flagging (flag icon toggle)
- [x] Implement Move Task dropdown (combined ±1–±4 weeks)
- [x] Implement Delete Task with confirmation modal
- [x] Implement drag-and-drop row reordering within a week column (dnd-kit)

### Phase 4 — Filter, Sort & Search ✓

- [x] Implement filter bar: product chips (AH/EH/NURO/N/A), project chips, status dropdown, multi-select logic
- [x] Implement sort modes: by product, by project, combined product+project, drag-and-drop default
- [x] Implement global search input with debounce, result dropdown (up to 8), week navigation and filter clear on selection

### Phase 5 — Detail Panel (Notes & Comments) ✓

- [x] Build the right-side slide-in panel component with open/close
- [x] Notes section: fetch, display, edit, and auto-save `task_notes`
- [x] Comments section: fetch and display `task_comments` with author and timestamp
- [x] Add new comment (input + Save button)
- [x] Edit and delete own comments (hover actions)
- [x] Wire panel open to PanelRight icon (notes) and MessageSquare badge (comments) on task rows

### Phase 6 — Settings Page ✓

- [x] Build Settings page layout with Account, Projects, Team management, and Export sections
- [x] Account details: read and update first name, last name, email, role, default landing
- [x] Projects: list, add, edit, delete, reorder (drag-and-drop), show/hide (visibility toggle)
- [x] Team management: full bidirectional invitation flow (send, accept, decline, re-send, remove)
- [x] Export data: CSV export of all tasks with notes and comments

### Phase 7 — Manager Experience ✓

- [x] Build Manager landing page (accessible via left sidebar Manager view item)
- [x] Implement favouriting, sorting, search, and Home/Archive tabs on landing page
- [x] Build Manager task view (read-only task table, comment-capable panel, sidebar remains active)
- [x] Implement Back navigation from task view to Manager landing page
- [x] Implement default landing page redirect on sign-in (reads `users.default_landing`)
- [x] Validate sidebar Manager view item appears/disappears correctly based on relationship status

### Phase 8 — Auth Enforcement ✓

- [x] Next.js middleware unconditionally redirects unauthenticated users to `/login`
- [x] Sign-in page (email + password)
- [x] Sign-up page
- [x] Forgot-password and reset-password pages
- [x] `handle_new_user` Supabase trigger creates `users` row on signup

---

## 11. Resolved Decisions & Notes for Developers

| Decision | Resolution |
|---|---|
| **Dual-role model** | Every user can operate as both task list owner and manager. There is no fixed account type. Access to each context is determined by data (what task lists they own, what `manager_relationships` they have). |
| **Left sidebar visibility** | Manager view item in the sidebar is hidden entirely until the user has at least one accepted `manager_relationships` record. The Settings icon shows a pending-invite badge count. |
| **Default landing page** | Stored in `users.default_landing`. Options: `'task_list'` (default) or `'manager_view'`. Manager view option is greyed out in settings with an explanatory note if no accepted manager relationships exist. |
| **Task creation target week** | Toolbar "Add task" always creates in the current (center) week. Inline "Add task" link at the bottom of a week column creates in that specific week. |
| **Autocomplete scope** | Scoped to the viewing user's own tasks only. Product-filtered if product is selected in the modal. Project-agnostic. |
| **Move task — combined icon** | A single `ChevronsLeftRight` icon opens a unified dropdown with both forward and backward options in two groups (divider-separated). There are no separate left/right arrow icons. |
| **Move task — original week** | No placeholder left. Task disappears from source week and appears in target week. |
| **Task ownership** | Each user sees only their own tasks in owner context. No shared team task lists in v1. |
| **Manager relationship init** | Task list owner invites manager from Settings (Team management section). Manager's landing page auto-populates from accepted relationships. Adding people on the manager side is not supported — the flow is always owner-initiated. |
| **Manager landing page data** | Cards are derived solely from accepted `manager_relationships` rows. `is_favorite` and `is_archived` are additional columns on `manager_relationships` controlled by the manager. |
| **Global search ordering** | Results ordered by `week_start_date` descending (most recent week first), capped at 8 results. |
| **Sort scope** | Sort (drag-and-drop, by product, by project) is applied per-week, not globally across the full table. |
| **Sort multi-select** | "By product" and "By project" can be active simultaneously (`product_project` combined mode). Clicking one while the other is already active enables the combined mode; clicking it again removes only that dimension. |
| **Week definition** | Monday–Sunday. No fixed start or end date. Navigation is open in both directions. The week epoch used internally is January 3, 2000 (the first Monday of 2000), giving a practical floor far enough back for any historical import. |
| **Week-window data loading** | The tasks query fetches a rolling window of weeks rather than all tasks. The initial window is approximately today −26 weeks to today +4 weeks. The window auto-expands by 13 weeks in either direction as the user navigates toward the boundary. This keeps initial load fast for users with years of task history. |
| **Realtime live updates** | The manager task view uses a Supabase Realtime Postgres changes subscription scoped to the task owner's `admin_user_id`. Any change to the tasks table triggers a React Query cache invalidation, refreshing the manager view within ~1 second. |
| **Row structure** | One row = one task. Product and project columns repeat per row. Multiple tasks for the same product/project in the same week each have their own row. |
| **Detail panel trigger** | Not auto-opened on row click. Opened via the `PanelRight` icon (notes) or the `MessageSquare` comment badge on a task row. The `MessageSquare` badge is only visible when `comment_count > 0`. |
| **Flagged task visibility** | Flag is visible to both task owner and manager. |
| **Comment editing** | Task list owner can edit or delete any comment (including manager comments). Intentional by design. Audit trail captured in `updated_by` and `updated_at`. |
| **Product list** | Fixed: Access Hub (AH), NURO, Evidence Hub (EH), N/A. Not user-configurable in v1. |
| **Project list** | Owner-configurable via Settings. Projects have a product association, a name, a visibility flag, and a drag-reorderable `sort_order`. Duplicate (name + product) pairs are rejected. Projects with active tasks cannot be deleted. |
| **Auth enforcement** | Fully enforced via Next.js middleware. No `NEXT_PUBLIC_AUTH_ENFORCED` feature flag exists. All routes except `/login`, `/signup`, `/forgot-password`, and `/reset-password` require an authenticated session. |
| **User role field** | `users.role` stores a free-text job title (e.g. "Product Manager"). Displayed on manager landing cards. Editable in Settings → Account details. |

---

## 12. Data Loading & Performance

### 12.1 Week-Window Pagination

The tasks query does not fetch all of a user's tasks on load. Instead, it fetches a rolling window of weeks from Supabase using `week_start_date` range filters.

**Initial window:** today −26 weeks to today +4 weeks (approximately 7 months).

**Auto-expansion:** when the user navigates within 4 weeks of either boundary of the loaded window, the window expands by 13 weeks in that direction and a new fetch is triggered. The expansion is cumulative — the window only ever grows, never shrinks.

**Cache behaviour:** the React Query cache key for tasks does not include the window bounds, so the optimistic update logic for mutations (toggle, flag, move, reorder, delete) continues to work unchanged. The window is passed to the query function via a ref and triggers a manual cache invalidation when it expands.

This approach keeps initial page load fast for users with years of task history (e.g. a user with 1,000+ tasks will load ~300 rows on first visit rather than all 1,000+), while making older and future weeks accessible on demand.

### 12.2 Server-Side Prefetch (Manager View)

The manager task view page uses Next.js server components to prefetch the task data before sending HTML to the browser. The server applies the same initial window filter as the client, so the prefetched data is consumed directly by React Query on hydration without an additional network request.

### 12.3 Batch Sort Order Updates

Drag-and-drop reordering within a week column persists sort order to the database using a single Supabase RPC call (`batch_update_sort_order`) rather than one `UPDATE` statement per task. The RPC function uses PostgreSQL `unnest` to update all affected rows in a single statement.

---

*Task Tracker Specification · Access Infinity · v1.2 · May 2026*

*Update this document as decisions are made or requirements change. Version the file (v1.3, v1.4, etc.) with a brief change note when significant updates are made.*

**v1.1 changes (May 2026):** Added N/A product option; open week navigation (no fixed start date); move-task backward action; corrected column widths; updated tech stack to TanStack Query v5; added `sort_order`, `product`, `is_visible` to projects schema; fixed search ordering; added Realtime live updates (§8.3); added Section 12 (Data Loading & Performance).

**v1.2 changes (May 2026):** Reconciled spec with actual codebase — all phases now marked complete. Updated §2.4 (auth is fully enforced, no feature flag). Updated §4.3 (added `is_favorite`/`is_archived` to `manager_relationships`). Fixed duplicate §5.3 numbering (renumbered §5.4–§5.8). Updated §5.6 Filter Bar (added N/A chip and Status dropdown). Updated §5.7 Sort Modes (multi-select product+project combined mode). Updated §6.2 Task Row Actions (single ChevronsLeftRight move icon, Pencil edit icon, PanelRight/MessageSquare panel triggers). Updated §6.6 Detail Panel triggers. Updated §6.7 autocomplete details. Updated §7.1 Account (added role field). Replaced §7.3 Manager Invitation with full "Team management" bidirectional flow. Added §7.4 Export data. Rewrote §8.1 Manager Landing (removed non-existent Add Person button); removed §8.2 Add/Edit Person Modal. Added N/A badge to §9.2. Updated §9.5 icon table. Added new Resolved Decisions entries.
