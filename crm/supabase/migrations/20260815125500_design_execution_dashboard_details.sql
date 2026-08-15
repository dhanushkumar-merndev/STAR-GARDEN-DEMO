-- Admin dashboard drill-downs for designer workload and execution projects.
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
    where profile.role = 'DESIGNER' and profile.is_active
    group by profile.id, profile.full_name
  ) member;
  return v_result;
end; $$;

revoke all on function public.admin_dashboard_designer_kpis(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_designer_kpis(timestamptz, timestamptz) to authenticated;

create or replace function public.admin_dashboard_execution_details(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  if not app.is_admin() then raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Invalid dashboard date range.' using errcode = '22023'; end if;
  with range_projects as (
    select project.* from public.execution_projects project
    where project.created_at >= p_from and project.created_at < p_to
  ), projects as (
    select project.id, project.lead_id,
      coalesce(project.title, lead.customer_name, 'Execution project') as title,
      lead.customer_name, project.status::text, project.progress_percent,
      project.due_at, project.blocker_summary,
      coalesce(string_agg(distinct profile.full_name, ', ' order by profile.full_name), 'Unassigned') as assignees
    from range_projects project
    join public.leads lead on lead.id = project.lead_id
    left join public.execution_assignees assignment on assignment.execution_project_id = project.id
    left join public.profiles profile on profile.id = assignment.user_id
    group by project.id, project.lead_id, project.title, lead.customer_name, project.status,
      project.progress_percent, project.due_at, project.blocker_summary, project.created_at
    order by (project.status = 'COMPLETED'), project.created_at desc
    limit 10
  )
  select jsonb_build_object(
    'assigned', (select count(*) from range_projects where status in ('NOT_STARTED', 'ASSIGNED')),
    'in_progress', (select count(*) from range_projects where status in ('IN_PROGRESS', 'BLOCKED', 'READY_FOR_REVIEW')),
    'completed', (select count(*) from range_projects where status = 'COMPLETED'),
    'projects', coalesce((select jsonb_agg(to_jsonb(project)) from projects project), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

revoke all on function public.admin_dashboard_execution_details(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_execution_details(timestamptz, timestamptz) to authenticated;

