# Account Health — Implementation Guide

**Access Infinity · Task Tracker · v1.0 · May 2026**

> This document is written for an agentic coding tool (e.g. Claude Code). It is self-contained per phase. Implement one phase at a time, verify it completely before moving to the next. Each phase is independently shippable.

---

## Before You Start

### Read these files first

Before touching any code, read the following files in full to understand the existing codebase:

| File | Why |
|---|---|
| `SPEC.md` | Full spec for the existing app — architecture, DB schema, design system, component patterns |
| `account_health.md` | Full feature spec for Account Health — schema, UI/UX, design decisions |
| `lib/supabase/types.ts` | All existing TypeScript types |
| `components/settings/SettingsView.tsx` | Pattern for Settings section cards, project list management — Phase A mirrors this |
| `components/layout/Sidebar.tsx` | Current sidebar logic — Phase A modifies this |
| `lib/sidebar-context.tsx` | How `triggerSidebarRefresh` / `useSidebarCounter` work |

### Existing file structure (relevant paths)

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

### General conventions — follow throughout

- **Styling:** Tailwind CSS only. No inline styles except for dynamically computed values.
- **Colors:** Use the tokens from SPEC.md Section 9.1. Never hardcode a colour not in that palette.
- **Icons:** Lucide React only (`lucide-react` package). Never add custom SVGs.
- **Font sizes:** `text-[13px]` for body, `text-[12px]` for labels/captions, `text-[11px]` for minor metadata.
- **Border radius:** `rounded-[8px]` for cards, `rounded-[6px]` for inputs/buttons, `rounded` (4px) for badges.
- **Question text:** The risk assessment question text is a fixed organisational framework. Reproduce it exactly as written in Appendix A of this document. Do not rephrase, reorder, or remove any question.
- **Section headers in the UI:** Title case (first letter of each word capitalised). No all-caps anywhere.
- **TypeScript:** Strict throughout. No `any` except where unavoidable in Supabase response mapping (follow existing patterns in the codebase).

---

## Phase A — Toggle, Client Accounts, Sidebar

### Goal

Add the `account_health_enabled` toggle to Settings, the Client Accounts list to Settings, and the conditional Account Health nav item to the sidebar. Create an empty shell page at `/account-health`.

### SQL to run first

Run this in the Supabase SQL editor before writing any code:

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

Save this as `supabase/migrations/account_health_phase_a.sql`.

### Files to create

- `app/(app)/account-health/page.tsx` — shell page (see below)
- `components/account-health/AccountHealthView.tsx` — shell component (see below)

### Files to modify

- `lib/supabase/types.ts` — add new types
- `components/settings/SettingsView.tsx` — add Account Health toggle + Client Accounts section
- `components/layout/Sidebar.tsx` — fetch `account_health_enabled`, add conditional nav item

---

### `lib/supabase/types.ts` — additions

Add the following to the existing types file. Do not remove or change any existing types.

```ts
// Add to the existing type exports:

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

---

### `components/layout/Sidebar.tsx` — changes

1. Add `Gauge` to the lucide-react import.

2. Add a `accountHealthEnabled` state variable:
```ts
const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)
```

3. In the existing `fetchRelationshipData` async function, add a third parallel fetch for `account_health_enabled`:
```ts
const [relResult, countResult, userResult] = await Promise.all([
  // ... existing two fetches unchanged ...
  supabase
    .from('users')
    .select('account_health_enabled')
    .eq('id', userId)
    .single(),
])
// After setting the existing state:
setAccountHealthEnabled(userResult.data?.account_health_enabled ?? false)
```

4. Update `mainNavItems` to conditionally include Account Health between My tasks and Manager view:
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

No other changes to `Sidebar.tsx`.

---

### `components/settings/SettingsView.tsx` — changes

The Settings page section order must be: **Account details → Projects → Team management → Account health → Export data.**

**Step 1: Add a `AccountHealthSection` component** (add it in the file above the main `SettingsView` export, following the same pattern as `ProjectsSection`):

The Account Health section card contains:
- A single toggle (checkbox or switch) labelled "Enable account health"
- Description text beneath it: *"Turn this on if you manage client accounts and want to use the monthly risk assessment features. This adds an Account health page to your sidebar."*
- When toggled, immediately upsert `account_health_enabled` to Supabase, then call `triggerSidebarRefresh()` so the sidebar nav item appears/disappears without a page reload.
- The toggled state is loaded from `users` on mount (same pattern as `AccountSection` loads `default_landing`).

```ts
function AccountHealthSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
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
    setEnabled(next) // optimistic
    const { error } = await supabase.from('users')
      .update({ account_health_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) {
      setEnabled(!next) // revert
      onToast('Failed to update account health setting.', 'error')
    } else {
      triggerSidebarRefresh()
    }
  }

  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="mt-0.5 accent-navy"
        />
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

**Step 2: Add a `ClientAccountsSection` component.**

This is a direct equivalent of `ProjectsSection` but for the `client_accounts` table. Follow `ProjectsSection` as the template. Key differences:
- Table is `client_accounts` instead of `projects`
- The delete guard checks `account_health_responses` and `account_health_metadata` for existing data. If any rows exist for this account, show a blocking dialog: *"[Account name] cannot be deleted because it has assessment data."* If no data exists, use the standard "Are you sure?" confirmation.
- All other behaviour (drag-to-reorder, edit inline, visibility toggle, duplicate validation, product selector) is identical to `ProjectsSection`.

**Step 3: Update the main `SettingsView` export** to use the new sections in the correct order:

```tsx
export default function SettingsView() {
  // ... existing toast state ...
  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Settings</h1>
      <SectionCard title="Account details">
        <AccountSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Projects">
        <ProjectsSection onToast={addToast} />
      </SectionCard>
      <SectionCard title="Team management">
        <TeamManagementSection onToast={addToast} />
      </SectionCard>
      <AccountHealthSettingsBlock onToast={addToast} />  {/* see below */}
      <SectionCard title="Export data">
        <ExportSection onToast={addToast} />
      </SectionCard>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
```

Create a thin wrapper component `AccountHealthSettingsBlock` that:
1. Loads `account_health_enabled` for the current user
2. Always renders the Account Health `SectionCard` (with the toggle)
3. When `account_health_enabled` is true, renders the Client Accounts `SectionCard` directly below it

```tsx
function AccountHealthSettingsBlock({ onToast }: { onToast: ... }) {
  const { userId } = useAuth()
  const [accountHealthEnabled, setAccountHealthEnabled] = useState(false)

  // Subscribe to changes so the Client Accounts section appears/disappears
  // immediately when the toggle is changed within AccountHealthSection.
  // Pass a shared state setter down to AccountHealthSection.

  return (
    <>
      <SectionCard title="Account health">
        <AccountHealthSection
          onToast={onToast}
          onEnabledChange={setAccountHealthEnabled}
        />
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

Update `AccountHealthSection` to accept and call `onEnabledChange` after a successful toggle, so `AccountHealthSettingsBlock` stays in sync.

---

### `app/(app)/account-health/page.tsx` — create

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

---

### `components/account-health/AccountHealthView.tsx` — create (shell)

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

This will be expanded in Phase B.

---

### Phase A — Verify

- [ ] SQL migration runs without error in Supabase SQL editor
- [ ] `client_accounts` table exists in Supabase with correct columns
- [ ] `users.account_health_enabled` column exists, defaulting to `false`
- [ ] Settings page renders in the correct order: Account details → Projects → Team management → Account health → Export data
- [ ] Toggling "Enable account health" on: sidebar immediately shows the Account health nav item (no page reload)
- [ ] Toggling "Enable account health" off: sidebar immediately hides the Account health nav item
- [ ] When enabled, the Client accounts section card appears below the Account health card in Settings
- [ ] Client accounts section: can add, edit, reorder (drag), and toggle visibility of accounts — same UX as Projects
- [ ] Navigating to `/account-health` when toggle is off redirects to `/tasks`
- [ ] Navigating to `/account-health` when toggle is on shows the shell page

---

## Phase B — Account Health Page: Header and Month Navigation

### Goal

Build the top section of the Account Health page: client account selector, account-level metadata fields (renewal date, last engagement, type of engagement), and month navigation with a current-month badge.

### SQL to run first

```sql
-- account_health_metadata table
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

-- RLS
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

### Files to create

None.

### Files to modify

- `lib/supabase/types.ts` — add `AccountHealthMetadata` type
- `components/account-health/AccountHealthView.tsx` — replace shell with full header

---

### `lib/supabase/types.ts` — additions

```ts
export type AccountHealthMetadata = {
  id: string
  client_account_id: string
  admin_user_id: string
  renewal_date: string | null        // ISO date string e.g. "2026-06-01"
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

---

### `components/account-health/AccountHealthView.tsx` — replace with full implementation

Replace the Phase A shell. The component must implement:

**1. Client account selector**

Fetches `client_accounts` for the current user (visible accounts only, ordered by `sort_order`):
```ts
supabase.from('client_accounts')
  .select('*')
  .eq('admin_user_id', userId)
  .eq('is_visible', true)
  .is('deleted_at', null)
  .order('sort_order')
```

Renders a `<select>` styled to match the rest of the app. Placeholder: `Select a client account…`. When no account is selected, show the empty state (Gauge icon + "Select a client account above to begin."). When an account is selected, show the metadata fields and the month navigation.

**2. Account-level metadata fields**

On account selection, fetch the metadata row for that account:
```ts
supabase.from('account_health_metadata')
  .select('*')
  .eq('client_account_id', selectedAccountId)
  .maybeSingle()
```

Display three fields inline to the right of the account selector (or on a second row if viewport is narrow). These fields are **not** month-specific.

| Field | Input type | Options / format |
|---|---|---|
| Renewal date | `<input type="date">` | ISO date |
| Last engagement date | `<input type="date">` | ISO date |
| Type of engagement | `<select>` | Monthly review, QBR, Training, Project call, Spontaneous mail / call, Other |

Auto-save on `onBlur` (date fields) or `onChange` (select field). Use an upsert keyed on `client_account_id`:
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

No explicit save button. No toast needed for these fields (the save is silent).

**3. Month navigation**

State: `currentMonth` — a `Date` object representing the first day of the displayed month. Initialise to the first day of the current calendar month:
```ts
const [currentMonth, setCurrentMonth] = useState(() => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
})
```

Helper to format the month label — three-letter abbreviation + dash + full year:
```ts
function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' }) + ' - ' + d.getFullYear()
}
// Example output: "Apr - 2026"
```

Helper to check if a date is the current month:
```ts
function isCurrentMonth(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}
```

Navigation controls layout:
```
◀   [Today]   ▶   Apr - 2026   [current]
```

- Left arrow: `ChevronLeft` size 16, click → subtract one month from `currentMonth`
- Today button: same teal styling as the Today button in the task list toolbar. Click → reset `currentMonth` to the first day of the current calendar month
- Right arrow: `ChevronRight` size 16, click → add one month to `currentMonth`
- Month label: `text-[14px] font-medium text-navy`
- "Current" badge: only shown when `isCurrentMonth(currentMonth)` is true

```tsx
// Current badge
<span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
  current
</span>
```

**Layout for the full header area:**

```tsx
<div className="p-6 flex flex-col gap-5">
  <h1 className="text-base font-medium text-navy">Account health</h1>

  {/* Account selector row */}
  <div className="flex flex-wrap items-center gap-3">
    <select ...>{/* client account options */}</select>
    {selectedAccount && (
      <>
        <input type="date" ... /> {/* renewal date */}
        <input type="date" ... /> {/* last engagement date */}
        <select ...>{/* engagement type */}</select>
      </>
    )}
  </div>

  {/* Month navigation — only shown when an account is selected */}
  {selectedAccount && (
    <div className="flex items-center gap-2">
      <button onClick={prevMonth}><ChevronLeft size={16} /></button>
      <button onClick={goToToday} className="...">Today</button>
      <button onClick={nextMonth}><ChevronRight size={16} /></button>
      <span className="text-[14px] font-medium text-navy ml-2">
        {formatMonthLabel(currentMonth)}
      </span>
      {isCurrentMonth(currentMonth) && (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal text-navy">
          current
        </span>
      )}
    </div>
  )}

  {/* Empty state or table placeholder */}
  {!selectedAccount ? (
    <div className="flex flex-col items-center justify-center py-20 gap-2">
      <Gauge size={28} className="text-border" />
      <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
    </div>
  ) : (
    <div className="text-[13px] text-text-muted">Risk assessment table coming in Phase C.</div>
  )}
</div>
```

---

### Phase B — Verify

- [ ] SQL migration runs without error
- [ ] `account_health_metadata` table exists with correct columns and unique constraint
- [ ] Visiting `/account-health`: page loads, account selector shows client accounts in settings order
- [ ] Selecting an account: renewal date, last engagement date, and type of engagement fields appear
- [ ] Changing any metadata field: upsert fires (check Supabase table editor), no error toast
- [ ] Reloading the page and reselecting the same account: metadata fields are pre-populated with saved values
- [ ] Month navigation: left/right arrows change the month label correctly
- [ ] Today button: returns to the current month
- [ ] "Current" badge: appears only on the current calendar month, not on past or future months

---

## Phase C — Risk Assessment Table: Response Column

### Goal

Render the full risk assessment table with all 23 questions grouped into 7 sections. Wire the response dropdowns to Supabase with immediate save on change and colour-coded selection states.

### SQL to run first

```sql
-- account_health_responses table
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

-- RLS
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

### Files to create

- `components/account-health/RiskAssessmentTable.tsx` — the full table component

### Files to modify

- `lib/supabase/types.ts` — add `AccountHealthResponse` type
- `components/account-health/AccountHealthView.tsx` — replace placeholder with `<RiskAssessmentTable />`

---

### `lib/supabase/types.ts` — additions

```ts
export type ResponseValue = 'yes' | 'no' | 'low' | 'medium' | 'high'

export type AccountHealthResponse = {
  id: string
  client_account_id: string
  admin_user_id: string
  month: string              // ISO date, first day of month: "2026-04-01"
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

---

### `components/account-health/RiskAssessmentTable.tsx` — create

**Props:**
```ts
interface RiskAssessmentTableProps {
  clientAccountId: string
  adminUserId: string
  month: Date           // first day of the displayed month
  readOnly?: boolean    // true in manager view
}
```

**Data fetching:**

On mount and whenever `clientAccountId` or `month` changes, fetch all responses for this (account, month) pair:
```ts
const monthStr = month.toISOString().slice(0, 10) // "2026-04-01"
supabase.from('account_health_responses')
  .select('*')
  .eq('client_account_id', clientAccountId)
  .eq('month', monthStr)
```

Store results in a `Map<string, AccountHealthResponse>` keyed by `question_id` for O(1) lookup when rendering each row.

**Default / empty state:**

When no response row exists for a (client account, month, question) combination, the dropdown renders in its default empty state: white background, `#DADADA` border, placeholder text "Select…". This is the starting state for every question on every new month. Never pre-fill a response.

**Saving a response:**

When the user selects a value in the dropdown, immediately upsert:
```ts
supabase.from('account_health_responses').upsert({
  client_account_id: clientAccountId,
  admin_user_id: adminUserId,
  month: monthStr,
  question_id: questionId,
  response: newValue,   // 'yes' | 'no' | 'low' | 'medium' | 'high'
  updated_at: new Date().toISOString(),
  updated_by: adminUserId,
}, { onConflict: 'client_account_id,month,question_id' })
```

Use optimistic updates: update the local map immediately, then revert on error.

**Clearing a response — two mechanisms:**

A user may accidentally select a value, or may want to leave a question blank while a discussion is still pending. Implement both of the following:

**Mechanism 1 — Selectable blank option:** The first option in every `<select>` is `<option value="">Select…</option>`. This option must **not** be `disabled`. When the user opens the dropdown and re-selects this blank option, treat `value=""` as a clear signal and call the clear handler (see below).

**Mechanism 2 — `×` clear button:** Render a small `×` button (Lucide `X`, size 12) immediately to the right of the `<select>` element. This button is only visible when the current response value is non-null. When clicked, it calls the same clear handler.

```tsx
// Render pattern for each response cell (column 2):
<div className="flex items-center gap-1.5 px-4 py-3">
  <select
    value={currentResponse ?? ''}
    onChange={(e) => {
      const val = e.target.value
      if (val === '') {
        handleClear(question.id)
      } else {
        handleResponseChange(question.id, val as ResponseValue)
      }
    }}
    disabled={readOnly}
    style={getResponseStyle(currentResponse)}
    className="flex-1 px-2 py-1.5 rounded-[6px] border border-border text-[13px] outline-none focus:border-navy disabled:cursor-not-allowed"
  >
    <option value="">Select…</option>
    {question.type === 'yes_no' ? (
      <>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </>
    ) : (
      <>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </>
    )}
  </select>
  {currentResponse && !readOnly && (
    <button
      onClick={() => handleClear(question.id)}
      className="flex-shrink-0 p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
      title="Clear response"
    >
      <X size={12} />
    </button>
  )}
</div>
```

**Clear handler:**

```ts
const handleClear = async (questionId: string) => {
  // Optimistic update
  setResponsesMap((prev) => {
    const next = new Map(prev)
    const existing = next.get(questionId)
    if (existing) {
      next.set(questionId, { ...existing, response: null })
    }
    // If no row exists yet, nothing to update — the field is already null
    return next
  })

  // Only upsert if a row already exists (no point creating a null row from scratch
  // unless we need to preserve the updated_at audit trail — which we don't for a clear)
  const existing = responsesMap.get(questionId)
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
    // Revert optimistic update
    setResponsesMap((prev) => {
      const next = new Map(prev)
      if (existing) next.set(questionId, existing)
      return next
    })
  }
}
```

> **Important:** Clearing a response sets `response = null` in the database. It does **not** delete the row, and it does **not** affect `cs_lead_comment`, `client_partner_comment`, or any other fields. A user may have already written comments for a question they haven't yet answered — those comments must be preserved.

**Question set (canonical — do not modify):**

Define this as a constant array outside the component:

```ts
type QuestionType = 'yes_no' | 'risk_level'

interface Question {
  id: string
  text: string
  type: QuestionType
}

interface Section {
  id: string
  label: string
  questions: Question[]
  infoBox?: string   // optional: text shown in a shared info box below the section header
}

const RISK_ASSESSMENT_SECTIONS: Section[] = [
  {
    id: 'engagement',
    label: 'Engagement',
    questions: [
      { id: 'engagement_usage_declining',     text: 'Is platform usage declining or inactive for 4+ weeks?',                                  type: 'yes_no' },
      { id: 'engagement_milestone_weakening', text: 'Are milestone or KPI tracking habits weakening?',                                        type: 'yes_no' },
      { id: 'engagement_qbr_missed',          text: 'Are QBRs consistently missed or poorly attended?',                                       type: 'yes_no' },
      { id: 'engagement_feedback_passive',    text: 'Is client feedback passive or negative? Are NPS scores low?',                            type: 'yes_no' },
    ],
  },
  {
    id: 'stakeholder',
    label: 'Stakeholder Risk',
    questions: [
      { id: 'stakeholder_key_left',             text: 'Have key admins, sponsors, or power users left or changed roles?',                      type: 'yes_no' },
      { id: 'stakeholder_ownership_unclear',    text: 'Is there unclear ownership or missing champions?',                                      type: 'yes_no' },
      { id: 'stakeholder_csm_changed',          text: 'Have CSMs been regularly changed?',                                                    type: 'yes_no' },
      { id: 'stakeholder_ai_sponsor_missing',   text: 'Are they missing an internal AI sponsor?',                                             type: 'yes_no' },
      { id: 'stakeholder_relationship_unstable',text: 'Is there an unstable relationship with sales, CS, product owner, or sponsor?',         type: 'yes_no' },
    ],
  },
  {
    id: 'strategic',
    label: 'Strategic Fit',
    questions: [
      { id: 'strategic_nonessential', text: 'Is the product seen as non-essential or misaligned with client priorities?', type: 'yes_no' },
    ],
  },
  {
    id: 'operational',
    label: 'Operational Risk',
    questions: [
      { id: 'operational_rollout_delayed',   text: 'Has roll-out been delayed due to inattentive or unresponsive admins?',  type: 'yes_no' },
      { id: 'operational_feedback_passive',  text: 'Is client feedback passive or negative? Are NPS scores low?',           type: 'yes_no' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial Risk',
    questions: [
      { id: 'commercial_renewal_delayed', text: 'Are renewal conversations delayed or stalled?', type: 'yes_no' },
    ],
  },
  {
    id: 'matrix',
    label: 'Risk Matrix',
    infoBox: 'Low — Minor concern or passive signals; log and track regular health reviews. Medium — Noticeable early signals; requires client re-engagement and active monitoring. High — High likelihood of churn or downgrade; urgent action and internal escalation.',
    questions: [
      { id: 'matrix_engagement',    text: 'Engagement risk',    type: 'risk_level' },
      { id: 'matrix_stakeholder',   text: 'Stakeholder risk',   type: 'risk_level' },
      { id: 'matrix_strategic_fit', text: 'Strategic fit',      type: 'risk_level' },
      { id: 'matrix_operational',   text: 'Operational risk',   type: 'risk_level' },
      { id: 'matrix_commercial',    text: 'Commercial risk',    type: 'risk_level' },
    ],
  },
  {
    id: 'risk_factor',
    label: 'Risk Factor',
    questions: [
      { id: 'risk_flagged_high',           text: 'Is the client flagged as high risk in the CS risk review?',                                          type: 'yes_no' },
      { id: 'risk_admin_left',             text: 'Has the primary admin, sponsor, or power user left and not been replaced?',                          type: 'yes_no' },
      { id: 'risk_usage_dropped',          text: 'Has product usage dropped significantly (30% or more decline) over a 4-week period?',               type: 'yes_no' },
      { id: 'risk_renewal_low_engagement', text: 'Is renewal within 3 months with low engagement?',                                                    type: 'yes_no' },
      { id: 'risk_confirmed_misalignment', text: 'Is there a confirmed commercial, strategic, or stakeholder misalignment?',                           type: 'yes_no' },
    ],
  },
]
```

**Info icon popovers (Risk Matrix only):**

Each Risk Matrix question row has a small `Info` icon (Lucide `Info`, size 13, `text-text-muted`) to the right of the label text in column 1. Clicking it opens a small popover positioned near the icon. The popover content per question:

| question_id | Popover text |
|---|---|
| `matrix_engagement` | Low or inconsistent platform usage, poor adoption, missed QBRs |
| `matrix_stakeholder` | Loss or absence of champions, sponsors, or decision-makers (e.g., re-organisations, maternity leave, medical leave, change of role, leaves organisation, etc.) |
| `matrix_strategic_fit` | Product is no longer aligned to client priorities or seen as non-essential (e.g., brand enters a new stage of its life-cycle) |
| `matrix_operational` | Onboarding delays, unresponsive admins, weak implementation of tracking tools |
| `matrix_commercial` | Silence or delays in renewal conversations, budget changes, pricing objections |

The popover is a small white card (`rounded-[8px] shadow-lg border border-border p-3 w-60 text-[12px] text-text-secondary`), positioned absolutely, opened by a local `useState` per row, closed on outside click.

**Table layout:**

Use a CSS grid or `<table>`. Four columns. Column 3 and 4 are placeholders in Phase C (just empty cells with light background — they will be filled in Phase D).

| Column | Width | Content in Phase C |
|---|---|---|
| Risk category | `w-[280px] shrink-0` | Section header rows + question text |
| Response | `w-[160px] shrink-0` | Response dropdown |
| CS lead comments | `flex-1 min-w-[200px]` | Empty placeholder |
| Client partner comments | `flex-1 min-w-[200px]` | Empty placeholder |

**Section header rows:** full-width row, `bg-[#F2F2F2]`, `border-t border-border`, section label in `text-[13px] font-medium text-navy px-4 py-2.5`.

**For the Risk Matrix section**, render the `infoBox` text as a compact info panel directly below the section header row, before the question rows: `bg-[#F2F2F2] rounded-[6px] mx-4 my-2 px-3 py-2 text-[12px] text-text-secondary`.

**Response dropdown styling (column 2):**

The `<select>` fills the column width. Background and text colour change based on selected value:

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

Apply via inline style on the `<select>` element (inline style is acceptable here since it's dynamic).

Yes/no dropdown options: `Select…` (empty, value=""), `Yes` (value="yes"), `No` (value="no").
Low/medium/high dropdown options: `Select…` (empty, value=""), `Low` (value="low"), `Medium` (value="medium"), `High` (value="high").

The dropdown is disabled when `readOnly` prop is true.

**Wrap the table in the existing white card pattern:**
```tsx
<div className="bg-white rounded-[8px] border border-border overflow-hidden">
  {/* table content */}
</div>
```

The table container has `overflow-x-auto` so it scrolls horizontally on narrower screens, consistent with the task table.

---

### `components/account-health/AccountHealthView.tsx` — update

Replace the Phase B placeholder comment with:
```tsx
<RiskAssessmentTable
  clientAccountId={selectedAccount.id}
  adminUserId={userId!}
  month={currentMonth}
/>
```

Pass `readOnly={false}` (default). The `readOnly` prop will be set to `true` in Phase E for the manager view.

---

### Phase C — Verify

- [ ] SQL migration runs without error
- [ ] `account_health_responses` table exists with correct columns, constraint, and indexes
- [ ] All 7 section headers render in the correct order with title-case labels
- [ ] All 23 question rows render under their correct sections (count them)
- [ ] The question text exactly matches Appendix A — no rewording
- [ ] New month with no data: all dropdowns show "Select…" in white/default state — no values pre-filled
- [ ] Changing a yes/no response: dropdown background turns red (Yes) or green (No); `×` clear button appears
- [ ] Changing a risk level response: Low → green, Medium → yellow, High → red; `×` clear button appears
- [ ] Upsert fires on change (check Supabase table viewer — row appears with correct `question_id`, `month`, and `response`)
- [ ] Clearing via `×` button: dropdown returns to default empty state, button disappears, `response` is null in DB
- [ ] Clearing via blank "Select…" option in dropdown: same result as `×` button
- [ ] After clearing: any existing comments for that question are preserved in the database
- [ ] Navigating to a different month and back: responses for the original month are still correct
- [ ] Risk Matrix section: info box appears below the section header
- [ ] Risk Matrix rows: Info icon appears next to each label; clicking it shows the correct popover text
- [ ] Info popover closes when clicking outside it

---

## Phase D — Comment Columns

### Goal

Implement the CS Lead Comments and Client Partner Comments columns in the risk assessment table. Each question row gets two independent free-text fields with auto-expanding textarea, save/cancel/edit flow, and last-updated attribution.

### SQL to run first

None. The comment columns already exist in `account_health_responses` from Phase C.

### Files to create

- `components/account-health/CommentCell.tsx` — reusable comment cell component

### Files to modify

- `components/account-health/RiskAssessmentTable.tsx` — wire up comment cells in columns 3 and 4

---

### `components/account-health/CommentCell.tsx` — create

This is a self-contained component used twice per question row (once for each comment column).

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

1. **Empty, view mode** (`initialValue` is null or empty string): render a `<div>` with placeholder text `Add a comment…` in `text-[12px] text-text-muted italic`. On hover (when not `readOnly`), apply a subtle background tint `hover:bg-[#F7F7F7] cursor-text`. Clicking enters editing mode.

2. **Editing mode**: replace the div with a `<textarea>`. Auto-expand height on every keystroke:
```ts
// In the onChange handler or via useEffect:
const el = textareaRef.current
if (el) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
```
Set `rows={2}` as minimum. Below the textarea, render two buttons: `Save` (navy primary, `text-[12px]`) and `Cancel` (secondary, `text-[12px]`). These appear only in editing mode.

3. **Saved, view mode** (`initialValue` has content): render the text as a `<p className="text-[13px] text-navy whitespace-pre-wrap">`. Below the text, render the attribution line: `Updated by [name] on [date]` in `text-[11px] text-text-muted`. On hover (when not `readOnly`), show a pencil icon (`Pencil`, size 12) in the top-right corner of the cell; clicking it enters editing mode.

**Resolving the user name for attribution:**

The `updatedByUserId` is a UUID. To show a name, fetch from `users`:
```ts
supabase.from('users').select('first_name, last_name').eq('id', updatedByUserId).single()
```

Cache this result in a local `useState` within the cell. Only fetch once per `updatedByUserId` value. Format: `[first_name] [last_name]` (or just the first name if last name is null).

Format the date: `new Date(updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })` + ` at ` + `toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })`.

**Save behaviour:**

On clicking Save, call `onSave(trimmedValue)`. While saving, disable both buttons and show `Saving…`. On success, transition to saved view mode. On error, stay in editing mode and show an error toast (if a toast mechanism is passed in, or use a local inline error message).

**Cancel behaviour:**

Discard uncommitted text. If previous state was empty, return to empty view mode. If previous state had content, return to saved view mode with the original content.

**`readOnly` mode:**

When `readOnly` is true: text is displayed (or empty state shows), but clicking does not enter edit mode, no pencil icon on hover, no Save/Cancel buttons.

---

### `components/account-health/RiskAssessmentTable.tsx` — update

1. Import `CommentCell`.

2. For each question row, replace the Phase C placeholder cells with two `<CommentCell>` instances:

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
    // Refresh local data after save
  }}
  readOnly={readOnly}
/>

// Client Partner Comments column — same pattern, different fields:
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

> **Important on `updated_by` in the upsert:** In the comment saves above, `adminUserId` is used as the `updated_by` field because the component is being used in the owner's own view. In Phase E (manager view), the `adminUserId` prop refers to the account owner, not the person currently logged in. Pass the logged-in user's ID separately as `currentUserId` prop in Phase E, and use `currentUserId` for the `_updated_by` fields while keeping `adminUserId` for `admin_user_id`.

3. After a successful upsert in `onSave`, refresh the local responses map by re-fetching (or updating the map in place optimistically).

---

### Phase D — Verify

- [ ] Empty comment cell: placeholder text "Add a comment…" visible; clicking it enters edit mode
- [ ] Typing in the textarea: height expands automatically as text grows beyond 2 lines
- [ ] Save button: saves to Supabase (check table viewer — `cs_lead_comment` or `client_partner_comment` populated with correct `_updated_at` and `_updated_by`)
- [ ] Cancel button: discards changes and returns to previous state
- [ ] Saved cell in view mode: text shows; pencil icon appears on hover; clicking pencil enters edit mode
- [ ] Attribution line shows correct name and formatted date after save
- [ ] Navigating to a different month and back: comments are still there for the original month
- [ ] CS Lead and Client Partner columns are fully independent — saving one does not affect the other

---

## Phase E — Manager View: Tab Navigation

### Goal

Allow managers to navigate to a user's Account Health page from the manager view. Add a tab bar above the task view page. The Account Health tab is only visible if the managed user has `account_health_enabled = true`.

### SQL to run first

None.

### Files to create

- `app/(app)/manager/[adminUserId]/account-health/page.tsx` — new manager account health route
- `components/manager/ManagerViewTabs.tsx` — tab bar component

### Files to modify

- `components/manager/ManagerLandingView.tsx` — fetch `account_health_enabled` for each managed user
- `app/(app)/manager/[adminUserId]/page.tsx` — pass `accountHealthEnabled` to tab bar
- `components/manager/ManagerTaskView.tsx` — accept and render tab bar

---

### `components/manager/ManagerLandingView.tsx` — changes

In the `loadPeople` function, update the users query to also fetch `account_health_enabled`:

```ts
// Change:
const { data: users } = await supabase
  .from('users')
  .select('id, first_name, last_name, email, role')
  .in('id', adminUserIds)

// To:
const { data: users } = await supabase
  .from('users')
  .select('id, first_name, last_name, email, role, account_health_enabled')
  .in('id', adminUserIds)
```

Add `accountHealthEnabled: boolean` to the `PersonCard` interface. Populate it from the user data when building cards. Pass it through to wherever the card click navigates — no UI change needed on the card itself. The tab bar in the destination page handles the conditional display.

---

### `components/manager/ManagerViewTabs.tsx` — create

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
      <TabLink
        href={`/manager/${adminUserId}`}
        label="Task list"
        active={!isAccountHealth}
      />
      <TabLink
        href={`/manager/${adminUserId}/account-health`}
        label="Account health"
        active={isAccountHealth}
      />
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-teal text-navy'
          : 'border-transparent text-text-muted hover:text-navy'
      }`}
    >
      {label}
    </Link>
  )
}
```

---

### `app/(app)/manager/[adminUserId]/page.tsx` — changes

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

---

### `components/manager/ManagerTaskView.tsx` — changes

Accept `accountHealthEnabled` prop and render the tab bar above the task table:

```tsx
import ManagerViewTabs from './ManagerViewTabs'
import TaskTableView from '@/components/tasks/TaskTableView'

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

---

### `app/(app)/manager/[adminUserId]/account-health/page.tsx` — create

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

  // Verify accepted manager relationship
  const { data: rel } = await supabase
    .from('manager_relationships')
    .select('id')
    .eq('admin_user_id', adminUserId)
    .eq('manager_user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!rel) redirect('/manager')

  // Check that the managed user has account health enabled
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

**Update `AccountHealthView` to accept these new props:**

```ts
interface AccountHealthViewProps {
  viewAsUserId?: string    // if set, view this user's data instead of the logged-in user's
  readOnly?: boolean       // if true, disable response dropdowns and comment editing
  managerUserId?: string   // the logged-in manager's userId, used as updated_by for comments
}
```

When `viewAsUserId` is provided:
- Fetch client accounts for `viewAsUserId` (not the logged-in user)
- Fetch metadata and responses for `viewAsUserId`
- Pass `readOnly` to `RiskAssessmentTable`
- For comment saves, use `managerUserId` as the `_updated_by` value (managers can still write comments)
- Response dropdowns are disabled (`readOnly` prop on the select element)
- Metadata fields (renewal date, last engagement, type) are read-only

When `viewAsUserId` is not provided (default, owner's own view):
- Behaviour unchanged from Phases B–D

---

### Phase E — Verify

- [ ] Manager landing page: managed user cards load without error
- [ ] Clicking a card for a user with Account Health **disabled**: navigates to task list, no tab bar shown
- [ ] Clicking a card for a user with Account Health **enabled**: navigates to task list, tab bar shows "Task list" and "Account health"
- [ ] Clicking "Account health" tab: navigates to `/manager/[adminUserId]/account-health`
- [ ] Manager account health page: shows the managed user's client accounts, not the manager's
- [ ] Response dropdowns in manager view: visible but disabled (cannot be changed)
- [ ] Account-level metadata fields in manager view: visible but read-only
- [ ] Comment cells in manager view: manager can add and edit comments; attribution shows manager's name
- [ ] Navigating directly to `/manager/[adminUserId]/account-health` for a user with Account Health disabled: redirects to `/manager/[adminUserId]`

---

## Appendix A — Canonical Question Text

**Do not modify this text. Reproduce exactly in the UI.**

### Engagement
1. Is platform usage declining or inactive for 4+ weeks?
2. Are milestone or KPI tracking habits weakening?
3. Are QBRs consistently missed or poorly attended?
4. Is client feedback passive or negative? Are NPS scores low?

### Stakeholder Risk
5. Have key admins, sponsors, or power users left or changed roles?
6. Is there unclear ownership or missing champions?
7. Have CSMs been regularly changed?
8. Are they missing an internal AI sponsor?
9. Is there an unstable relationship with sales, CS, product owner, or sponsor?

### Strategic Fit
10. Is the product seen as non-essential or misaligned with client priorities?

### Operational Risk
11. Has roll-out been delayed due to inattentive or unresponsive admins?
12. Is client feedback passive or negative? Are NPS scores low?

### Commercial Risk
13. Are renewal conversations delayed or stalled?

### Risk Matrix
14. Engagement risk
15. Stakeholder risk
16. Strategic fit
17. Operational risk
18. Commercial risk

### Risk Factor
19. Is the client flagged as high risk in the CS risk review?
20. Has the primary admin, sponsor, or power user left and not been replaced?
21. Has product usage dropped significantly (30% or more decline) over a 4-week period?
22. Is renewal within 3 months with low engagement?
23. Is there a confirmed commercial, strategic, or stakeholder misalignment?

---

## Appendix B — Full Migration SQL (all phases, in order)

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
CREATE POLICY "ah_metadata: owner full"    ON public.account_health_metadata FOR ALL USING (auth.uid() = admin_user_id);
CREATE POLICY "ah_metadata: manager read"  ON public.account_health_metadata FOR SELECT USING (EXISTS (SELECT 1 FROM public.manager_relationships mr WHERE mr.admin_user_id = account_health_metadata.admin_user_id AND mr.manager_user_id = auth.uid() AND mr.status = 'accepted'));

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
CREATE POLICY "ah_responses: owner full"    ON public.account_health_responses FOR ALL USING (auth.uid() = admin_user_id);
CREATE POLICY "ah_responses: manager read"  ON public.account_health_responses FOR SELECT USING (EXISTS (SELECT 1 FROM public.manager_relationships mr WHERE mr.admin_user_id = account_health_responses.admin_user_id AND mr.manager_user_id = auth.uid() AND mr.status = 'accepted'));
```

---

*Account Health Implementation Guide · Access Infinity · Task Tracker · v1.0 · May 2026*
