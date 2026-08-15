-- Individual manual call-outcome counts for the Admin KPI detail modal.
-- The range is applied to the activity timestamp, not the lead creation date.
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

  with outcomes(label, sort_order) as (
    values
      ('INTERESTED'::public.call_outcome, 10),
      ('NOT_INTERESTED'::public.call_outcome, 20),
      ('CONNECTED'::public.call_outcome, 30),
      ('NO_ANSWER'::public.call_outcome, 40),
      ('BUSY'::public.call_outcome, 50),
      ('SWITCHED_OFF'::public.call_outcome, 60),
      ('INVALID_NUMBER'::public.call_outcome, 70),
      ('CALL_LATER'::public.call_outcome, 80)
  ), counts as (
    select activity.outcome, count(*)::integer as count
    from public.activities activity
    where activity.type = 'CALL_OUTCOME'
      and activity.activity_at >= p_from
      and activity.activity_at < p_to
      and activity.outcome is not null
    group by activity.outcome
  )
  select jsonb_agg(
    jsonb_build_object('label', outcome.label::text, 'count', coalesce(counts.count, 0))
    order by outcome.sort_order
  )
  into v_result
  from outcomes outcome
  left join counts on counts.outcome = outcome.label;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_dashboard_call_outcome_kpis(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_call_outcome_kpis(timestamptz, timestamptz) to authenticated;

comment on function public.admin_dashboard_call_outcome_kpis(timestamptz, timestamptz) is
  'Admin-only counts for every manual call outcome in the selected activity date range.';
