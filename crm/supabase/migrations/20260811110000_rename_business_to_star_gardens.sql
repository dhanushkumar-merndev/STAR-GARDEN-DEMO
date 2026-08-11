-- Keep existing deployments in sync with the Star Gardens brand rename.
insert into public.app_settings (key, value, description)
values (
  'business_name',
  '"Star Gardens"'::jsonb,
  'Company name shown in emails and on the customer portal.'
)
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();
