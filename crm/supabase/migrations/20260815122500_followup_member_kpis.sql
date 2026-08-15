-- Date-range-aware follow-up workload per active Admin/BDM.
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
    where profile.role in ('ADMIN', 'BDM') and profile.is_active
    group by profile.id, profile.full_name
  ) member;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_followup_member_kpis(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_followup_member_kpis(timestamptz, timestamptz) to authenticated;

