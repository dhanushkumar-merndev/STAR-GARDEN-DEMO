-- Extend the call-outcome KPI RPC with one daily series per visible outcome.
-- CALL_LATER is intentionally omitted because it is represented by Follow-ups.
create or replace function public.admin_dashboard_call_outcome_kpis(
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

  with
  outcomes(label, sort_order) as (
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
  activity_counts as (
    select
      (activity.activity_at at time zone 'Asia/Kolkata')::date as day,
      activity.outcome,
      count(*)::integer as count
    from public.activities activity
    where activity.type = 'CALL_OUTCOME'
      and activity.activity_at >= p_from
      and activity.activity_at < p_to
      and activity.outcome is not null
    group by 1, activity.outcome
  ),
  totals as (
    select
      outcome.label,
      outcome.sort_order,
      coalesce(sum(activity_counts.count), 0)::integer as count
    from outcomes outcome
    left join activity_counts on activity_counts.outcome = outcome.label
    group by outcome.label, outcome.sort_order
  ),
  daily as (
    select
      to_char(day.day, 'YYYY-MM-DD') as day,
      jsonb_agg(
        jsonb_build_object(
          'label', outcome.label::text,
          'count', coalesce(activity_counts.count, 0)
        ) order by outcome.sort_order
      ) as outcomes
    from days day
    cross join outcomes outcome
    left join activity_counts
      on activity_counts.day = day.day and activity_counts.outcome = outcome.label
    group by day.day
  )
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_agg(
        jsonb_build_object('label', total.label::text, 'count', total.count)
        order by total.sort_order
      ) from totals total
    ), '[]'::jsonb),
    'trends', coalesce((
      select jsonb_agg(to_jsonb(daily_row) order by daily_row.day)
      from daily daily_row
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_dashboard_call_outcome_kpis(timestamptz, timestamptz) is
  'Admin-only totals and daily trends for seven visible manual call outcomes; Call later belongs to Follow-ups.';
