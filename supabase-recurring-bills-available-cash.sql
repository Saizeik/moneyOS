alter table public.recurring_bills
add column if not exists counts_toward_available_cash boolean not null default true;

update public.recurring_bills
set counts_toward_available_cash = case
  when lower(name) like '%loan%'
    or lower(name) like '%credit%'
    or lower(name) like '%debt%'
    or lower(name) like '%pay later%'
    or lower(category) like '%loan%'
    or lower(category) like '%credit%'
    or lower(category) like '%debt%'
    or lower(category) like '%pay later%'
  then false
  else true
end
where counts_toward_available_cash is distinct from case
  when lower(name) like '%loan%'
    or lower(name) like '%credit%'
    or lower(name) like '%debt%'
    or lower(name) like '%pay later%'
    or lower(category) like '%loan%'
    or lower(category) like '%credit%'
    or lower(category) like '%debt%'
    or lower(category) like '%pay later%'
  then false
  else true
end;
