-- Money HQ schema (docs/SPEC.md section 5).
-- Rules: every table has id, user_id, created_at, updated_at. Amounts are whole pence (bigint). Dates are calendar dates.
-- Never edit this file once it has been run: add a new numbered migration instead.

create extension if not exists pgcrypto with schema extensions;

-- Keeps updated_at current on every change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- accounts and structure

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('current', 'savings', 'credit_card', 'isa', 'investment', 'pension', 'cash')),
  institution text,
  import_format text not null default 'manual' check (import_format in ('revolut', 'ulster', 'capital_one', 'manual')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text,
  colour text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  bucket_id uuid references public.buckets (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  patterns text[] not null default '{}',
  default_category_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------- cycles and budgets

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  predicted_next_payday date,
  salary_transaction_id uuid, -- linked once transactions exist (see the foreign key below)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (user_id, start_date)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  bucket_id uuid not null references public.buckets (id) on delete cascade,
  amount_pence bigint not null check (amount_pence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, bucket_id)
);

-- Headline totals for cycles from before the detailed data starts (the old dashboard's months).
create table public.cycle_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  label text,
  income_pence bigint not null default 0,
  spent_pence bigint not null default 0,
  saved_pence bigint not null default 0,
  invested_pence bigint not null default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, start_date)
);

-- ---------------------------------------------------------------- transactions

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  account_id uuid references public.accounts (id) on delete set null,
  imported_at timestamptz not null default now(),
  row_count int not null default 0,
  new_count int not null default 0,
  duplicate_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete restrict,
  date date not null,
  cycle_date date, -- set when a transaction is counted in a different cycle from its bank date
  amount_pence bigint not null, -- negative = money out
  raw_description text not null default '',
  merchant_id uuid references public.merchants (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  note text,
  tag text,
  status text not null default 'needs_review' check (status in ('needs_review', 'reviewed')),
  kind text not null check (kind in ('spend', 'income', 'transfer', 'saved', 'invested', 'repayment', 'refund')),
  transfer_pair_id uuid references public.transactions (id) on delete set null,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  fingerprint text not null,
  archived boolean not null default false, -- older history: stored, but never counted in live views
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index transactions_user_date on public.transactions (user_id, date);
create index transactions_user_live on public.transactions (user_id, archived, date);

alter table public.cycles
  add constraint cycles_salary_transaction_fk
  foreign key (salary_transaction_id) references public.transactions (id) on delete set null;

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  amount_pence bigint not null check (amount_pence > 0),
  settled_by_transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- match: { "merchant_id", "description_contains", "amount_min_pence", "amount_max_pence", "account_id" }
  match jsonb not null,
  -- set: { "category_id", "kind", "merchant_id" }
  "set" jsonb not null,
  priority int not null default 100,
  created_from text not null default 'manual' check (created_from in ('manual', 'learned', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- bills, funds, balances and goals

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  merchant_id uuid references public.merchants (id) on delete set null,
  amount_pence bigint not null check (amount_pence >= 0),
  cadence text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_date date,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sinking_funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_pence bigint not null default 0 check (target_pence >= 0),
  due_date date,
  monthly_pence bigint not null default 0 check (monthly_pence >= 0),
  account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  balance_pence bigint not null, -- a credit card balance owed is negative
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, date)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_pence bigint not null check (target_pence > 0),
  target_date date,
  account_id uuid references public.accounts (id) on delete set null,
  sinking_fund_id uuid references public.sinking_funds (id) on delete set null,
  monthly_pence bigint not null default 0 check (monthly_pence >= 0), -- for the what-if sliders
  growth_rate numeric(5, 2) not null default 0, -- expected yearly growth in %, an assumption Abilin chooses
  priority int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per user.
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade unique,
  reserve_pence bigint not null default 0 check (reserve_pence >= 0),
  payday_usual_day int not null default 24 check (payday_usual_day between 1 and 31),
  paydays date[] not null default '{}', -- known paydays; later ones are predicted
  typeface text not null default 'Archivo',
  theme text not null default 'midnight',
  extra jsonb not null default '{}', -- small settings that don't need their own column
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger on every table
do $$
declare t text;
begin
  foreach t in array array['accounts', 'buckets', 'categories', 'merchants', 'people', 'cycles', 'budgets', 'cycle_summaries',
    'import_batches', 'transactions', 'splits', 'rules', 'recurring', 'sinking_funds', 'balance_snapshots', 'goals', 'settings']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
