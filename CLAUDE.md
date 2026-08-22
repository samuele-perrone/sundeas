# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
npm test         # Vitest unit tests
npx vitest run   # Run tests (alternative)
npx vitest run lib/__tests__/finance.test.ts   # Run a single test file
```

Migrations applied manually via Supabase dashboard SQL editor (schema in `supabase/schema.sql`).

## Testing

Tests live in `__tests__/` directories co-located with the code they test:
- Pure logic → `lib/__tests__/`
- React components → co-located `__tests__/` next to the component
- API route handlers → co-located `__tests__/` next to the route

Use Vitest + React Testing Library. Mock Supabase via `vi.mock('@/lib/supabase/client')` and `vi.mock('@/lib/supabase/server')`. Mock `next/navigation` as needed.

## Architecture

**Stack:** Next.js 16 App Router · Supabase (Postgres + Auth + RLS) · Tailwind CSS v4 · Anthropic Claude · TrueLayer (Open Banking) · Trading 212 API · Resend · Vercel

Personal wealth management and retirement planning platform. Users connect UK bank accounts, track net worth over time, plan retirement goals, and receive AI-powered email digests.

**Critical:** Not a financial adviser. All AI output must be framed as educational/informational only.

### Access control

- Supabase Auth with Google/Apple OAuth. Callback at `/api/auth/callback`. Profile row auto-created via DB trigger.
- `app/(app)/layout.tsx` guards all app routes: requires `profiles.approved = true`, otherwise redirects to `/unauthorised`.
- `profiles.role = 'superadmin'` unlocks the admin page (`/admin`) and triggers extra nav items in `AppNav` and `MobileNav`.

### Supabase clients

- `lib/supabase/server.ts` — cookie-based, Server Components and Route Handlers
- `lib/supabase/client.ts` — browser client, Client Components
- `lib/supabase/admin.ts` — service-role, **cron routes only**

### Styling

Tailwind CSS v4 — `@import "tailwindcss"` and `@theme` in `globals.css`. No `tailwind.config.*`. Responsive breakpoints: `md:` for desktop sidebar layout. Email templates must use `<table>` layouts — email clients don't support flexbox.

### Mobile layout

`app/(app)/layout.tsx` renders:
- **Desktop** (`md:`): fixed left sidebar (64 = `w-64`) with logo, `AppNav`, `RetirementWidget`, sign-out
- **Mobile**: fixed top bar (`h-14`, `md:hidden`) + `MobileNav` bottom tab bar (`fixed bottom-0`, `md:hidden`)
- Main content has `pt-14 md:pt-0 pb-20 md:pb-0` to clear both fixed bars on mobile

### Account types

`type` column on `accounts`: `current` | `savings` | `isa` | `pension` | `investment` | `mortgage` | `credit_card` | `other`

Both TrueLayer-connected (`is_manual = false`) and manually entered (`is_manual = true`) accounts are first-class citizens.

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

---

## Feature implementation notes

### Dashboard chart (`dashboard/page.tsx` + `NetWorthChart.tsx`)

The chart uses Recharts `ComposedChart` with two layers:
- **Historical** (`netWorth` Area + `h_{type}` Lines): one data point per calendar **date** (`YYYY-MM-DD`). Multiple snapshots on the same day → latest wins. Different days → separate points.
- **Projected** (`projected` Area + `p_{type}` Lines, dashed): future simulation from the last snapshot forward.

Grouping key: `snap.snapshotted_at.slice(0, 10)` (not `.slice(0, 7)` — per-day, not per-month).

`projStartDate` is constructed by parsing the last snapshot's `YYYY-MM-DD` key as local time: `new Date(y, m-1, d)`. Do NOT use `new Date(lastSnapshotTs + '-01')` (that was the old month-based code).

`monthsBehind` = months between last snapshot and today. When > 0, the projection loop draws a solid extension up to today before switching to dotted future lines.

### Snapshot system

Two separate snapshot mechanisms with intentionally different behaviour:

| | `POST /api/snapshots/take` | `GET /api/cron/snapshot` |
|---|---|---|
| Trigger | Manual button / historical dialog | Automated monthly cron |
| Behaviour | **Pure insert** — snapshots accumulate | Delete-then-insert (one per month) |
| Why | Preserve historical clicks | Replace monthly automated baseline |

`SnapshotButton` supports two modes: "Snapshot now" (current balances, current time) and "Add historical date" (custom date + per-account balance inputs).

### Budget / recurring payments (`recurring_payments` table)

`type`: `'income'` | `'expense'` | `'transfer'`
`frequency`: `'weekly'` | `'monthly'` | `'annual'`
`payment_month` (1–12): for annual payments, the calendar month they land. Used in projection to apply as a lump sum in the correct month rather than smoothed monthly.

`toMonthlyAmount(amount, frequency)` in `lib/finance.ts` normalises to monthly. Annual payments with `payment_month` set are excluded from monthly smoothing and applied as lump sums in the projection loop.

Transfers have `to_account_id`; they reduce the source account and increase the destination in projections.

### Trading 212 integration (`lib/trading212.ts`)

`institution_id` column on `connections` encodes both mode and account type:
- `'demo'` → demo ISA
- `'isa'` → live ISA
- `'invest'` → live Invest (type=`investment`)
- anything else → live ISA (legacy)

`syncT212()` derives `base` and `accountType` from `institution_id`. `detectMode()` tries live then demo. The T212 API does **not** expose the account type — the user selects ISA vs Invest at connect time via the dropdown in `Trading212Section.tsx`.

### TrueLayer OAuth flow

1. User clicks "Connect bank" → redirect to TrueLayer auth URL
2. TrueLayer redirects to `/api/auth/truelayer/callback?code=...`
3. Exchange code for access + refresh tokens, store encrypted in `connections` table
4. Fetch accounts + balances + transactions via TrueLayer Data API

### AI advisor (`app/api/chat/route.ts`)

The system prompt is **rebuilt on every message** by `buildSystemPrompt()` which re-fetches live account data, balance snapshots, recurring payments, and goal from Supabase. This means the advisor always has current figures regardless of when the conversation started.

Messages are persisted separately via `POST /api/chat/messages` (client calls this after receiving the AI response). The chat API itself is a streaming route — it does not save messages.

`GET /api/chat/messages` — load a conversation (by `conversation_id`) or the most recent one.
`GET /api/chat/conversations` — list all conversations with previews.

### Digest email (`lib/digest.ts`)

Triggered by `GET /api/cron/investment-digest?userId=<id>` (Bearer `CRON_SECRET`) or `POST /api/admin/send-digest` (superadmin session).

**Important cron route bug fix**: The Supabase query builder returns a new object from `.eq()`; the original query is not mutated. Use `let query = ...; if (targetUserId) query = query.eq(...)` not `if (targetUserId) query.eq(...)`.

Email structure (all `<table>`-based — flexbox not supported in Gmail/Apple Mail):
1. Net worth + Retire-at progress side-by-side
2. Monthly cash flow bar (IN/NET/OUT)
3. Net worth breakdown by account type
4. AI summary + 4 recommendations

AI prompt strategy: recent advisor chat messages (last 7 days, up to 50) go at the **top** of the prompt with a `CRITICAL INSTRUCTION` requiring the first 1–2 recommendations to address topics discussed. This ensures digest recommendations update when the advisor is used. Uses `claude-sonnet-4-6` (not Haiku) for better instruction-following.

### Database schema (key tables)

- `profiles` — extends auth.users (`display_name`, `date_of_birth`, `target_retirement_age`, `role`, `approved`)
- `goals` — retirement target (`target_retirement_age`, `target_monthly_income`, `target_lump_sum`)
- `connections` — bank/T212 connections (`provider`, `api_key`, `institution_id`, `last_synced_at`)
- `accounts` — individual accounts (`balance`, `type`, `is_manual`, `include_in_net_worth`, `interest_rate`, `rate_source`)
- `balance_snapshots` — (`account_id`, `balance`, `snapshotted_at`) — accumulates over time for manual snapshots
- `recurring_payments` — budget items (`type`, `frequency`, `category`, `payment_day`, `payment_month`, `to_account_id`)
- `transactions` — bank transactions with AI categories
- `todos` — action items (`priority`, `source: 'ai'|'manual'`, `completed_at`)
- `chat_messages` — (`role`, `content`, `conversation_id`, `user_id`)
- `digests` — email digest history

Full schema: `supabase/schema.sql`
