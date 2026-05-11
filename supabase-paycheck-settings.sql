-- Run this in the Supabase SQL editor for the Money OS project.
-- It stores paycheck schedule settings per user so daily spend and
-- next-payday calculations stay consistent across devices.

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

create or replace function public.set_paycheck_settings_updated_at()
returns trigger
language plpgsql
as '
begin
  new.updated_at = timezone(''utc'', now());
  return new;
end;
';

drop trigger if exists set_paycheck_settings_updated_at on public.paycheck_settings;

create trigger set_paycheck_settings_updated_at
before update on public.paycheck_settings
for each row
execute function public.set_paycheck_settings_updated_at();

alter table public.paycheck_settings enable row level security;

drop policy if exists "paycheck_settings_select_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_insert_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_update_own" on public.paycheck_settings;
drop policy if exists "paycheck_settings_delete_own" on public.paycheck_settings;

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
