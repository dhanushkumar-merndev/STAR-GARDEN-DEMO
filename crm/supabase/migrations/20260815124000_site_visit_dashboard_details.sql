-- Admin Site visits dashboard: exact card scopes plus today's active visit list.
create or replace function public.admin_dashboard_site_visit_details(
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

  with range_visits as (
    select visit.*
    from public.site_visits visit
    where visit.scheduled_start_at >= p_from and visit.scheduled_start_at < p_to
  ),
  active_today as (
    select
      visit.id,
      visit.lead_id,
      lead.customer_name,
      visit.scheduled_start_at,
      visit.status::text,
      visit.address
    from public.site_visits visit
    join public.leads lead on lead.id = visit.lead_id
    where visit.scheduled_start_at >= v_today_start
      and visit.scheduled_start_at < v_today_end
      and visit.status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
    order by visit.scheduled_start_at
    limit 10
  )
  select jsonb_build_object(
    'total', (select count(*) from range_visits),
    'today', (select count(*) from range_visits where scheduled_start_at >= v_today_start and scheduled_start_at < v_today_end),
    'upcoming', (select count(*) from range_visits where scheduled_start_at >= v_now and status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')),
    'overdue', (select count(*) from range_visits where scheduled_start_at < v_now and status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')),
    'completed', (select count(*) from range_visits where status = 'COMPLETED'),
    'scheduled', (select count(*) from range_visits where status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')),
    'today_active', coalesce((select jsonb_agg(to_jsonb(active)) from active_today active), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_site_visit_details(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_site_visit_details(timestamptz, timestamptz) to authenticated;

