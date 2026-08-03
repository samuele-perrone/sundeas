@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

No test suite. Migrations applied manually via Supabase dashboard SQL editor (schema in `supabase/schema.sql`).

## Architecture

**Stack:** Next.js 16 App Router · Supabase (Postgres + Auth + RLS) · Tailwind CSS v4 · Anthropic Claude · TrueLayer (Open Banking) · Resend · Vercel

### What this app does

Personal wealth management and retirement planning platform. It:
1. **Tracks** — connects UK bank accounts via TrueLayer Open Banking; also supports manual account entry for any account (pension, premium bonds, accounts not covered by TrueLayer)
2. **Plans** — tracks progress against a "retire at 57" goal with net worth snapshots
3. **Analyses** — AI categorises transactions (bills, subscriptions, salary, etc.) and flags spending issues
4. **Stocks** — connects to Trading 212 (read-only API) to include investment portfolio in net worth
5. **Alerts** — weekly/monthly digest email with progress, issues, and a TODO action list

**Critical:** Not a financial adviser. All AI output must be framed as educational/informational only.

### Account types

`type` column on `accounts`: `current` | `savings` | `isa` | `pension` | `investment` | `mortgage` | `credit_card` | `other`

Both TrueLayer-connected (`is_manual = false`) and manually entered (`is_manual = true`) accounts are first-class citizens.

### Supabase clients

- `lib/supabase/server.ts` — cookie-based, Server Components and Route Handlers
- `lib/supabase/client.ts` — browser client, Client Components
- `lib/supabase/admin.ts` — service-role, cron routes only

### Auth

Supabase Auth with Google/Apple OAuth. Callback at `/api/auth/callback`. Profile row auto-created via DB trigger.

### TrueLayer OAuth flow

1. User clicks "Connect bank" → redirect to TrueLayer auth URL with `client_id`, `scope`, `redirect_uri`
2. TrueLayer redirects to `/api/auth/truelayer/callback?code=...`
3. Exchange code for access + refresh tokens, store encrypted in `connections` table
4. Fetch accounts + balances + transactions via TrueLayer Data API

### Styling

Tailwind CSS v4 — `@import "tailwindcss"` and `@theme` in `globals.css`. No `tailwind.config.*`.

### Key env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TRUELAYER_CLIENT_ID
TRUELAYER_CLIENT_SECRET
TRUELAYER_REDIRECT_URI
ANTHROPIC_API_KEY
RESEND_API_KEY
RESEND_FROM
NEXT_PUBLIC_APP_URL
CRON_SECRET
```

### Database schema (key tables)

- `profiles` — extends auth.users (display_name, date_of_birth, target_retirement_age)
- `goals` — retirement target (age, monthly income target, lump sum target)
- `connections` — bank connections (TrueLayer tokens or manual)
- `accounts` — individual accounts (balance, type, is_manual)
- `balance_snapshots` — weekly balance history per account
- `transactions` — bank transactions with AI categories
- `todos` — action items (AI-generated or manual)
- `digests` — weekly email digest history

Full schema: `supabase/schema.sql`
