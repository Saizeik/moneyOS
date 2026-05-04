-- Run this in the Supabase SQL editor for the Money OS project.
-- It enables row-level security and allows each authenticated user
-- to read and write only their own records.

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.budget_categories enable row level security;
alter table public.debts enable row level security;
alter table public.recurring_bills enable row level security;
alter table public.savings enable row level security;
alter table public.net_worth_snapshots enable row level security;

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
