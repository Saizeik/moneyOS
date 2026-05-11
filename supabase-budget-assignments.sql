-- Run this in the Supabase SQL editor for the Money OS project.
-- It creates monthly budget assignments so "Ready to assign" and
-- "Safe to spend" can stay in sync across devices.

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

create or replace function public.set_budget_assignments_updated_at()
returns trigger
language plpgsql
as '
begin
  new.updated_at = timezone(''utc'', now());
  return new;
end;
';

drop trigger if exists set_budget_assignments_updated_at on public.budget_assignments;

create trigger set_budget_assignments_updated_at
before update on public.budget_assignments
for each row
execute function public.set_budget_assignments_updated_at();

alter table public.budget_assignments enable row level security;

drop policy if exists "budget_assignments_select_own" on public.budget_assignments;
drop policy if exists "budget_assignments_insert_own" on public.budget_assignments;
drop policy if exists "budget_assignments_update_own" on public.budget_assignments;
drop policy if exists "budget_assignments_delete_own" on public.budget_assignments;

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
