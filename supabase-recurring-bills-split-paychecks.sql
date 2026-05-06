alter table public.recurring_bills
add column if not exists split_across_paychecks boolean not null default false;
