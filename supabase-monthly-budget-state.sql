create table if not exists public.monthly_budget_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null,
  monthly_income numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month_key)
);

create or replace function public.set_monthly_budget_state_updated_at()
returns trigger
language plpgsql
as '
begin
  new.updated_at = timezone(''utc'', now());
  return new;
end;
';

drop trigger if exists set_monthly_budget_state_updated_at on public.monthly_budget_state;

create trigger set_monthly_budget_state_updated_at
before update on public.monthly_budget_state
for each row
execute function public.set_monthly_budget_state_updated_at();

alter table public.monthly_budget_state enable row level security;

drop policy if exists "monthly_budget_state_select_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_insert_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_update_own" on public.monthly_budget_state;
drop policy if exists "monthly_budget_state_delete_own" on public.monthly_budget_state;

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
