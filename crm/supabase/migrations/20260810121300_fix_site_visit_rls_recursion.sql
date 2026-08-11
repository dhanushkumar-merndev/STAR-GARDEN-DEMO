-- Break the site_visits <-> site_visit_attendees RLS recursion.
--
-- The original site_visits policies queried site_visit_attendees directly,
-- while the attendee policies queried site_visits. PostgreSQL expands both
-- policies before evaluating their OR branches, causing every site-visit read
-- to fail with "infinite recursion detected in policy" (including for Admins).
-- This small SECURITY DEFINER predicate performs only the attendee membership
-- lookup and keeps the original authorization semantics intact.
create or replace function app.is_site_visit_attendee(p_site_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and exists (
    select 1
    from public.site_visit_attendees attendee
    where attendee.site_visit_id = p_site_visit_id
      and attendee.user_id = auth.uid()
  );
$$;

revoke all on function app.is_site_visit_attendee(uuid) from public;
grant execute on function app.is_site_visit_attendee(uuid) to authenticated, service_role;

drop policy if exists site_visits_select on public.site_visits;
create policy site_visits_select on public.site_visits
  for select to authenticated
  using (
    app.can_read_lead(lead_id)
    or app.is_site_visit_attendee(id)
  );

drop policy if exists site_visits_update on public.site_visits;
create policy site_visits_update on public.site_visits
  for update to authenticated
  using (
    app.can_write_lead(lead_id)
    or app.is_site_visit_attendee(id)
  )
  with check (
    app.can_write_lead(lead_id)
    or app.is_site_visit_attendee(id)
  );
