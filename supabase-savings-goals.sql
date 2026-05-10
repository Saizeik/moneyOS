alter table public.savings
add column if not exists name text;

update public.savings
set name = 'Emergency Fund'
where coalesce(trim(name), '') = '';

alter table public.savings
add column if not exists linked_category_id uuid references public.budget_categories (id) on delete set null;
