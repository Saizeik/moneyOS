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

create or replace function public.set_paycheck_history_updated_at()
returns trigger
language plpgsql
as '
begin
  new.updated_at = timezone(''utc'', now());
  return new;
end;
';

drop trigger if exists set_paycheck_history_updated_at on public.paycheck_history;

create trigger set_paycheck_history_updated_at
before update on public.paycheck_history
for each row
execute function public.set_paycheck_history_updated_at();

alter table public.paycheck_history enable row level security;

drop policy if exists "paycheck_history_select_own" on public.paycheck_history;
drop policy if exists "paycheck_history_insert_own" on public.paycheck_history;
drop policy if exists "paycheck_history_update_own" on public.paycheck_history;
drop policy if exists "paycheck_history_delete_own" on public.paycheck_history;

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
