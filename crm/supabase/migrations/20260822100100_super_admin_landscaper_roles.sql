-- Introduces SUPER_ADMIN above ADMIN, and renames the DESIGNER role's job to
-- LANDSCAPER (site visit + design, one person). Depends on
-- `20260822100000_super_admin_landscaper_enum_values` having already
-- committed the two new enum values.
--
-- Role model after this migration:
--   SUPER_ADMIN  everything ADMIN can do, plus Accounts, Reports, Marketing
--                and Settings (including who else has which role).
--   ADMIN        full operational reach: leads, site visits, landscaper work,
--                execution. Not Accounts/Reports/Marketing/Settings.
--   BDM          creates and owns leads.
--   LANDSCAPER   attends the site visit they are assigned, then designs it.
--   EXECUTION    executes the approved design on site.
--
-- Application-side authorization (session.ts, permissions/index.ts,
-- users.ts, meta-config.ts, reports.ts, the page guards) was updated in the
-- same commit as this migration — see that diff for the app-layer half of
-- this change. RLS itself needs no edits here: every SELECT/UPDATE policy on
-- leads/site_visits/design_projects/execution_projects already grants access
-- by *row ownership* (`assigned_bdm_id`, `assigned_designer_id`,
-- `execution_assignees`), not by a role-string comparison, so renaming the
-- role a person holds does not change what rows they can reach — only
-- `app.is_admin()` and the handful of SQL functions below compare role by
-- name, and are corrected here.

-- ---------------------------------------------------------------------------
-- Move every existing DESIGNER profile onto the renamed role. The DESIGNER
-- enum label stays defined (see the previous migration) but nothing holds it
-- from this point on.
--
-- `guard_profile_privilege_change` (20260810120300) blocks any change to
-- `role`/`is_active`/`archived_at` unless `app.is_admin()` is true, which
-- reads `auth.uid()` — always null in a migration, which runs as the
-- database owner, not as a signed-in app user. Disabling the trigger for the
-- one bulk statement it exists to gate against a browser session, not a
-- migration, is exactly what it should not stop.
-- ---------------------------------------------------------------------------
alter table public.profiles disable trigger guard_profile_privilege_change;
update public.profiles set role = 'LANDSCAPER' where role = 'DESIGNER';
alter table public.profiles enable trigger guard_profile_privilege_change;

-- ---------------------------------------------------------------------------
-- app.is_admin(): the RLS bypass. Widening this to include SUPER_ADMIN is a
-- strict superset of what it already granted ADMIN — every policy that calls
-- it (directly, or through can_read_lead / can_write_lead / … ) now also
-- passes for a Super Admin, and nothing an Admin could do stops working.
-- ---------------------------------------------------------------------------
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.current_user_role() in ('ADMIN', 'SUPER_ADMIN');
$$;

-- New: the narrower predicate for the four surfaces a plain Admin no longer
-- reaches (Accounts, Reports, Marketing, Settings). Not used by RLS — those
-- four are ordinary tables/views an Admin already has row access to; the
-- restriction lives in the application layer (requireSuperAdmin,
-- requirePageRole('SUPER_ADMIN')), matching how Accounts/Reports/Marketing
-- were already app-layer-gated rather than RLS-gated before this change.
create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.current_user_role() = 'SUPER_ADMIN';
$$;

grant execute on function app.is_super_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lead assignment: a Super Admin may also be assigned lead ownership, the
-- same way an Admin already could (§8.1 step 6, §7.1 unchanged otherwise).
-- ---------------------------------------------------------------------------
create or replace function public.assign_lead(
  p_lead_id uuid,
  p_to_user_id uuid,
  p_reason text default null
)
returns public.leads
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lead   public.leads;
  v_from   uuid;
  v_target public.profiles;
begin
  if not app.is_admin() then
    raise exception 'Only an Admin may assign or reassign leads'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  select * into v_target from public.profiles where id = p_to_user_id;
  if not found or not v_target.is_active then
    raise exception 'Assignee is not an active user' using errcode = 'check_violation';
  end if;

  if v_target.role not in ('BDM', 'ADMIN', 'SUPER_ADMIN') then
    raise exception 'Leads may only be assigned to a BDM' using errcode = 'check_violation';
  end if;

  v_from := v_lead.assigned_bdm_id;

  if v_from is not distinct from p_to_user_id then
    return v_lead;
  end if;

  update public.leads
     set assigned_bdm_id = p_to_user_id,
         status = case when status in ('NEW', 'UNASSIGNED') then 'ASSIGNED'::public.lead_status
                       else status end,
         last_activity_at = now()
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_assignment_history (lead_id, from_user_id, to_user_id, reason, changed_by)
  values (p_lead_id, v_from, p_to_user_id, p_reason, auth.uid());

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    p_lead_id,
    'ASSIGNMENT',
    coalesce(p_reason, 'Lead assigned to ' || v_target.full_name),
    auth.uid()
  );

  return v_lead;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin-only lead purge (§ admin_lead_purge_otp): a Super Admin may also
-- purge, same as Admin already could.
-- ---------------------------------------------------------------------------
create or replace function public.purge_leads_for_verified_challenge(
  p_challenge_id uuid,
  p_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_ids uuid[];
  v_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_user_id and role in ('ADMIN', 'SUPER_ADMIN') and is_active
  ) then
    raise exception 'Active Admin required';
  end if;

  select lead_ids into v_lead_ids
  from public.lead_purge_challenges
  where id = p_challenge_id
    and admin_user_id = p_actor_user_id
    and verified_at is not null
    and consumed_at is null
    and expires_at > now()
  for update;

  if v_lead_ids is null then
    raise exception 'Invalid or expired purge verification';
  end if;

  -- Break the design project/version reference cycle before cascading the
  -- complete lead graph. Execution rows disappear through their lead FK.
  update public.design_projects
  set approved_version_id = null
  where lead_id = any(v_lead_ids);

  delete from public.leads where id = any(v_lead_ids);
  get diagnostics v_count = row_count;

  update public.lead_purge_challenges
  set consumed_at = now()
  where id = p_challenge_id;

  insert into public.audit_logs(
    actor_user_id, action, entity_type, before_data, after_data
  ) values (
    p_actor_user_id,
    'LEADS_PERMANENTLY_DELETED',
    'lead_batch',
    jsonb_build_object('lead_ids', to_jsonb(v_lead_ids)),
    jsonb_build_object('deleted_count', v_count, 'otp_verified', true)
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard/report KPI functions: each already gates the whole call on
-- `app.is_admin()` (now ADMIN-or-SUPER_ADMIN, handled above with no further
-- edit needed here). Only their internal "which profiles count as a sales
-- member" / "which profiles count as a designer" filters are updated, so a
-- Super Admin who also carries lead or design work is counted alongside
-- Admin, and the designer breakdown reads LANDSCAPER instead of the retired
-- DESIGNER label.
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard_sales_member_kpis(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid dashboard date range.' using errcode = '22023';
  end if;

  with range_leads as (
    select lead.id, lead.assigned_bdm_id
    from public.leads lead
    where lead.created_at >= p_from and lead.created_at < p_to
  ),
  latest_outcomes as (
    select distinct on (activity.lead_id)
      activity.lead_id,
      activity.outcome
    from public.activities activity
    join range_leads lead on lead.id = activity.lead_id
    where activity.type = 'CALL_OUTCOME'
      and activity.outcome is not null
      and activity.activity_at >= p_from
      and activity.activity_at < p_to
    order by activity.lead_id, activity.activity_at desc, activity.created_at desc, activity.id desc
  ),
  members as (
    select
      profile.id,
      profile.full_name as name,
      count(lead.id)::integer as assigned,
      count(outcome.lead_id)::integer as contacted,
      count(lead.id) filter (where outcome.lead_id is null)::integer as uncontacted,
      count(lead.id) filter (where outcome.outcome = 'INTERESTED')::integer as interested,
      count(lead.id) filter (where outcome.outcome = 'NOT_INTERESTED')::integer as not_interested,
      count(lead.id) filter (where outcome.outcome = 'INVALID_NUMBER')::integer as invalid
    from public.profiles profile
    left join range_leads lead on lead.assigned_bdm_id = profile.id
    left join latest_outcomes outcome on outcome.lead_id = lead.id
    where profile.role in ('ADMIN', 'SUPER_ADMIN', 'BDM') and profile.is_active
    group by profile.id, profile.full_name
  )
  select coalesce(jsonb_agg(to_jsonb(member) order by member.assigned desc, member.name), '[]'::jsonb)
  into v_result
  from members member;

  return v_result;
end;
$$;

create or replace function public.admin_dashboard_operational_kpis(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_today_end timestamptz := v_today_start + interval '1 day';
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid dashboard date range.' using errcode = '22023';
  end if;

  with
  range_leads as (
    select lead.*
    from public.leads lead
    where lead.created_at >= p_from and lead.created_at < p_to
  ),
  range_calls as (
    select activity.lead_id, activity.outcome, activity.activity_at
    from public.activities activity
    where activity.type = 'CALL_OUTCOME'
      and activity.activity_at >= p_from and activity.activity_at < p_to
  ),
  call_flags as (
    select
      lead_id,
      true as contacted,
      bool_or(outcome = 'INTERESTED') as interested,
      bool_or(outcome = 'INVALID_NUMBER') as invalid,
      bool_or(outcome in ('NOT_INTERESTED', 'INVALID_NUMBER', 'NO_ANSWER', 'BUSY', 'SWITCHED_OFF')) as unsuccessful
    from range_calls
    group by lead_id
  ),
  sales_members as (
    select
      profile.id,
      profile.full_name as name,
      count(lead.id) as assigned,
      count(lead.id) filter (where flags.contacted) as contacted,
      count(lead.id) filter (where flags.contacted is not true) as uncontacted,
      count(lead.id) filter (where flags.interested) as interested,
      count(lead.id) filter (where flags.unsuccessful) as not_interested,
      count(lead.id) filter (where flags.invalid) as invalid
    from public.profiles profile
    left join range_leads lead on lead.assigned_bdm_id = profile.id
    left join call_flags flags on flags.lead_id = lead.id
    where profile.role in ('ADMIN', 'SUPER_ADMIN', 'BDM') and profile.is_active
    group by profile.id, profile.full_name
  ),
  phase_days as (
    select day::date
    from generate_series(
      date_trunc('day', p_from at time zone 'Asia/Kolkata'),
      date_trunc('day', (p_to - interval '1 second') at time zone 'Asia/Kolkata'),
      interval '1 day'
    ) day
  ),
  phase_trends as (
    select
      to_char(day.day, 'YYYY-MM-DD') as day,
      (select count(*) from public.leads x where (x.created_at at time zone 'Asia/Kolkata')::date = day.day) as leads,
      (select count(*) from public.activities x where x.type = 'CALL_OUTCOME' and (x.activity_at at time zone 'Asia/Kolkata')::date = day.day) as sales,
      (select count(*) from public.site_visits x where (x.scheduled_start_at at time zone 'Asia/Kolkata')::date = day.day) as site_visits,
      (select count(*) from public.design_projects x where (x.created_at at time zone 'Asia/Kolkata')::date = day.day) as designs,
      (select count(*) from public.follow_ups x where (x.due_at at time zone 'Asia/Kolkata')::date = day.day) as follow_ups,
      (select count(*) from public.execution_projects x where (x.created_at at time zone 'Asia/Kolkata')::date = day.day) as execution
    from phase_days day
  )
  select jsonb_build_object(
    'leads', jsonb_build_object(
      'today', (select count(*) from range_leads where created_at >= v_today_start and created_at < v_today_end),
      'all', (select count(*) from range_leads),
      'not_interested', (select count(*) from range_leads lead join call_flags flags on flags.lead_id = lead.id where flags.unsuccessful),
      'invalid', (select count(*) from range_leads lead join call_flags flags on flags.lead_id = lead.id where flags.invalid),
      'breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('label', status::text, 'count', count) order by count desc)
        from (select status, count(*) as count from range_leads group by status) grouped
      ), '[]'::jsonb)
    ),
    'sales', jsonb_build_object(
      'contacted', (select count(*) from range_leads lead join call_flags flags on flags.lead_id = lead.id where flags.contacted),
      'uncontacted', (select count(*) from range_leads lead left join call_flags flags on flags.lead_id = lead.id where flags.contacted is not true),
      'assigned', (select count(*) from range_leads where assigned_bdm_id is not null),
      'unassigned', (select count(*) from range_leads where assigned_bdm_id is null),
      'members', coalesce((select jsonb_agg(to_jsonb(member) order by member.assigned desc, member.name) from sales_members member), '[]'::jsonb)
    ),
    'site_visits', jsonb_build_object(
      'total', (select count(*) from public.site_visits where scheduled_start_at >= p_from and scheduled_start_at < p_to),
      'today', (select count(*) from public.site_visits where scheduled_start_at >= greatest(p_from, v_today_start) and scheduled_start_at < least(p_to, v_today_end)),
      'completed', (select count(*) from public.site_visits where scheduled_start_at >= p_from and scheduled_start_at < p_to and status = 'COMPLETED'),
      'due', (select count(*) from public.site_visits where scheduled_start_at >= p_from and scheduled_start_at < p_to and status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')),
      'breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('label', status::text, 'count', count) order by count desc)
        from (select status, count(*) as count from public.site_visits where scheduled_start_at >= p_from and scheduled_start_at < p_to group by status) grouped
      ), '[]'::jsonb)
    ),
    'designs', jsonb_build_object(
      'in_process', (select count(*) from public.design_projects where created_at >= p_from and created_at < p_to and status in ('REQUIRED', 'ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUESTED')),
      'completed', (select count(*) from public.design_projects where created_at >= p_from and created_at < p_to and status = 'APPROVED'),
      'overdue', (select count(*) from public.design_projects where created_at >= p_from and created_at < p_to and due_at < v_now and status not in ('APPROVED', 'CANCELLED')),
      'approval_pending', (select count(*) from public.design_projects where created_at >= p_from and created_at < p_to and status = 'READY_FOR_REVIEW'),
      'breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('label', status::text, 'count', count) order by count desc)
        from (select status, count(*) as count from public.design_projects where created_at >= p_from and created_at < p_to group by status) grouped
      ), '[]'::jsonb)
    ),
    'follow_ups', jsonb_build_object(
      'pending', (select count(*) from public.follow_ups where due_at >= p_from and due_at < p_to and status in ('OPEN', 'OVERDUE')),
      'today', (select count(*) from public.follow_ups where due_at >= greatest(p_from, v_today_start) and due_at < least(p_to, v_today_end) and status in ('OPEN', 'OVERDUE')),
      'completed', (select count(*) from public.follow_ups where due_at >= p_from and due_at < p_to and status = 'COMPLETED'),
      'overdue', (select count(*) from public.follow_ups where due_at >= p_from and due_at < p_to and due_at < v_now and status in ('OPEN', 'OVERDUE')),
      'breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('label', status::text, 'count', count) order by count desc)
        from (select status, count(*) as count from public.follow_ups where due_at >= p_from and due_at < p_to group by status) grouped
      ), '[]'::jsonb)
    ),
    'execution', jsonb_build_object(
      'in_progress', (select count(*) from public.execution_projects where created_at >= p_from and created_at < p_to and status in ('NOT_STARTED', 'ASSIGNED', 'IN_PROGRESS')),
      'completed', (select count(*) from public.execution_projects where created_at >= p_from and created_at < p_to and status = 'COMPLETED'),
      'blocked', (select count(*) from public.execution_projects where created_at >= p_from and created_at < p_to and status = 'BLOCKED'),
      'overdue', (select count(*) from public.execution_projects where created_at >= p_from and created_at < p_to and due_at < v_now and status not in ('COMPLETED', 'CANCELLED')),
      'breakdown', coalesce((
        select jsonb_agg(jsonb_build_object('label', status::text, 'count', count) order by count desc)
        from (select status, count(*) as count from public.execution_projects where created_at >= p_from and created_at < p_to group by status) grouped
      ), '[]'::jsonb)
    ),
    'trends', coalesce((select jsonb_agg(to_jsonb(trend) order by trend.day) from phase_trends trend), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_sales_member_daily_kpis(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Sales analytics are Admin-only.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Invalid analytics date range.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role in ('ADMIN', 'SUPER_ADMIN', 'BDM')
  ) then
    raise exception 'Sales member not found.' using errcode = '22023';
  end if;

  with outcomes(label, sort_order) as (
    values
      ('INTERESTED'::public.call_outcome, 10),
      ('NOT_INTERESTED'::public.call_outcome, 20),
      ('CONNECTED'::public.call_outcome, 30),
      ('NO_ANSWER'::public.call_outcome, 40),
      ('BUSY'::public.call_outcome, 50),
      ('SWITCHED_OFF'::public.call_outcome, 60),
      ('INVALID_NUMBER'::public.call_outcome, 70)
  ),
  days(day) as (
    select generated::date
    from generate_series(
      date_trunc('day', p_from at time zone 'Asia/Kolkata'),
      date_trunc('day', (p_to - interval '1 second') at time zone 'Asia/Kolkata'),
      interval '1 day'
    ) generated
  ),
  daily_latest as (
    select distinct on (
      activity.lead_id,
      (activity.activity_at at time zone 'Asia/Kolkata')::date
    )
      activity.lead_id,
      (activity.activity_at at time zone 'Asia/Kolkata')::date as day,
      activity.outcome
    from public.activities activity
    join public.leads lead on lead.id = activity.lead_id
    where lead.assigned_bdm_id = p_user_id
      and activity.type = 'CALL_OUTCOME'
      and activity.outcome in (
        'INTERESTED', 'NOT_INTERESTED', 'CONNECTED', 'NO_ANSWER',
        'BUSY', 'SWITCHED_OFF', 'INVALID_NUMBER'
      )
      and activity.activity_at >= p_from
      and activity.activity_at < p_to
    order by
      activity.lead_id,
      (activity.activity_at at time zone 'Asia/Kolkata')::date,
      activity.activity_at desc,
      activity.created_at desc,
      activity.id desc
  ),
  counts as (
    select day, outcome, count(*)::integer as count
    from daily_latest
    group by day, outcome
  ),
  daily as (
    select
      to_char(day.day, 'YYYY-MM-DD') as day,
      jsonb_agg(
        jsonb_build_object(
          'label', outcome.label::text,
          'count', coalesce(counts.count, 0)
        ) order by outcome.sort_order
      ) as outcomes
    from days day
    cross join outcomes outcome
    left join counts on counts.day = day.day and counts.outcome = outcome.label
    group by day.day
  )
  select jsonb_build_object(
    'days', coalesce(jsonb_agg(to_jsonb(daily_row) order by daily_row.day), '[]'::jsonb)
  ) into v_result
  from daily daily_row;

  return v_result;
end;
$$;

create or replace function public.admin_dashboard_followup_member_kpis(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid dashboard date range.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(member) order by member.total desc, member.overdue desc, member.name), '[]'::jsonb)
  into v_result
  from (
    select
      profile.id,
      profile.full_name as name,
      count(follow_up.id)::integer as total,
      count(follow_up.id) filter (
        where follow_up.status in ('OPEN', 'OVERDUE') and follow_up.due_at < v_now
      )::integer as overdue,
      count(follow_up.id) filter (
        where follow_up.status in ('OPEN', 'OVERDUE')
      )::integer as pending,
      count(follow_up.id) filter (where follow_up.status = 'COMPLETED')::integer as completed
    from public.profiles profile
    left join public.follow_ups follow_up
      on follow_up.assigned_to = profile.id
      and follow_up.due_at >= p_from
      and follow_up.due_at < p_to
    where profile.role in ('ADMIN', 'SUPER_ADMIN', 'BDM') and profile.is_active
    group by profile.id, profile.full_name
  ) member;

  return v_result;
end;
$$;

create or replace function public.admin_dashboard_designer_kpis(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not app.is_admin() then raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Invalid dashboard date range.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(member) order by member.pending desc, member.completed desc, member.name), '[]'::jsonb)
  into v_result
  from (
    select profile.id, profile.full_name as name,
      count(project.id)::integer as total,
      count(project.id) filter (where project.status not in ('APPROVED', 'CANCELLED'))::integer as pending,
      count(project.id) filter (where project.status = 'APPROVED')::integer as completed
    from public.profiles profile
    left join public.design_projects project
      on project.assigned_designer_id = profile.id
      and project.created_at >= p_from and project.created_at < p_to
    where profile.role = 'LANDSCAPER' and profile.is_active
    group by profile.id, profile.full_name
  ) member;
  return v_result;
end; $$;
