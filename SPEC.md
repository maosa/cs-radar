# Task Tracker — Product Design & Engineering Specification

**Access Infinity · Version 1.1 · May 2026**

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

Supabase Auth handles all authentication. Row Level Security (RLS) policies enforce permissions at the database level. The system is built auth-first even though an initial public/open mode will be used at launch.

**Launch mode (short-term):** The application URL can be shared openly. Anyone with the URL can interact with the platform. RLS policies are present in the schema but a feature flag (`NEXT_PUBLIC_AUTH_ENFORCED=false`) disables enforcement. This allows a user to share their task list URL with their manager without requiring sign-up.

**Full auth mode (future, one config change to enable):** Users must sign in. RLS policies enforce that each user only sees their own tasks. Manager context access is only granted where an accepted `manager_relationships` record exists. The invitation flow (described in Section 7) is already built and functional in this mode.

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

### 5.3 Week Navigation

- Left arrow button — navigate to previous set of weeks
- Right arrow button — navigate to next set of weeks
- Today button — jump back to the current week, always visible
- In Focused view: one column visible (current week)
- In Expanded view: three columns visible (previous, current, next week). The current week column header is highlighted with a teal underline indicator and a `current` label badge.

### 5.4 View Modes

| Mode | Behaviour |
|---|---|
| **Focused** | Shows only the current week column. Clean, minimal view for daily use. |
| **Expanded** | Shows three columns: previous week, current week, next week. Current week is visually distinguished by a teal underline on its column header and a small `current` badge. |

### 5.5 Filter Bar

A lightweight filter bar sits between the toolbar and the table. It filters which rows are visible — it does not paginate or hide week columns.

- **Filter by product:** chip buttons for AH, EH, NURO. Multiple can be active simultaneously. Clicking an active chip deactivates it.
- **Filter by project:** chip buttons for each project in the admin's project list. Multiple can be active.
- When no filters are active, all tasks are shown.
- Active filter chips are visually distinct (navy background, white text).

### 5.6 Sort Modes

Sort is applied per-week (within each week column independently).

| Mode | Behaviour |
|---|---|
| **Drag & drop** | User can drag rows to reorder tasks within a week. Sort order is persisted to `tasks.sort_order`. Default mode. |
| **By product** | Tasks within each week are grouped and ordered: AH → EH → NURO. |
| **By project** | Tasks within each week are grouped alphabetically by project name. |

Sort mode is selected via chip buttons in the filter/sort bar. Only one sort mode is active at a time. Drag-and-drop is disabled when a non-default sort mode is active.

### 5.7 Global Search

A search input in the toolbar provides global search across all tasks, all weeks.

- Searches across: task description, product name, project name
- Results appear in a dropdown below the search input
- Results are ordered most recent first (by `week_start_date` descending)
- Each result shows: task description, product badge, project name, week label
- Clicking a result navigates to that week and highlights the task row
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

Each task row has a set of action icons. The checkbox is always visible. All other icons appear on hover.

| Action | Behaviour |
|---|---|
| **Checkbox** | Tick/untick to mark complete. Always visible. |
| **Flag icon** | Toggle flagged state. Click once to flag, again to unflag. |
| **Arrow-left icon** | Move task to a past week. Opens a dropdown: Previous week (−1) / −2 weeks / −3 weeks / −4 weeks. |
| **Arrow-right icon** | Move task to a future week. Opens a dropdown: Next week (+1) / +2 weeks / +3 weeks / +4 weeks. |
| **Notes icon** | Opens the detail panel (right-side) and scrolls to the Notes section. |
| **Comment icon** | Opens the detail panel and scrolls to the Comments section. |
| **Delete icon** | Opens a confirmation dialog: "Are you sure you want to delete this task? This action cannot be undone." Confirm / Cancel. |

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
- The Notes icon on a task row (scrolls to Notes section)
- The Comment icon on a task row (scrolls to Comments section)
- A persistent panel-toggle icon in the top-right of the main view

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
- Keyword-based matching (not exact match). Results ranked by recency.
- Up to 5 suggestions shown
- Selecting a suggestion populates the description field; user can edit freely
- Debounced at 300ms

---

## 7. Settings Page

Accessible from the left sidebar (Settings icon, pinned to bottom). Available to all users.

### 7.1 Account Details

- First name — editable text input
- Last name — editable text input
- Email — editable text input
- **Default landing page** — radio or toggle with two options:
  - `My task list` (default for all users)
  - `Manager view` — only selectable if the user has at least one accepted `manager_relationships` record. If not, this option is greyed out with a note beneath it: *"Manager view is available once you have an accepted manager relationship. Ask a colleague to invite you as their manager."*
- Save button — updates the `users` table (`first_name`, `last_name`, `email`, `default_landing`)

### 7.2 Projects Configuration

Admin users manage their project list here. Changes are reflected immediately in the task table's Project dropdown.

- List of current projects — each row shows project name with Edit (pencil) and Delete (trash) icons
- Add new project — text input + Add button. Duplicate names are rejected with an inline error.
- Edit project — inline edit on the existing row, Save / Cancel
- Delete project — confirmation dialog. If tasks reference this project: "X tasks reference this project. Deleting it will remove the project association from those tasks." Confirm / Cancel.

### 7.3 Manager Invitation

Admin users can invite one or more managers to view their task list.

- **Email input** — on blur or Enter, live validation fires:
  - Email found in `users` table → subtle green confirmation: "User found — invitation will be sent."
  - Email not found → subtle warning: "No account found for this email address."
- **Send Invitation button** — creates a `manager_relationships` record with status `'pending'` and triggers an invitation email
- Invitation email contains a link. Clicking the link sets status → `'accepted'` and logs the manager in. If the manager has no account, they are prompted to create one first.
- **Current managers list** — shows all accepted relationships. Each row has a Remove button that sets status to `'archived'` and revokes access.

---

## 8. Manager Experience

### 8.1 Manager Landing Page

Accessible via the Manager view item in the left sidebar. This item is hidden entirely if the user has no accepted `manager_relationships` records. When a user with accepted relationships clicks Manager view, they land on a page showing all the users whose task lists they manage.

Each Admin is shown as a card containing:
- Admin's full name
- Admin's role/title (if provided)
- Favourite star icon (top-left) — toggles to pin cards to the top of the list
- Edit icon (top-right, appears on hover) — opens edit modal

Page controls:
- **Search bar** — filters cards by name or role in real time
- **Sort controls** — sort by name (A–Z), by role, or favourites first
- **Home / Archive tabs** — Home shows active relationships; Archive shows relationships the manager has archived
- **Add person button** (+) — opens Add Person modal

### 8.2 Add / Edit Person Modal

Fields: First name, Last name, Email, Role. Save and Cancel buttons. Edit modal also has a Delete button that archives the card (moves to Archive tab).

> Note: Adding a person here is the manager-side record of their direct report. It does not send an invitation. The invitation flow (which grants access to the task list) is initiated by the Admin from their Settings page.

### 8.3 Manager Task View

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
| Toolbar buttons (tasks & manager views) | `size={14}–size={16}` | `Plus`, `Search`, `ChevronLeft/Right`, `PanelRight` |
| Task row action icons | `size={14}` | `Flag`, `ArrowRight`, `Trash2`, `FileText`, `MessageSquare` |
| Drag handle | `size={12}` | `GripVertical` |
| Detail panel | `size={12}–size={14}` | `X`, `Pencil`, `Trash2` |
| Manager view cards | `size={13}–size={16}` | `Pencil`, `Star` |
| Manager view empty state | `size={28}` | `UserRound` |
| Settings view | `size={12}–size={13}` | `Pencil`, `Trash2`, `Check`, `X` |

**Fill states:** Icons that toggle between filled and unfilled (e.g. flag, star) use Tailwind's `fill-` utility class directly on the Lucide component — e.g. `className="text-[#FF0522] fill-[#FF0522]"`. No separate filled/unfilled SVG variants are needed.

### 9.6 Responsive Behaviour

Primary target is desktop browser. Week columns have a minimum width of 200px and expand to fill available space. The two sticky columns (Product 110px, Project 130px) are always visible. On narrower screens, horizontal scrolling is enabled on the table only (not the full page).

---

## 10. Phased Development Plan

Phases are ordered by dependency. Each phase is independently shippable to Vercel. **Any agent picking up this project should confirm which phases are already complete before proceeding.**

### Phase 1 — Project Scaffolding & Infrastructure

- [ ] Initialise Next.js project with TypeScript and Tailwind CSS
- [ ] Connect Supabase project; configure environment variables
- [ ] Create full database schema (all tables from Section 4) with RLS policies defined but controlled by feature flag (`NEXT_PUBLIC_AUTH_ENFORCED=false`)
- [ ] Set up Vercel project and confirm CI/CD pipeline from GitHub
- [ ] Configure Supabase Auth (email provider, invite email template)
- [ ] Implement base layout: left sidebar (collapsed rail, expandable), top bar, page shell
- [ ] Implement sidebar navigation logic: My tasks always visible; Manager view hidden until accepted `manager_relationships` exist; Settings pinned to bottom

### Phase 2 — Core Task Table

- [ ] Build the week-column table component with dynamic week generation from Jan 5, 2026
- [ ] Implement sticky Product and Project columns
- [ ] Implement Focused and Expanded view modes
- [ ] Implement week navigation (prev/next arrows, Today button)
- [ ] Hard-code mock data to validate layout and scrolling behaviour
- [ ] Apply full design system: colors, typography, badge styles, row heights

### Phase 3 — Task CRUD

- [ ] Wire table to Supabase: fetch real tasks
- [ ] Implement Add Task modal (product, project, description fields)
- [ ] Implement task autocomplete (keyword search on description, scoped by product)
- [ ] Implement inline task completion (checkbox toggle)
- [ ] Implement task flagging (flag icon toggle)
- [ ] Implement Move Task dropdown (+1 / +2 / +3 / +4 weeks)
- [ ] Implement Delete Task with confirmation modal
- [ ] Implement drag-and-drop row reordering within a week column (dnd-kit)

### Phase 4 — Filter, Sort & Search

- [ ] Implement filter bar: product chips, project chips, multi-select logic
- [ ] Implement sort modes: by product, by project, drag-and-drop default
- [ ] Implement global search input with debounce, result dropdown, week navigation on selection

### Phase 5 — Detail Panel (Notes & Comments)

- [ ] Build the right-side slide-in panel component with open/close toggle
- [ ] Notes section: fetch, display, edit, and auto-save `task_notes`
- [ ] Comments section: fetch and display `task_comments` with author and timestamp
- [ ] Add new comment (input + Save button)
- [ ] Edit and delete own comments (hover actions)
- [ ] Wire panel open to Notes icon and Comment icon on task rows

### Phase 6 — Settings Page

- [ ] Build Settings page layout with Account, Projects, and Manager sections
- [ ] Account details: read and update first name, last name, email
- [ ] Default landing page preference: toggle between `'task_list'` and `'manager_view'`; Manager view option greyed out with explanatory note if no accepted manager relationships exist
- [ ] Projects: list, add, edit, delete with confirmation and task-reference warning
- [ ] Manager invitation: email input with live validation, send invitation, current managers list

### Phase 7 — Manager Experience

- [ ] Build Manager landing page (accessible via left sidebar Manager view item)
- [ ] Implement favouriting, sorting, search, and Home/Archive tabs on landing page
- [ ] Implement Add/Edit Person modal
- [ ] Build Manager task view (read-only task table, comment-only panel, sidebar remains active)
- [ ] Implement Back navigation from task view to Manager landing page
- [ ] Implement default landing page redirect on sign-in (reads `users.default_landing`)
- [ ] Test invitation acceptance flow end-to-end
- [ ] Validate sidebar Manager view item appears/disappears correctly based on relationship status

### Phase 8 — Auth Enforcement (Future)

- [ ] Set `NEXT_PUBLIC_AUTH_ENFORCED=true` in Vercel environment
- [ ] Add sign-in page (email + password or magic link)
- [ ] Add sign-up page
- [ ] Validate RLS policies enforce correct data isolation between users
- [ ] Test manager invitation flow with auth fully enabled
- [ ] Remove any temporary open-access bypasses

---

## 11. Resolved Decisions & Notes for Developers

| Decision | Resolution |
|---|---|
| **Dual-role model** | Every user can operate as both task list owner and manager. There is no fixed account type. Access to each context is determined by data (what task lists they own, what `manager_relationships` they have). |
| **Left sidebar visibility** | Manager view item in the sidebar is hidden entirely until the user has at least one accepted `manager_relationships` record. |
| **Default landing page** | Stored in `users.default_landing`. Options: `'task_list'` (default) or `'manager_view'`. Manager view option is greyed out in settings with an explanatory note if no accepted manager relationships exist. |
| **Task creation target week** | Toolbar "Add task" always creates in the current week. Inline "Add task" in a week column footer creates in that specific week. |
| **Autocomplete scope** | Scoped to the viewing user's own tasks only. Product-filtered if product is selected in the modal. Project-agnostic. |
| **Move task — original week** | No placeholder left. Task disappears from source week and appears in target week. |
| **Task ownership** | Each user sees only their own tasks in owner context. No shared team task lists in v1. |
| **Manager relationship init** | Task list owner invites manager from Settings. Manager's landing page auto-populates from accepted relationships. |
| **Global search ordering** | Results ordered by `week_start_date` descending (most recent week first). |
| **Sort scope** | Sort (drag-and-drop, by product, by project) is applied per-week, not globally across the full table. |
| **Week definition** | Monday–Sunday. No fixed start or end date. Navigation is open in both directions. The week epoch used internally is January 3, 2000 (the first Monday of 2000), giving a practical floor far enough back for any historical import. |
| **Week-window data loading** | The tasks query fetches a rolling window of weeks rather than all tasks. The initial window is approximately today −26 weeks to today +4 weeks. The window auto-expands by 13 weeks in either direction as the user navigates toward the boundary. This keeps initial load fast for users with years of task history. |
| **Realtime live updates** | The manager task view uses a Supabase Realtime Postgres changes subscription scoped to the task owner's `admin_user_id`. Any change to the tasks table triggers a React Query cache invalidation, refreshing the manager view within ~1 second. |
| **Row structure** | One row = one task. Product and project columns repeat per row. Multiple tasks for the same product/project in the same week each have their own row. |
| **Detail panel trigger** | Not auto-opened on row click. Opened via Notes/Comment icon on task row, or panel toggle button. |
| **Flagged task visibility** | Flag is visible to both task owner and manager. |
| **Comment editing** | Task list owner can edit or delete any comment (including manager comments). Intentional by design. Audit trail captured in `updated_by` and `updated_at`. |
| **Product list** | Fixed: Access Hub (AH), NURO, Evidence Hub (EH). Not user-configurable in v1. |
| **Project list** | Owner-configurable via Settings. Reflected immediately in task table dropdown. |

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

*Task Tracker Specification · Access Infinity · v1.1 · May 2026*

*Update this document as decisions are made or requirements change. Version the file (v1.2, v1.3, etc.) with a brief change note when significant updates are made.*

**v1.1 changes (May 2026):** Added N/A product option; open week navigation (no fixed start date); move-task backward action; corrected column widths; updated tech stack to TanStack Query v5; added `sort_order`, `product`, `is_visible` to projects schema; fixed search ordering; added Realtime live updates (§8.3); added Section 12 (Data Loading & Performance).
