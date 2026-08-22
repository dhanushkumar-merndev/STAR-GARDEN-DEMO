-- Revises `20260822120000_lead_favorites`: the pin (`leads.is_starred`) and
-- the personal star (`lead_favorites`) are independent, both always visible,
-- never hiding one because the other is set. The pin has no tab of its own —
-- it just reorders whatever tab a lead already belongs to (application-side:
-- `listLeads` now orders `is_starred desc` before `created_at desc`) — so the
-- STARRED count here goes back to meaning only "personally favourited",
-- matching the tab it actually powers.
create or replace function public.lead_stage_counts(
  p_owner_id uuid,
  p_scope_unassigned boolean,
  p_no_next_action boolean,
  p_source text,
  p_assigned_to uuid,
  p_assigned_unassigned boolean,
  p_search text,
  p_search_digits text,
  p_search_has_digits boolean
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select l.id, l.status
    from public.leads l
    where (p_owner_id is null or l.assigned_bdm_id = p_owner_id)
      and (not p_scope_unassigned or l.assigned_bdm_id is null)
      and (
        not p_no_next_action
        or (l.next_action_at is null and l.status not in ('LOST', 'CLOSED'))
      )
      and (p_source is null or l.source::text = p_source)
      and (p_assigned_to is null or l.assigned_bdm_id = p_assigned_to)
      and (not p_assigned_unassigned or l.assigned_bdm_id is null)
      and (
        p_search is null
        or (
          p_search_has_digits
          and (
            l.mobile_normalized ilike '%' || p_search_digits || '%'
            or l.customer_name ilike '%' || p_search || '%'
            or l.lead_code ilike '%' || p_search || '%'
          )
        )
        or (
          not p_search_has_digits
          and (
            l.customer_name ilike '%' || p_search || '%'
            or l.lead_code ilike '%' || p_search || '%'
            or l.location_text ilike '%' || p_search || '%'
          )
        )
      )
  )
  select jsonb_build_object(
    'ALL', count(*),
    'NEW', count(*) filter (where v.status = 'NEW'),
    'UNASSIGNED', count(*) filter (where v.status = 'UNASSIGNED'),
    'ASSIGNED', count(*) filter (where v.status = 'ASSIGNED'),
    'CONTACTED', count(*) filter (where v.status = 'CONTACTED'),
    'FOLLOW_UP', count(*) filter (where v.status = 'FOLLOW_UP'),
    'SITE_VISIT_SCHEDULED', count(*) filter (where v.status = 'SITE_VISIT_SCHEDULED'),
    'SITE_VISIT_COMPLETED', count(*) filter (where v.status = 'SITE_VISIT_COMPLETED'),
    'QUALIFIED', count(*) filter (where v.status = 'QUALIFIED'),
    'LOST', count(*) filter (where v.status = 'LOST'),
    'CLOSED', count(*) filter (where v.status = 'CLOSED'),
    'IN_DESIGN', count(*) filter (
      where exists (
        select 1 from public.design_projects d
        where d.lead_id = v.id and d.status not in ('NOT_REQUIRED', 'CANCELLED')
      )
    ),
    'IN_EXECUTION', count(*) filter (
      where exists (
        select 1 from public.execution_projects e
        where e.lead_id = v.id and e.status not in ('COMPLETED', 'CANCELLED')
      )
    ),
    'STARRED', count(*) filter (
      where exists (
        select 1 from public.lead_favorites f
        where f.lead_id = v.id and f.user_id = (select auth.uid())
      )
    )
  )
  from visible v;
$$;

revoke all on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) from public;
grant execute on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) to authenticated;
