-- `insert ... returning` on files was denied even when the INSERT policy
-- passed. The SELECT policy called app.can_read_file(id), which re-read the
-- just-inserted row through a separate function snapshot; that row is not
-- visible there until the statement ends. Authorize from the candidate row's
-- parent columns instead, so Postgres can evaluate RETURNING atomically.
create or replace function app.can_read_file_parents(
  p_lead_id uuid,
  p_site_visit_id uuid,
  p_design_project_id uuid,
  p_execution_project_id uuid,
  p_execution_task_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and (
    app.is_admin()
    or (p_lead_id is not null and app.can_read_lead(p_lead_id))
    or (p_site_visit_id is not null and exists (
      select 1
      from public.site_visits visit
      where visit.id = p_site_visit_id
        and (
          app.can_read_lead(visit.lead_id)
          or app.is_site_visit_attendee(visit.id)
        )
    ))
    or (p_design_project_id is not null and app.can_read_design_project(p_design_project_id))
    or (p_execution_project_id is not null and app.can_read_execution_project(p_execution_project_id))
    or (p_execution_task_id is not null and exists (
      select 1
      from public.execution_tasks task
      where task.id = p_execution_task_id
        and app.can_read_execution_project(task.execution_project_id)
    ))
  );
$$;

revoke all on function app.can_read_file_parents(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function app.can_read_file_parents(uuid, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function app.can_read_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.files file
    where file.id = p_file_id
      and app.can_read_file_parents(
        file.lead_id,
        file.site_visit_id,
        file.design_project_id,
        file.execution_project_id,
        file.execution_task_id
      )
  );
$$;

drop policy if exists files_select on public.files;
create policy files_select on public.files
  for select to authenticated
  using (
    app.can_read_file_parents(
      lead_id,
      site_visit_id,
      design_project_id,
      execution_project_id,
      execution_task_id
    )
  );

drop policy if exists files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and app.can_read_file_parents(
      lead_id,
      site_visit_id,
      design_project_id,
      execution_project_id,
      execution_task_id
    )
  );
