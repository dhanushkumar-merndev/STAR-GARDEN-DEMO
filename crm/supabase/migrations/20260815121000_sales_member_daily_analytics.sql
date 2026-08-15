-- Admin drill-down: mutually exclusive latest outcome per lead per IST day for
-- one sales member. Returned as a dense date series for line charts.
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
    where id = p_user_id and role in ('ADMIN', 'BDM')
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

revoke all on function public.admin_sales_member_daily_kpis(uuid, timestamptz, timestamptz) from public;
grant execute on function public.admin_sales_member_daily_kpis(uuid, timestamptz, timestamptz) to authenticated;

