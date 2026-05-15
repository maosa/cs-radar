# Task Tracker — Product Design & Engineering Specification

**Access Infinity · Version 1.3 · May 2026**

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
13. [Account Health — Feature Specification](#13-account-health--feature-specification)
14. [Account Health — Implementation Guide](#14-account-health--implementation-guide)

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

*Task Tracker Specification · Access Infinity · v1.3 · May 2026*

*Update this document as decisions are made or requirements change. Version the file (v1.4, v1.5, etc.) with a brief change note when significant updates are made.*

**v1.1 changes (May 2026):** Added N/A product option; open week navigation (no fixed start date); move-task backward action; corrected column widths; updated tech stack to TanStack Query v5; added `sort_order`, `product`, `is_visible` to projects schema; fixed search ordering; added Realtime live updates (§8.3); added Section 12 (Data Loading & Performance).

**v1.2 changes (May 2026):** Reconciled spec with actual codebase — all phases now marked complete. Updated §2.4 (auth is fully enforced, no feature flag). Updated §4.3 (added `is_favorite`/`is_archived` to `manager_relationships`). Fixed duplicate §5.3 numbering (renumbered §5.4–§5.8). Updated §5.6 Filter Bar (added N/A chip and Status dropdown). Updated §5.7 Sort Modes (multi-select product+project combined mode). Updated §6.2 Task Row Actions (single ChevronsLeftRight move icon, Pencil edit icon, PanelRight/MessageSquare panel triggers). Updated §6.6 Detail Panel triggers. Updated §6.7 autocomplete details. Updated §7.1 Account (added role field). Replaced §7.3 Manager Invitation with full "Team management" bidirectional flow. Added §7.4 Export data. Rewrote §8.1 Manager Landing (removed non-existent Add Person button); removed §8.2 Add/Edit Person Modal. Added N/A badge to §9.2. Updated §9.5 icon table. Added new Resolved Decisions entries.

**v1.3 changes (May 2026):** Consolidated `account_health.md` (feature spec, previously Draft v1.4) and `account_health_implementation.md` (implementation guide, previously v1.0) into this document as Sections 13 and 14. Cross-references updated to new numbering. Source files are superseded by this document.

---

## 13. Account Health — Feature Specification

### 13.1 Overview & Approach

Account Health is a new page in the Task Tracker that allows CS Leads and Client Partners to conduct structured, monthly risk assessments for each client account they manage. It sits alongside the existing task list as a separate, first-class section of the platform.

Key characteristics:

- Account Health is **opt-in per user**. It is disabled by default and must be explicitly enabled in Settings. This means users who only use the task tracking features are unaffected.
- Each user has their own Account Health data, scoped to their client accounts
- Assessments are organised by month (not by week, unlike the task list)
- Each month contains a fixed set of risk questions grouped into labelled sections
- Responses are binary (yes / no) or three-level (low / medium / high) depending on the section
- Each question has two free-text comment fields: one for the CS Lead, one for the Client Partner
- The client account list is defined by the user in Settings, similar to how the project list is currently managed
- Managers can view a user's Account Health data through the manager view, but only if that user has Account Health enabled

---

### 13.2 Settings: Architecture Decision

#### Recommendation: Option 1 (keep projects separate, add a parallel client accounts section)

Option 2 (full Client Account > Product > Project hierarchy) is architecturally cleaner in the long run but would require restructuring the `projects` table, the `tasks` table references, and all existing queries — with meaningful risk to live data. Given that the app is already in active use, Option 1 is the right starting point.

**What Option 1 means in practice:**

The Settings page will have two distinct, clearly labelled sections for lists that appear in different parts of the app:

- **Projects** — used in the task list when creating or editing a task. The description beneath the section heading will be updated to say: *"Projects appear in the task list when you create or edit a task. Each project can be associated with a product to pre-filter the dropdown."*
- **Client Accounts** — used in Account Health when selecting which client you are reviewing. Each client account has a name and an optional product association.

There is intentional overlap (a project like "Vaccines" maps to Pfizer / AH, and a client account called "Pfizer" also maps to AH), but this duplication is tolerable in v1 and can be collapsed in a future Option 2 migration once the hierarchy is validated.

#### A note on flipping the hierarchy

For a CSM, the natural unit of work is the client. You think "I need to do Pfizer's monthly review", not "I need to do the AH review". You also think "I need to add a task for Pfizer", not "I need to add a task for AH". This is reinforced by the examples — Pfizer, Astellas, Regeneron, etc. are the primary identifiers, with product as a sub-attribute.

**The hierarchy Client Account > Product > Project is the right one.** Keep this as the design target for Option 2.

---

### 13.3 Settings: Client Accounts Section

#### 13.3.1 Account Health enable/disable toggle

The Settings page section order is: **Account details → Projects → Team management → Account health → Export data.**

The Account Health `SectionCard` therefore sits between Team Management and Export Data. Its content is a single toggle or checkbox:

> **Enable account health**
> Turn this on if you manage client accounts and want to use the monthly risk assessment features. This adds an Account health page to your sidebar.

- Default state: **off**
- When toggled on: the Account Health nav item appears in the sidebar (see Section 13.5), and the Client Accounts section becomes visible lower on the Settings page
- When toggled off: the Account Health nav item disappears from the sidebar. Existing client account definitions and assessment data are retained in the database — nothing is deleted
- The toggle state is stored in `users.account_health_enabled` (see Section 13.4.5)
- Save is immediate on toggle change (no separate save button needed for this field)
- After saving, the component calls `triggerSidebarRefresh()` from the `useSidebarRefresh()` hook. This increments the shared counter in `SidebarContext`, which the Sidebar component is already subscribed to — it immediately re-fetches `account_health_enabled` from Supabase and re-evaluates which nav items to show. The sidebar updates **without any page reload** — the same mechanism already used today when accepting or declining a manager invitation.

> **Note for managers:** A manager never needs to enable Account Health for themselves in order to view a user's account health data. The visibility of Account Health in the manager view is determined by whether the user being managed has it enabled (see Section 13.10.4). Account Health in a user's own sidebar is entirely separate from their manager's access to it.

#### 13.3.2 Client Accounts section visibility

The Client Accounts `SectionCard` in Settings is only rendered when `account_health_enabled` is `true` for the current user. It appears immediately after the Account Health toggle card. If a user disables Account Health, the section is hidden (though any data already saved is preserved).

#### 13.3.3 Location on the Settings page

When Account Health is enabled, the `SectionCard` titled **"Client accounts"** appears directly below the Account Health toggle card (i.e., between Team Management and Export Data). Include a short description:

> *Used in Account Health to select the client you are reviewing. Each account can be associated with a product.*

#### 13.3.4 Behaviour

The Client Accounts section mirrors the Projects section exactly in terms of UX patterns:

- **List of current client accounts** — each row shows the account name, an optional product badge, and on hover: Edit (pencil), visibility toggle (Eye / EyeOff), and Delete (trash) icons
- **Drag-to-reorder** — same dnd-kit SortableContext pattern as projects. The order set here is the order in which accounts appear in the Account Health dropdown
- **Add new account** — product selector dropdown + text input + Add button, same layout as adding a project. Product is optional (accounts like "General" may not have one)
- **Edit** — inline edit with save / cancel, same as project edit
- **Delete** — if the account has any `account_health_responses` or `account_health_metadata` rows, show a blocking dialog: *"[Account name] cannot be deleted because it has assessment data. Please contact support if you need to remove it."* If it has no data, confirm with: *"Are you sure you want to delete this client account? This action cannot be undone."*
- **Visibility toggle** — same Eye/EyeOff logic as projects. Hidden accounts are excluded from the Account Health dropdown but their historical data is preserved
- **Duplicate validation** — same name + product combination is rejected inline

#### 13.3.5 New database table: `client_accounts`

See Section 13.4.1.

---

### 13.4 Database Schema (Account Health)

#### 13.4.1 `client_accounts`

Stores the user-defined list of client accounts. Mirrors the structure of `projects`.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key, `uuid_generate_v4()` |
| `admin_user_id` | `uuid` — references `users(id)` on delete cascade |
| `name` | `text` — e.g. "Pfizer", "Astellas" |
| `product` | `text` — nullable, `check (product in ('AH', 'NURO', 'EH', 'N/A'))` |
| `sort_order` | `integer` — not null, default 0 |
| `is_visible` | `boolean` — not null, default true |
| `created_at` | `timestamptz` — not null, default `now()` |
| `updated_at` | `timestamptz` |
| `deleted_at` | `timestamptz` — soft delete |

```sql
create table if not exists public.client_accounts (
  id            uuid primary key default uuid_generate_v4(),
  admin_user_id uuid not null references public.users(id) on delete cascade,
  name          text not null,
  product       text check (product in ('AH', 'NURO', 'EH', 'N/A')),
  sort_order    integer not null default 0,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);

create index if not exists client_accounts_admin_user_id_idx on public.client_accounts(admin_user_id);
```

#### 13.4.2 `account_health_metadata`

Client-level fields that are not month-specific: renewal date, last engagement date, and type of engagement. One row per client account (upsert pattern).

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `client_account_id` | `uuid` — references `client_accounts(id)` on delete cascade |
| `admin_user_id` | `uuid` — references `users(id)` on delete cascade |
| `renewal_date` | `date` — nullable |
| `last_engagement_date` | `date` — nullable |
| `engagement_type` | `text` — nullable, `check (engagement_type in ('monthly_review', 'qbr', 'training', 'project_call', 'spontaneous', 'other'))` |
| `updated_at` | `timestamptz` |
| `updated_by` | `uuid` — references `users(id)` on delete set null |

```sql
create table if not exists public.account_health_metadata (
  id                   uuid primary key default uuid_generate_v4(),
  client_account_id    uuid not null references public.client_accounts(id) on delete cascade,
  admin_user_id        uuid not null references public.users(id) on delete cascade,
  renewal_date         date,
  last_engagement_date date,
  engagement_type      text check (engagement_type in (
                         'monthly_review', 'qbr', 'training',
                         'project_call', 'spontaneous', 'other'
                       )),
  updated_at           timestamptz,
  updated_by           uuid references public.users(id) on delete set null,
  unique (client_account_id)
);
```

#### 13.4.3 `account_health_responses`

One row per (client account, month, question). Stores the response selection and both comment columns, along with separate audit fields for each comment column.

`month` is always stored as the first day of the month (e.g. `2026-04-01`). This makes range queries and month equality checks straightforward.

`question_id` is a text enum identifying which question this row answers. Full list in Section 13.7.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `client_account_id` | `uuid` — references `client_accounts(id)` on delete cascade |
| `admin_user_id` | `uuid` — references `users(id)` on delete cascade |
| `month` | `date` — not null, always the first day of the month |
| `question_id` | `text` — not null, one of the enum values in Section 13.7.3 |
| `response` | `text` — nullable, `check (response in ('yes', 'no', 'low', 'medium', 'high'))` |
| `cs_lead_comment` | `text` — nullable |
| `cs_lead_updated_at` | `timestamptz` |
| `cs_lead_updated_by` | `uuid` — references `users(id)` on delete set null |
| `client_partner_comment` | `text` — nullable |
| `client_partner_updated_at` | `timestamptz` |
| `client_partner_updated_by` | `uuid` — references `users(id)` on delete set null |
| `created_at` | `timestamptz` — not null, default `now()` |
| `updated_at` | `timestamptz` |
| `updated_by` | `uuid` — references `users(id)` on delete set null |

```sql
create table if not exists public.account_health_responses (
  id                         uuid primary key default uuid_generate_v4(),
  client_account_id          uuid not null references public.client_accounts(id) on delete cascade,
  admin_user_id              uuid not null references public.users(id) on delete cascade,
  month                      date not null,
  question_id                text not null,
  response                   text check (response in ('yes', 'no', 'low', 'medium', 'high')),
  cs_lead_comment            text,
  cs_lead_updated_at         timestamptz,
  cs_lead_updated_by         uuid references public.users(id) on delete set null,
  client_partner_comment     text,
  client_partner_updated_at  timestamptz,
  client_partner_updated_by  uuid references public.users(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz,
  updated_by                 uuid references public.users(id) on delete set null,
  unique (client_account_id, month, question_id)
);

create index if not exists ahr_client_account_month_idx
  on public.account_health_responses(client_account_id, month);
create index if not exists ahr_admin_user_id_idx
  on public.account_health_responses(admin_user_id);
```

The `unique (client_account_id, month, question_id)` constraint enables safe upsert operations.

#### 13.4.4 Migration SQL (new tables only — additive, no changes to existing tables)

The three new tables (`client_accounts`, `account_health_metadata`, `account_health_responses`) plus their RLS policies (Section 13.11) are entirely additive. The only change to an existing table is the addition of one column to `users` (Section 13.4.5).

#### 13.4.5 `users` table: new column `account_health_enabled`

| Column | Definition |
|---|---|
| `account_health_enabled` | `boolean` — not null, default `false` |

```sql
alter table public.users
  add column if not exists account_health_enabled boolean not null default false;
```

This is the only change to an existing table. The default of `false` means no existing users are affected. The `users: self update` RLS policy already in place covers this column; no new policy is needed.

---

### 13.5 Sidebar Changes

#### 13.5.1 New nav item

Add an Account Health nav item to the main navigation in `Sidebar.tsx`, between "My tasks" and "Manager view":

| Icon | Label | Route | Behaviour |
|---|---|---|---|
| `Gauge` (size 20) | Account health | `/account-health` | **Conditionally visible** — shown only when `account_health_enabled = true` for the current user. Same active-state logic as other nav items. |

#### 13.5.2 Updated state in `Sidebar.tsx`

The sidebar currently fetches `hasManagerRelationships` from Supabase. Add a parallel fetch for `account_health_enabled` from the `users` table:

```ts
const [relResult, countResult, userResult] = await Promise.all([
  supabase.from('manager_relationships')
    .select('id').eq('manager_user_id', userId).eq('status', 'accepted').limit(1),
  supabase.from('manager_relationships')
    .select('id', { count: 'exact', head: true }).eq('manager_user_id', userId).eq('status', 'pending'),
  supabase.from('users')
    .select('account_health_enabled').eq('id', userId).single(),
])

setHasManagerRelationships(...)
setPendingInviteCount(...)
setAccountHealthEnabled(userResult.data?.account_health_enabled ?? false)
```

The sidebar should re-run this fetch whenever the `sidebarCounter` changes, so that toggling Account Health in Settings immediately updates the sidebar without a page reload.

#### 13.5.3 Updated `mainNavItems` array

```ts
const mainNavItems: NavItem[] = [
  { href: '/tasks', label: 'My tasks', icon: <ListTodo size={20} /> },
  ...(accountHealthEnabled
    ? [{ href: '/account-health', label: 'Account health', icon: <Gauge size={20} /> }]
    : []),
  ...(hasManagerRelationships
    ? [{ href: '/manager', label: 'Manager view', icon: <Users size={20} /> }]
    : []),
]
```

#### 13.5.4 New page route

Create `app/(app)/account-health/page.tsx` and `components/account-health/AccountHealthView.tsx`.

> **Direct URL access:** If a user navigates directly to `/account-health` but has `account_health_enabled = false`, redirect them to `/tasks`.

---

### 13.6 Account Health Page — Layout & Navigation

#### 13.6.1 Overall layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Page heading: "Account health"                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Client account dropdown ▾]  [Renewal date]  [Last engagement]    │
│                               [Type of engagement ▾]               │
├─────────────────────────────────────────────────────────────────────┤
│  ◀  [Today]  ▶   Apr - 2026   [current]                            │
├─────────────────────────────────────────────────────────────────────┤
│  Risk assessment table (see Section 13.8)                           │
└─────────────────────────────────────────────────────────────────────┘
```

#### 13.6.2 Client account selector

A single-select dropdown at the top of the page. Populated from the user's `client_accounts` table (only visible accounts, ordered by `sort_order`). Placeholder text: *"Select a client account…"*

Until an account is selected, the month navigation and the assessment table are not shown. Instead, show a simple empty state: *"Select a client account above to begin."*

Once an account is selected, the three account-level metadata fields appear inline to the right of the dropdown on the same row (or wrapping to a second row on narrower viewports):

| Field | Type | Notes |
|---|---|---|
| Renewal date | Date input | Stored in `account_health_metadata.renewal_date` |
| Last engagement date | Date input | Stored in `account_health_metadata.last_engagement_date` |
| Type of engagement | Single-select dropdown | Options listed in Section 13.6.3 |

These three fields persist at the account level (not per month). They auto-save on blur / on change, using an upsert on `account_health_metadata` keyed on `client_account_id`. No explicit save button is needed.

Layout:

```
[Pfizer ▾]   Renewal date [01/06/2026]   Last engagement [15/04/2026]   Type [Monthly review ▾]
```

#### 13.6.3 Type of engagement options

| Display label | Stored value |
|---|---|
| Monthly review | `monthly_review` |
| QBR | `qbr` |
| Training | `training` |
| Project call | `project_call` |
| Spontaneous mail / call | `spontaneous` |
| Other | `other` |

#### 13.6.4 Month navigation

```
◀   [Today]   ▶   Apr - 2026   [current]
```

- **Left arrow** (`ChevronLeft`, size 16): navigate to previous month
- **Today button**: return to the current month. Same teal styling as the Today button in the task list
- **Right arrow** (`ChevronRight`, size 16): navigate to next month
- **Month label**: three-letter month abbreviation + dash + four-digit year (e.g. `Apr - 2026`)
- **"Current" badge**: shown only when the displayed month is the current calendar month. Small pill, teal background (`#00D1BA`), navy text, 4px border radius, 11px font

The selected month determines which `account_health_responses` rows are fetched. Month state is local to the page, initialised to the current month on load.

#### 13.6.5 Loading and empty states

- If no account is selected: show *"Select a client account above to begin."* centred in the content area
- If an account is selected but has no response data for the selected month: render the full table with all questions but with empty response dropdowns and empty comment fields — ready for the user to fill in
- Loading state: show a subtle skeleton or spinner in the table area while data is being fetched

---

### 13.7 Risk Assessment Structure & Question Set

#### 13.7.1 Sections and questions

> **⚠ Do not modify question text.** The questions below are used as a shared framework across the organisation. The wording is fixed and must be reproduced exactly in the UI as written here. No rewording, reordering, or removal of questions is permitted without explicit sign-off.

**Formatting note:** No text in the UI should be in all caps. Section headers use title case. Question text is sentence case.

---

##### Engagement

| Question ID | Question text | Response type |
|---|---|---|
| `engagement_usage_declining` | Is platform usage declining or inactive for 4+ weeks? | Yes / No |
| `engagement_milestone_weakening` | Are milestone or KPI tracking habits weakening? | Yes / No |
| `engagement_qbr_missed` | Are QBRs consistently missed or poorly attended? | Yes / No |
| `engagement_feedback_passive` | Is client feedback passive or negative? Are NPS scores low? | Yes / No |

##### Stakeholder Risk

| Question ID | Question text | Response type |
|---|---|---|
| `stakeholder_key_left` | Have key admins, sponsors, or power users left or changed roles? | Yes / No |
| `stakeholder_ownership_unclear` | Is there unclear ownership or missing champions? | Yes / No |
| `stakeholder_csm_changed` | Have CSMs been regularly changed? | Yes / No |
| `stakeholder_ai_sponsor_missing` | Are they missing an internal AI sponsor? | Yes / No |
| `stakeholder_relationship_unstable` | Is there an unstable relationship with sales, CS, product owner, or sponsor? | Yes / No |

##### Strategic Fit

| Question ID | Question text | Response type |
|---|---|---|
| `strategic_nonessential` | Is the product seen as non-essential or misaligned with client priorities? | Yes / No |

##### Operational Risk

| Question ID | Question text | Response type |
|---|---|---|
| `operational_rollout_delayed` | Has roll-out been delayed due to inattentive or unresponsive admins? | Yes / No |
| `operational_feedback_passive` | Is client feedback passive or negative? Are NPS scores low? | Yes / No |

> **Note on duplication:** The question "Is client feedback passive or negative? Are NPS scores low?" appears identically in both the Engagement and Operational Risk sections. This is intentional — the wording is fixed by design. The two rows are independent; a user may answer Yes in one section and No in the other.

##### Commercial Risk

| Question ID | Question text | Response type |
|---|---|---|
| `commercial_renewal_delayed` | Are renewal conversations delayed or stalled? | Yes / No |

##### Risk Matrix

Section header row should include a note: *"Select the risk level for each category."*

Each item in the Risk Matrix has a small `Info` icon (Lucide `Info`, size 13) to the right of the label. Clicking opens a popover (see Section 13.9.3).

| Question ID | Label | Response type | Popover content |
|---|---|---|---|
| `matrix_engagement` | Engagement risk | Low / Medium / High | Low or inconsistent platform usage, poor adoption, missed QBRs |
| `matrix_stakeholder` | Stakeholder risk | Low / Medium / High | Loss or absence of champions, sponsors, or decision-makers (e.g., re-organisations, maternity leave, medical leave, change of role, leaves organisation, etc.) |
| `matrix_strategic_fit` | Strategic fit | Low / Medium / High | Product is no longer aligned to client priorities or seen as non-essential (e.g., brand enters a new stage of its life-cycle) |
| `matrix_operational` | Operational risk | Low / Medium / High | Onboarding delays, unresponsive admins, weak implementation of tracking tools |
| `matrix_commercial` | Commercial risk | Low / Medium / High | Silence or delays in renewal conversations, budget changes, pricing objections |

The Low / Medium / High response options also have definitions:

| Response | Definition |
|---|---|
| Low | Minor concern or passive signals; log and track regular health reviews |
| Medium | Noticeable early signals; requires client re-engagement and active monitoring |
| High | High likelihood of churn or downgrade; urgent action and internal escalation |

Recommended: place these definitions as a compact info box just below the "Risk Matrix" section header rather than gating them behind per-row popovers.

##### Risk Factor

| Question ID | Question text | Response type |
|---|---|---|
| `risk_flagged_high` | Is the client flagged as high risk in the CS risk review? | Yes / No |
| `risk_admin_left` | Has the primary admin, sponsor, or power user left and not been replaced? | Yes / No |
| `risk_usage_dropped` | Has product usage dropped significantly (30% or more decline) over a 4-week period? | Yes / No |
| `risk_renewal_low_engagement` | Is renewal within 3 months with low engagement? | Yes / No |
| `risk_confirmed_misalignment` | Is there a confirmed commercial, strategic, or stakeholder misalignment? | Yes / No |

#### 13.7.2 Total question count

| Section | Questions |
|---|---|
| Engagement | 4 |
| Stakeholder Risk | 5 |
| Strategic Fit | 1 |
| Operational Risk | 2 |
| Commercial Risk | 1 |
| Risk Matrix | 5 |
| Risk Factor | 5 |
| **Total** | **23** |

#### 13.7.3 Full `question_id` enum (for database constraint)

```sql
check (question_id in (
  'engagement_usage_declining',
  'engagement_milestone_weakening',
  'engagement_qbr_missed',
  'engagement_feedback_passive',
  'stakeholder_key_left',
  'stakeholder_ownership_unclear',
  'stakeholder_csm_changed',
  'stakeholder_ai_sponsor_missing',
  'stakeholder_relationship_unstable',
  'strategic_nonessential',
  'operational_rollout_delayed',
  'operational_feedback_passive',
  'commercial_renewal_delayed',
  'matrix_engagement',
  'matrix_stakeholder',
  'matrix_strategic_fit',
  'matrix_operational',
  'matrix_commercial',
  'risk_flagged_high',
  'risk_admin_left',
  'risk_usage_dropped',
  'risk_renewal_low_engagement',
  'risk_confirmed_misalignment'
))
```

---

### 13.8 Table: Column Specifications

#### 13.8.1 Layout choice

A **table-style layout with variable row heights**. The four-column structure aligns naturally with a table, and using a `<table>` or CSS grid with explicit column widths gives the clearest visual separation between the risk category, the response, and the two comment columns.

#### 13.8.2 Column definitions

| Col | Label | Width | Content |
|---|---|---|---|
| 1 | Risk category | 280px (fixed) | Section header rows OR question text rows |
| 2 | Response | 160px (fixed) | Response dropdown (Yes/No or Low/Medium/High) |
| 3 | CS lead comments | flex-1, min 200px | Auto-expanding textarea with save/edit/cancel controls |
| 4 | Client partner comments | flex-1, min 200px | Identical to Col 3 |

Total min width ≈ 840px. On narrower screens, the page scrolls horizontally (same pattern as the task table).

#### 13.8.3 Section header rows

Section header rows span the full width of the table. They have:
- Background: `#F2F2F2`
- Section name in `13px` font, `500` weight, navy text
- A `1px` top border in `#DADADA`
- No response dropdown, no comment fields

#### 13.8.4 Response dropdown (column 2)

The response dropdown for each question row is a `<select>` element styled to match the rest of the app.

**Default / empty state:** when no response has been saved, the dropdown shows a blank "Select…" placeholder with a white background and muted text. No response is ever pre-filled.

**For Yes / No questions:**

| Selected value | Dropdown styling |
|---|---|
| (empty / no selection) | White background, `#DADADA` border, muted placeholder "Select…" |
| Yes | Light red background `#FFCDD3`, red text `#C0001A`, red-tinted border |
| No | Light teal/green background `#C3FFF8`, teal text `#007A6E`, teal-tinted border |

**For Low / Medium / High questions (Risk Matrix only):**

| Selected value | Dropdown styling |
|---|---|
| (empty) | Default: white, muted |
| Low | `#C3FFF8` background, `#007A6E` text |
| Medium | `#FFF7CB` background, `#7F6900` text |
| High | `#FFCDD3` background, `#C0001A` text |

Changes to the response dropdown are saved immediately on change via optimistic update + background upsert to `account_health_responses`.

**Clearing a response — two mechanisms:**

1. **The blank "Select…" option is always selectable**, even after a value has been chosen. Re-selecting it clears the response.
2. **A small `×` clear button** (Lucide `X`, size 12) appears to the right of the dropdown, but only when a value has been selected.

When either mechanism is used to clear a response:
- The dropdown returns to the default empty/white state
- The clear button disappears
- An upsert fires with `response = null`
- **The row is not deleted.** Any comments already saved for that question remain intact.

#### 13.8.5 Comment fields (columns 3 and 4)

Each question row has two comment fields with identical behaviour:

**States:**
1. **Empty, view mode** — faint placeholder *"Add a comment…"*. On hover, subtle background tint (`#F7F7F7`).
2. **Editing mode** — `<textarea>` with auto-expanding height (min 2 rows). Below the textarea: `Save` (navy, 12px) and `Cancel` (secondary, 12px) buttons.
3. **Saved, view mode** — text displayed at `13px`. On hover, a small pencil icon appears at top-right. Clicking re-enters editing mode.

**Save behaviour:** upsert on `account_health_responses` for the relevant `(client_account_id, month, question_id)` row, updating either `cs_lead_comment` or `client_partner_comment` with their respective `_updated_at` and `_updated_by` fields.

**Last updated attribution:** below saved comment text, in `11px` muted text: *"Updated by [First name] on [Day Month Year at HH:MM]"*. Read from `cs_lead_updated_by` / `cs_lead_updated_at`, resolved to a user's name by joining on `users`.

---

### 13.9 UI Design Details

#### 13.9.1 Page-level styling

- Page background: `#F2F2F2`
- Page padding: `p-6`
- Page heading: `text-base font-medium text-navy` — "Account health"
- Assessment table in a white card with `rounded-[8px] border border-border`

#### 13.9.2 Table borders and spacing

- All cell borders: `0.5px solid #DADADA`
- Question row height: auto (minimum ~44px)
- Section header row height: 36px, vertically centred text
- Column 1: `13px`, `text-navy`, `py-3 px-4`
- Column 2: `py-3 px-4`, select element fills available width
- Columns 3 and 4: `py-3 px-4`

#### 13.9.3 Info icon popover (Risk Matrix)

The `Info` icon (Lucide, size 13, `text-text-muted`) sits to the right of the label in column 1 for each Risk Matrix row.

Clicking opens a small popover:
- White background, `rounded-[8px]`, `shadow-lg`, `border border-border`
- ~240px wide
- Definition text at `12px`, `text-text-secondary`
- Small close button (X icon, size 12) in top-right corner, or closes on outside click
- Implemented as a local `useState` on each row

#### 13.9.4 "Current" month badge

```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
  current
</span>
```

Shown only when the displayed month equals the current calendar month.

#### 13.9.5 Empty state (no client account selected)

```tsx
<div className="flex flex-col items-center justify-center py-20 gap-2">
  <Gauge size={28} className="text-border" />
  <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
</div>
```

#### 13.9.6 Relationship to existing design system

All colours, font sizes, border radii, button styles, and icon usage conventions from Section 9 apply unchanged. No new design tokens are introduced.

---

### 13.10 Manager View Integration

#### 13.10.1 The problem

Currently, clicking a user card in the Manager landing page navigates directly to their task list. With Account Health, each user may also have account health data. The manager needs to be able to access both — but only for users who have Account Health enabled.

#### 13.10.2 Who sees what

| Situation | What the manager sees |
|---|---|
| User has Account Health **disabled** | Only task list is accessible. No Account Health option is shown. |
| User has Account Health **enabled** | Both task list and Account Health are accessible. |

The manager landing page must know whether each managed user has `account_health_enabled = true`. Add `account_health_enabled` to the `users` select when populating user cards.

#### 13.10.3 Recommended UX

**Option A — Tabs on the user's task/account view page:** After clicking a user card, arrive at the task list view as today, but with a tab bar at the top: "Task list" | "Account health". The "Account health" tab is only rendered if that user has `account_health_enabled = true`.

**Option B — Context menu on the user card:** Each user card gets a secondary action letting the manager choose "View task list" or "View account health" before navigating.

**Option A is recommended** — simpler to implement and keeps navigation consistent.

#### 13.10.4 Manager permissions for Account Health

- The manager can **view** all responses, comments, and metadata
- The manager can **add and edit** comments in both the CS Lead and Client Partner comment columns
- The manager **cannot** change response dropdown values
- The manager **cannot** edit account-level metadata (renewal date, last engagement, engagement type)

#### 13.10.5 The "manager without Account Health" scenario

User B (manager, Account Health disabled) can still view User A's (CS Lead, Account Health enabled) account health data via the manager view. Manager access to Account Health data is entirely independent of whether the manager has Account Health enabled for themselves.

The manager view logic must gate Account Health access on the *managed user's* `account_health_enabled` value — not the manager's.

#### 13.10.6 Data access

The manager's access to a user's `account_health_responses` and `client_accounts` data is gated by the same `manager_relationships` check used throughout the app. See Section 13.11 for RLS policies.

---

### 13.11 RLS Policies

```sql
-- client_accounts
alter table public.client_accounts enable row level security;

create policy "client_accounts: owner read"
  on public.client_accounts for select
  using (auth.uid() = admin_user_id);

create policy "client_accounts: manager read"
  on public.client_accounts for select
  using (
    exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = client_accounts.admin_user_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );

create policy "client_accounts: owner insert"
  on public.client_accounts for insert
  with check (auth.uid() = admin_user_id);

create policy "client_accounts: owner update"
  on public.client_accounts for update
  using (auth.uid() = admin_user_id);

create policy "client_accounts: owner delete"
  on public.client_accounts for delete
  using (auth.uid() = admin_user_id);


-- account_health_metadata
alter table public.account_health_metadata enable row level security;

create policy "ah_metadata: owner full"
  on public.account_health_metadata for all
  using (auth.uid() = admin_user_id);

create policy "ah_metadata: manager read"
  on public.account_health_metadata for select
  using (
    exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = account_health_metadata.admin_user_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );


-- account_health_responses
alter table public.account_health_responses enable row level security;

create policy "ah_responses: owner full"
  on public.account_health_responses for all
  using (auth.uid() = admin_user_id);

create policy "ah_responses: manager read"
  on public.account_health_responses for select
  using (
    exists (
      select 1 from public.manager_relationships mr
      where mr.admin_user_id = account_health_responses.admin_user_id
        and mr.manager_user_id = auth.uid()
        and mr.status = 'accepted'
    )
  );

-- Managers can update comment fields only (not response values).
-- Enforced in application code rather than RLS in v1.
-- For INSERT/UPDATE by managers, enforce via app logic.
```

> Note: If stricter column-level enforcement is desired later, PostgreSQL column-level privileges or application-layer checks can be added. For v1, application logic is sufficient.

---

### 13.12 Development Phases

#### Phase A — Settings: Account Health toggle + Client Accounts section

- Run migration: `alter table users add column account_health_enabled boolean not null default false`
- Add "Account health" `SectionCard` to `SettingsView.tsx` with a toggle/checkbox
- Wire toggle to Supabase upsert on `users.account_health_enabled`; call `triggerSidebarRefresh()` on save
- Add `client_accounts` table + RLS + migration file
- Add "Client accounts" `SectionCard` — rendered conditionally on `account_health_enabled`
- Implement `ClientAccountsSection` component (mirrors `ProjectsSection` exactly)
- Update `Sidebar.tsx`: fetch `account_health_enabled`, conditionally render Account Health nav item
- Add `Gauge` icon import to sidebar
- Create `app/(app)/account-health/page.tsx` shell (redirect to `/tasks` if `account_health_enabled = false`)

#### Phase B — Account Health page: header and navigation

- Build `AccountHealthView.tsx`
- Implement client account dropdown
- Add `account_health_metadata` table + RLS
- Implement account-level fields with auto-save
- Implement month navigation (state, arrows, Today button, month label, current badge)

#### Phase C — Risk assessment table: response column

- Add `account_health_responses` table + RLS + migration
- Build the full table layout with all 23 question rows and 7 section header rows
- Implement response dropdowns with colour coding
- Wire to Supabase: load existing responses, upsert on change
- Implement Info icon popovers for Risk Matrix rows

#### Phase D — Risk assessment table: comment columns

- Implement auto-expanding textarea for CS Lead and Client Partner columns
- Implement save / cancel / edit flow with optimistic updates
- Implement "Updated by [name] on [date]" attribution line
- Wire to Supabase: upsert on save, populating `_updated_at` / `_updated_by` fields

#### Phase E — Manager view integration

- Implement Option A tab bar above the manager task view page
- Build read-only variant of `AccountHealthView` for the manager context
- Allow managers to write to CS Lead and Client Partner comment columns
- Block managers from editing response dropdowns and metadata fields

---

### 13.13 Open Questions & Future Considerations (Option 2 Hierarchy)

#### 13.13.1 What Option 2 would look like

If the full Client Account > Product > Project hierarchy were implemented, the `projects` table would be subordinate to `client_accounts`, and a task's association chain would be: Task → Project → Client Account (with product inferred from the client account).

The hierarchy from existing examples:

```
Pfizer          → AH      → Vaccines
Astellas        → EH      → Xtandi
Boehringer      → EH      → Jardiance
Regeneron       → EH      → Linvoseltamab
Regeneron       → EH      → Odronextamab
Sanofi          → EH      → Epidemiology
Almirall        → NURO    → (no project level)
General         → EH      → (general EH tasks)
General         → NURO    → (general NURO tasks)
N/A             → General → (non-product tasks)
```

#### 13.13.1a "General" and "N/A" accounts in the hierarchy (Option 2 concern only)

In Option 1, this is not a problem — users simply choose which client accounts to define in their Settings list. The two lists (projects vs client accounts) are independent.

In Option 2, "General > EH", "General > NURO", and "N/A > General" are currently used as catch-all entries. If the full hierarchy is adopted, a decision is needed about whether these placeholder entries should appear in the Account Health dropdown. The likely resolution would be an `exclude_from_account_health` flag, or a `type` field (`client` vs `internal`).

#### 13.13.2 Impact on the task list (if Option 2 were adopted)

- The product dropdown in "Add Task" would be removed — product inferred from the selected project's parent client account
- Filter chips could filter by client account OR by product
- The `tasks.product` column would either be deprecated or kept as a denormalised cache
- Existing task data would need a migration to set `client_account_id` on each project

#### 13.13.3 Migration safety

Before attempting Option 2:
1. A full Supabase backup snapshot before any schema change
2. A data audit confirming every project maps cleanly to one client account
3. A test run on a staging/dev Supabase instance with production data restored
4. A feature flag to toggle the new hierarchy UI independently of the schema change

#### 13.13.4 Recommendation

Proceed with Option 1 now. Once Account Health is live and the client account list is stable, plan the Option 2 migration as a discrete, separately scoped piece of work.

---

## 14. Account Health — Implementation Guide

> This section is written for an agentic coding tool. It is self-contained per phase. Implement one phase at a time, verify it completely before moving to the next. Each phase is independently shippable.

### 14.1 Before You Start

#### Read these files first

Before touching any code, read the following files in full to understand the existing codebase:

| File | Why |
|---|---|
| Sections 1–12 of this document | Full spec for the existing app — architecture, DB schema, design system, component patterns |
| Section 13 of this document | Full feature spec for Account Health — schema, UI/UX, design decisions |
| `lib/supabase/types.ts` | All existing TypeScript types |
| `components/settings/SettingsView.tsx` | Pattern for Settings section cards, project list management — Phase A mirrors this |
| `components/layout/Sidebar.tsx` | Current sidebar logic — Phase A modifies this |
| `lib/sidebar-context.tsx` | How `triggerSidebarRefresh` / `useSidebarCounter` work |

#### Existing file structure (relevant paths)

```
app/
  (app)/
    layout.tsx                        ← wraps all app pages with AuthProvider + SidebarProvider
    tasks/page.tsx                    ← server component, prefetches tasks
    settings/page.tsx                 ← renders <SettingsView />
    manager/
      page.tsx                        ← renders <ManagerLandingView />
      [adminUserId]/page.tsx          ← server component, prefetches tasks, renders <ManagerTaskView />
components/
  layout/
    Sidebar.tsx                       ← Phase A modifies
  settings/
    SettingsView.tsx                  ← Phase A modifies
  manager/
    ManagerLandingView.tsx            ← Phase E modifies
    ManagerTaskView.tsx               ← Phase E modifies
  tasks/
    TaskTableView.tsx                 ← referenced by ManagerTaskView; do not modify
lib/
  auth-context.tsx                    ← provides useAuth() → { userId }
  sidebar-context.tsx                 ← provides useSidebarRefresh() and useSidebarCounter()
  supabase/
    client.ts                         ← client-side Supabase instance
    server.ts                         ← server-side Supabase instance (use in server components)
    types.ts                          ← Phase A, B, C add types here
supabase/
  migrations/                         ← add new .sql files here for each phase
```

#### General conventions — follow throughout

- **Styling:** Tailwind CSS only. No inline styles except for dynamically computed values.
- **Colors:** Use the tokens from Section 9.1. Never hardcode a colour not in that palette.
- **Icons:** Lucide React only (`lucide-react` package). Never add custom SVGs.
- **Font sizes:** `text-[13px]` for body, `text-[12px]` for labels/captions, `text-[11px]` for minor metadata.
- **Border radius:** `rounded-[8px]` for cards, `rounded-[6px]` for inputs/buttons, `rounded` (4px) for badges.
- **Question text:** The risk assessment question text is a fixed organisational framework. Reproduce it exactly as written in Appendix A (Section 14.7). Do not rephrase, reorder, or remove any question.
- **Section headers in the UI:** Title case. No all-caps anywhere.
- **TypeScript:** Strict throughout. No `any` except where unavoidable in Supabase response mapping.

---

### 14.2 Phase A — Toggle, Client Accounts, Sidebar

**Goal:** Add the `account_health_enabled` toggle to Settings, the Client Accounts list to Settings, and the conditional Account Health nav item to the sidebar. Create an empty shell page at `/account-health`.

#### SQL to run first

```sql
-- 1. Add account_health_enabled to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_health_enabled boolean NOT NULL DEFAULT false;

-- 2. Create client_accounts table
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  product       text CHECK (product IN ('AH', 'NURO', 'EH', 'N/A')),
  sort_order    integer NOT NULL DEFAULT 0,
  is_visible    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS client_accounts_admin_user_id_idx
  ON public.client_accounts(admin_user_id);

-- 3. RLS for client_accounts
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_accounts: owner read"
  ON public.client_accounts FOR SELECT
  USING (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: manager read"
  ON public.client_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = client_accounts.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );

CREATE POLICY "client_accounts: owner insert"
  ON public.client_accounts FOR INSERT
  WITH CHECK (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: owner update"
  ON public.client_accounts FOR UPDATE
  USING (auth.uid() = admin_user_id);

CREATE POLICY "client_accounts: owner delete"
  ON public.client_accounts FOR DELETE
  USING (auth.uid() = admin_user_id);
```

Save as `supabase/migrations/account_health_phase_a.sql`.

#### Files to create

- `app/(app)/account-health/page.tsx`
- `components/account-health/AccountHealthView.tsx`

#### Files to modify

- `lib/supabase/types.ts`
- `components/settings/SettingsView.tsx`
- `components/layout/Sidebar.tsx`

#### `lib/supabase/types.ts` — additions

```ts
export type ClientAccountRow = {
  id: string
  admin_user_id: string
  name: string
  product: Product | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}
```

Also add `account_health_enabled` to the `Database` interface's `users` table definition:

```ts
// In Database.public.Tables.users.Row, add:
account_health_enabled: boolean

// In Database.public.Tables.users.Update, add:
account_health_enabled?: boolean
```

#### `components/layout/Sidebar.tsx` — changes

1. Add `Gauge` to the lucide-react import.

2. Add a `accountHealthEnabled` state variable:
```ts
const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)
```

3. In the existing `fetchRelationshipData` async function, add a third parallel fetch:
```ts
const [relResult, countResult, userResult] = await Promise.all([
  // ... existing two fetches unchanged ...
  supabase
    .from('users')
    .select('account_health_enabled')
    .eq('id', userId)
    .single(),
])
setAccountHealthEnabled(userResult.data?.account_health_enabled ?? false)
```

4. Update `mainNavItems`:
```ts
const mainNavItems: NavItem[] = [
  { href: '/tasks', label: 'My tasks', icon: <ListTodo size={20} /> },
  ...(accountHealthEnabled
    ? [{ href: '/account-health', label: 'Account health', icon: <Gauge size={20} /> }]
    : []),
  ...(hasManagerRelationships
    ? [{ href: '/manager', label: 'Manager view', icon: <Users size={20} /> }]
    : []),
]
```

#### `components/settings/SettingsView.tsx` — changes

The Settings page section order must be: **Account details → Projects → Team management → Account health → Export data.**

**Step 1: Add `AccountHealthSection` component:**

```ts
function AccountHealthSection({ onToast, onEnabledChange }: { onToast: ..., onEnabledChange: (v: boolean) => void }) {
  const { userId } = useAuth()
  const triggerSidebarRefresh = useSidebarRefresh()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    supabase.from('users').select('account_health_enabled').eq('id', userId).single()
      .then(({ data }) => {
        setEnabled(data?.account_health_enabled ?? false)
        setLoading(false)
      })
  }, [userId])

  const handleToggle = async () => {
    if (!userId) return
    const next = !enabled
    setEnabled(next)
    onEnabledChange(next)
    const { error } = await supabase.from('users')
      .update({ account_health_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      setEnabled(!next)
      onEnabledChange(!next)
      onToast('Failed to update account health setting.', 'error')
    } else {
      triggerSidebarRefresh()
    }
  }

  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={handleToggle} className="mt-0.5 accent-navy" />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-navy">Enable account health</span>
          <span className="text-[12px] text-text-secondary">
            Turn this on if you manage client accounts and want to use the monthly risk assessment features. This adds an Account health page to your sidebar.
          </span>
        </div>
      </label>
    </div>
  )
}
```

**Step 2: Add `ClientAccountsSection` component.** This is a direct equivalent of `ProjectsSection` but for the `client_accounts` table. Key difference: the delete guard checks `account_health_responses` and `account_health_metadata`. If any rows exist for this account, show: *"[Account name] cannot be deleted because it has assessment data."* All other behaviour (drag-to-reorder, edit inline, visibility toggle, duplicate validation, product selector) is identical.

**Step 3: Add `AccountHealthSettingsBlock` wrapper:**

```tsx
function AccountHealthSettingsBlock({ onToast }: { onToast: ... }) {
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)
  return (
    <>
      <SectionCard title="Account health">
        <AccountHealthSection onToast={onToast} onEnabledChange={setAccountHealthEnabled} />
      </SectionCard>
      {accountHealthEnabled && (
        <SectionCard title="Client accounts">
          <p className="text-[12px] text-text-secondary mb-4">
            Used in Account Health to select the client you are reviewing. Each account can be associated with a product.
          </p>
          <ClientAccountsSection onToast={onToast} />
        </SectionCard>
      )}
    </>
  )
}
```

**Step 4: Update main `SettingsView` export** to use the new sections in correct order:

```tsx
export default function SettingsView() {
  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Settings</h1>
      <SectionCard title="Account details"><AccountSection onToast={addToast} /></SectionCard>
      <SectionCard title="Projects"><ProjectsSection onToast={addToast} /></SectionCard>
      <SectionCard title="Team management"><TeamManagementSection onToast={addToast} /></SectionCard>
      <AccountHealthSettingsBlock onToast={addToast} />
      <SectionCard title="Export data"><ExportSection onToast={addToast} /></SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
```

#### `app/(app)/account-health/page.tsx` — create

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountHealthView from '@/components/account-health/AccountHealthView'

export default async function AccountHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  if (userId) {
    const { data } = await supabase
      .from('users')
      .select('account_health_enabled')
      .eq('id', userId)
      .single()
    if (!data?.account_health_enabled) redirect('/tasks')
  }

  return <AccountHealthView />
}
```

#### `components/account-health/AccountHealthView.tsx` — create (shell)

```tsx
'use client'
import { Gauge } from 'lucide-react'

export default function AccountHealthView() {
  return (
    <div className="p-6 flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Account health</h1>
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Gauge size={28} className="text-border" />
        <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
      </div>
    </div>
  )
}
```

#### Phase A — Verify

- [ ] SQL migration runs without error in Supabase SQL editor
- [ ] `client_accounts` table exists with correct columns
- [ ] `users.account_health_enabled` column exists, defaulting to `false`
- [ ] Settings page renders in the correct order: Account details → Projects → Team management → Account health → Export data
- [ ] Toggling "Enable account health" on: sidebar immediately shows Account health nav item (no page reload)
- [ ] Toggling "Enable account health" off: sidebar immediately hides Account health nav item
- [ ] When enabled, Client accounts section card appears below Account health card
- [ ] Client accounts section: can add, edit, reorder, and toggle visibility — same UX as Projects
- [ ] Navigating to `/account-health` when toggle is off redirects to `/tasks`
- [ ] Navigating to `/account-health` when toggle is on shows the shell page

---

### 14.3 Phase B — Account Health Page: Header and Month Navigation

**Goal:** Build the top section of the Account Health page: client account selector, account-level metadata fields, and month navigation.

#### SQL to run first

```sql
CREATE TABLE IF NOT EXISTS public.account_health_metadata (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id    uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  renewal_date         date,
  last_engagement_date date,
  engagement_type      text CHECK (engagement_type IN (
                         'monthly_review', 'qbr', 'training',
                         'project_call', 'spontaneous', 'other'
                       )),
  updated_at           timestamptz,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id)
);

ALTER TABLE public.account_health_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ah_metadata: owner full"
  ON public.account_health_metadata FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "ah_metadata: manager read"
  ON public.account_health_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = account_health_metadata.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );
```

Save as `supabase/migrations/account_health_phase_b.sql`.

#### `lib/supabase/types.ts` — additions

```ts
export type AccountHealthMetadata = {
  id: string
  client_account_id: string
  admin_user_id: string
  renewal_date: string | null
  last_engagement_date: string | null
  engagement_type: EngagementType | null
  updated_at: string | null
  updated_by: string | null
}

export type EngagementType =
  | 'monthly_review'
  | 'qbr'
  | 'training'
  | 'project_call'
  | 'spontaneous'
  | 'other'
```

#### `components/account-health/AccountHealthView.tsx` — replace with full implementation

**1. Client account selector**

```ts
supabase.from('client_accounts')
  .select('*')
  .eq('admin_user_id', userId)
  .eq('is_visible', true)
  .is('deleted_at', null)
  .order('sort_order')
```

Renders a `<select>` with placeholder `Select a client account…`. When no account is selected, show the empty state.

**2. Account-level metadata fields**

On account selection, fetch the metadata row:
```ts
supabase.from('account_health_metadata')
  .select('*')
  .eq('client_account_id', selectedAccountId)
  .maybeSingle()
```

Display three fields inline (renewal date, last engagement date, type of engagement). Auto-save on `onBlur` / `onChange`:
```ts
supabase.from('account_health_metadata').upsert({
  client_account_id: selectedAccountId,
  admin_user_id: userId,
  renewal_date: ...,
  last_engagement_date: ...,
  engagement_type: ...,
  updated_at: new Date().toISOString(),
  updated_by: userId,
}, { onConflict: 'client_account_id' })
```

**3. Month navigation state**

```ts
const [currentMonth, setCurrentMonth] = useState(() => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
})

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' }) + ' - ' + d.getFullYear()
}

function isCurrentMonth(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}
```

Navigation controls layout:
```tsx
<div className="flex items-center gap-2">
  <button onClick={prevMonth}><ChevronLeft size={16} /></button>
  <button onClick={goToToday} className="...">Today</button>
  <button onClick={nextMonth}><ChevronRight size={16} /></button>
  <span className="text-[14px] font-medium text-navy ml-2">{formatMonthLabel(currentMonth)}</span>
  {isCurrentMonth(currentMonth) && (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
      current
    </span>
  )}
</div>
```

#### Phase B — Verify

- [ ] SQL migration runs without error
- [ ] `account_health_metadata` table exists with correct columns and unique constraint
- [ ] Account selector shows client accounts in settings order
- [ ] Selecting an account: metadata fields appear
- [ ] Changing any metadata field: upsert fires, no error toast
- [ ] Reloading and reselecting the same account: metadata fields pre-populated
- [ ] Month navigation: arrows change month label correctly
- [ ] Today button: returns to current month
- [ ] "Current" badge: appears only on current calendar month

---

### 14.4 Phase C — Risk Assessment Table: Response Column

**Goal:** Render the full risk assessment table with all 23 questions grouped into 7 sections. Wire response dropdowns to Supabase with immediate save on change and colour-coded selection states.

#### SQL to run first

```sql
CREATE TABLE IF NOT EXISTS public.account_health_responses (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id          uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id              uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month                      date NOT NULL,
  question_id                text NOT NULL CHECK (question_id IN (
                               'engagement_usage_declining',
                               'engagement_milestone_weakening',
                               'engagement_qbr_missed',
                               'engagement_feedback_passive',
                               'stakeholder_key_left',
                               'stakeholder_ownership_unclear',
                               'stakeholder_csm_changed',
                               'stakeholder_ai_sponsor_missing',
                               'stakeholder_relationship_unstable',
                               'strategic_nonessential',
                               'operational_rollout_delayed',
                               'operational_feedback_passive',
                               'commercial_renewal_delayed',
                               'matrix_engagement',
                               'matrix_stakeholder',
                               'matrix_strategic_fit',
                               'matrix_operational',
                               'matrix_commercial',
                               'risk_flagged_high',
                               'risk_admin_left',
                               'risk_usage_dropped',
                               'risk_renewal_low_engagement',
                               'risk_confirmed_misalignment'
                             )),
  response                   text CHECK (response IN ('yes', 'no', 'low', 'medium', 'high')),
  cs_lead_comment            text,
  cs_lead_updated_at         timestamptz,
  cs_lead_updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  client_partner_comment     text,
  client_partner_updated_at  timestamptz,
  client_partner_updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz,
  updated_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id, month, question_id)
);

CREATE INDEX IF NOT EXISTS ahr_client_account_month_idx
  ON public.account_health_responses(client_account_id, month);
CREATE INDEX IF NOT EXISTS ahr_admin_user_id_idx
  ON public.account_health_responses(admin_user_id);

ALTER TABLE public.account_health_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ah_responses: owner full"
  ON public.account_health_responses FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "ah_responses: manager read"
  ON public.account_health_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = account_health_responses.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );
```

Save as `supabase/migrations/account_health_phase_c.sql`.

#### Files to create

- `components/account-health/RiskAssessmentTable.tsx`

#### Files to modify

- `lib/supabase/types.ts`
- `components/account-health/AccountHealthView.tsx`

#### `lib/supabase/types.ts` — additions

```ts
export type ResponseValue = 'yes' | 'no' | 'low' | 'medium' | 'high'

export type AccountHealthResponse = {
  id: string
  client_account_id: string
  admin_user_id: string
  month: string
  question_id: string
  response: ResponseValue | null
  cs_lead_comment: string | null
  cs_lead_updated_at: string | null
  cs_lead_updated_by: string | null
  client_partner_comment: string | null
  client_partner_updated_at: string | null
  client_partner_updated_by: string | null
  created_at: string
  updated_at: string | null
  updated_by: string | null
}
```

#### `components/account-health/RiskAssessmentTable.tsx` — create

**Props:**
```ts
interface RiskAssessmentTableProps {
  clientAccountId: string
  adminUserId: string
  month: Date
  readOnly?: boolean
}
```

**Data fetching:**
```ts
const monthStr = month.toISOString().slice(0, 10)
supabase.from('account_health_responses')
  .select('*')
  .eq('client_account_id', clientAccountId)
  .eq('month', monthStr)
```

Store results in a `Map<string, AccountHealthResponse>` keyed by `question_id`.

**Saving a response:**
```ts
supabase.from('account_health_responses').upsert({
  client_account_id: clientAccountId,
  admin_user_id: adminUserId,
  month: monthStr,
  question_id: questionId,
  response: newValue,
  updated_at: new Date().toISOString(),
  updated_by: adminUserId,
}, { onConflict: 'client_account_id,month,question_id' })
```

Use optimistic updates: update the local map immediately, revert on error.

**Clearing a response — two mechanisms:**

1. The first option in every `<select>` is `<option value="">Select…</option>` and must **not** be `disabled`. When `value=""` is selected, treat as a clear.
2. A small `×` button (Lucide `X`, size 12) appears to the right of the dropdown, only when a value is selected.

```tsx
<div className="flex items-center gap-1.5 px-4 py-3">
  <select
    value={currentResponse ?? ''}
    onChange={(e) => {
      const val = e.target.value
      if (val === '') { handleClear(question.id) }
      else { handleResponseChange(question.id, val as ResponseValue) }
    }}
    disabled={readOnly}
    style={getResponseStyle(currentResponse)}
    className="flex-1 px-2 py-1.5 rounded-[6px] border border-border text-[13px] outline-none focus:border-navy disabled:cursor-not-allowed"
  >
    <option value="">Select…</option>
    {question.type === 'yes_no' ? (
      <><option value="yes">Yes</option><option value="no">No</option></>
    ) : (
      <><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></>
    )}
  </select>
  {currentResponse && !readOnly && (
    <button onClick={() => handleClear(question.id)} className="flex-shrink-0 p-1 rounded text-text-muted hover:text-navy" title="Clear response">
      <X size={12} />
    </button>
  )}
</div>
```

**Clear handler:**
```ts
const handleClear = async (questionId: string) => {
  const existing = responsesMap.get(questionId)
  // Optimistic update
  setResponsesMap((prev) => {
    const next = new Map(prev)
    const row = next.get(questionId)
    if (row) next.set(questionId, { ...row, response: null })
    return next
  })
  if (!existing?.id) return  // no row exists, nothing to clear
  const { error } = await supabase.from('account_health_responses').upsert({
    client_account_id: clientAccountId,
    admin_user_id: adminUserId,
    month: monthStr,
    question_id: questionId,
    response: null,
    updated_at: new Date().toISOString(),
    updated_by: adminUserId,
  }, { onConflict: 'client_account_id,month,question_id' })
  if (error) {
    setResponsesMap((prev) => {
      const next = new Map(prev)
      if (existing) next.set(questionId, existing)
      return next
    })
  }
}
```

> **Important:** Clearing a response sets `response = null`. It does **not** delete the row or affect `cs_lead_comment`, `client_partner_comment`, or any other fields.

**Question set constant (define outside the component):**

```ts
type QuestionType = 'yes_no' | 'risk_level'
interface Question { id: string; text: string; type: QuestionType }
interface Section { id: string; label: string; questions: Question[]; infoBox?: string }

const RISK_ASSESSMENT_SECTIONS: Section[] = [
  {
    id: 'engagement', label: 'Engagement',
    questions: [
      { id: 'engagement_usage_declining',     text: 'Is platform usage declining or inactive for 4+ weeks?',               type: 'yes_no' },
      { id: 'engagement_milestone_weakening', text: 'Are milestone or KPI tracking habits weakening?',                     type: 'yes_no' },
      { id: 'engagement_qbr_missed',          text: 'Are QBRs consistently missed or poorly attended?',                    type: 'yes_no' },
      { id: 'engagement_feedback_passive',    text: 'Is client feedback passive or negative? Are NPS scores low?',         type: 'yes_no' },
    ],
  },
  {
    id: 'stakeholder', label: 'Stakeholder Risk',
    questions: [
      { id: 'stakeholder_key_left',              text: 'Have key admins, sponsors, or power users left or changed roles?',                    type: 'yes_no' },
      { id: 'stakeholder_ownership_unclear',     text: 'Is there unclear ownership or missing champions?',                                    type: 'yes_no' },
      { id: 'stakeholder_csm_changed',           text: 'Have CSMs been regularly changed?',                                                   type: 'yes_no' },
      { id: 'stakeholder_ai_sponsor_missing',    text: 'Are they missing an internal AI sponsor?',                                            type: 'yes_no' },
      { id: 'stakeholder_relationship_unstable', text: 'Is there an unstable relationship with sales, CS, product owner, or sponsor?',        type: 'yes_no' },
    ],
  },
  {
    id: 'strategic', label: 'Strategic Fit',
    questions: [
      { id: 'strategic_nonessential', text: 'Is the product seen as non-essential or misaligned with client priorities?', type: 'yes_no' },
    ],
  },
  {
    id: 'operational', label: 'Operational Risk',
    questions: [
      { id: 'operational_rollout_delayed',  text: 'Has roll-out been delayed due to inattentive or unresponsive admins?', type: 'yes_no' },
      { id: 'operational_feedback_passive', text: 'Is client feedback passive or negative? Are NPS scores low?',          type: 'yes_no' },
    ],
  },
  {
    id: 'commercial', label: 'Commercial Risk',
    questions: [
      { id: 'commercial_renewal_delayed', text: 'Are renewal conversations delayed or stalled?', type: 'yes_no' },
    ],
  },
  {
    id: 'matrix', label: 'Risk Matrix',
    infoBox: 'Low — Minor concern or passive signals; log and track regular health reviews. Medium — Noticeable early signals; requires client re-engagement and active monitoring. High — High likelihood of churn or downgrade; urgent action and internal escalation.',
    questions: [
      { id: 'matrix_engagement',    text: 'Engagement risk',  type: 'risk_level' },
      { id: 'matrix_stakeholder',   text: 'Stakeholder risk', type: 'risk_level' },
      { id: 'matrix_strategic_fit', text: 'Strategic fit',    type: 'risk_level' },
      { id: 'matrix_operational',   text: 'Operational risk', type: 'risk_level' },
      { id: 'matrix_commercial',    text: 'Commercial risk',  type: 'risk_level' },
    ],
  },
  {
    id: 'risk_factor', label: 'Risk Factor',
    questions: [
      { id: 'risk_flagged_high',           text: 'Is the client flagged as high risk in the CS risk review?',                                        type: 'yes_no' },
      { id: 'risk_admin_left',             text: 'Has the primary admin, sponsor, or power user left and not been replaced?',                        type: 'yes_no' },
      { id: 'risk_usage_dropped',          text: 'Has product usage dropped significantly (30% or more decline) over a 4-week period?',             type: 'yes_no' },
      { id: 'risk_renewal_low_engagement', text: 'Is renewal within 3 months with low engagement?',                                                  type: 'yes_no' },
      { id: 'risk_confirmed_misalignment', text: 'Is there a confirmed commercial, strategic, or stakeholder misalignment?',                         type: 'yes_no' },
    ],
  },
]
```

**Info icon popovers (Risk Matrix only):**

| question_id | Popover text |
|---|---|
| `matrix_engagement` | Low or inconsistent platform usage, poor adoption, missed QBRs |
| `matrix_stakeholder` | Loss or absence of champions, sponsors, or decision-makers (e.g., re-organisations, maternity leave, medical leave, change of role, leaves organisation, etc.) |
| `matrix_strategic_fit` | Product is no longer aligned to client priorities or seen as non-essential (e.g., brand enters a new stage of its life-cycle) |
| `matrix_operational` | Onboarding delays, unresponsive admins, weak implementation of tracking tools |
| `matrix_commercial` | Silence or delays in renewal conversations, budget changes, pricing objections |

Popover: `rounded-[8px] shadow-lg border border-border p-3 w-60 text-[12px] text-text-secondary`, opened by local `useState`, closed on outside click.

**Response dropdown styling:**
```ts
function getResponseStyle(value: ResponseValue | null): React.CSSProperties {
  switch (value) {
    case 'yes':    return { backgroundColor: '#FFCDD3', color: '#C0001A' }
    case 'no':     return { backgroundColor: '#C3FFF8', color: '#007A6E' }
    case 'low':    return { backgroundColor: '#C3FFF8', color: '#007A6E' }
    case 'medium': return { backgroundColor: '#FFF7CB', color: '#7F6900' }
    case 'high':   return { backgroundColor: '#FFCDD3', color: '#C0001A' }
    default:       return { backgroundColor: '#FFFFFF', color: '#595959' }
  }
}
```

**Table wrapper:**
```tsx
<div className="bg-white rounded-[8px] border border-border overflow-x-auto">
  {/* table content */}
</div>
```

**Section header rows:** `bg-[#F2F2F2] border-t border-border`, label in `text-[13px] font-medium text-navy px-4 py-2.5`.

**For the Risk Matrix section**, render the `infoBox` as: `bg-[#F2F2F2] rounded-[6px] mx-4 my-2 px-3 py-2 text-[12px] text-text-secondary`.

**In Phase C**, columns 3 and 4 are placeholder empty cells — they will be filled in Phase D.

#### `components/account-health/AccountHealthView.tsx` — update

Replace the Phase B placeholder with:
```tsx
<RiskAssessmentTable
  clientAccountId={selectedAccount.id}
  adminUserId={userId!}
  month={currentMonth}
/>
```

#### Phase C — Verify

- [ ] SQL migration runs without error
- [ ] `account_health_responses` table exists with correct columns, constraint, and indexes
- [ ] All 7 section headers render in correct order with title-case labels
- [ ] All 23 question rows render under their correct sections (count them)
- [ ] Question text exactly matches Appendix A (Section 14.7) — no rewording
- [ ] New month with no data: all dropdowns show "Select…" in white/default state — no values pre-filled
- [ ] Yes response: dropdown turns red; `×` clear button appears
- [ ] No response: dropdown turns green; `×` clear button appears
- [ ] Low/Medium/High: correct colours applied
- [ ] Upsert fires on change (check Supabase table viewer)
- [ ] Clearing via `×`: dropdown returns to default, button disappears, `response` is null in DB
- [ ] Clearing via blank "Select…": same result as `×`
- [ ] After clearing: existing comments preserved in the database
- [ ] Risk Matrix: info box appears below section header
- [ ] Risk Matrix rows: Info icon shows; clicking shows correct popover; popover closes on outside click

---

### 14.5 Phase D — Comment Columns

**Goal:** Implement the CS Lead Comments and Client Partner Comments columns with auto-expanding textarea, save/cancel/edit flow, and last-updated attribution.

#### SQL to run first

None. The comment columns already exist in `account_health_responses` from Phase C.

#### Files to create

- `components/account-health/CommentCell.tsx`

#### Files to modify

- `components/account-health/RiskAssessmentTable.tsx`

#### `components/account-health/CommentCell.tsx` — create

**Props:**
```ts
interface CommentCellProps {
  initialValue: string | null
  updatedAt: string | null
  updatedByUserId: string | null
  onSave: (value: string) => Promise<void>
  readOnly?: boolean
}
```

**States:**

1. **Empty, view mode** — `<div>` with placeholder `Add a comment…` in `text-[12px] text-text-muted italic`. On hover (not `readOnly`): `hover:bg-[#F7F7F7] cursor-text`. Clicking enters editing mode.

2. **Editing mode** — `<textarea>` with auto-expand:
```ts
const el = textareaRef.current
if (el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
```
`rows={2}` minimum. Below: `Save` (navy primary, `text-[12px]`) and `Cancel` (secondary, `text-[12px]`).

3. **Saved, view mode** — text as `<p className="text-[13px] text-navy whitespace-pre-wrap">`. Below: attribution line `text-[11px] text-text-muted`. On hover (not `readOnly`): pencil icon (`Pencil`, size 12) at top-right.

**Resolving user name for attribution:**
```ts
supabase.from('users').select('first_name, last_name').eq('id', updatedByUserId).single()
```
Cache in local `useState`. Format: `[first_name] [last_name]`.

Date format: `new Date(updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })` + ` at ` + `toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })`.

**Save:** Call `onSave(trimmedValue)`. While saving, disable buttons and show `Saving…`. On success, transition to saved view mode. On error, stay in editing mode.

**Cancel:** Discard uncommitted text. Return to previous state (empty or previous saved content).

**`readOnly` mode:** Text displayed; clicking does not enter edit mode; no pencil icon; no Save/Cancel buttons.

#### `components/account-health/RiskAssessmentTable.tsx` — update

Replace Phase C placeholder cells with two `<CommentCell>` instances per question row:

```tsx
// CS Lead Comments column
<CommentCell
  initialValue={rowData?.cs_lead_comment ?? null}
  updatedAt={rowData?.cs_lead_updated_at ?? null}
  updatedByUserId={rowData?.cs_lead_updated_by ?? null}
  onSave={async (value) => {
    await supabase.from('account_health_responses').upsert({
      client_account_id: clientAccountId,
      admin_user_id: adminUserId,
      month: monthStr,
      question_id: question.id,
      cs_lead_comment: value,
      cs_lead_updated_at: new Date().toISOString(),
      cs_lead_updated_by: adminUserId,
      updated_at: new Date().toISOString(),
      updated_by: adminUserId,
    }, { onConflict: 'client_account_id,month,question_id' })
  }}
  readOnly={readOnly}
/>

// Client Partner Comments column
<CommentCell
  initialValue={rowData?.client_partner_comment ?? null}
  updatedAt={rowData?.client_partner_updated_at ?? null}
  updatedByUserId={rowData?.client_partner_updated_by ?? null}
  onSave={async (value) => {
    await supabase.from('account_health_responses').upsert({
      client_account_id: clientAccountId,
      admin_user_id: adminUserId,
      month: monthStr,
      question_id: question.id,
      client_partner_comment: value,
      client_partner_updated_at: new Date().toISOString(),
      client_partner_updated_by: adminUserId,
      updated_at: new Date().toISOString(),
      updated_by: adminUserId,
    }, { onConflict: 'client_account_id,month,question_id' })
  }}
  readOnly={readOnly}
/>
```

> **Important on `updated_by` in Phase E:** In the manager view, `adminUserId` is the account owner — not the logged-in manager. Pass the logged-in user's ID separately as `currentUserId` in Phase E, and use `currentUserId` for the `_updated_by` fields while keeping `adminUserId` for `admin_user_id`.

After a successful upsert in `onSave`, refresh the local responses map by re-fetching or updating optimistically.

#### Phase D — Verify

- [ ] Empty comment cell: placeholder text visible; clicking enters edit mode
- [ ] Typing: textarea height expands automatically beyond 2 lines
- [ ] Save: saves to Supabase with correct `_updated_at` and `_updated_by`
- [ ] Cancel: discards changes and returns to previous state
- [ ] Saved cell: text shows; pencil icon on hover; clicking pencil enters edit mode
- [ ] Attribution line shows correct name and formatted date
- [ ] Navigating to a different month and back: comments still there for original month
- [ ] CS Lead and Client Partner columns are independent — saving one does not affect the other

---

### 14.6 Phase E — Manager View: Tab Navigation

**Goal:** Allow managers to navigate to a user's Account Health page from the manager view. Add a tab bar above the task view page. The Account Health tab is only visible if the managed user has `account_health_enabled = true`.

#### SQL to run first

None.

#### Files to create

- `app/(app)/manager/[adminUserId]/account-health/page.tsx`
- `components/manager/ManagerViewTabs.tsx`

#### Files to modify

- `components/manager/ManagerLandingView.tsx`
- `app/(app)/manager/[adminUserId]/page.tsx`
- `components/manager/ManagerTaskView.tsx`

#### `components/manager/ManagerLandingView.tsx` — changes

In the `loadPeople` function, update the users query to also fetch `account_health_enabled`:

```ts
const { data: users } = await supabase
  .from('users')
  .select('id, first_name, last_name, email, role, account_health_enabled')
  .in('id', adminUserIds)
```

Add `accountHealthEnabled: boolean` to the `PersonCard` interface. Populate from user data when building cards.

#### `components/manager/ManagerViewTabs.tsx` — create

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface ManagerViewTabsProps {
  adminUserId: string
  accountHealthEnabled: boolean
}

export default function ManagerViewTabs({ adminUserId, accountHealthEnabled }: ManagerViewTabsProps) {
  const pathname = usePathname()
  const isAccountHealth = pathname.includes('/account-health')
  if (!accountHealthEnabled) return null
  return (
    <div className="flex items-center gap-0 border-b border-border bg-white px-6">
      <TabLink href={`/manager/${adminUserId}`} label="Task list" active={!isAccountHealth} />
      <TabLink href={`/manager/${adminUserId}/account-health`} label="Account health" active={isAccountHealth} />
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${active ? 'border-teal text-navy' : 'border-transparent text-text-muted hover:text-navy'}`}>
      {label}
    </Link>
  )
}
```

#### `app/(app)/manager/[adminUserId]/page.tsx` — changes

After the existing manager relationship check, fetch `account_health_enabled` for the adminUser:

```ts
const { data: adminUserData } = await supabase
  .from('users')
  .select('account_health_enabled')
  .eq('id', adminUserId)
  .single()
const accountHealthEnabled = adminUserData?.account_health_enabled ?? false
```

Pass it to `ManagerTaskView`:
```tsx
<ManagerTaskView adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} />
```

#### `components/manager/ManagerTaskView.tsx` — changes

```tsx
import ManagerViewTabs from './ManagerViewTabs'

interface ManagerTaskViewProps {
  adminUserId: string
  accountHealthEnabled: boolean
}

export default function ManagerTaskView({ adminUserId, accountHealthEnabled }: ManagerTaskViewProps) {
  return (
    <div className="flex flex-col h-full">
      <ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={accountHealthEnabled} />
      <TaskTableView readOnly adminUserId={adminUserId} />
    </div>
  )
}
```

#### `app/(app)/manager/[adminUserId]/account-health/page.tsx` — create

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerViewTabs from '@/components/manager/ManagerViewTabs'
import AccountHealthView from '@/components/account-health/AccountHealthView'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ManagerAccountHealthPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>
}) {
  const { adminUserId } = await params
  if (!UUID_RE.test(adminUserId)) redirect('/manager')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) redirect('/login')

  const { data: rel } = await supabase
    .from('manager_relationships')
    .select('id')
    .eq('admin_user_id', adminUserId)
    .eq('manager_user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!rel) redirect('/manager')

  const { data: adminUserData } = await supabase
    .from('users')
    .select('account_health_enabled')
    .eq('id', adminUserId)
    .single()
  if (!adminUserData?.account_health_enabled) redirect(`/manager/${adminUserId}`)

  return (
    <div className="flex flex-col h-full">
      <ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={true} />
      <AccountHealthView
        viewAsUserId={adminUserId}
        readOnly={true}
        managerUserId={userId}
      />
    </div>
  )
}
```

**Update `AccountHealthView` to accept new props:**

```ts
interface AccountHealthViewProps {
  viewAsUserId?: string    // if set, view this user's data instead of the logged-in user's
  readOnly?: boolean       // if true, disable response dropdowns and comment editing
  managerUserId?: string   // the logged-in manager's userId, used as updated_by for comments
}
```

When `viewAsUserId` is provided:
- Fetch client accounts, metadata, and responses for `viewAsUserId`
- Pass `readOnly` to `RiskAssessmentTable`
- For comment saves, use `managerUserId` as the `_updated_by` value
- Response dropdowns are disabled
- Metadata fields are read-only

#### Phase E — Verify

- [ ] Manager landing page: cards load without error
- [ ] Card for user with Account Health **disabled**: navigates to task list, no tab bar
- [ ] Card for user with Account Health **enabled**: navigates to task list, tab bar shows both tabs
- [ ] Clicking "Account health" tab: navigates to `/manager/[adminUserId]/account-health`
- [ ] Manager account health page: shows the managed user's client accounts, not the manager's
- [ ] Response dropdowns in manager view: visible but disabled
- [ ] Metadata fields in manager view: visible but read-only
- [ ] Comment cells in manager view: manager can add/edit comments; attribution shows manager's name
- [ ] Direct URL to `/manager/[adminUserId]/account-health` for user with Account Health disabled: redirects to `/manager/[adminUserId]`

---

### 14.7 Appendix A — Canonical Question Text

**Do not modify this text. Reproduce exactly in the UI.**

#### Engagement
1. Is platform usage declining or inactive for 4+ weeks?
2. Are milestone or KPI tracking habits weakening?
3. Are QBRs consistently missed or poorly attended?
4. Is client feedback passive or negative? Are NPS scores low?

#### Stakeholder Risk
5. Have key admins, sponsors, or power users left or changed roles?
6. Is there unclear ownership or missing champions?
7. Have CSMs been regularly changed?
8. Are they missing an internal AI sponsor?
9. Is there an unstable relationship with sales, CS, product owner, or sponsor?

#### Strategic Fit
10. Is the product seen as non-essential or misaligned with client priorities?

#### Operational Risk
11. Has roll-out been delayed due to inattentive or unresponsive admins?
12. Is client feedback passive or negative? Are NPS scores low?

#### Commercial Risk
13. Are renewal conversations delayed or stalled?

#### Risk Matrix
14. Engagement risk
15. Stakeholder risk
16. Strategic fit
17. Operational risk
18. Commercial risk

#### Risk Factor
19. Is the client flagged as high risk in the CS risk review?
20. Has the primary admin, sponsor, or power user left and not been replaced?
21. Has product usage dropped significantly (30% or more decline) over a 4-week period?
22. Is renewal within 3 months with low engagement?
23. Is there a confirmed commercial, strategic, or stakeholder misalignment?

---

### 14.8 Appendix B — Full Migration SQL (all phases, in order)

Run this if setting up a fresh environment or verifying the complete schema. Each phase's individual migration file is still the recommended approach for incremental deployment.

```sql
-- ═══════════════════════════════════════════════════════════════
-- Phase A
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_health_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.client_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  product       text CHECK (product IN ('AH', 'NURO', 'EH', 'N/A')),
  sort_order    integer NOT NULL DEFAULT 0,
  is_visible    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS client_accounts_admin_user_id_idx ON public.client_accounts(admin_user_id);
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_accounts: owner read"   ON public.client_accounts FOR SELECT USING (auth.uid() = admin_user_id);
CREATE POLICY "client_accounts: manager read" ON public.client_accounts FOR SELECT USING (EXISTS (SELECT 1 FROM public.manager_relationships mr WHERE mr.admin_user_id = client_accounts.admin_user_id AND mr.manager_user_id = auth.uid() AND mr.status = 'accepted'));
CREATE POLICY "client_accounts: owner insert" ON public.client_accounts FOR INSERT WITH CHECK (auth.uid() = admin_user_id);
CREATE POLICY "client_accounts: owner update" ON public.client_accounts FOR UPDATE USING (auth.uid() = admin_user_id);
CREATE POLICY "client_accounts: owner delete" ON public.client_accounts FOR DELETE USING (auth.uid() = admin_user_id);

-- ═══════════════════════════════════════════════════════════════
-- Phase B
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_health_metadata (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id    uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  renewal_date         date,
  last_engagement_date date,
  engagement_type      text CHECK (engagement_type IN ('monthly_review','qbr','training','project_call','spontaneous','other')),
  updated_at           timestamptz,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id)
);
ALTER TABLE public.account_health_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ah_metadata: owner full"   ON public.account_health_metadata FOR ALL USING (auth.uid() = admin_user_id);
CREATE POLICY "ah_metadata: manager read" ON public.account_health_metadata FOR SELECT USING (EXISTS (SELECT 1 FROM public.manager_relationships mr WHERE mr.admin_user_id = account_health_metadata.admin_user_id AND mr.manager_user_id = auth.uid() AND mr.status = 'accepted'));

-- ═══════════════════════════════════════════════════════════════
-- Phase C
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_health_responses (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id          uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id              uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month                      date NOT NULL,
  question_id                text NOT NULL CHECK (question_id IN (
                               'engagement_usage_declining','engagement_milestone_weakening',
                               'engagement_qbr_missed','engagement_feedback_passive',
                               'stakeholder_key_left','stakeholder_ownership_unclear',
                               'stakeholder_csm_changed','stakeholder_ai_sponsor_missing',
                               'stakeholder_relationship_unstable','strategic_nonessential',
                               'operational_rollout_delayed','operational_feedback_passive',
                               'commercial_renewal_delayed','matrix_engagement',
                               'matrix_stakeholder','matrix_strategic_fit',
                               'matrix_operational','matrix_commercial',
                               'risk_flagged_high','risk_admin_left','risk_usage_dropped',
                               'risk_renewal_low_engagement','risk_confirmed_misalignment'
                             )),
  response                   text CHECK (response IN ('yes','no','low','medium','high')),
  cs_lead_comment            text,
  cs_lead_updated_at         timestamptz,
  cs_lead_updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  client_partner_comment     text,
  client_partner_updated_at  timestamptz,
  client_partner_updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz,
  updated_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id, month, question_id)
);
CREATE INDEX IF NOT EXISTS ahr_client_account_month_idx ON public.account_health_responses(client_account_id, month);
CREATE INDEX IF NOT EXISTS ahr_admin_user_id_idx ON public.account_health_responses(admin_user_id);
ALTER TABLE public.account_health_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ah_responses: owner full"   ON public.account_health_responses FOR ALL USING (auth.uid() = admin_user_id);
CREATE POLICY "ah_responses: manager read" ON public.account_health_responses FOR SELECT USING (EXISTS (SELECT 1 FROM public.manager_relationships mr WHERE mr.admin_user_id = account_health_responses.admin_user_id AND mr.manager_user_id = auth.uid() AND mr.status = 'accepted'));
```
