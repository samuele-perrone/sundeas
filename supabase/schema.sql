-- Wealth Management Schema

-- User profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  target_retirement_age integer,
  role text not null default 'user' check (role in ('user', 'superadmin')),
  approved boolean not null default false,
  created_at timestamptz default now()
);

-- Retirement goal per user
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_retirement_age integer,
  target_monthly_income numeric(12,2),   -- desired monthly income in retirement (£)
  target_lump_sum numeric(12,2),         -- total pot target
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Connected bank institutions (via TrueLayer)
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'truelayer',  -- 'truelayer' | 'manual'
  institution_name text not null,
  truelayer_access_token text,
  truelayer_refresh_token text,
  truelayer_token_expiry timestamptz,
  connected_at timestamptz default now(),
  last_synced_at timestamptz
);

-- Accounts (current, savings, ISA, pension, investment, etc.)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  truelayer_account_id text,                -- external ID from TrueLayer
  institution_name text,                    -- provider name e.g. 'Vanguard', 'Hargreaves Lansdown'
  interest_rate numeric(5,3),               -- % rate (AER for savings, p.a. for investments/mortgages)
  rate_source text default 'ai',            -- 'ai' | 'manual'
  name text not null,
  type text not null,                       -- 'current' | 'savings' | 'isa' | 'pension' | 'investment' | 'mortgage' | 'credit_card' | 'other'
  currency text not null default 'GBP',
  balance numeric(14,2),
  is_manual boolean not null default false,
  include_in_net_worth boolean not null default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (connection_id, truelayer_account_id)
);

-- Balance snapshots (taken weekly/monthly for charting)
create table if not exists public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric(14,2) not null,
  snapshotted_at timestamptz not null default now()
);

-- Transactions (synced from TrueLayer or entered manually)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  truelayer_transaction_id text,
  amount numeric(12,2) not null,           -- negative = debit, positive = credit
  currency text not null default 'GBP',
  description text,
  merchant_name text,
  category text,                            -- AI-classified category
  transaction_type text,                   -- 'bill' | 'subscription' | 'groceries' | 'eating_out' | 'transport' | 'salary' | 'transfer' | 'other'
  is_recurring boolean default false,
  transacted_at timestamptz not null,
  created_at timestamptz default now(),
  unique (account_id, truelayer_transaction_id)
);

-- Recurring income and expense items, linked to an account
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  frequency text not null,               -- 'weekly' | 'monthly' | 'annual'
  type text not null,                    -- 'income' | 'expense'
  category text,                         -- income: salary|dividends|rental|pension|freelance|benefits|other  expense: rent|mortgage|bills|subscriptions|insurance|direct_debit|transport|childcare|other
  to_account_id uuid references public.accounts(id) on delete set null,  -- only for type='transfer'
  payment_day integer,                   -- day of month (1–31) for monthly/annual
  payment_month integer,                 -- month of year (1–12) for annual payments
  created_at timestamptz not null default now()
);

-- TODO action items for the user
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'medium',  -- 'high' | 'medium' | 'low'
  due_date date,
  completed_at timestamptz,
  source text default 'ai',                 -- 'ai' | 'manual'
  created_at timestamptz default now()
);

-- Weekly/monthly digest snapshots (for email + history)
create table if not exists public.digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  net_worth numeric(14,2),
  retirement_progress_pct numeric(5,2),
  insight jsonb,
  sent_at timestamptz default now()
);

-- AI advisor chat history
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                    -- 'user' | 'assistant'
  content text not null,
  conversation_id uuid,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.connections enable row level security;
alter table public.accounts enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.transactions enable row level security;
alter table public.todos enable row level security;
alter table public.digests enable row level security;

create policy "users see own profile" on public.profiles for all using (auth.uid() = id);
create policy "users see own goals" on public.goals for all using (auth.uid() = user_id);
create policy "users see own connections" on public.connections for all using (auth.uid() = user_id);
create policy "users see own accounts" on public.accounts for all using (auth.uid() = user_id);
create policy "users see own snapshots" on public.balance_snapshots for all
  using (account_id in (select id from public.accounts where user_id = auth.uid()));
create policy "users see own transactions" on public.transactions for all
  using (account_id in (select id from public.accounts where user_id = auth.uid()));
create policy "users see own todos" on public.todos for all using (auth.uid() = user_id);
alter table public.recurring_payments enable row level security;
create policy "users manage own recurring payments" on public.recurring_payments
  for all using (auth.uid() = user_id);
create policy "users see own digests" on public.digests for all using (auth.uid() = user_id);

alter table public.chat_messages enable row level security;
create policy "users see own chat messages" on public.chat_messages for all using (auth.uid() = user_id);


-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
