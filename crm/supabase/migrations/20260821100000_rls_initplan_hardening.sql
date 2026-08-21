-- RLS read-path hardening for the list screens.
--
-- Every list page timed out at 8s (Postgres 57014) once the table reached
-- ~10k leads, including queries that fetch a single 25-row page. Pagination
-- was never the problem: `count: 'exact'` and the policy check both have to
-- visit every row the filter matches, and the policy was the expensive part.
--
-- The old policies delegated to `app.can_read_lead(id)` and friends. Those are
-- `security definer`, which means Postgres will NOT inline them — so each was
-- a real function call *per row*, and each call ran `app.is_active_user()` and
-- `app.is_admin()` (two `profiles` lookups) plus up to three correlated
-- EXISTS subqueries. On `leads` it also re-queried `public.leads` by id for a
-- row the scan already had in hand.
--
-- At 10k rows that is ~60k index probes per counting query, and the leads page
-- issued twelve of them concurrently for the stage tabs. Hence 8 seconds.
--
-- The fix is the documented Supabase RLS pattern: inline the predicate into
-- the policy and wrap every session-scoped subexpression in a scalar subquery
-- so the planner hoists it into an InitPlan evaluated once per query instead
-- of once per row. For an Admin `(select app.is_admin())` is then a single
-- lookup that short-circuits the whole OR, so the policy costs nothing per
-- row; for a BDM the first branch is an indexed comparison against a column
-- the scan already holds (`leads_assigned_bdm_idx`).
--
-- Access semantics are unchanged. Each policy below reproduces exactly the
-- predicate its helper function computed; only the evaluation strategy moves.
-- The helper functions themselves are left in place — a dozen other policies
-- and RPCs still call them on single rows, where per-row cost is irrelevant.

-- ---------------------------------------------------------------------------
-- leads — was: app.can_read_lead(id)
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      -- The row's own column, rather than re-selecting from public.leads by
      -- id the way can_read_lead had to.
      or assigned_bdm_id = (select auth.uid())
      or exists (
        select 1 from public.design_projects dp
        where dp.lead_id = leads.id
          and dp.assigned_designer_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.execution_projects ep
        join public.execution_assignees ea on ea.execution_project_id = ep.id
        where ep.lead_id = leads.id
          and ea.user_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- follow_ups — was: app.can_read_lead(lead_id) or assigned_to = auth.uid()
-- ---------------------------------------------------------------------------
drop policy if exists follow_ups_select on public.follow_ups;
create policy follow_ups_select on public.follow_ups
  for select to authenticated
  using (
    assigned_to = (select auth.uid())
    or (
      (select app.is_active_user())
      and (
        (select app.is_admin())
        or exists (
          select 1 from public.leads l
          where l.id = follow_ups.lead_id
            and l.assigned_bdm_id = (select auth.uid())
        )
        or exists (
          select 1 from public.design_projects dp
          where dp.lead_id = follow_ups.lead_id
            and dp.assigned_designer_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.execution_projects ep
          join public.execution_assignees ea on ea.execution_project_id = ep.id
          where ep.lead_id = follow_ups.lead_id
            and ea.user_id = (select auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- site_visits — was: app.can_read_lead(lead_id) or app.is_site_visit_attendee(id)
-- ---------------------------------------------------------------------------
drop policy if exists site_visits_select on public.site_visits;
create policy site_visits_select on public.site_visits
  for select to authenticated
  using (
    exists (
      select 1 from public.site_visit_attendees a
      where a.site_visit_id = site_visits.id
        and a.user_id = (select auth.uid())
    )
    or (
      (select app.is_active_user())
      and (
        (select app.is_admin())
        or exists (
          select 1 from public.leads l
          where l.id = site_visits.lead_id
            and l.assigned_bdm_id = (select auth.uid())
        )
        or exists (
          select 1 from public.design_projects dp
          where dp.lead_id = site_visits.lead_id
            and dp.assigned_designer_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.execution_projects ep
          join public.execution_assignees ea on ea.execution_project_id = ep.id
          where ep.lead_id = site_visits.lead_id
            and ea.user_id = (select auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- design_projects — was: app.can_read_design_project(id)
-- ---------------------------------------------------------------------------
drop policy if exists design_projects_select on public.design_projects;
create policy design_projects_select on public.design_projects
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or assigned_designer_id = (select auth.uid())
      or exists (
        select 1 from public.leads l
        where l.id = design_projects.lead_id
          and l.assigned_bdm_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- execution_projects — was: app.can_read_execution_project(id)
-- ---------------------------------------------------------------------------
drop policy if exists execution_projects_select on public.execution_projects;
create policy execution_projects_select on public.execution_projects
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or exists (
        select 1 from public.execution_assignees ea
        where ea.execution_project_id = execution_projects.id
          and ea.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.leads l
        where l.id = execution_projects.lead_id
          and l.assigned_bdm_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Supporting indexes for the EXISTS branches above.
-- ---------------------------------------------------------------------------
create index if not exists design_projects_lead_designer_idx
  on public.design_projects (lead_id, assigned_designer_id);

create index if not exists execution_projects_lead_idx
  on public.execution_projects (lead_id);

create index if not exists execution_assignees_user_project_idx
  on public.execution_assignees (user_id, execution_project_id);

create index if not exists site_visit_attendees_user_visit_idx
  on public.site_visit_attendees (user_id, site_visit_id);

create index if not exists follow_ups_assigned_to_idx
  on public.follow_ups (assigned_to);
