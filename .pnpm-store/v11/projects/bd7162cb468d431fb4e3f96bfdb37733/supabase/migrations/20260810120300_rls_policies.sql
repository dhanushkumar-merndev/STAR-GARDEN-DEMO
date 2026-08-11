-- ===========================================================================
-- Star Gardens CRM — 04. Row Level Security
--
-- AGENTS.md §7.5 / §15: RLS is the *second* enforcement layer. Every server
-- action also re-checks authorization. Neither layer is allowed to be the only
-- one. Anonymous callers get nothing here; the public enquiry form reaches the
-- database only through a server-verified service-role path (§11.8).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Baseline grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'leads', 'lead_assignment_history', 'activities', 'follow_ups',
    'site_visits', 'site_visit_attendees', 'design_projects', 'design_versions',
    'execution_projects', 'execution_assignees', 'execution_tasks',
    'files', 'file_access_logs', 'notifications', 'audit_logs',
    'meta_webhook_events', 'app_settings', 'config_options',
    'execution_task_templates', 'rate_limit_hits'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ===========================================================================
-- profiles
-- ===========================================================================

-- Staff need to see each other's names for assignment pickers and attendee
-- lists. Own row is always readable so a deactivated user still resolves.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or app.is_active_user());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (app.is_admin());

-- Self-service edits are allowed; the trigger below stops anyone but an Admin
-- from escalating their own role or reactivating themselves.
create policy profiles_update on public.profiles
  for update to authenticated
  using (app.is_admin() or id = auth.uid())
  with check (app.is_admin() or id = auth.uid());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (app.is_admin());

create or replace function app.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    raise exception 'only an Admin may change role or activation state'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger guard_profile_privilege_change
  before update on public.profiles
  for each row execute function app.guard_profile_privilege_change();

-- ===========================================================================
-- leads
-- ===========================================================================

create policy leads_select on public.leads
  for select to authenticated
  using (app.can_read_lead(id));

-- A BDM may create a lead but only owning it themselves or leaving it
-- unassigned; only an Admin may create a lead on someone else's behalf (§7.2).
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    app.is_admin()
    or (
      app.current_user_role() = 'BDM'
      and (assigned_bdm_id is null or assigned_bdm_id = auth.uid())
    )
  );

create policy leads_update on public.leads
  for update to authenticated
  using (app.can_write_lead(id))
  with check (app.can_write_lead(id) or app.is_admin());

create policy leads_delete_admin on public.leads
  for delete to authenticated
  using (app.is_admin());

-- ===========================================================================
-- lead_assignment_history — append-only
-- ===========================================================================

create policy lead_assignment_history_select on public.lead_assignment_history
  for select to authenticated
  using (app.can_read_lead(lead_id));

create policy lead_assignment_history_insert on public.lead_assignment_history
  for insert to authenticated
  with check (app.is_admin() or app.can_write_lead(lead_id));

-- ===========================================================================
-- activities — the timeline is append-only for normal users (§17)
-- ===========================================================================

create policy activities_select on public.activities
  for select to authenticated
  using (app.can_read_lead(lead_id));

create policy activities_insert on public.activities
  for insert to authenticated
  with check (app.can_read_lead(lead_id) and created_by = auth.uid());

create policy activities_update_admin on public.activities
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy activities_delete_admin on public.activities
  for delete to authenticated
  using (app.is_admin());

-- ===========================================================================
-- follow_ups
-- ===========================================================================

create policy follow_ups_select on public.follow_ups
  for select to authenticated
  using (app.can_read_lead(lead_id) or assigned_to = auth.uid());

create policy follow_ups_insert on public.follow_ups
  for insert to authenticated
  with check (app.can_write_lead(lead_id));

create policy follow_ups_update on public.follow_ups
  for update to authenticated
  using (app.can_write_lead(lead_id) or assigned_to = auth.uid())
  with check (app.can_write_lead(lead_id) or assigned_to = auth.uid());

create policy follow_ups_delete_admin on public.follow_ups
  for delete to authenticated
  using (app.is_admin());

-- ===========================================================================
-- site_visits
-- ===========================================================================

create policy site_visits_select on public.site_visits
  for select to authenticated
  using (
    app.can_read_lead(lead_id)
    or exists (
      select 1 from public.site_visit_attendees a
      where a.site_visit_id = id and a.user_id = auth.uid()
    )
  );

create policy site_visits_insert on public.site_visits
  for insert to authenticated
  with check (app.can_write_lead(lead_id));

-- Attendees (including an invited Designer) may check in/out and add notes.
create policy site_visits_update on public.site_visits
  for update to authenticated
  using (
    app.can_write_lead(lead_id)
    or exists (
      select 1 from public.site_visit_attendees a
      where a.site_visit_id = id and a.user_id = auth.uid()
    )
  )
  with check (
    app.can_write_lead(lead_id)
    or exists (
      select 1 from public.site_visit_attendees a
      where a.site_visit_id = id and a.user_id = auth.uid()
    )
  );

create policy site_visits_delete_admin on public.site_visits
  for delete to authenticated
  using (app.is_admin());

create policy site_visit_attendees_select on public.site_visit_attendees
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id and app.can_read_lead(sv.lead_id)
    )
  );

create policy site_visit_attendees_write on public.site_visit_attendees
  for all to authenticated
  using (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id and app.can_write_lead(sv.lead_id)
    )
  )
  with check (
    exists (
      select 1 from public.site_visits sv
      where sv.id = site_visit_id and app.can_write_lead(sv.lead_id)
    )
  );

-- ===========================================================================
-- design_projects / design_versions
-- ===========================================================================

create policy design_projects_select on public.design_projects
  for select to authenticated
  using (app.can_read_design_project(id));

create policy design_projects_insert on public.design_projects
  for insert to authenticated
  with check (app.is_admin() or app.can_write_lead(lead_id));

-- The assigned designer may move the project through IN_PROGRESS /
-- READY_FOR_REVIEW; approval itself is gated in the service layer (§8.4).
create policy design_projects_update on public.design_projects
  for update to authenticated
  using (app.can_read_design_project(id))
  with check (app.can_read_design_project(id));

create policy design_projects_delete_admin on public.design_projects
  for delete to authenticated
  using (app.is_admin());

create policy design_versions_select on public.design_versions
  for select to authenticated
  using (app.can_read_design_project(design_project_id));

-- Only the assigned designer (or an Admin) may add a version.
create policy design_versions_insert on public.design_versions
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      app.is_admin()
      or exists (
        select 1 from public.design_projects dp
        where dp.id = design_project_id
          and dp.assigned_designer_id = auth.uid()
          and dp.status not in ('APPROVED', 'CANCELLED')
      )
    )
  );

create policy design_versions_update on public.design_versions
  for update to authenticated
  using (app.can_read_design_project(design_project_id))
  with check (app.can_read_design_project(design_project_id));

-- No DELETE policy: design history cannot be destroyed (§18).

-- ===========================================================================
-- execution_projects / assignees / tasks
-- ===========================================================================

create policy execution_projects_select on public.execution_projects
  for select to authenticated
  using (app.can_read_execution_project(id));

create policy execution_projects_insert on public.execution_projects
  for insert to authenticated
  with check (app.is_admin() or app.can_write_lead(lead_id));

create policy execution_projects_update on public.execution_projects
  for update to authenticated
  using (app.can_read_execution_project(id))
  with check (app.can_read_execution_project(id));

create policy execution_projects_delete_admin on public.execution_projects
  for delete to authenticated
  using (app.is_admin());

create policy execution_assignees_select on public.execution_assignees
  for select to authenticated
  using (user_id = auth.uid() or app.can_read_execution_project(execution_project_id));

create policy execution_assignees_write on public.execution_assignees
  for all to authenticated
  using (
    app.is_admin()
    or exists (
      select 1 from public.execution_projects ep
      where ep.id = execution_project_id and app.can_write_lead(ep.lead_id)
    )
  )
  with check (
    app.is_admin()
    or exists (
      select 1 from public.execution_projects ep
      where ep.id = execution_project_id and app.can_write_lead(ep.lead_id)
    )
  );

create policy execution_tasks_select on public.execution_tasks
  for select to authenticated
  using (app.can_read_execution_project(execution_project_id));

create policy execution_tasks_insert on public.execution_tasks
  for insert to authenticated
  with check (app.can_read_execution_project(execution_project_id));

create policy execution_tasks_update on public.execution_tasks
  for update to authenticated
  using (app.can_read_execution_project(execution_project_id))
  with check (app.can_read_execution_project(execution_project_id));

create policy execution_tasks_delete on public.execution_tasks
  for delete to authenticated
  using (app.is_admin());

-- ===========================================================================
-- files / file_access_logs
-- ===========================================================================

create policy files_select on public.files
  for select to authenticated
  using (app.can_read_file(id));

-- Inserted by the finalize endpoint after the server has already verified the
-- upload. The predicate re-derives permission from the parent record so a
-- forged parent id cannot smuggle a file into someone else's lead (§4.4).
create policy files_insert on public.files
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      (lead_id is not null and app.can_read_lead(lead_id))
      or (site_visit_id is not null and exists (
            select 1 from public.site_visits sv
            where sv.id = site_visit_id and app.can_read_lead(sv.lead_id)
          ))
      or (design_project_id is not null and app.can_read_design_project(design_project_id))
      or (execution_project_id is not null and app.can_read_execution_project(execution_project_id))
      or (execution_task_id is not null and exists (
            select 1 from public.execution_tasks et
            where et.id = execution_task_id
              and app.can_read_execution_project(et.execution_project_id)
          ))
    )
  );

-- Archive (soft delete) only. Admins archive anything; uploaders may archive
-- their own non-design uploads.
create policy files_update on public.files
  for update to authenticated
  using (app.is_admin() or (uploaded_by = auth.uid() and category <> 'DESIGN_VERSION'))
  with check (app.is_admin() or (uploaded_by = auth.uid() and category <> 'DESIGN_VERSION'));

create policy files_delete_admin on public.files
  for delete to authenticated
  using (app.is_admin());

create policy file_access_logs_select on public.file_access_logs
  for select to authenticated
  using (app.is_admin() or user_id = auth.uid());

create policy file_access_logs_insert on public.file_access_logs
  for insert to authenticated
  with check (user_id = auth.uid() and app.can_read_file(file_id));

-- ===========================================================================
-- notifications — a user sees only their own
-- ===========================================================================

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT policy: notifications are system-generated. The notification
-- service writes them with the service-role client *after* the calling action
-- has passed its own authorization check (§7.5).

-- ===========================================================================
-- audit_logs — Admin-readable, append-only, never client-written
-- ===========================================================================

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (app.is_admin());

-- ===========================================================================
-- meta_webhook_events — Admin visibility for the integration status screen
-- ===========================================================================

create policy meta_webhook_events_select_admin on public.meta_webhook_events
  for select to authenticated
  using (app.is_admin());

-- ===========================================================================
-- Configuration tables — readable by all active staff, writable by Admin
-- ===========================================================================

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (app.is_active_user());

create policy app_settings_write_admin on public.app_settings
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy config_options_select on public.config_options
  for select to authenticated
  using (app.is_active_user());

create policy config_options_write_admin on public.config_options
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy execution_task_templates_select on public.execution_task_templates
  for select to authenticated
  using (app.is_active_user());

create policy execution_task_templates_write_admin on public.execution_task_templates
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- rate_limit_hits: RLS enabled with no policies at all. Only service_role,
-- which bypasses RLS, may touch it.
