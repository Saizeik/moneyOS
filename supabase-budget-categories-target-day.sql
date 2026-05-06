alter table public.budget_categories
add column if not exists target_day integer;

alter table public.budget_categories
drop constraint if exists budget_categories_target_day_check;

alter table public.budget_categories
add constraint budget_categories_target_day_check
check (target_day is null or (target_day >= 1 and target_day <= 31));
