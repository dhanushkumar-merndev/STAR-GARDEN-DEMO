-- Two independent ways to mark a lead worth coming back to, deliberately
-- never both showing at once on the same lead:
--
--   `leads.is_starred`   one flag, Admin/Super-Admin only, visible to everyone.
--                        "This lead matters" as a fact about the business.
--   `lead_favorites`     one row per (user, lead), any staff member, private
--                        to them. "I personally want to find this again."
--
-- A lead that is globally starred has nothing left for a personal favourite
-- to add — the UI shows the global star to everyone and does not also offer
-- a personal star for that same lead (enforced again below, not just in the
-- UI: §7.5, never trust the browser's claim about what it is showing).

alter table public.leads
  add column is_starred boolean not null default false;

-- Partial: almost every lead has this false, so the interesting subset (the
-- tab this powers) is the only part worth indexing.
create index leads_is_starred_idx on public.leads (id) where is_starred;

create table public.lead_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);

create index lead_favorites_lead_idx on public.lead_favorites (lead_id);

alter table public.lead_favorites enable row level security;
alter table public.lead_favorites force row level security;

-- A favourite is only ever this user's own — there is no admin override read
-- here, on purpose: "who else has this starred" is not a question the app
-- asks, and adding a bypass would just be attack surface for a feature that
-- does not exist.
create policy lead_favorites_select on public.lead_favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Reachable only for a lead the user could already see — guessing a lead id
-- gains nothing (§23.13), and this is the same predicate every other
-- lead-scoped table already uses for that.
create policy lead_favorites_insert on public.lead_favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and app.can_read_lead(lead_id)
  );

create policy lead_favorites_delete on public.lead_favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.lead_favorites from public, anon;
grant select, insert, delete on public.lead_favorites to authenticated;

-- ---------------------------------------------------------------------------
-- lead_stage_counts gains a STARRED count: globally starred, or personally
-- favourited by whoever is calling. `auth.uid()` inside a `security invoker`
-- function resolves to the real caller, so no new parameter is needed to
-- know who "personally" means.
-- ---------------------------------------------------------------------------
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
    select l.id, l.status, l.is_starred
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
      where v.is_starred
        or exists (
          select 1 from public.lead_favorites f
          where f.lead_id = v.id and f.user_id = (select auth.uid())
        )
    )
  )
  from visible v;
$$;

revoke all on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) from public;
grant execute on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) to authenticated;
