# Task Tracker

A week-oriented task management tool for structured personal productivity and team review.

## What it does

Task Tracker organises work into weekly columns, giving you a clear view of what you're working on, what's been completed, and what's carried forward. Each task is tagged by product area and project, making it easy to filter and review work by team or initiative.

Key features:

- **Weekly task table** — tasks are organised by week, with navigation to move between past and future weeks
- **Product and project tagging** — every task is associated with a product area (AH, NURO, EH) and a project from your personal project list
- **Task states** — tasks can be marked complete, flagged for attention, or moved to a future week
- **Notes and comments** — each task supports a private notes field and a comments thread, intended for async feedback between a team member and their manager
- **Manager view** — users can invite a manager to view their task list in read-only mode; managers can leave comments on individual tasks
- **Settings** — manage your project list, account details, and manager relationships from a dedicated settings page

## How it works

Every user has a single account with two contexts: their own task list (owner) and a manager view (where they can see the task lists of people who have invited them). A user can operate in both contexts simultaneously — for example, managing their own tasks while also reviewing a direct report's list.

## Tech stack

- **Next.js 16** (App Router) — React framework with server components and server actions
- **Supabase** — PostgreSQL database with Row-Level Security, Auth, and PostgREST API
- **TanStack Query v5** — client-side data fetching, caching, and optimistic updates
- **Tailwind CSS v4** — utility-first styling
- **@dnd-kit** — accessible drag-and-drop for task and project reordering

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd task-tracker

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local and fill in the values (see below)

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (from Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe to expose client-side) |
| `NEXT_PUBLIC_AUTH_ENFORCED` | Set to `true` to require login; `false` to disable auth (dev only) |
| `NEXT_PUBLIC_SITE_URL` | Canonical app URL — used for auth email redirect links |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS; only used in scripts, never commit the real value |

All variables are documented in [`.env.example`](.env.example).

### Database setup

Apply the SQL migrations in `supabase/migrations/` to your Supabase project using the SQL Editor or Supabase CLI. Run them in alphabetical order.

### Importing historical tasks

If you have a `tasks_archive.csv` export, you can bulk-import it:

```bash
npm run import
```

The script reads `.env.local` for credentials and expects the CSV to be in the project root. See [`scripts/import-tasks.mjs`](scripts/import-tasks.mjs) for the expected column format.

## Deployment

The app is designed to deploy on [Vercel](https://vercel.com):

1. Push the repo to GitHub and connect it to a Vercel project.
2. Set the environment variables in Vercel → Project → Settings → Environment Variables.
3. Set `NEXT_PUBLIC_SITE_URL` to your production URL (e.g. `https://tasks.example.com`).
4. Set `NEXT_PUBLIC_AUTH_ENFORCED=true` in all non-local environments.
