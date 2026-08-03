-- Wealth Management Schema

-- User profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  target_retirement_age integer default 57,
  created_at timestamptz default now()
);

-- Retirement goal per user
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_retirement_age integer not null default 57,
  target_monthly_income numeric(12,2),   -- desired monthly income in retirement (£)
  target_lump_sum numeric(12,2),         -- total pot target
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Connected bank institutions (via TrueLayer)
create table public.connections (
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
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  truelayer_account_id text,                -- external ID from TrueLayer
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
create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric(14,2) not null,
  snapshotted_at timestamptz not null default now()
);

-- Transactions (synced from TrueLayer or entered manually)
create table public.transactions (
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

-- TODO action items for the user
create table public.todos (
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
create table public.digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  net_worth numeric(14,2),
  retirement_progress_pct numeric(5,2),
  insight jsonb,
  sent_at timestamptz default now()
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
create policy "users see own digests" on public.digests for all using (auth.uid() = user_id);

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
