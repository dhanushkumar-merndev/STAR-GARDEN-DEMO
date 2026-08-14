-- Date-range-aware operational KPI snapshot for the Admin dashboard.
-- Counts are calculated in PostgreSQL so customer rows never need to be sent
-- to the browser merely to produce analytics.

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
    where profile.role in ('ADMIN', 'BDM') and profile.is_active
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

revoke all on function public.admin_dashboard_operational_kpis(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_operational_kpis(timestamptz, timestamptz) to authenticated;

comment on function public.admin_dashboard_operational_kpis(timestamptz, timestamptz) is
  'Admin-only, date-range-aware operational KPI and trend snapshot.';
