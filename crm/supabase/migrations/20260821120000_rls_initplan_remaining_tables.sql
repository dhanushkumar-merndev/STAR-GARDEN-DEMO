-- Extends the InitPlan fix from 20260821110000 to the rest of the read paths.
--
-- Same defect, same shape: a SELECT policy calling a `security definer` helper,
-- which Postgres will not inline, so it runs once per row. Each call costs at
-- least one `profiles` lookup (via `app.is_active_user()` / `app.is_admin()`),
-- and `count: 'exact'` has to visit every matching row.
--
-- The worst of these is `audit_logs`: its policy is a bare `app.is_admin()`,
-- and `listAuditLog` (server/services/reports.ts) runs an unfiltered
-- `count: 'exact'` over the whole table. That table is append-only and grows
-- without bound, so it was on course to fail exactly the way /leads did.
--
-- Same rewrite as before, and for the same reason:
--
--   (select app.is_active_user())     -- InitPlan, evaluated once per query
--   and ( (select app.is_admin())     -- InitPlan, evaluated once per query
--         or <original helper> )
--
-- Semantics are unchanged. Every helper here already begins with
-- `app.is_active_user() and (app.is_admin() or ...)`, so hoisting those two
-- checks out in front is a rewrite of the evaluation order, not the predicate.
-- The helper stays authoritative for the non-Admin branches, which keeps its
-- SECURITY DEFINER RLS-bypass intact — the hazard noted in 20260821110000.

-- ---------------------------------------------------------------------------
-- audit_logs / meta_webhook_events — Admin-only, so the InitPlan is the whole
-- predicate. This turns one `profiles` lookup per row into one per query.
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select app.is_admin()));

drop policy if exists meta_webhook_events_select_admin on public.meta_webhook_events;
create policy meta_webhook_events_select_admin on public.meta_webhook_events
  for select to authenticated
  using ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- activities — grows per action rather than per lead, so it outruns `leads`.
-- ---------------------------------------------------------------------------
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_lead(lead_id)
    )
  );

-- ---------------------------------------------------------------------------
-- lead_assignment_history
-- ---------------------------------------------------------------------------
drop policy if exists lead_assignment_history_select on public.lead_assignment_history;
create policy lead_assignment_history_select on public.lead_assignment_history
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_lead(lead_id)
    )
  );

-- ---------------------------------------------------------------------------
-- design_versions
-- ---------------------------------------------------------------------------
drop policy if exists design_versions_select on public.design_versions;
create policy design_versions_select on public.design_versions
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_design_project(design_project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- execution_tasks
-- ---------------------------------------------------------------------------
drop policy if exists execution_tasks_select on public.execution_tasks;
create policy execution_tasks_select on public.execution_tasks
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_execution_project(execution_project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- files
--
-- `can_read_file` fans out across five parent types, so it is the most
-- expensive helper of the set — and the one that benefits most from an Admin
-- never reaching it.
-- ---------------------------------------------------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_file(id)
    )
  );

-- ---------------------------------------------------------------------------
-- Configuration tables — read by every authenticated page, so the per-row
-- `profiles` lookup was pure overhead on every request.
-- ---------------------------------------------------------------------------
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists config_options_select on public.config_options;
create policy config_options_select on public.config_options
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists execution_task_templates_select on public.execution_task_templates;
create policy execution_task_templates_select on public.execution_task_templates
  for select to authenticated
  using ((select app.is_active_user()));

-- ---------------------------------------------------------------------------
-- Supporting index for the audit log's default ordering, which pages over the
-- whole table newest-first.
-- ---------------------------------------------------------------------------
create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists activities_lead_created_idx
  on public.activities (lead_id, created_at desc);
