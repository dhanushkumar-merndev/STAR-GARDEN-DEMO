-- ===========================================================================
-- Star Garden CRM — 02. Core tables
-- AGENTS.md §10. UUID primary keys, created_at/updated_at, actor fields.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 10.1 profiles — one row per staff member, keyed to Supabase Auth
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) between 1 and 120),
  email         text,
  mobile        text,
  role          public.user_role not null default 'BDM',
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_role_idx      on public.profiles (role) where is_active;
create index profiles_is_active_idx on public.profiles (is_active);

comment on table public.profiles is
  'Staff directory. Deactivating a row must immediately remove application access (§15).';

-- ---------------------------------------------------------------------------
-- 10.2 leads
-- ---------------------------------------------------------------------------
create sequence public.lead_code_seq start 1000;

create table public.leads (
  id                  uuid primary key default gen_random_uuid(),
  lead_code           text not null unique,
  customer_name       text not null check (length(btrim(customer_name)) between 1 and 160),

  -- Mobile is stored split: country code separate from the normalized national
  -- number, so duplicate detection compares like with like (§8.1).
  mobile_country_code text not null default '+91' check (mobile_country_code ~ '^\+[0-9]{1,4}$'),
  mobile_normalized   text not null check (mobile_normalized ~ '^[0-9]{6,15}$'),
  email               text,

  location_text       text,
  site_address        text,
  requirement_summary text,

  source              public.lead_source not null default 'MANUAL',
  source_reference    text,
  meta_page_id        text,
  meta_form_id        text,
  meta_lead_id        text,

  status              public.lead_status not null default 'NEW',
  assigned_bdm_id     uuid references public.profiles (id) on delete set null,

  design_required     boolean not null default false,

  next_action_at      timestamptz,
  last_activity_at    timestamptz not null default now(),
  lost_reason         text,

  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A lead may only be LOST with a stated reason (§8.2).
  constraint leads_lost_reason_required
    check (status <> 'LOST' or (lost_reason is not null and length(btrim(lost_reason)) > 0))
);

-- Meta retries must never create a second lead (§10.2, §14).
create unique index leads_meta_lead_id_key
  on public.leads (meta_lead_id) where meta_lead_id is not null;

-- Duplicate detection scans the normalized number of leads that are still live.
create index leads_mobile_normalized_idx on public.leads (mobile_normalized);
create index leads_active_mobile_idx
  on public.leads (mobile_normalized) where status not in ('LOST', 'CLOSED');
create index leads_email_idx            on public.leads (lower(email)) where email is not null;
create index leads_status_idx           on public.leads (status);
create index leads_assigned_bdm_idx     on public.leads (assigned_bdm_id);
create index leads_next_action_idx      on public.leads (next_action_at) where next_action_at is not null;
create index leads_created_at_idx       on public.leads (created_at desc);
create index leads_source_idx           on public.leads (source);

comment on column public.leads.mobile_normalized is
  'Digits only, national significant number. For India this is the last 10 digits (§8.1).';

-- ---------------------------------------------------------------------------
-- 10.3 lead_assignment_history
-- ---------------------------------------------------------------------------
create table public.lead_assignment_history (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  from_user_id uuid references public.profiles (id) on delete set null,
  to_user_id   uuid references public.profiles (id) on delete set null,
  reason       text,
  changed_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index lead_assignment_history_lead_idx on public.lead_assignment_history (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10.4 activities — the lead timeline
-- ---------------------------------------------------------------------------
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  type        public.activity_type not null,
  outcome     public.call_outcome,
  notes       text,
  next_action text,
  activity_at timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Only call rows may carry a call outcome.
  constraint activities_outcome_only_for_calls
    check (outcome is null or type in ('CALL_ATTEMPT', 'CALL_OUTCOME'))
);

create index activities_lead_idx on public.activities (lead_id, activity_at desc);
create index activities_type_idx on public.activities (type);

comment on table public.activities is
  'A CALL_ATTEMPT timestamp records that the dialler was opened. It is not proof '
  'the call connected (§6.3).';

-- ---------------------------------------------------------------------------
-- 10.5 follow_ups
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  assigned_to  uuid references public.profiles (id) on delete set null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  notes        text,
  due_at       timestamptz not null,
  status       public.follow_up_status not null default 'OPEN',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint follow_ups_completed_fields
    check (status <> 'COMPLETED' or completed_at is not null)
);

create index follow_ups_lead_idx     on public.follow_ups (lead_id, due_at);
create index follow_ups_assignee_idx on public.follow_ups (assigned_to, due_at) where status in ('OPEN', 'OVERDUE');
create index follow_ups_due_idx      on public.follow_ups (due_at) where status in ('OPEN', 'OVERDUE');

-- ---------------------------------------------------------------------------
-- 10.6 site_visits
-- ---------------------------------------------------------------------------
create table public.site_visits (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.leads (id) on delete cascade,
  scheduled_start_at  timestamptz not null,
  scheduled_end_at    timestamptz,
  address             text,
  latitude            numeric(9, 6) check (latitude between -90 and 90),
  longitude           numeric(9, 6) check (longitude between -180 and 180),
  map_url             text,
  status              public.site_visit_status not null default 'SCHEDULED',

  -- Optional, one-time, explicitly consented coordinates. Continuous tracking
  -- is forbidden (§3.2, §8.3, §18).
  check_in_at         timestamptz,
  check_in_latitude   numeric(9, 6) check (check_in_latitude between -90 and 90),
  check_in_longitude  numeric(9, 6) check (check_in_longitude between -180 and 180),
  check_out_at        timestamptz,
  check_out_latitude  numeric(9, 6) check (check_out_latitude between -90 and 90),
  check_out_longitude numeric(9, 6) check (check_out_longitude between -180 and 180),

  notes               text,
  requirement_summary text,
  cancellation_reason text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint site_visits_end_after_start
    check (scheduled_end_at is null or scheduled_end_at >= scheduled_start_at),
  constraint site_visits_checkout_after_checkin
    check (check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at))
);

create index site_visits_lead_idx      on public.site_visits (lead_id, scheduled_start_at desc);
create index site_visits_scheduled_idx on public.site_visits (scheduled_start_at)
  where status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS');

-- Join table for BDM / designer attendees (§10.6).
create table public.site_visit_attendees (
  id            uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references public.site_visits (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  is_required   boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (site_visit_id, user_id)
);

create index site_visit_attendees_user_idx on public.site_visit_attendees (user_id);

-- ---------------------------------------------------------------------------
-- 10.7 design_projects
-- ---------------------------------------------------------------------------
create table public.design_projects (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.leads (id) on delete cascade,
  assigned_designer_id uuid references public.profiles (id) on delete set null,
  status               public.design_status not null default 'REQUIRED',
  requirement_notes    text,
  due_at               timestamptz,

  -- FK added after design_versions exists (circular reference).
  approved_version_id  uuid,
  approved_by          uuid references public.profiles (id) on delete set null,
  approved_at          timestamptz,

  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint design_projects_approved_fields
    check (status <> 'APPROVED' or (approved_version_id is not null and approved_at is not null))
);

-- One live design project per lead keeps the workflow unambiguous.
create unique index design_projects_lead_active_key
  on public.design_projects (lead_id) where status <> 'CANCELLED';
create index design_projects_designer_idx on public.design_projects (assigned_designer_id, status);
create index design_projects_status_idx   on public.design_projects (status);
create index design_projects_due_idx      on public.design_projects (due_at)
  where status not in ('APPROVED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- 10.8 design_versions — immutable history (§5.6)
-- ---------------------------------------------------------------------------
create table public.design_versions (
  id                  uuid primary key default gen_random_uuid(),
  design_project_id   uuid not null references public.design_projects (id) on delete cascade,
  version_number      integer not null check (version_number >= 1),

  -- FK added after `files` exists.
  file_id             uuid not null,

  version_note        text,
  status              public.design_version_status not null default 'DRAFT',
  uploaded_by         uuid references public.profiles (id) on delete set null,
  ready_for_review_at timestamptz,
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  revision_notes      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (design_project_id, version_number)
);

create index design_versions_project_idx on public.design_versions (design_project_id, version_number desc);

alter table public.design_projects
  add constraint design_projects_approved_version_fkey
  foreign key (approved_version_id) references public.design_versions (id) on delete restrict;

comment on table public.design_versions is
  'Append-only. Uploads always create a new row; existing versions are never '
  'overwritten or deleted (§5.6, §18).';

-- ---------------------------------------------------------------------------
-- 10.9 execution_projects
-- ---------------------------------------------------------------------------
create table public.execution_projects (
  id                         uuid primary key default gen_random_uuid(),
  lead_id                    uuid not null references public.leads (id) on delete cascade,
  design_project_id          uuid references public.design_projects (id) on delete set null,

  -- Execution must reference the EXACT approved version, not "the latest
  -- file" (§5.6, §8.5, §18).
  approved_design_version_id uuid not null references public.design_versions (id) on delete restrict,

  title                      text,
  status                     public.execution_status not null default 'NOT_STARTED',
  planned_start_at           timestamptz,
  due_at                     timestamptz,
  completed_at               timestamptz,
  progress_percent           integer not null default 0 check (progress_percent between 0 and 100),
  blocker_summary            text,
  completion_override_reason text,
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint execution_projects_completed_fields
    check (status <> 'COMPLETED' or completed_at is not null),
  constraint execution_projects_blocker_required
    check (status <> 'BLOCKED' or (blocker_summary is not null and length(btrim(blocker_summary)) > 0))
);

create unique index execution_projects_lead_active_key
  on public.execution_projects (lead_id) where status <> 'CANCELLED';
create index execution_projects_status_idx on public.execution_projects (status);
create index execution_projects_due_idx    on public.execution_projects (due_at)
  where status not in ('COMPLETED', 'CANCELLED');

-- Multiple execution staff per project (§10.9).
create table public.execution_assignees (
  id                   uuid primary key default gen_random_uuid(),
  execution_project_id uuid not null references public.execution_projects (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  assigned_by          uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (execution_project_id, user_id)
);

create index execution_assignees_user_idx on public.execution_assignees (user_id);

-- ---------------------------------------------------------------------------
-- 10.10 execution_tasks
-- ---------------------------------------------------------------------------
create table public.execution_tasks (
  id                   uuid primary key default gen_random_uuid(),
  execution_project_id uuid not null references public.execution_projects (id) on delete cascade,
  title                text not null check (length(btrim(title)) between 1 and 200),
  description          text,
  assigned_to          uuid references public.profiles (id) on delete set null,
  is_mandatory         boolean not null default false,
  status               public.execution_task_status not null default 'TODO',
  blocker_notes        text,
  due_at               timestamptz,
  completed_at         timestamptz,
  completed_by         uuid references public.profiles (id) on delete set null,
  sort_order           integer not null default 0,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint execution_tasks_completed_fields
    check (status <> 'COMPLETED' or completed_at is not null)
);

create index execution_tasks_project_idx  on public.execution_tasks (execution_project_id, sort_order);
create index execution_tasks_assignee_idx on public.execution_tasks (assigned_to, due_at)
  where status not in ('COMPLETED', 'CANCELLED');
create index execution_tasks_due_idx      on public.execution_tasks (due_at)
  where status not in ('COMPLETED', 'CANCELLED');

-- ---------------------------------------------------------------------------
-- 10.11 files — METADATA ONLY. Bytes live in the private Tigris bucket (§5.1).
-- ---------------------------------------------------------------------------
create table public.files (
  id                   uuid primary key default gen_random_uuid(),
  category             public.file_category not null,

  object_key           text not null unique,
  original_filename    text not null,
  safe_filename        text not null,
  mime_type            text not null,
  extension            text not null,
  size_bytes           bigint not null check (size_bytes > 0),
  checksum             text,

  lead_id              uuid references public.leads (id) on delete cascade,
  site_visit_id        uuid references public.site_visits (id) on delete cascade,
  design_project_id    uuid references public.design_projects (id) on delete cascade,
  execution_project_id uuid references public.execution_projects (id) on delete cascade,
  execution_task_id    uuid references public.execution_tasks (id) on delete cascade,

  uploaded_by          uuid references public.profiles (id) on delete set null,
  is_archived          boolean not null default false,
  archived_at          timestamptz,
  archived_by          uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- At least one valid parent relation must be present (§10.11).
  constraint files_requires_parent check (
    lead_id is not null
    or site_visit_id is not null
    or design_project_id is not null
    or execution_project_id is not null
    or execution_task_id is not null
  )
);

create index files_lead_idx      on public.files (lead_id)              where lead_id is not null;
create index files_visit_idx     on public.files (site_visit_id)        where site_visit_id is not null;
create index files_design_idx    on public.files (design_project_id)    where design_project_id is not null;
create index files_execution_idx on public.files (execution_project_id) where execution_project_id is not null;
create index files_task_idx      on public.files (execution_task_id)    where execution_task_id is not null;
create index files_category_idx  on public.files (category);

alter table public.design_versions
  add constraint design_versions_file_fkey
  foreign key (file_id) references public.files (id) on delete restrict;

comment on column public.files.object_key is
  'UUID-based private Tigris key. The original filename is never used as the '
  'storage path (§5.3, §5.4).';

-- Every sensitive read is recorded (§4.4 step 9).
create table public.file_access_logs (
  id         uuid primary key default gen_random_uuid(),
  file_id    uuid not null references public.files (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  action     text not null check (action in ('PREVIEW', 'DOWNLOAD')),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index file_access_logs_file_idx on public.file_access_logs (file_id, created_at desc);
create index file_access_logs_user_idx on public.file_access_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10.12 notifications (§13)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Reminder jobs must stay idempotent across cron runs (§13).
create unique index notifications_dedupe_key
  on public.notifications (
    user_id,
    type,
    entity_id,
    ((created_at at time zone 'UTC')::date)
  )
  where entity_id is not null;

-- ---------------------------------------------------------------------------
-- 10.13 audit_logs — append-only for application users (§17)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx   on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_action_idx  on public.audit_logs (action);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- 10.14 meta_webhook_events (§14)
-- ---------------------------------------------------------------------------
create table public.meta_webhook_events (
  id                uuid primary key default gen_random_uuid(),

  -- Idempotency key. Meta retries the same leadgen id; the unique constraint
  -- makes duplicate delivery a no-op (§10.14, §14).
  provider_event_id text not null unique,

  page_id           text,
  form_id           text,
  payload           jsonb not null,
  processing_status public.webhook_processing_status not null default 'PENDING',
  attempt_count     integer not null default 0,
  last_error        text,
  lead_id           uuid references public.leads (id) on delete set null,
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index meta_webhook_events_status_idx on public.meta_webhook_events (processing_status, created_at);

-- ---------------------------------------------------------------------------
-- Configurable business options (§2, §7.1, §11.7)
-- Statuses, sources and loss reasons stay in the database rather than being
-- scattered as hard-coded text.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.config_options (
  id         uuid primary key default gen_random_uuid(),
  group_key  text not null,
  value      text not null,
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_key, value)
);

create index config_options_group_idx on public.config_options (group_key, sort_order) where is_active;

-- Reusable execution checklist templates (§8.5 step 4).
create table public.execution_task_templates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  is_mandatory boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Rate limiting for the public enquiry form and auth-sensitive routes (§15).
create table public.rate_limit_hits (
  id         bigserial primary key,
  bucket     text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_lookup_idx on public.rate_limit_hits (bucket, identifier, created_at desc);
