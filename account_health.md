# Account Health — Feature Specification

**Access Infinity · Task Tracker · Draft v1.4 · May 2026**

> This document specifies the Account Health feature end-to-end: database schema, settings changes, UI/UX design, component architecture, and integration with the existing app. It is written to be self-contained so any developer can implement it without additional context. Read in conjunction with SPEC.md.

---

## Table of Contents

1. [Overview & Approach](#1-overview--approach)
2. [Settings: Architecture Decision](#2-settings-architecture-decision)
3. [Settings: Client Accounts Section](#3-settings-client-accounts-section)
4. [Database Schema](#4-database-schema)
5. [Sidebar Changes](#5-sidebar-changes)
6. [Account Health Page — Layout & Navigation](#6-account-health-page--layout--navigation)
7. [Risk Assessment Structure & Question Set](#7-risk-assessment-structure--question-set)
8. [Table: Column Specifications](#8-table-column-specifications)
9. [UI Design Details](#9-ui-design-details)
10. [Manager View Integration](#10-manager-view-integration)
11. [RLS Policies](#11-rls-policies)
12. [Development Phases](#12-development-phases)
13. [Open Questions & Future Considerations (Option 2 Hierarchy)](#13-open-questions--future-considerations-option-2-hierarchy)

---

## 1. Overview & Approach

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

## 2. Settings: Architecture Decision

### Recommendation: Option 1 (keep projects separate, add a parallel client accounts section)

Option 2 (full Client Account > Product > Project hierarchy) is architecturally cleaner in the long run but would require restructuring the `projects` table, the `tasks` table references, and all existing queries — with meaningful risk to live data. Given that the app is already in active use, Option 1 is the right starting point.

**What Option 1 means in practice:**

The Settings page will have two distinct, clearly labelled sections for lists that appear in different parts of the app:

- **Projects** — used in the task list when creating or editing a task. The description beneath the section heading will be updated to say: *"Projects appear in the task list when you create or edit a task. Each project can be associated with a product to pre-filter the dropdown."*
- **Client Accounts** — used in Account Health when selecting which client you are reviewing. Each client account has a name and an optional product association.

There is intentional overlap (a project like "Vaccines" maps to Pfizer / AH, and a client account called "Pfizer" also maps to AH), but this duplication is tolerable in v1 and can be collapsed in a future Option 2 migration once the hierarchy is validated.

### A note on flipping the hierarchy

You asked whether Product > Client Account > Project makes more sense than Client Account > Product > Project.

For a CSM, the natural unit of work is the client. You think "I need to do Pfizer's monthly review", not "I need to do the AH review". You also think "I need to add a task for Pfizer", not "I need to add a task for AH". This is reinforced by the examples you provided — Pfizer, Astellas, Regeneron, etc. are the primary identifiers, with product as a sub-attribute.

**The hierarchy Client Account > Product > Project is the right one.** Keep this as the design target for Option 2.

---

## 3. Settings: Client Accounts Section

### 3.1 Account Health enable/disable toggle

The Settings page section order is: **Account details → Projects → Team management → Account health → Export data.**

The Account Health `SectionCard` therefore sits between Team Management and Export Data — not near the top of the page. Its content is a single toggle or checkbox:

> **Enable account health**
> Turn this on if you manage client accounts and want to use the monthly risk assessment features. This adds an Account health page to your sidebar.

- Default state: **off**
- When toggled on: the Account Health nav item appears in the sidebar (see Section 5), and the Client Accounts section becomes visible lower on the Settings page
- When toggled off: the Account Health nav item disappears from the sidebar. Existing client account definitions and assessment data are retained in the database — nothing is deleted
- The toggle state is stored in `users.account_health_enabled` (see Section 4.5)
- Save is immediate on toggle change (no separate save button needed for this field)
- After saving, the component calls `triggerSidebarRefresh()` from the `useSidebarRefresh()` hook. This increments the shared counter in `SidebarContext`, which the Sidebar component is already subscribed to — it immediately re-fetches `account_health_enabled` from Supabase and re-evaluates which nav items to show. The sidebar updates **without any page reload** — the same mechanism already used today when accepting or declining a manager invitation.

> **Note for managers:** A manager never needs to enable Account Health for themselves in order to view a user's account health data. The visibility of Account Health in the manager view is determined by whether the user being managed has it enabled (see Section 10.4). Account Health in a user's own sidebar is entirely separate from their manager's access to it.

### 3.2 Client Accounts section visibility

The Client Accounts `SectionCard` in Settings is only rendered when `account_health_enabled` is `true` for the current user. It appears immediately after the Account Health toggle card. If a user disables Account Health, the section is hidden (though any data already saved is preserved).

### 3.3 Location on the Settings page

When Account Health is enabled, the `SectionCard` titled **"Client accounts"** appears directly below the Account Health toggle card (i.e., between Team Management and Export Data). Include a short description:

> *Used in Account Health to select the client you are reviewing. Each account can be associated with a product.*

### 3.4 Behaviour

The Client Accounts section mirrors the Projects section exactly in terms of UX patterns:

- **List of current client accounts** — each row shows the account name, an optional product badge, and on hover: Edit (pencil), visibility toggle (Eye / EyeOff), and Delete (trash) icons
- **Drag-to-reorder** — same dnd-kit SortableContext pattern as projects. The order set here is the order in which accounts appear in the Account Health dropdown
- **Add new account** — product selector dropdown + text input + Add button, same layout as adding a project. Product is optional (accounts like "General" may not have one)
- **Edit** — inline edit with save / cancel, same as project edit
- **Delete** — if the account has any `account_health_responses` or `account_health_metadata` rows, show a blocking dialog: *"[Account name] cannot be deleted because it has assessment data. Please contact support if you need to remove it."* If it has no data, confirm with: *"Are you sure you want to delete this client account? This action cannot be undone."*
- **Visibility toggle** — same Eye/EyeOff logic as projects. Hidden accounts are excluded from the Account Health dropdown but their historical data is preserved
- **Duplicate validation** — same name + product combination is rejected inline

### 3.5 New database table: `client_accounts`

See Section 4.1.

---

## 4. Database Schema

### 4.1 `client_accounts`

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

### 4.2 `account_health_metadata`

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

### 4.3 `account_health_responses`

One row per (client account, month, question). Stores the response selection and both comment columns, along with separate audit fields for each comment column.

`month` is always stored as the first day of the month (e.g. `2026-04-01`). This makes range queries and month equality checks straightforward.

`question_id` is a text enum identifying which question this row answers. Full list in Section 7.

| Column | Definition |
|---|---|
| `id` | `uuid` — primary key |
| `client_account_id` | `uuid` — references `client_accounts(id)` on delete cascade |
| `admin_user_id` | `uuid` — references `users(id)` on delete cascade |
| `month` | `date` — not null, always the first day of the month |
| `question_id` | `text` — not null, one of the enum values in Section 7.3 |
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

The `unique (client_account_id, month, question_id)` constraint enables safe upsert operations — when a user saves a response, the app can `upsert` on this composite key without risk of duplicates.

### 4.4 Migration SQL (new tables only — additive, no changes to existing tables)

The three new tables (`client_accounts`, `account_health_metadata`, `account_health_responses`) plus their RLS policies (Section 11) are entirely additive. The only change to an existing table is the addition of one column to `users` (Section 4.5).

### 4.5 `users` table: new column `account_health_enabled`

One additive column on the existing `users` table:

| Column | Definition |
|---|---|
| `account_health_enabled` | `boolean` — not null, default `false` |

```sql
alter table public.users
  add column if not exists account_health_enabled boolean not null default false;
```

This is the only change to an existing table. The default of `false` means no existing users are affected — Account Health is off for everyone until they explicitly enable it in Settings. The `users: self update` RLS policy already in place covers this column; no new policy is needed.

---

## 5. Sidebar Changes

### 5.1 New nav item

Add an Account Health nav item to the main navigation in `Sidebar.tsx`, between "My tasks" and "Manager view":

| Icon | Label | Route | Behaviour |
|---|---|---|---|
| `Gauge` (size 20) | Account health | `/account-health` | **Conditionally visible** — shown only when `account_health_enabled = true` for the current user. Same active-state logic as other nav items. |

The `Gauge` icon is available in `lucide-react` and matches the request. No new packages needed.

### 5.2 Updated state in `Sidebar.tsx`

The sidebar currently fetches `hasManagerRelationships` from Supabase. Add a parallel fetch for `account_health_enabled` from the `users` table:

```ts
// In the fetchRelationshipData function inside Sidebar.tsx
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

The sidebar should re-run this fetch whenever the `sidebarCounter` changes (same pattern as the existing `hasManagerRelationships` check), so that toggling Account Health in Settings immediately updates the sidebar without a page reload.

### 5.3 Updated `mainNavItems` array

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

The Settings page should call `triggerSidebarRefresh()` after saving the `account_health_enabled` toggle, exactly as it does today when accepting/declining a manager invitation.

### 5.4 New page route

Create `app/(app)/account-health/page.tsx` (analogous to `app/(app)/tasks/page.tsx`) and `components/account-health/AccountHealthView.tsx`.

> **Direct URL access:** If a user navigates directly to `/account-health` but has `account_health_enabled = false`, redirect them to `/tasks`. This prevents confusion if someone bookmarks the URL before the toggle is activated.

---

## 6. Account Health Page — Layout & Navigation

### 6.1 Overall layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Page heading: "Account health"                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [Client account dropdown ▾]  [Renewal date]  [Last engagement]    │
│                               [Type of engagement ▾]               │
├─────────────────────────────────────────────────────────────────────┤
│  ◀  [Today]  ▶   Apr - 2026   [current]                            │
├─────────────────────────────────────────────────────────────────────┤
│  Risk assessment table (see Section 8)                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Client account selector

A single-select dropdown at the top of the page. Populated from the user's `client_accounts` table (only visible accounts, ordered by `sort_order`). Placeholder text: *"Select a client account…"*

Until an account is selected, the month navigation and the assessment table are not shown. Instead, show a simple empty state: *"Select a client account above to begin."*

Once an account is selected, the three account-level metadata fields appear inline to the right of the dropdown on the same row (or wrapping to a second row on narrower viewports). These three fields are:

| Field | Type | Notes |
|---|---|---|
| Renewal date | Date input | Stored in `account_health_metadata.renewal_date` |
| Last engagement date | Date input | Stored in `account_health_metadata.last_engagement_date` |
| Type of engagement | Single-select dropdown | Options listed in Section 6.3 |

These three fields persist at the account level (not per month). They auto-save on blur / on change, using an upsert on `account_health_metadata` keyed on `client_account_id`. No explicit save button is needed — a subtle "Saved" toast or inline tick can confirm the save.

The layout for this header row should look roughly like:

```
[Pfizer ▾]   Renewal date [01/06/2026]   Last engagement [15/04/2026]   Type [Monthly review ▾]
```

Use consistent input styling with the rest of the app (6px border radius, `#DADADA` border, navy text, focus border `#19153F`).

### 6.3 Type of engagement options

| Display label | Stored value |
|---|---|
| Monthly review | `monthly_review` |
| QBR | `qbr` |
| Training | `training` |
| Project call | `project_call` |
| Spontaneous mail / call | `spontaneous` |
| Other | `other` |

### 6.4 Month navigation

Sits below the account selector row. Modelled closely on the week navigation in the task list.

```
◀   [Today]   ▶   Apr - 2026   [current]
```

- **Left arrow** (`ChevronLeft`, size 16): navigate to previous month
- **Today button**: return to the current month. Same teal styling as the Today button in the task list
- **Right arrow** (`ChevronRight`, size 16): navigate to next month
- **Month label**: three-letter month abbreviation + dash + four-digit year (e.g. `Apr - 2026`)
- **"Current" badge**: shown only when the displayed month is the current calendar month. Use the same teal badge style as the "current" week badge in the Expanded task view — small pill, teal background (`#00D1BA`), navy text, 4px border radius, 11px font

The selected month determines which `account_health_responses` rows are fetched and displayed. Month state is local to the page (React `useState`), initialised to the current month on load.

### 6.5 Loading and empty states

- If no account is selected: show *"Select a client account above to begin."* centred in the content area
- If an account is selected but has no response data for the selected month: render the full table with all questions but with empty response dropdowns and empty comment fields — ready for the user to fill in
- Loading state: show a subtle skeleton or spinner in the table area while data is being fetched from Supabase

---

## 7. Risk Assessment Structure & Question Set

### 7.1 Sections and questions

The assessment is divided into labelled sections. Section headers are displayed as visually distinct rows in the table (see Section 8). Questions within each section follow directly below their header.

> **⚠ Do not modify question text.** The questions below are used as a shared framework across the organisation. The wording is fixed and must be reproduced exactly in the UI as written here. No rewording, reordering, or removal of questions is permitted without explicit sign-off.

**Formatting note for developers:** No text in the UI should be in all caps. Section headers use title case (first letter of each word capitalised). Question text is sentence case.

---

#### Engagement

| Question ID | Question text | Response type |
|---|---|---|
| `engagement_usage_declining` | Is platform usage declining or inactive for 4+ weeks? | Yes / No |
| `engagement_milestone_weakening` | Are milestone or KPI tracking habits weakening? | Yes / No |
| `engagement_qbr_missed` | Are QBRs consistently missed or poorly attended? | Yes / No |
| `engagement_feedback_passive` | Is client feedback passive or negative? Are NPS scores low? | Yes / No |

---

#### Stakeholder Risk

| Question ID | Question text | Response type |
|---|---|---|
| `stakeholder_key_left` | Have key admins, sponsors, or power users left or changed roles? | Yes / No |
| `stakeholder_ownership_unclear` | Is there unclear ownership or missing champions? | Yes / No |
| `stakeholder_csm_changed` | Have CSMs been regularly changed? | Yes / No |
| `stakeholder_ai_sponsor_missing` | Are they missing an internal AI sponsor? | Yes / No |
| `stakeholder_relationship_unstable` | Is there an unstable relationship with sales, CS, product owner, or sponsor? | Yes / No |

---

#### Strategic Fit

| Question ID | Question text | Response type |
|---|---|---|
| `strategic_nonessential` | Is the product seen as non-essential or misaligned with client priorities? | Yes / No |

---

#### Operational Risk

| Question ID | Question text | Response type |
|---|---|---|
| `operational_rollout_delayed` | Has roll-out been delayed due to inattentive or unresponsive admins? | Yes / No |
| `operational_feedback_passive` | Is client feedback passive or negative? Are NPS scores low? | Yes / No |

> **Note on duplication:** The question "Is client feedback passive or negative? Are NPS scores low?" appears identically in both the Engagement and Operational Risk sections. This is intentional — it is part of the organisation's shared framework and the wording must not be changed. The two rows are independent: a user may answer Yes in one section and No in the other, since the same signal is assessed through two different lenses.

---

#### Commercial Risk

| Question ID | Question text | Response type |
|---|---|---|
| `commercial_renewal_delayed` | Are renewal conversations delayed or stalled? | Yes / No |

---

#### Risk Matrix

Section header row should include a note that responses here differ from the rest: *"Select the risk level for each category."*

Each item in the Risk Matrix has a small `Info` icon (Lucide `Info`, size 13) to the right of the label. Clicking this icon opens a small popover / tooltip modal (see Section 9.3 for popover spec).

| Question ID | Label | Response type | Popover content |
|---|---|---|---|
| `matrix_engagement` | Engagement risk | Low / Medium / High | Low or inconsistent platform usage, poor adoption, missed QBRs |
| `matrix_stakeholder` | Stakeholder risk | Low / Medium / High | Loss or absence of champions, sponsors, or decision-makers (e.g., re-organisations, maternity leave, medical leave, change of role, leaves organisation, etc.) |
| `matrix_strategic_fit` | Strategic fit | Low / Medium / High | Product is no longer aligned to client priorities or seen as non-essential (e.g., brand enters a new stage of its life-cycle) |
| `matrix_operational` | Operational risk | Low / Medium / High | Onboarding delays, unresponsive admins, weak implementation of tracking tools |
| `matrix_commercial` | Commercial risk | Low / Medium / High | Silence or delays in renewal conversations, budget changes, pricing objections |

The Low / Medium / High response options also have `Info` icons with the following popover content:

| Response | Popover content |
|---|---|
| Low | Minor concern or passive signals; log and track regular health reviews |
| Medium | Noticeable early signals; requires client re-engagement and active monitoring |
| High | High likelihood of churn or downgrade; urgent action and internal escalation |

These response-level definitions should appear in a shared tooltip near the top of the Risk Matrix section (e.g. a subtle info panel or expandable note), OR alternatively as part of each row's popover. The simpler implementation is a single shared note above the Risk Matrix rows explaining what Low / Medium / High mean, so users don't need to open five separate popovers to understand the scale. Recommended: place it as a compact info box just below the "Risk Matrix" section header.

---

#### Risk Factor

| Question ID | Question text | Response type |
|---|---|---|
| `risk_flagged_high` | Is the client flagged as high risk in the CS risk review? | Yes / No |
| `risk_admin_left` | Has the primary admin, sponsor, or power user left and not been replaced? | Yes / No |
| `risk_usage_dropped` | Has product usage dropped significantly (30% or more decline) over a 4-week period? | Yes / No |
| `risk_renewal_low_engagement` | Is renewal within 3 months with low engagement? | Yes / No |
| `risk_confirmed_misalignment` | Is there a confirmed commercial, strategic, or stakeholder misalignment? | Yes / No |

---

### 7.2 Total question count

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

### 7.3 Full `question_id` enum (for database constraint)

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

## 8. Table: Column Specifications

### 8.1 Layout choice

A **table-style layout with variable row heights** is the right approach here. The four-column structure aligns naturally with a table, and using a `<table>` or CSS grid with explicit column widths gives the clearest visual separation between the risk category, the response, and the two comment columns.

The comment columns need to grow dynamically with content — this is fine. Each row can have a different height, and this is preferable to truncating or hiding text.

### 8.2 Column definitions

| Col | Label | Width | Content |
|---|---|---|---|
| 1 | Risk category | 280px (fixed) | Section header rows OR question text rows |
| 2 | Response | 160px (fixed) | Response dropdown (Yes/No or Low/Medium/High) |
| 3 | CS lead comments | flex-1, min 200px | Auto-expanding textarea with save/edit/cancel controls |
| 4 | Client partner comments | flex-1, min 200px | Identical to Col 3 |

Total min width ≈ 840px, which works well on standard desktop viewports. On narrower screens, the page scrolls horizontally (same pattern as the task table).

### 8.3 Section header rows

Section header rows span the full width of the table. They have:
- A slightly darker background (use `#F2F2F2`, the same as the page background / table header in the task list)
- The section name in `13px` font, `500` weight, navy text
- A `1px` top border in `#DADADA` for visual separation
- No response dropdown, no comment fields in this row

### 8.4 Response dropdown (column 2)

The response dropdown for each question row is a `<select>` element, styled to match the rest of the app.

**Default / empty state**

When no response has been saved for a question — either because the month is new or the user has never answered it — the dropdown shows a blank "Select…" placeholder with a white background and muted text. This is the starting state for every question on every new month. No response is ever pre-filled or assumed.

**For Yes / No questions:**

| Selected value | Dropdown styling |
|---|---|
| (empty / no selection) | Default: white background, `#DADADA` border, muted placeholder text "Select…" |
| Yes | Light red background `#FFCDD3`, red text `#C0001A`, red-tinted border |
| No | Light teal/green background `#C3FFF8`, teal text `#007A6E`, teal-tinted border |

**For Low / Medium / High questions (Risk Matrix only):**

| Selected value | Dropdown styling |
|---|---|
| (empty) | Default: white, muted |
| Low | Same green as No: `#C3FFF8` background, `#007A6E` text |
| Medium | Yellow: `#FFF7CB` background, `#7F6900` text (consistent with EH badge colours) |
| High | Same red as Yes: `#FFCDD3` background, `#C0001A` text |

The colour is applied to the `<select>` element itself via inline style, updated dynamically when the value changes. The option dropdown (the native OS dropdown) does not need colouring — just the select trigger itself.

Changes to the response dropdown are saved immediately on change (no explicit save button needed for the response field). Use an optimistic update + background upsert to `account_health_responses`.

**Clearing a response**

A user may select a response by accident, or may want to leave a question blank while a discussion with their manager is still pending. Two mechanisms allow clearing:

1. **The blank "Select…" option is always selectable**, even after a value has been chosen. Re-selecting it clears the response. This caters to keyboard users and is the fallback for all users.

2. **A small `×` clear button** (Lucide `X`, size 12, `text-text-muted`) appears immediately to the right of the dropdown, but **only when a value has been selected**. Clicking it clears the response in one action. The button is hidden when the dropdown is already empty.

When either mechanism is used to clear a response, the behaviour is:
- The dropdown returns to the default empty/white state
- The clear button disappears
- An upsert fires with `response = null` (setting the field back to null in the database)
- **The row is not deleted.** Any comments already saved for that question remain intact. Clearing the response only clears the response field — nothing else.

### 8.5 Comment fields (columns 3 and 4)

Each question row has two comment fields. They share identical behaviour:

**States:**

1. **Empty, view mode** — the cell shows a faint placeholder: *"Add a comment…"*. On hover, the cell gets a subtle background tint (`#F7F7F7`) to indicate it is interactive.

2. **Editing mode** — triggered by clicking anywhere in an empty cell, or clicking the Edit (pencil) icon on a cell that has existing content. Shows a `<textarea>` with:
   - Auto-expanding height (min 2 rows). Implementation: use the `rows={2}` attribute and a `useEffect` that sets `textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px'` on every value change.
   - Below the textarea, two small buttons: `Save` (navy, primary button style, 12px) and `Cancel` (secondary, 12px). These appear only in editing mode.
   - The cell expands to fit the textarea.

3. **Saved, view mode** — the text is displayed in a `<p>` or `<div>` at `13px`. On hover, a small pencil icon appears at the top-right of the cell. Clicking it re-enters editing mode (state 2).

**Save behaviour:**
- Clicking Save calls an upsert on `account_health_responses` for the relevant `(client_account_id, month, question_id)` row, updating either `cs_lead_comment` (with `cs_lead_updated_at = now()` and `cs_lead_updated_by = currentUserId`) or `client_partner_comment` (with its own updated_at and updated_by fields)
- Also updates the row-level `updated_at` and `updated_by`
- On success, transitions to saved view mode and shows a brief toast: *"Comment saved."*
- On error, stays in editing mode and shows an error toast

**Cancel behaviour:**
- Discards any uncommitted changes and returns to the previous state (either empty or previous saved content)

**Last updated attribution:**
- Below the saved comment text (in saved view mode), show a subtle attribution line in `11px` muted text: *"Updated by [First name] on [Day Month Year at HH:MM]"*. This is read from the relevant `cs_lead_updated_by` / `cs_lead_updated_at` fields, resolved to a user's name by joining on `users`.

---

## 9. UI Design Details

### 9.1 Page-level styling

Consistent with the rest of the app:
- Page background: `#F2F2F2`
- Page padding: `p-6` (same as Settings)
- Page heading: `text-base font-medium text-navy` — "Account health"
- The assessment table sits in a white card with `rounded-[8px] border border-border` (same as `SectionCard` in Settings)

### 9.2 Table borders and spacing

- All cell borders: `0.5px solid #DADADA`
- Question row height: auto (determined by content, minimum ~44px for a row with a small dropdown and no comment text)
- Section header row height: 36px, vertically centred text
- Column 1 (question text): `13px`, `text-navy`, `py-3 px-4`
- Column 2 (response): `py-3 px-4`, select element fills available width
- Columns 3 and 4 (comments): `py-3 px-4`

### 9.3 Info icon popover (Risk Matrix)

The `Info` icon (Lucide, size 13, `text-text-muted`) sits to the right of the label in column 1 for each Risk Matrix row.

Clicking the icon opens a small popover positioned above or below the icon (whichever has more space). The popover:
- Has a white background, `rounded-[8px]`, `shadow-lg`, `border border-border`
- Is ~240px wide
- Contains the definition text at `12px`, `text-text-secondary`
- Has a small close button (X icon, size 12) in the top-right corner, or closes on any outside click
- Is implemented as a local `useState` on each row — no global popover manager needed

The same popover pattern applies to the shared "what do Low / Medium / High mean?" info icons. Alternatively, the Low/Medium/High definitions can be rendered as a single compact info box (`bg-[#F2F2F2] rounded-[6px] px-4 py-3 text-[12px] text-text-secondary`) directly beneath the "Risk Matrix" section header row, visible at all times rather than gated behind a click. This is simpler to implement and more immediately useful — **recommended** over per-row popovers for the response level definitions.

### 9.4 "Current" month badge

Matches the existing "current" week badge in the task list Expanded view:

```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
  current
</span>
```

Shown only when the displayed month equals the current calendar month.

### 9.5 Empty state (no client account selected)

Centred in the content area below the header:

```tsx
<div className="flex flex-col items-center justify-center py-20 gap-2">
  <Gauge size={28} className="text-border" />
  <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
</div>
```

### 9.6 Relationship to existing design system

All colours, font sizes, border radii, button styles, and icon usage conventions from SPEC.md Section 9 apply unchanged. No new design tokens are introduced. The response dropdown colour coding (red/green/yellow) maps directly to existing palette values.

---

## 10. Manager View Integration

### 10.1 The problem

Currently, clicking a user card in the Manager landing page navigates directly to their task list. With Account Health, each user may also have account health data. The manager needs to be able to access both — but only for users who have Account Health enabled.

### 10.2 Who sees what

| Situation | What the manager sees |
|---|---|
| User has Account Health **disabled** | Only task list is accessible. No Account Health option is shown anywhere in the manager view for this user. |
| User has Account Health **enabled** | Both task list and Account Health are accessible. The manager view shows a way to navigate to either. |

This means the manager landing page (`ManagerLandingView`) must know whether each managed user has `account_health_enabled = true`. This can be fetched as part of the existing query that populates the user cards (add `account_health_enabled` to the `users` select alongside `first_name`, `last_name`, etc.).

### 10.3 Recommended UX (for future implementation)

The exact UX for switching between a user's task list and their account health data is to be decided. Two viable options:

**Option A — Tabs on the user's task/account view page:**
After clicking a user card, arrive at the task list view as today, but with a tab bar at the top: "Task list" | "Account health". The "Account health" tab is only rendered if that user has `account_health_enabled = true`. Clicking it renders the account health view for that user.

**Option B — Context menu on the user card:**
Each user card in the Manager landing page gets a secondary action (a small dropdown or split button) that lets the manager choose "View task list" or "View account health" before navigating. The "View account health" option is only shown if that user has `account_health_enabled = true`.

Option A is simpler to implement and keeps the navigation structure consistent. **Option A is recommended.**

### 10.4 Manager permissions for Account Health

Following the same philosophy as the manager task view:
- The manager can **view** all responses, comments, and metadata
- The manager can **add and edit** comments in both the CS Lead and Client Partner comment columns (no column-level permission restrictions in v1)
- The manager **cannot** change response dropdown values (these are the owner's assessment)
- The manager **cannot** edit account-level metadata (renewal date, last engagement, engagement type)

> This reflects the intended roles: the CS Lead (account owner) fills in the responses and their own comment column, and the Client Partner (manager) contributes to the Client Partner comment column. In practice the app doesn't enforce which column each person uses in v1, but the column labels make the intent clear.

### 10.5 The "manager without Account Health" scenario

Consider User A (CS Lead, Account Health enabled) and User B (their manager, Account Health disabled — they don't manage accounts themselves).

- User B's **own sidebar** does not show an Account Health item. This is correct.
- User B **can still view** User A's account health data via the manager view. Manager access to Account Health data is entirely independent of whether the manager has Account Health enabled for themselves.
- This means the manager view logic must not gate Account Health access on the *manager's* `account_health_enabled` value — it must gate it on the *managed user's* value.

### 10.6 Data access

The manager's access to a user's `account_health_responses` and `client_accounts` data is gated by the same `manager_relationships` check used throughout the app. See Section 11 for RLS policies.

---

## 11. RLS Policies

Add to the migration:

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

-- Managers can update comment fields only (not response values)
-- This is enforced in application code rather than RLS in v1,
-- consistent with the "no column-level permissions yet" approach.
-- The manager read policy above covers SELECT.
-- For INSERT/UPDATE by managers, enforce via app logic.
```

> Note: If stricter column-level enforcement is desired later, PostgreSQL column-level privileges or application-layer checks can be added. For v1, application logic is sufficient.

---

## 12. Development Phases

### Phase A — Settings: Account Health toggle + Client Accounts section

- Run migration: `alter table users add column account_health_enabled boolean not null default false`
- Add "Account health" `SectionCard` to `SettingsView.tsx` between the Team Management and Export Data cards, with a toggle/checkbox
- Wire toggle to Supabase upsert on `users.account_health_enabled`; call `triggerSidebarRefresh()` on save — this updates the sidebar in real time without a page reload
- Add `client_accounts` table + RLS + migration file
- Add "Client accounts" `SectionCard` to `SettingsView.tsx` — rendered conditionally on `account_health_enabled`
- Implement `ClientAccountsSection` component (mirrors `ProjectsSection` exactly)
- Update `Sidebar.tsx`: fetch `account_health_enabled` from users table; conditionally render Account Health nav item
- Add `Gauge` icon import to sidebar
- Create `app/(app)/account-health/page.tsx` shell (redirect to `/tasks` if `account_health_enabled = false`; empty state otherwise)

### Phase B — Account Health page: header and navigation

- Build `AccountHealthView.tsx`
- Implement client account dropdown (fetches from `client_accounts`)
- Add `account_health_metadata` table + RLS
- Implement account-level fields (renewal date, last engagement, engagement type) with auto-save
- Implement month navigation (state, arrows, Today button, month label, current badge)
- Display empty state when no account selected; empty table shell when account selected

### Phase C — Risk assessment table: response column

- Add `account_health_responses` table + RLS + migration
- Build the full table layout with all 23 question rows and 7 section header rows
- Implement response dropdowns with colour coding
- Wire to Supabase: load existing responses for (account, month), upsert on change
- Implement Info icon popovers for Risk Matrix rows

### Phase D — Risk assessment table: comment columns

- Implement auto-expanding textarea for CS Lead and Client Partner columns
- Implement save / cancel / edit flow with optimistic updates
- Implement "Updated by [name] on [date]" attribution line (requires joining `users` table)
- Wire to Supabase: upsert on save, populating the correct `_updated_at` / `_updated_by` fields

### Phase E — Manager view integration

- Decide on Option A (tabs) vs Option B (card context menu) — Option A recommended
- Add tab bar to manager task view page
- Build read-only variant of `AccountHealthView` for the manager context
- Allow managers to write to CS Lead and Client Partner comment columns
- Block managers from editing response dropdowns and metadata fields

---

## 13. Open Questions & Future Considerations (Option 2 Hierarchy)

### 13.1 What Option 2 would look like

If the full Client Account > Product > Project hierarchy were implemented, the `projects` table would be subordinate to `client_accounts`, and a task's association chain would be: Task → Project → Client Account (with product inferred from the client account). This would eliminate the current need to select a product and a project separately when creating a task, replacing it with a single project picker that inherently knows its client and product.

The hierarchy from your examples:

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

### 13.1a "General" and "N/A" accounts in the hierarchy (Option 2 concern only)

In Option 1, this is not a problem — users simply choose which client accounts to define in their Settings list. If they don't want "General" or "N/A" to appear in Account Health, they don't add those entries to the client accounts list. The two lists (projects vs client accounts) are independent.

In Option 2, "General > EH", "General > NURO", and "N/A > General" are currently used as catch-all entries in the task tracker. If the full hierarchy is adopted, a decision is needed about whether these placeholder entries should appear in the Account Health dropdown at all (they don't represent real client accounts and don't make sense for a risk assessment). The likely resolution would be an `exclude_from_account_health` flag on client account entries, or a separate "type" field (`client` vs `internal`) that governs where they appear. This should be designed as part of any Option 2 migration work.

### 13.2 Impact on the task list (if Option 2 were adopted)

- The product dropdown in "Add Task" would be removed. Product would be inferred from the selected project's parent client account.
- The project dropdown would show a hierarchical or grouped list: client account name as group header, project names within
- Filter chips in the task list could filter by client account OR by product (the product filter would aggregate all projects across all client accounts for that product)
- The `tasks.product` column would either be deprecated (derived at query time) or kept as a denormalised cache for performance
- Existing task data would need a migration: every task currently has a `product` and a `project_id`. The migration would need to set `client_account_id` on each project, then tasks inherit the product from there.

### 13.3 Migration safety

Before attempting Option 2, the following safeguards are needed:

1. A full Supabase backup snapshot before any schema change
2. A data audit confirming every project in the `projects` table maps cleanly to one client account (no ambiguity)
3. A test run of the migration on a staging/dev Supabase instance with production data restored
4. A feature flag to toggle the new hierarchy UI independently of the schema change, so a rollback doesn't lose data

### 13.4 Recommendation

Proceed with Option 1 now. Build Account Health with its own `client_accounts` table. Once Account Health is live and the client account list is established and stable, plan the Option 2 migration as a discrete, separately scoped piece of work — essentially linking the existing `projects` rows to `client_accounts` rows, then updating the task form UI.

---

*Account Health Specification · Access Infinity · Task Tracker · Draft v1.1 · May 2026*

*This document should be versioned alongside SPEC.md. When development begins, update the Phased Development Plan in SPEC.md to reference these Account Health phases.*

**v1.1 changes (May 2026):** Added Account Health opt-in toggle (`users.account_health_enabled`); updated sidebar conditional logic; updated manager view to gate Account Health access on managed user's flag, not manager's; clarified CS Lead / Client Partner roles; noted intentional duplication of NPS question across Engagement and Operational Risk sections; added Section 13.1a on General/N/A accounts as an Option 2 concern only; corrected Risk Matrix popover definitions.

**v1.2 changes (May 2026):** Moved Account Health toggle to correct position in Settings page order (Account details → Projects → Team management → Account health → Export data); clarified that Client Accounts section appears below the toggle card when enabled; clarified that sidebar updates in real time via existing `SidebarContext` counter mechanism — no page reload required.

**v1.3 changes (May 2026):** Added explicit freeze notice on question text — the question set is a shared organisational framework and must be reproduced exactly as written. Simplified duplication note to reflect that the wording is fixed by design.

**v1.4 changes (May 2026):** Clarified response column default/empty state; specified clearing mechanism — selectable blank option in dropdown plus a visible `×` clear button when a value is set; clarified that clearing a response sets `response = null` via upsert and does not delete the row or affect saved comments.
