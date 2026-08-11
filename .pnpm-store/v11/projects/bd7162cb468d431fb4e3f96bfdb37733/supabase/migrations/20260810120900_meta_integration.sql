-- ===========================================================================
-- Star Gardens CRM — 10. Meta campaign, form mapping and insights
--
-- Extends the existing Meta lead intake (migration 02's `meta_webhook_events`
-- and the `leads.meta_*` columns) with the campaign metadata, per-form field
-- mapping and performance data the Admin screens need.
--
-- Three design rules run through this file:
--
--   1. **Meta IDs are the durable key.** Names change; ids do not. Every table
--      is keyed on the immutable Meta id and stores the name only as a display
--      snapshot.
--   2. **Sync never destroys.** A campaign that stops appearing in a sync is
--      flagged, not deleted, so historical lead attribution keeps resolving
--      even after a campaign is archived at Meta.
--   3. **A form is not owned by a campaign.** Lead forms are reused across
--      campaigns, so the association is its own table with its own provenance.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table public.meta_campaigns (
  id                        uuid primary key default gen_random_uuid(),

  meta_campaign_id          text not null unique,
  name                      text not null,

  -- Meta reports both: `status` is what the advertiser set, `effective_status`
  -- folds in account/ad-set level pauses. Operations care about the second.
  configured_status         text,
  effective_status          text,
  objective                 text,

  -- Set false when a sync completes without seeing this campaign. The row
  -- stays, so leads attributed to it still render (rule 2 above).
  is_present_in_latest_sync boolean not null default true,

  last_synced_at            timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index meta_campaigns_status_idx on public.meta_campaigns (effective_status);
create index meta_campaigns_present_idx on public.meta_campaigns (is_present_in_latest_sync);

create trigger set_updated_at before update on public.meta_campaigns
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lead forms
-- ---------------------------------------------------------------------------
create table public.meta_lead_forms (
  id             uuid primary key default gen_random_uuid(),

  meta_form_id   text not null unique,
  meta_page_id   text,
  name           text not null,
  status         text,

  -- Cached copy of the form's questions, so the mapping screen can be built
  -- without a Graph call on every page load (add-on §2, "opening the Ads
  -- screen must not make a complete Meta API fetch").
  questions      jsonb not null default '[]'::jsonb,

  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index meta_lead_forms_page_idx on public.meta_lead_forms (meta_page_id);

create trigger set_updated_at before update on public.meta_lead_forms
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaign ↔ form association
--
-- Many-to-many on purpose: one form is commonly reused across several
-- campaigns, and one campaign can run several forms.
-- ---------------------------------------------------------------------------
create table public.meta_campaign_forms (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.meta_campaigns (id) on delete cascade,
  form_id            uuid not null references public.meta_lead_forms (id) on delete cascade,

  association_source public.meta_association_source not null default 'ADS_GRAPH',
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),

  unique (campaign_id, form_id)
);

create index meta_campaign_forms_form_idx on public.meta_campaign_forms (form_id);

-- ---------------------------------------------------------------------------
-- Field mapping (add-on §6)
--
-- One row per Meta question, saying where its answer lands in the CRM.
-- ---------------------------------------------------------------------------
create table public.meta_field_mappings (
  id              uuid primary key default gen_random_uuid(),

  -- Text, not a FK: a mapping may legitimately be authored for a form id the
  -- CRM has not synced yet, and losing the mapping if a form row is rebuilt
  -- would silently break intake.
  meta_form_id    text not null,

  meta_field_key  text not null,
  meta_field_label text,
  crm_field       public.meta_crm_field not null,

  is_active       boolean not null default true,

  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (meta_form_id, meta_field_key)
);

-- A CRM destination may be claimed by at most one active Meta field per form.
-- IGNORE is exempt, because any number of questions may be discarded.
create unique index meta_field_mappings_unique_destination
  on public.meta_field_mappings (meta_form_id, crm_field)
  where is_active and crm_field <> 'IGNORE';

create index meta_field_mappings_form_idx on public.meta_field_mappings (meta_form_id) where is_active;

create trigger set_updated_at before update on public.meta_field_mappings
  for each row execute function app.set_updated_at();

comment on table public.meta_field_mappings is
  'Maps Meta lead-form questions onto CRM lead fields. Call notes and '
  'follow-ups are deliberately NOT valid destinations — those are the BDM''s '
  'own record and Meta must never write to them.';

/**
 * A form is usable for intake only when name and mobile both have a home.
 * Checked here as well as in the application so a hand-written INSERT cannot
 * leave a half-configured form that silently drops customers.
 */
create or replace function public.meta_form_mapping_is_complete(p_meta_form_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where crm_field = 'customer_name') = 1
    and count(*) filter (where crm_field = 'mobile') = 1
  from public.meta_field_mappings
  where meta_form_id = p_meta_form_id
    and is_active;
$$;

grant execute on function public.meta_form_mapping_is_complete(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily campaign insights (add-on §4)
--
-- One row per campaign per day, upserted every 30 minutes. Storing a snapshot
-- per run would grow without bound and answer no question the Admin asks.
-- ---------------------------------------------------------------------------
create table public.meta_campaign_daily_insights (
  id               uuid primary key default gen_random_uuid(),

  meta_campaign_id text not null,
  insight_date     date not null,

  spend            numeric(14, 2) not null default 0,
  impressions      bigint not null default 0,
  reach            bigint not null default 0,
  clicks           bigint not null default 0,
  leads            integer not null default 0,

  -- Null, never infinity: a campaign with spend and zero leads has no cost per
  -- lead, and 0 would read as "free" on the dashboard (add-on §4).
  cost_per_lead    numeric(14, 2),

  last_synced_at   timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  unique (meta_campaign_id, insight_date),
  constraint meta_insights_cpl_requires_leads
    check (cost_per_lead is null or leads > 0)
);

create index meta_insights_date_idx on public.meta_campaign_daily_insights (insight_date desc);
create index meta_insights_campaign_idx
  on public.meta_campaign_daily_insights (meta_campaign_id, insight_date desc);

-- ---------------------------------------------------------------------------
-- Sync run history (add-on §8)
-- ---------------------------------------------------------------------------
create table public.meta_sync_runs (
  id               uuid primary key default gen_random_uuid(),

  sync_type        public.meta_sync_type not null,
  status           public.meta_sync_status not null default 'RUNNING',
  trigger_type     public.meta_sync_trigger not null default 'CRON',
  triggered_by     uuid references public.profiles (id) on delete set null,

  started_at       timestamptz not null default now(),
  completed_at     timestamptz,

  records_received integer not null default 0,
  records_created  integer not null default 0,
  records_updated  integer not null default 0,

  -- Redacted upstream. Never contains a token.
  error_summary    text
);

create index meta_sync_runs_type_idx on public.meta_sync_runs (sync_type, started_at desc);
create index meta_sync_runs_status_idx on public.meta_sync_runs (status, started_at desc);

/**
 * Server-enforced cooldown for the Admin "Sync now" button (add-on §5).
 *
 * Returns the seconds remaining before another manual run of this type is
 * allowed. Enforcing it in the database rather than the route means a second
 * browser tab cannot bypass it.
 */
create or replace function public.meta_sync_cooldown_remaining(
  p_sync_type public.meta_sync_type,
  p_cooldown_seconds integer default 60
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    0,
    p_cooldown_seconds - coalesce(
      extract(epoch from (now() - max(started_at)))::int,
      p_cooldown_seconds
    )
  )
  from public.meta_sync_runs
  where sync_type = p_sync_type
    and trigger_type = 'ADMIN_MANUAL';
$$;

grant execute on function public.meta_sync_cooldown_remaining(public.meta_sync_type, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lead attribution (add-on §7, §9)
--
-- `meta_page_id`, `meta_form_id` and `meta_lead_id` already exist from
-- migration 02, including the unique index that makes webhook retries a no-op.
-- Only the campaign/ad-set/ad columns are new.
-- ---------------------------------------------------------------------------
alter table public.leads add column meta_campaign_id   text;
alter table public.leads add column meta_campaign_name text;
alter table public.leads add column meta_adset_id      text;
alter table public.leads add column meta_adset_name    text;
alter table public.leads add column meta_ad_id         text;
alter table public.leads add column meta_ad_name       text;

create index leads_meta_campaign_idx on public.leads (meta_campaign_id)
  where meta_campaign_id is not null;
create index leads_meta_form_idx on public.leads (meta_form_id)
  where meta_form_id is not null;

comment on column public.leads.meta_campaign_name is
  'Display snapshot taken at intake. meta_campaign_id is the durable key.';

-- ---------------------------------------------------------------------------
-- Webhook event: retry support
-- ---------------------------------------------------------------------------
alter table public.meta_webhook_events add column form_name text;
alter table public.meta_webhook_events add column last_attempt_at timestamptz;

-- The Admin "integration issues" list reads this: unmapped forms and failures.
create index meta_webhook_events_unresolved_idx
  on public.meta_webhook_events (created_at desc)
  where processing_status in ('FAILED', 'UNMAPPED_FORM', 'PENDING', 'RECEIVED');

-- ===========================================================================
-- RLS (add-on §18)
--
-- Meta configuration is Admin-only in every direction. A BDM sees campaign
-- attribution through the `leads` row they are already allowed to read — never
-- through these tables.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'meta_campaigns', 'meta_lead_forms', 'meta_campaign_forms',
    'meta_field_mappings', 'meta_campaign_daily_insights', 'meta_sync_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (app.is_admin())',
      t || '_select_admin', t
    );

    execute format(
      'create policy %I on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())',
      t || '_write_admin', t
    );
  end loop;
end;
$$;
