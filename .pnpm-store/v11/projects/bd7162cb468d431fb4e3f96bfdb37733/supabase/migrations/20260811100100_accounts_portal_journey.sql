-- ===========================================================================
-- Star Gardens CRM — 16. Accounts, client portal, visit journey, business contact
--
-- Four additions, all driven by the operations brief:
--
--   1. The landscape designer who does the SITE VISIT is the same person who
--      later does the design, so the visit itself now names them.
--   2. A visit has a journey: the designer taps "Start", then "Reached site".
--      Two discrete, user-pressed events — never a background feed (§3.2, §18).
--   3. A finished job goes to Accounts, where an Admin records the value and
--      closes it. One row per lead, so a job cannot be billed twice.
--   4. The customer gets a read-only login showing where their job has reached.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (a) "Active user" now means "active STAFF member"
--
-- Every existing RLS predicate is written on top of `app.is_active_user()`.
-- Narrowing it here is what keeps a CLIENT out of all of them at once: a
-- customer login can reach nothing through normal policies, and sees their own
-- job only through the curated function in section (f). Adding a role to an
-- enum must never silently widen an existing grant.
-- ---------------------------------------------------------------------------
create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role <> 'CLIENT'
  );
$$;

comment on function app.is_active_user() is
  'True for an active STAFF profile. Deliberately false for CLIENT so the '
  'customer portal cannot inherit any staff policy (migration 16).';

-- Any signed-in, active account — staff or customer. Used only where a client
-- legitimately belongs, which today is nothing but their own portal row.
create or replace function app.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

grant execute on function app.is_active_account() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (b) Site visit: the designer who attends, and the journey they make
-- ---------------------------------------------------------------------------
alter table public.site_visits
  add column assigned_designer_id uuid references public.profiles (id) on delete set null,
  add column journey_status public.visit_journey_status not null default 'NOT_STARTED',
  add column journey_started_at timestamptz,
  add column journey_start_latitude numeric(9, 6)
    check (journey_start_latitude between -90 and 90),
  add column journey_start_longitude numeric(9, 6)
    check (journey_start_longitude between -180 and 180);

create index site_visits_designer_idx
  on public.site_visits (assigned_designer_id, scheduled_start_at desc)
  where assigned_designer_id is not null;

comment on column public.site_visits.assigned_designer_id is
  'The landscape designer who attends this visit. The same person is offered '
  'first when the design project is created, so one landscaper owns the site '
  'end to end.';

comment on column public.site_visits.journey_status is
  'NOT_STARTED -> EN_ROUTE -> ARRIVED. Each step is an explicit tap by the '
  'designer. Coordinates are captured at most once per step and only when the '
  'browser prompt was accepted; declining still allows the step.';

-- ARRIVED is the same moment as check-in, so the two may not disagree.
alter table public.site_visits
  add constraint site_visits_arrival_matches_check_in
    check (journey_status <> 'ARRIVED' or check_in_at is not null);

-- ---------------------------------------------------------------------------
-- (c) lead_accounts — the money on a finished job
--
-- One row per lead. `balance_amount` is generated rather than stored by the
-- app so it can never drift from the two figures it is derived from.
-- ---------------------------------------------------------------------------
create table public.lead_accounts (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null unique references public.leads (id) on delete cascade,

  total_amount     numeric(12, 2) not null default 0 check (total_amount >= 0),
  received_amount  numeric(12, 2) not null default 0 check (received_amount >= 0),
  balance_amount   numeric(12, 2) generated always as (total_amount - received_amount) stored,

  currency         text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  payment_status   public.payment_status not null default 'PENDING',

  invoice_number   text,
  invoiced_at      timestamptz,
  notes            text,

  closed_at        timestamptz,
  closed_by        uuid references public.profiles (id) on delete set null,

  recorded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Money received can never exceed the agreed value; that is a data-entry
  -- slip, not a legitimate state.
  constraint lead_accounts_received_within_total
    check (received_amount <= total_amount),

  -- Closing a job requires a value on it. An Admin who wants to close without
  -- collecting marks it WRITTEN_OFF, which is visible, rather than closing a
  -- zero-value job, which is not.
  constraint lead_accounts_closed_requires_amount
    check (closed_at is null or total_amount > 0 or payment_status = 'WRITTEN_OFF')
);

create index lead_accounts_status_idx on public.lead_accounts (payment_status);
create index lead_accounts_open_idx   on public.lead_accounts (created_at desc)
  where closed_at is null;

create trigger set_updated_at before update on public.lead_accounts
  for each row execute function app.set_updated_at();

comment on table public.lead_accounts is
  'The commercial record for one lead: agreed value, money received, and the '
  'closure decision. Written only by an Admin (§accounts).';

-- ---------------------------------------------------------------------------
-- (d) lead_portal_access — which email may see which job
--
-- The address the customer gave on the lead is the primary one. An alternative
-- may be added for status updates only; it grants exactly the same read-only
-- view and nothing else.
-- ---------------------------------------------------------------------------
create table public.lead_portal_access (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads (id) on delete cascade,

  email          text not null check (position('@' in email) > 1),
  is_primary     boolean not null default false,

  invited_at     timestamptz,
  invited_by     uuid references public.profiles (id) on delete set null,
  last_viewed_at timestamptz,
  revoked_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index lead_portal_access_lead_email_key
  on public.lead_portal_access (lead_id, lower(btrim(email)));

create index lead_portal_access_email_idx
  on public.lead_portal_access (lower(btrim(email)))
  where revoked_at is null;

-- Exactly one primary address per lead.
create unique index lead_portal_access_primary_key
  on public.lead_portal_access (lead_id) where is_primary;

create trigger set_updated_at before update on public.lead_portal_access
  for each row execute function app.set_updated_at();

comment on table public.lead_portal_access is
  'Grants a customer email a read-only view of one job. Presence here is also '
  'what lets that address sign in at all — see app.handle_new_auth_user().';

-- ---------------------------------------------------------------------------
-- (e) Sign-in provisioning now recognises customers
--
-- Order matters. A staff invite always wins: if the same address is both a
-- staff member and a customer on some lead, they are staff.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text := lower(btrim(new.email));
  v_invite    public.staff_invites%rowtype;
  v_is_client boolean := false;
  v_name      text;
  v_mobile    text;
  v_avatar    text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Unnamed user'
  );
  v_avatar := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
  );
  v_mobile := nullif(btrim(new.raw_user_meta_data ->> 'mobile'), '');

  select * into v_invite
    from public.staff_invites
   where lower(btrim(email)) = v_email
   limit 1;

  if v_invite.id is null then
    select exists (
      select 1 from public.lead_portal_access a
      where lower(btrim(a.email)) = v_email
        and a.revoked_at is null
    ) into v_is_client;
  end if;

  insert into public.profiles (
    id, full_name, email, mobile, avatar_url, role, is_active, approved_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(v_invite.full_name), ''), v_name),
    new.email,
    coalesce(v_mobile, v_invite.mobile),
    v_avatar,
    case
      when v_invite.id is not null then v_invite.role
      when v_is_client              then 'CLIENT'::public.user_role
      else 'BDM'::public.user_role
    end,
    -- Staff on the allowlist, or a customer with a live portal grant. Anyone
    -- else lands inactive and sees the "waiting for approval" screen.
    v_invite.id is not null or v_is_client,
    case when v_invite.id is not null or v_is_client then now() end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null and v_invite.accepted_at is null then
    update public.staff_invites
       set accepted_at = now(), accepted_by = new.id
     where id = v_invite.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- (f) The customer's read-only view
--
-- A SECURITY DEFINER function rather than an RLS policy, because a customer
-- must see a *projection* of their job — a status, a date, an amount — and
-- never the underlying rows, which carry internal notes, call outcomes, staff
-- identities and other customers' data. Adding a client policy to `leads`
-- would have opened all of that; this opens exactly six statuses.
-- ---------------------------------------------------------------------------
create or replace function public.client_portal_jobs()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select lower(btrim(p.email)) as email
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role = 'CLIENT'
  ),
  mine as (
    select distinct a.lead_id
    from public.lead_portal_access a
    join me on lower(btrim(a.email)) = me.email
    where a.revoked_at is null
  )
  select coalesce(
    jsonb_agg(job order by job ->> 'created_at' desc),
    '[]'::jsonb
  )
  from (
    select jsonb_build_object(
      'lead_id',             l.id,
      'lead_code',           l.lead_code,
      'customer_name',       l.customer_name,
      'status',              l.status,
      'requirement_summary', l.requirement_summary,
      'location',            l.location_text,
      'created_at',          l.created_at,
      'site_visit', (
        select jsonb_build_object(
          'scheduled_start_at', sv.scheduled_start_at,
          'status',             sv.status,
          'journey_status',     sv.journey_status,
          'completed_at',       sv.check_out_at
        )
        from public.site_visits sv
        where sv.lead_id = l.id and sv.status <> 'CANCELLED'
        order by sv.scheduled_start_at desc
        limit 1
      ),
      'design', (
        select jsonb_build_object(
          'status',      dp.status,
          'approved_at', dp.approved_at
        )
        from public.design_projects dp
        where dp.lead_id = l.id and dp.status <> 'CANCELLED'
        limit 1
      ),
      'execution', (
        select jsonb_build_object(
          'status',           ep.status,
          'progress_percent', ep.progress_percent,
          'planned_start_at', ep.planned_start_at,
          'completed_at',     ep.completed_at
        )
        from public.execution_projects ep
        where ep.lead_id = l.id and ep.status <> 'CANCELLED'
        limit 1
      ),
      'account', (
        select jsonb_build_object(
          'total_amount',    la.total_amount,
          'received_amount', la.received_amount,
          'balance_amount',  la.balance_amount,
          'currency',        la.currency,
          'payment_status',  la.payment_status,
          'closed_at',       la.closed_at
        )
        from public.lead_accounts la
        where la.lead_id = l.id
      )
    ) as job
    from public.leads l
    join mine on mine.lead_id = l.id
  ) jobs;
$$;

grant execute on function public.client_portal_jobs() to authenticated;

comment on function public.client_portal_jobs() is
  'Read-only status projection for the signed-in customer. Returns [] for '
  'anyone who is not an active CLIENT with a live portal grant.';

-- Records that the customer looked. Best-effort bookkeeping, not an audit row.
create or replace function public.client_portal_seen()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.lead_portal_access a
     set last_viewed_at = now()
   where a.revoked_at is null
     and lower(btrim(a.email)) = (
       select lower(btrim(p.email))
       from public.profiles p
       where p.id = auth.uid() and p.is_active and p.role = 'CLIENT'
     );
$$;

grant execute on function public.client_portal_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- (g) Recording the account and closing the job, in one transaction
--
-- The amount, the closure and the lead's own status have to move together: a
-- lead marked CLOSED with no account row, or an account closed against a lead
-- still shown as in-progress, are both states the Accounts screen would then
-- have to apologise for.
-- ---------------------------------------------------------------------------
create or replace function public.record_lead_account(
  p_lead_id         uuid,
  p_total_amount    numeric,
  p_received_amount numeric default 0,
  p_payment_status  public.payment_status default 'PENDING',
  p_invoice_number  text default null,
  p_notes           text default null,
  p_close           boolean default false
)
returns public.lead_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.lead_accounts%rowtype;
  v_lead    public.leads%rowtype;
begin
  if not app.is_admin() then
    raise exception 'Only an Admin may record account values.'
      using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  insert into public.lead_accounts as la (
    lead_id, total_amount, received_amount, payment_status,
    invoice_number, invoiced_at, notes, recorded_by
  )
  values (
    p_lead_id,
    coalesce(p_total_amount, 0),
    coalesce(p_received_amount, 0),
    p_payment_status,
    nullif(btrim(p_invoice_number), ''),
    case when nullif(btrim(p_invoice_number), '') is not null then now() end,
    nullif(btrim(p_notes), ''),
    auth.uid()
  )
  on conflict (lead_id) do update
    set total_amount    = excluded.total_amount,
        received_amount = excluded.received_amount,
        payment_status  = excluded.payment_status,
        invoice_number  = excluded.invoice_number,
        invoiced_at     = coalesce(la.invoiced_at, excluded.invoiced_at),
        notes           = excluded.notes,
        recorded_by     = excluded.recorded_by
  returning * into v_account;

  if p_close then
    update public.lead_accounts
       set closed_at = coalesce(closed_at, now()),
           closed_by = auth.uid()
     where lead_id = p_lead_id
    returning * into v_account;

    -- CLOSED is the lead's terminal "won and finished" state (§9.1).
    update public.leads
       set status           = 'CLOSED',
           last_activity_at = now()
     where id = p_lead_id
       and status <> 'CLOSED';
  end if;

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    p_lead_id,
    'ACCOUNT_UPDATE',
    case
      when p_close then 'Account closed. Value recorded: ' || to_char(v_account.total_amount, 'FM999999999.00')
      else 'Account value recorded: ' || to_char(v_account.total_amount, 'FM999999999.00')
    end,
    auth.uid()
  );

  return v_account;
end;
$$;

grant execute on function public.record_lead_account(
  uuid, numeric, numeric, public.payment_status, text, text, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- (h) Row Level Security on the two new tables
-- ---------------------------------------------------------------------------
alter table public.lead_accounts       enable row level security;
alter table public.lead_accounts       force  row level security;
alter table public.lead_portal_access  enable row level security;
alter table public.lead_portal_access  force  row level security;

-- Staff who can already read the lead can see its value; only an Admin writes,
-- and in practice writes go through record_lead_account() above.
create policy lead_accounts_select on public.lead_accounts
  for select to authenticated
  using (app.can_read_lead(lead_id));

create policy lead_accounts_write_admin on public.lead_accounts
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy lead_portal_access_select on public.lead_portal_access
  for select to authenticated
  using (app.can_read_lead(lead_id));

create policy lead_portal_access_write_admin on public.lead_portal_access
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- (i) Business contact details
--
-- The WhatsApp number is the company's, not a staff member's: tapping "WhatsApp"
-- on a lead opens a chat FROM whoever is signed in TO the customer, using the
-- number the business publishes. Stored as a setting so an Admin can change it
-- without a redeploy (§2, §11.7).
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('business_name',
   '"Star Gardens"'::jsonb,
   'Company name shown in emails and on the customer portal.'),

  ('business_whatsapp_number',
   '""'::jsonb,
   'Company WhatsApp number in international format, e.g. +919876543210. '
   'Blank hides every WhatsApp button.'),

  ('business_phone',
   '""'::jsonb,
   'Company landline or mobile shown to customers.'),

  ('business_email',
   '""'::jsonb,
   'Reply-to address shown on customer emails.'),

  ('whatsapp_default_message',
   '"Hello {{customer_name}}, this is {{business_name}} regarding your garden enquiry {{lead_code}}."'::jsonb,
   'Prefilled WhatsApp text. Supports {{customer_name}}, {{business_name}} and {{lead_code}}.'),

  ('client_portal_enabled',
   'true'::jsonb,
   'Master switch for customer logins. Off revokes nothing, it only hides the invite action.'),

  -- Off today: the two Admins do the calling themselves. Turning it on makes
  -- BDM a real, assignable role and reveals the "assign to BDM" controls. The
  -- role itself is never removed from the enum, so switching it on later needs
  -- no data migration and no reassignment of historical leads.
  ('bdm_role_enabled',
   'false'::jsonb,
   'Whether Business Development Manager is a separate role. Off means Admins '
   'own the calling and leads are assigned to Admins.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- (j) Loss reasons the disposition buttons need
-- ---------------------------------------------------------------------------
insert into public.config_options (group_key, value, label, sort_order) values
  ('lost_reason', 'NO_REQUIREMENT', 'No requirement right now', 45)
on conflict (group_key, value) do nothing;
