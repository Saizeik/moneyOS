alter table public.transactions
add column if not exists merchant text,
add column if not exists memo text,
add column if not exists account_id uuid references public.accounts (id) on delete set null,
add column if not exists transaction_date date,
add column if not exists transaction_type text not null default 'expense';

update public.transactions
set transaction_type = 'expense'
where transaction_type is null;
