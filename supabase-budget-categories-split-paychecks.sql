alter table public.budget_categories
add column if not exists split_across_paychecks boolean not null default false;
