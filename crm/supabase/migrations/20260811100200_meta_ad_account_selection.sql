-- ===========================================================================
-- Star Gardens CRM — 17. Meta ad-account and campaign selection, lead normalization
--
-- Until now the ad account was a deploy-time environment variable, and every
-- campaign under it was synced. Two problems with that: the owner cannot see
-- which accounts the token can actually reach, and an agency token that reaches
-- five accounts would pull four accounts' worth of noise into the CRM.
--
-- So: sync the reachable accounts, let an Admin PICK one, and let them narrow
-- to specific campaigns. The environment variable stays as the fallback, which
-- means nothing breaks on a deployment that never opens the new screen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (a) Ad accounts the configured token can reach
-- ---------------------------------------------------------------------------
create table public.meta_ad_accounts (
  id                        uuid primary key default gen_random_uuid(),

  -- Meta's own identifier, always in `act_<digits>` form.
  meta_ad_account_id        text not null unique
    check (meta_ad_account_id ~ '^act_[0-9]+$'),

  name                      text not null,
  currency                  text,
  timezone_name             text,
  business_name             text,

  -- 1 = ACTIVE in Meta's vocabulary. Stored as Meta reports it rather than
  -- translated, so a new status code cannot silently read as "fine".
  account_status            integer,

  is_present_in_latest_sync boolean not null default true,
  last_synced_at            timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index meta_ad_accounts_present_idx
  on public.meta_ad_accounts (is_present_in_latest_sync, name);

create trigger set_updated_at before update on public.meta_ad_accounts
  for each row execute function app.set_updated_at();

comment on table public.meta_ad_accounts is
  'Ad accounts visible to META_ADS_ACCESS_TOKEN. A failed sync marks rows '
  'absent rather than deleting them, so a transient Graph outage never wipes '
  'the Admin''s selection.';

-- ---------------------------------------------------------------------------
-- (b) Campaigns remember which account they came from, and whether the Admin
--     wants them.
--
-- `is_selected` defaults true so an owner who never touches the new screen sees
-- exactly the behaviour they have today.
-- ---------------------------------------------------------------------------
alter table public.meta_campaigns
  add column meta_ad_account_id text,
  add column is_selected boolean not null default true;

create index meta_campaigns_account_idx
  on public.meta_campaigns (meta_ad_account_id)
  where meta_ad_account_id is not null;

create index meta_campaigns_selected_idx
  on public.meta_campaigns (is_selected) where is_selected;

comment on column public.meta_campaigns.is_selected is
  'Admin''s choice of which campaigns matter. Unselected campaigns keep syncing '
  'their metadata but are hidden from the Ads screen and skipped by insights.';

-- ---------------------------------------------------------------------------
-- (c) Forms record whether a human has signed off their mapping
-- ---------------------------------------------------------------------------
alter table public.meta_lead_forms
  add column mapping_reviewed_at timestamptz,
  add column mapping_reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.meta_lead_forms.mapping_reviewed_at is
  'Set when an Admin saves a mapping for this form. Null means "auto-suggested, '
  'never confirmed" — the state the setup screen exists to clear.';

-- ---------------------------------------------------------------------------
-- (d) Settings: selection, and the one-time lead normalization rules
--
-- Normalization runs on EVERY inbound lead — Meta, website and manual alike —
-- so a name typed as "  RAVI   KUMAR " and a phone typed as "+91 98765 43210"
-- land the same way regardless of which door they came through. Configured
-- once, applied everywhere; that is the whole point of putting it here rather
-- than in three intake paths.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('meta_selected_ad_account_id',
   '""'::jsonb,
   'The act_<id> an Admin picked. Blank falls back to META_AD_ACCOUNT_ID.'),

  ('meta_campaign_selection_mode',
   '"ALL"'::jsonb,
   'ALL syncs every campaign on the account; SELECTED honours meta_campaigns.is_selected.'),

  ('meta_auto_map_new_forms',
   'true'::jsonb,
   'Apply the suggested field mapping to a newly discovered form. The Admin '
   'still has to confirm it before leads are accepted.'),

  ('lead_normalization',
   jsonb_build_object(
     'trimWhitespace',    true,
     'collapseSpaces',    true,
     'titleCaseNames',    true,
     'lowercaseEmail',    true,
     'stripPhoneFormatting', true,
     'dropPlaceholderEmails', true
   ),
   'One-time setup: how raw inbound values are cleaned before they become a '
   'lead. Applies to Meta, website and manual intake alike.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- (e) RLS — same shape as every other Meta table: staff read, Admin write
-- ---------------------------------------------------------------------------
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ad_accounts force  row level security;

create policy meta_ad_accounts_select on public.meta_ad_accounts
  for select to authenticated
  using (app.is_active_user());

create policy meta_ad_accounts_write_admin on public.meta_ad_accounts
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- (f) Selecting campaigns atomically
--
-- Sent as one array rather than a row at a time: a half-applied selection would
-- quietly change which campaigns feed the CRM, and the Admin would have no way
-- to tell which half landed.
-- ---------------------------------------------------------------------------
create or replace function public.set_meta_campaign_selection(
  p_meta_ad_account_id text,
  p_selected_campaign_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_admin() then
    raise exception 'Only an Admin may choose campaigns.' using errcode = '42501';
  end if;

  update public.meta_campaigns
     set is_selected = (meta_campaign_id = any (coalesce(p_selected_campaign_ids, '{}')))
   where p_meta_ad_account_id is null
      or meta_ad_account_id is null
      or meta_ad_account_id = p_meta_ad_account_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.set_meta_campaign_selection(text, text[]) to authenticated;
