# Money OS

Money OS is a personal budgeting app focused on:

- zero-based monthly planning
- assign-every-dollar budgeting
- safe-to-spend guidance
- debt payoff tracking
- recurring bills and spending categories

## Local Development

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase values
3. Install dependencies and start the app

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Supabase Setup

Run these SQL files in Supabase SQL Editor:

1. `supabase-rls-policies.sql`
2. `supabase-budget-assignments.sql`

If `budget_assignments` already exists with the wrong columns, run:

3. `supabase-budget-assignments-repair.sql`

## Deploy

Recommended stack:

1. Push this repo to GitHub
2. Import the repo into Vercel
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables for Development, Preview, and Production
4. Deploy `main` to production
5. Use feature branches for preview deployments

## Notes

- Monthly income is stored locally in the browser right now.
- Monthly budget assignments are intended to sync through Supabase.
- If inserts or updates fail, check your Supabase RLS policies first.
