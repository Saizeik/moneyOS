-- Money OS production catch-up
-- Run this in Supabase SQL Editor to bring an older project up to the
-- current app schema without dropping existing data.
--
-- If your `budget_assignments` table already exists with the wrong columns,
-- run `supabase-budget-assignments-repair.sql` separately after this file.

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.budget_categories enable row level security;
alter table public.debts enable row level security;
alter table public.recurring_bills enable row level security;
alter table public.savings enable row level security;
alter table public.net_worth_snapshots enable row level security;

alter table public.transactions
add column if not exists merchant text,
add column if not exists memo text,
add column if not exists account_id uuid references public.accounts (id) on delete set null,
add column if not exists transaction_date date,
add column if not exists transaction_type text not null default 'expense';

update public.transactions
set transaction_type = 'expense'
where transaction_type is null;

alter table public.budget_categories
add column if not exists target_day integer;

alter table public.budget_categories
drop constraint if exists budget_categories_target_day_check;

alter table public.budget_categories
add constraint budget_categories_target_day_check
check (target_day is null or (target_day >= 1 and target_day <= 31));

alter table public.budget_categories
add column if not exists split_across_paychecks boolean not null default false;

alter table public.recurring_bills
add column if not exists counts_toward_available_cash boolean not null default true;

update public.recurring_bills
set counts_toward_available_cash = case
  when lower(name) like '%loan%'
    or lower(name) like '%credit%'
    or lower(name) like '%debt%'
    or lower(name) like '%pay later%'
    or lower(category) like '%loan%'
    or lower(category) like '%credit%'
    or lower(category) like '%debt%'
    or lower(category) like '%pay later%'
  then false
  else true
end
where counts_toward_available_cash is distinct from case
  when lower(name) like '%loan%'
    or lower(name) like '%credit%'
    or lower(name) like '%debt%'
    or lower(name) like '%pay later%'
    or lower(category) like '%loan%'
    or lower(category) like '%credit%'
    or lower(category) like '%debt%'
    or lower(category) like '%pay later%'
  then false
  else true
end;

alter table public.recurring_bills
add column if not exists split_across_paychecks boolean not null default false;

alter table public.savings
add column if not exists name text;

update public.savings
set name = 'Emergency Fund'
where coalesce(trim(name), '') = '';

alter table public.savings
add column if not exists linked_category_id uuid references public.budget_categories (id) on delete set null;

create table if not exists public.paycheck_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schedule_type text not null check (
    schedule_type in ('weekly', 'biweekly', 'twice_monthly', 'monthly')
  ),
  anchor_date date,
  monthly_day integer,
  first_twice_monthly_day integer,
  second_twice_monthly_day integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.paycheck_settings enable row level security;

create table if not exists public.monthly_budget_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null,
  monthly_income numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_key)
);

alter table public.monthly_budget_state enable row level security;

create table if not exists public.paycheck_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  received_date date not null,
  amount numeric,
  expected_date date,
  source_transaction_id uuid references public.transactions (id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_transaction_id)
);

alter table public.paycheck_history enable row level security;

create table if not exists public.budget_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null,
  item_key text not null,
  assigned numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_key, item_key)
);

alter table public.budget_assignments enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

drop policy if exists "budget_categories_select_own" on public.budget_categories;
drop policy if exists "budget_categories_insert_own" on public.budget_categories;
drop policy if exists "budget_categories_update_own" on public.budget_categories;
drop policy if exists "budget_categories_delete_own" on public.budget_categories;

drop policy if exists "debts_select_own" on public.debts;
drop policy if exists "debts_insert_own" on public.debts;
drop policy if exists "debts_update_own" on public.debts;
drop policy if exists "debts_delete_own" on public.debts;

drop policy if exists "recurring_bills_select_own" on public.recurring_bills;
drop policy if exists "recurring_bills_insert_own" on public.recurring_bills;
drop policy if exists "recurring_bills_update_own" on public.recurring_bills;
drop policy if exists "recurring_bills_delete_own" on public.recurring_bills;

drop policy if exists "savings_select_own" on public.savings;
drop policy if exists "savings_insert_own" on public.savings;
drop policy if exists "savings_update_own" on public.savings;
drop policy if exists "savings_delete_own" on public.savings;

drop policy if exists "net_worth_snapshots_select_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_insert_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_update_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_delete_own" on public.net_worth_snapshots;

drop policy if exists "paycheck_history_select_own" on public.paycheck_history;
drop policy if exists "paycheck_history_insert_own" on public.paycheck_history;
drop policy if exists "paycheck_history_update_own" on public.paycheck_history;
drop policy if exists "paycheck_history_delete_own" on public.paycheck_history;

drop policy if exists "paycheck_settings_select_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_insert_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_update_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_delete_own" on public.paycheck_settings;

drop policy if exists "monthly_budget_state_select_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_insert_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_update_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_delete_own" on public.monthly_budget_state;

drop policy if exists "budget_assignments_select_own" on public.budget_assignments;
drop policy if exists "budget_assignments_insert_own" on public.budget_assignments;
drop policy if exists "budget_assignments_update_own" on public.budget_assignments;
drop policy if exists "budget_assignments_delete_own" on public.budget_assignments;

create policy "accounts_select_own"
on public.accounts
for select
to authenticated
using (auth.uid() = user_id);

create policy "accounts_insert_own"
on public.accounts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "accounts_update_own"
on public.accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "accounts_delete_own"
on public.accounts
for delete
to authenticated
using (auth.uid() = user_id);

create policy "transactions_select_own"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

create policy "transactions_insert_own"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "transactions_update_own"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "transactions_delete_own"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

create policy "budget_categories_select_own"
on public.budget_categories
for select
to authenticated
using (auth.uid() = user_id);

create policy "budget_categories_insert_own"
on public.budget_categories
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "budget_categories_update_own"
on public.budget_categories
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "budget_categories_delete_own"
on public.budget_categories
for delete
to authenticated
using (auth.uid() = user_id);

create policy "debts_select_own"
on public.debts
for select
to authenticated
using (auth.uid() = user_id);

create policy "debts_insert_own"
on public.debts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "debts_update_own"
on public.debts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "debts_delete_own"
on public.debts
for delete
to authenticated
using (auth.uid() = user_id);

create policy "recurring_bills_select_own"
on public.recurring_bills
for select
to authenticated
using (auth.uid() = user_id);

create policy "recurring_bills_insert_own"
on public.recurring_bills
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "recurring_bills_update_own"
on public.recurring_bills
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "recurring_bills_delete_own"
on public.recurring_bills
for delete
to authenticated
using (auth.uid() = user_id);

create policy "savings_select_own"
on public.savings
for select
to authenticated
using (auth.uid() = user_id);

create policy "savings_insert_own"
on public.savings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "savings_update_own"
on public.savings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "savings_delete_own"
on public.savings
for delete
to authenticated
using (auth.uid() = user_id);

create policy "net_worth_snapshots_select_own"
on public.net_worth_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create policy "net_worth_snapshots_insert_own"
on public.net_worth_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "net_worth_snapshots_update_own"
on public.net_worth_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "net_worth_snapshots_delete_own"
on public.net_worth_snapshots
for delete
to authenticated
using (auth.uid() = user_id);

create policy "paycheck_history_select_own"
on public.paycheck_history
for select
to authenticated
using (auth.uid() = user_id);

create policy "paycheck_history_insert_own"
on public.paycheck_history
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "paycheck_history_update_own"
on public.paycheck_history
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "paycheck_history_delete_own"
on public.paycheck_history
for delete
to authenticated
using (auth.uid() = user_id);

create policy "paycheck_settings_select_own"
on public.paycheck_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy "paycheck_settings_insert_own"
on public.paycheck_settings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "paycheck_settings_update_own"
on public.paycheck_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "paycheck_settings_delete_own"
on public.paycheck_settings
for delete
to authenticated
using (auth.uid() = user_id);

create policy "monthly_budget_state_select_own"
on public.monthly_budget_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "monthly_budget_state_insert_own"
on public.monthly_budget_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "monthly_budget_state_update_own"
on public.monthly_budget_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "monthly_budget_state_delete_own"
on public.monthly_budget_state
for delete
to authenticated
using (auth.uid() = user_id);

create policy "budget_assignments_select_own"
on public.budget_assignments
for select
to authenticated
using (auth.uid() = user_id);

create policy "budget_assignments_insert_own"
on public.budget_assignments
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "budget_assignments_update_own"
on public.budget_assignments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "budget_assignments_delete_own"
on public.budget_assignments
for delete
to authenticated
using (auth.uid() = user_id);
