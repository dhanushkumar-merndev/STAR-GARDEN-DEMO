-- ===========================================================================
-- Star Gardens CRM - production query performance hardening
--
-- Keeps large analytical and financial reads inside PostgreSQL, behind one
-- authorization check, instead of making many RLS-filtered HTTP requests or
-- downloading thousands of rows for JavaScript aggregation.
-- ===========================================================================

create extension if not exists pg_trgm with schema extensions;

-- Substring search used by the Leads and Accounts screens.
create index if not exists leads_customer_name_trgm_idx
  on public.leads using gin (customer_name extensions.gin_trgm_ops);
create index if not exists leads_lead_code_trgm_idx
  on public.leads using gin (lead_code extensions.gin_trgm_ops);
create index if not exists leads_mobile_trgm_idx
  on public.leads using gin (mobile_normalized extensions.gin_trgm_ops);
create index if not exists leads_location_trgm_idx
  on public.leads using gin (location_text extensions.gin_trgm_ops);

-- Composite indexes matching the actual list, dashboard and authorization
-- predicates. These complement (rather than duplicate) the single-column MVP
-- indexes created in migration 02.
create index if not exists leads_owner_created_idx
  on public.leads (assigned_bdm_id, created_at desc);
create index if not exists leads_status_created_idx
  on public.leads (status, created_at desc);
create index if not exists design_projects_lead_idx
  on public.design_projects (lead_id);
create index if not exists execution_projects_lead_idx
  on public.execution_projects (lead_id);
create index if not exists execution_projects_lead_created_idx
  on public.execution_projects (lead_id, created_at desc);
create index if not exists execution_projects_lead_status_idx
  on public.execution_projects (lead_id, status);
create index if not exists site_visits_status_scheduled_idx
  on public.site_visits (status, scheduled_start_at);
create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);
create index if not exists lead_accounts_closed_idx
  on public.lead_accounts (closed_at, lead_id)
  where closed_at is not null;

-- ---------------------------------------------------------------------------
-- Accounts register: one bounded, Admin-only database call.
-- ---------------------------------------------------------------------------

create or replace function public.accounts_register_page(
  p_tab text default 'READY',
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tab text := upper(coalesce(nullif(btrim(p_tab), ''), 'READY'));
  v_search text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_,]', ' ', 'g')), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 5), 100);
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Accounts are Admin-only.' using errcode = '42501';
  end if;

  if v_tab not in ('READY', 'OPEN', 'CLOSED', 'ALL') then
    raise exception 'Invalid accounts tab.' using errcode = '22023';
  end if;

  with eligible as materialized (
    select
      lead.id as lead_id,
      lead.lead_code,
      lead.customer_name,
      lead.mobile_country_code,
      lead.mobile_normalized,
      lead.email,
      lead.location_text,
      lead.site_address,
      lead.requirement_summary,
      lead.status as lead_status,
      lead.updated_at,
      owner.full_name as owner_name,
      latest_execution.status as execution_status,
      latest_execution.completed_at as execution_completed_at,
      case when account.id is null then null else to_jsonb(account) end as account
    from public.leads lead
    left join public.profiles owner on owner.id = lead.assigned_bdm_id
    left join public.lead_accounts account on account.lead_id = lead.id
    left join lateral (
      select execution.status, execution.completed_at
      from public.execution_projects execution
      where execution.lead_id = lead.id
      order by execution.created_at desc
      limit 1
    ) latest_execution on true
    where
      (
        v_tab = 'ALL'
        or (v_tab = 'OPEN' and account.id is not null and account.closed_at is null)
        or (v_tab = 'CLOSED' and account.closed_at is not null)
        or (
          v_tab = 'READY'
          and account.id is null
          and exists (
            select 1
            from public.execution_projects completed_execution
            where completed_execution.lead_id = lead.id
              and completed_execution.status = 'COMPLETED'
          )
        )
      )
      and (
        v_search is null
        or (
          length(v_digits) >= 4
          and (
            lead.mobile_normalized ilike '%' || v_digits || '%'
            or lead.customer_name ilike '%' || v_search || '%'
            or lead.lead_code ilike '%' || v_search || '%'
          )
        )
        or (
          length(v_digits) < 4
          and (
            lead.customer_name ilike '%' || v_search || '%'
            or lead.lead_code ilike '%' || v_search || '%'
          )
        )
      )
  ),
  page_rows as (
    select *
    from eligible
    order by updated_at desc, lead_id
    offset v_offset
    limit v_limit
  ),
  account_totals as (
    select
      coalesce(sum(total_amount), 0) as agreed,
      coalesce(sum(received_amount), 0) as received,
      coalesce(sum(balance_amount), 0) as balance
    from public.lead_accounts
  )
  select jsonb_build_object(
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'lead_id', row.lead_id,
            'lead_code', row.lead_code,
            'customer_name', row.customer_name,
            'mobile_country_code', row.mobile_country_code,
            'mobile_normalized', row.mobile_normalized,
            'email', row.email,
            'location_text', row.location_text,
            'site_address', row.site_address,
            'requirement_summary', row.requirement_summary,
            'lead_status', row.lead_status,
            'owner_name', row.owner_name,
            'execution_status', row.execution_status,
            'execution_completed_at', row.execution_completed_at,
            'account', row.account
          )
          order by row.updated_at desc, row.lead_id
        )
        from page_rows row
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from eligible),
    'totals', (
      select jsonb_build_object(
        'agreed', totals.agreed,
        'received', totals.received,
        'balance', totals.balance
      )
      from account_totals totals
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.accounts_register_page(text, text, integer, integer) from public;
grant execute on function public.accounts_register_page(text, text, integer, integer) to authenticated;

comment on function public.accounts_register_page(text, text, integer, integer) is
  'Admin-only, bounded Accounts register page with server-side filtering, total count and financial totals.';

-- ---------------------------------------------------------------------------
-- Admin dashboard: one snapshot generated next to the data.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_dashboard_cache (
  range_from timestamptz not null,
  range_to timestamptz not null,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (range_from, range_to)
);

alter table public.admin_dashboard_cache enable row level security;
alter table public.admin_dashboard_cache force row level security;

-- No direct table policies: snapshots contain company-wide analytics and are
-- reachable only through the authorization-checked functions below.
revoke all on public.admin_dashboard_cache from public, anon, authenticated;

create or replace function public.admin_dashboard_snapshot(
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
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_today_end timestamptz;
  v_from timestamptz := p_from;
  v_to timestamptz := p_to;
  v_result jsonb;
begin
  if not app.is_admin() then
    raise exception 'Dashboard analytics are Admin-only.' using errcode = '42501';
  end if;

  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'Invalid dashboard date range.' using errcode = '22023';
  end if;

  select cache.payload
    into v_result
    from public.admin_dashboard_cache cache
   where cache.range_from = v_from
     and cache.range_to = v_to
     and cache.generated_at >= v_now - interval '1 hour';

  if v_result is not null then
    return v_result;
  end if;

  v_today_end := v_today_start + interval '1 day';

  with lead_counts as (
    select
      count(*) filter (where created_at >= v_today_start) as today,
      count(*) filter (where created_at >= v_now - interval '7 days') as week,
      count(*) filter (where created_at >= v_now - interval '30 days') as month,
      count(*) filter (where created_at >= v_from and created_at < v_to) as in_range,
      count(*) filter (
        where assigned_bdm_id is null and status not in ('LOST', 'CLOSED')
      ) as unassigned,
      count(*) filter (
        where next_action_at is null and status not in ('LOST', 'CLOSED')
      ) as no_next_action
    from public.leads
  ),
  lead_trend as (
    select
      to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day,
      count(*) as count
    from public.leads
    where created_at >= v_from and created_at < v_to
    group by 1
  ),
  leads_by_source as (
    select source::text as label, count(*) as count
    from public.leads
    where created_at >= v_from and created_at < v_to
    group by source
  ),
  leads_by_status as (
    select status::text as label, count(*) as count
    from public.leads
    where created_at >= v_from and created_at < v_to
    group by status
  ),
  leads_by_bdm as (
    select coalesce(owner.full_name, 'Unassigned') as label, count(*) as count
    from public.leads lead
    left join public.profiles owner on owner.id = lead.assigned_bdm_id
    where lead.created_at >= v_from and lead.created_at < v_to
    group by coalesce(owner.full_name, 'Unassigned')
  ),
  recent_activity as (
    select
      audit.id,
      audit.action,
      audit.entity_type,
      audit.created_at,
      actor.full_name as actor
    from public.audit_logs audit
    left join public.profiles actor on actor.id = audit.actor_user_id
    where audit.action in (
      'lead.assigned',
      'lead.reassigned',
      'design.version_approved',
      'file.downloaded',
      'execution.completed',
      'lead.status_changed'
    )
    order by audit.created_at desc
    limit 12
  )
  select jsonb_build_object(
    'leads_today', counts.today,
    'leads_this_week', counts.week,
    'leads_this_month', counts.month,
    'leads_in_range', counts.in_range,
    'unassigned', counts.unassigned,
    'no_next_action', counts.no_next_action,
    'lead_trend', coalesce(
      (select jsonb_agg(jsonb_build_object('day', trend.day, 'count', trend.count) order by trend.day) from lead_trend trend),
      '[]'::jsonb
    ),
    'by_source', coalesce(
      (select jsonb_agg(jsonb_build_object('source', source.label, 'count', source.count) order by source.count desc) from leads_by_source source),
      '[]'::jsonb
    ),
    'by_status', coalesce(
      (select jsonb_agg(jsonb_build_object('status', status.label, 'count', status.count) order by status.count desc) from leads_by_status status),
      '[]'::jsonb
    ),
    'by_bdm', coalesce(
      (select jsonb_agg(jsonb_build_object('name', bdm.label, 'count', bdm.count) order by bdm.count desc) from leads_by_bdm bdm),
      '[]'::jsonb
    ),
    'follow_ups', jsonb_build_object(
      'overdue', (
        select count(*) from public.follow_ups
        where status in ('OPEN', 'OVERDUE') and due_at < v_now
      ),
      'today', (
        select count(*) from public.follow_ups
        where status in ('OPEN', 'OVERDUE')
          and due_at >= v_today_start and due_at < v_today_end
      )
    ),
    'designs', jsonb_build_object(
      'awaitingAssignment', (
        select count(*) from public.design_projects
        where assigned_designer_id is null and status = 'REQUIRED'
      ),
      'readyForReview', (
        select count(*) from public.design_projects where status = 'READY_FOR_REVIEW'
      ),
      'dueSoon', (
        select count(*) from public.design_projects
        where due_at is not null
          and due_at <= v_now + interval '3 days'
          and status not in ('APPROVED', 'CANCELLED')
      ),
      'revisions', (
        select count(*) from public.design_projects where status = 'REVISION_REQUESTED'
      )
    ),
    'execution', jsonb_build_object(
      'dueToday', (
        select count(*) from public.execution_tasks
        where status not in ('COMPLETED', 'CANCELLED')
          and due_at >= v_now and due_at < v_today_end
      ),
      'overdue', (
        select count(*) from public.execution_tasks
        where status not in ('COMPLETED', 'CANCELLED') and due_at < v_now
      ),
      'blocked', (
        select count(*) from public.execution_projects where status = 'BLOCKED'
      ),
      'nearingCompletion', (
        select count(*) from public.execution_projects
        where progress_percent >= 80 and status not in ('COMPLETED', 'CANCELLED')
      )
    ),
    'visits_today', (
      select count(*) from public.site_visits
      where status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
        and scheduled_start_at >= v_today_start and scheduled_start_at < v_today_end
    ),
    'visits_overdue', (
      select count(*) from public.site_visits
      where status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
        and scheduled_start_at < v_now
    ),
    'recent_activity', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', activity.id,
            'action', activity.action,
            'entity_type', activity.entity_type,
            'created_at', activity.created_at,
            'actor', activity.actor
          )
          order by activity.created_at desc
        )
        from recent_activity activity
      ),
      '[]'::jsonb
    )
  ) into v_result
  from lead_counts counts;

  insert into public.admin_dashboard_cache (range_from, range_to, payload, generated_at)
  values (v_from, v_to, v_result, v_now)
  on conflict (range_from, range_to) do update
    set payload = excluded.payload,
        generated_at = excluded.generated_at;

  return v_result;
end;
$$;

create or replace function public.refresh_admin_dashboard_cache()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'Dashboard refresh is Admin-only.' using errcode = '42501';
  end if;

  delete from public.admin_dashboard_cache;
end;
$$;

revoke all on function public.admin_dashboard_snapshot(timestamptz, timestamptz) from public;
grant execute on function public.admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;
revoke all on function public.refresh_admin_dashboard_cache() from public;
grant execute on function public.refresh_admin_dashboard_cache() to authenticated;

comment on function public.admin_dashboard_snapshot(timestamptz, timestamptz) is
  'Admin-only dashboard snapshot, cached per date range for one hour.';

comment on function public.refresh_admin_dashboard_cache() is
  'Admin-only manual invalidation of cached dashboard snapshots.';
