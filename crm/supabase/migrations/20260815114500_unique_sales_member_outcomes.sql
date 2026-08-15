-- Sales-member outcome columns must be mutually exclusive: one lead contributes
-- only its latest manual outcome in the selected range.
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
    where profile.role in ('ADMIN', 'BDM') and profile.is_active
    group by profile.id, profile.full_name
  )
  select coalesce(jsonb_agg(to_jsonb(member) order by member.assigned desc, member.name), '[]'::jsonb)
  into v_result
  from members member;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_sales_member_kpis(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_sales_member_kpis(timestamptz, timestamptz) to authenticated;

