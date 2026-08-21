-- Corrects 20260821100000, which went too far.
--
-- That migration inlined the whole of `app.can_read_lead` and friends into the
-- policies. Two things broke:
--
--   1. `site_visits_select` inlined a `site_visit_attendees` lookup. That
--      table's own policy queries `public.site_visits`, so the inline version
--      reintroduces the "infinite recursion detected in policy" failure that
--      20260810121300 added `app.is_site_visit_attendee` to avoid.
--   2. The same branch lost its `app.is_active_user()` gate, which
--      `is_site_visit_attendee` applies internally. A deactivated attendee
--      would have regained read access to their visits, against §15.
--
-- There was also a subtler hazard: the inlined EXISTS subqueries run as the
-- invoking user, so they pick up RLS on `design_projects` / `execution_projects`,
-- whereas the SECURITY DEFINER helpers deliberately bypass it.
--
-- So keep the helpers as the authority on *who may read what*, and use the
-- rewrite only for the part that was actually the performance problem: hoisting
-- the session-scoped checks out of the per-row path.
--
-- Each policy below is now:
--
--   (select app.is_active_user())            -- InitPlan, once per query
--   and ( (select app.is_admin())            -- InitPlan, once per query
--         or <row's own indexed column>      -- no function call, no subquery
--         or <original SECURITY DEFINER helper> )
--
-- An Admin short-circuits on the second InitPlan, so the policy costs nothing
-- per row — that is the 10k-lead case that was timing out. A BDM matches on an
-- indexed column already in hand. Only the rarer designer / execution-staff
-- paths reach the helper, and it keeps the original semantics exactly, since
-- every added branch is a strict subset of what the helper already allowed.

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or assigned_bdm_id = (select auth.uid())
      or app.can_read_lead(id)
    )
  );

-- ---------------------------------------------------------------------------
-- follow_ups
--
-- The `assigned_to` branch is deliberately left outside the is_active_user
-- gate, because that is where the original policy had it.
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
        or app.can_read_lead(lead_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- site_visits — attendee check goes back through the SECURITY DEFINER helper.
-- ---------------------------------------------------------------------------
drop policy if exists site_visits_select on public.site_visits;
create policy site_visits_select on public.site_visits
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_lead(lead_id)
      or app.is_site_visit_attendee(id)
    )
  );

-- ---------------------------------------------------------------------------
-- design_projects
-- ---------------------------------------------------------------------------
drop policy if exists design_projects_select on public.design_projects;
create policy design_projects_select on public.design_projects
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or assigned_designer_id = (select auth.uid())
      or app.can_read_design_project(id)
    )
  );

-- ---------------------------------------------------------------------------
-- execution_projects
-- ---------------------------------------------------------------------------
drop policy if exists execution_projects_select on public.execution_projects;
create policy execution_projects_select on public.execution_projects
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.is_admin())
      or app.can_read_execution_project(id)
    )
  );
