-- API performance hardening: collapse list-tab fan-out into one RLS-scoped
-- aggregate per screen, and make the public rate limiter atomic.

create or replace function public.follow_up_scope_counts(
  p_assigned_to uuid,
  p_now timestamptz,
  p_start_today timestamptz,
  p_end_today timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'PENDING', count(*) filter (where f.status in ('OPEN', 'OVERDUE')),
    'TODAY', count(*) filter (
      where f.status in ('OPEN', 'OVERDUE')
        and f.due_at >= p_start_today and f.due_at <= p_end_today
    ),
    'OVERDUE', count(*) filter (
      where f.status in ('OPEN', 'OVERDUE') and f.due_at < p_now
    ),
    'UPCOMING', count(*) filter (
      where f.status in ('OPEN', 'OVERDUE') and f.due_at > p_end_today
    ),
    'COMPLETED', count(*) filter (where f.status = 'COMPLETED'),
    'ALL', count(*)
  )
  from public.follow_ups f
  where p_assigned_to is null or f.assigned_to = p_assigned_to;
$$;

create or replace function public.site_visit_scope_counts(
  p_now timestamptz,
  p_start_today timestamptz,
  p_end_today timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'UPCOMING', count(*) filter (
      where v.status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
        and v.scheduled_start_at >= p_now
    ),
    'TODAY', count(*) filter (
      where v.status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
        and v.scheduled_start_at >= p_start_today
        and v.scheduled_start_at <= p_end_today
    ),
    'OVERDUE', count(*) filter (
      where v.status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
        and v.scheduled_start_at < p_now
    ),
    'COMPLETED', count(*) filter (where v.status = 'COMPLETED'),
    'ALL', count(*)
  )
  from public.site_visits v;
$$;

create or replace function public.design_project_scope_counts(
  p_designer_id uuid,
  p_current_user_id uuid,
  p_due_cutoff timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'MINE', count(*) filter (
      where d.assigned_designer_id = p_current_user_id and d.status <> 'CANCELLED'
    ),
    'AWAITING_ASSIGNMENT', count(*) filter (
      where d.assigned_designer_id is null and d.status = 'REQUIRED'
    ),
    'PENDING', count(*) filter (where d.status not in ('APPROVED', 'CANCELLED')),
    'COMPLETED', count(*) filter (where d.status = 'APPROVED'),
    'READY_FOR_REVIEW', count(*) filter (where d.status = 'READY_FOR_REVIEW'),
    'REVISION_REQUESTED', count(*) filter (where d.status = 'REVISION_REQUESTED'),
    'DUE', count(*) filter (
      where d.due_at is not null
        and d.status not in ('APPROVED', 'CANCELLED')
        and d.due_at <= p_due_cutoff
    ),
    'ALL', count(*) filter (where d.status <> 'CANCELLED')
  )
  from public.design_projects d
  where p_designer_id is null or d.assigned_designer_id = p_designer_id;
$$;

create or replace function public.execution_work_counts(
  p_task_assignee uuid,
  p_now timestamptz,
  p_end_today timestamptz
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'DUE_TODAY', (
      select count(*) from public.execution_tasks t
      where t.status not in ('COMPLETED', 'CANCELLED')
        and (p_task_assignee is null or t.assigned_to = p_task_assignee)
        and t.due_at >= p_now and t.due_at <= p_end_today
    ),
    'OVERDUE', (
      select count(*) from public.execution_tasks t
      where t.status not in ('COMPLETED', 'CANCELLED')
        and (p_task_assignee is null or t.assigned_to = p_task_assignee)
        and t.due_at < p_now
    ),
    'BLOCKED', (
      select count(*) from public.execution_projects e where e.status = 'BLOCKED'
    ),
    'NEARING_COMPLETION', (
      select count(*) from public.execution_projects e
      where e.progress_percent >= 80 and e.status not in ('COMPLETED', 'CANCELLED')
    )
  );
$$;

create or replace function public.execution_project_scope_counts(
  p_current_user_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'MINE', count(*) filter (
      where e.status <> 'CANCELLED'
        and exists (
          select 1
          from public.execution_assignees a
          where a.execution_project_id = e.id
            and a.user_id = p_current_user_id
        )
    ),
    'ACTIVE', count(*) filter (where e.status not in ('COMPLETED', 'CANCELLED')),
    'BLOCKED', count(*) filter (where e.status = 'BLOCKED'),
    'ALL', count(*) filter (where e.status <> 'CANCELLED')
  )
  from public.execution_projects e;
$$;

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
    )
  )
  from visible v;
$$;

revoke all on function public.follow_up_scope_counts(uuid, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.site_visit_scope_counts(timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.design_project_scope_counts(uuid, uuid, timestamptz) from public;
revoke all on function public.execution_project_scope_counts(uuid) from public;
revoke all on function public.execution_work_counts(uuid, timestamptz, timestamptz) from public;
revoke all on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) from public;

grant execute on function public.follow_up_scope_counts(uuid, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.site_visit_scope_counts(timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.design_project_scope_counts(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.execution_project_scope_counts(uuid) to authenticated;
grant execute on function public.execution_work_counts(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.lead_stage_counts(uuid, boolean, boolean, text, uuid, boolean, text, text, boolean) to authenticated;

create or replace function public.check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_allowed boolean;
begin
  if p_bucket is null or length(p_bucket) > 80
     or p_identifier is null or length(p_identifier) > 255
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  -- Serializes only callers in the same bucket/identity pair. Different IPs
  -- never block one another, while simultaneous requests cannot pass the limit
  -- between a separate count and insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_bucket || ':' || p_identifier, 0)
  );

  select count(*)::integer
    into v_used
  from public.rate_limit_hits h
  where h.bucket = p_bucket
    and h.identifier = p_identifier
    and h.created_at >= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  v_allowed := v_used < p_limit;
  if v_allowed then
    insert into public.rate_limit_hits(bucket, identifier)
    values (p_bucket, p_identifier);
    v_used := v_used + 1;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', greatest(p_limit - v_used, 0),
    'retry_after_seconds', case when v_allowed then 0 else p_window_seconds end
  );
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated, service_role;

-- One network round trip for a whole reminder/admin fan-out. Conflicts from
-- the per-day dedupe index are skipped row-by-row without aborting the batch.
create or replace function public.insert_notifications_dedup(p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_inserted public.notifications%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Notifications must be a JSON array containing at most 2000 rows';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      insert into public.notifications(user_id, type, title, body, entity_type, entity_id)
      values (
        (v_item->>'user_id')::uuid,
        (v_item->>'type')::public.notification_type,
        v_item->>'title',
        nullif(v_item->>'body', ''),
        nullif(v_item->>'entity_type', ''),
        nullif(v_item->>'entity_id', '')::uuid
      )
      returning * into v_inserted;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'user_id', v_inserted.user_id,
        'type', v_inserted.type,
        'entity_id', v_inserted.entity_id
      ));
    exception when unique_violation then
      null;
    end;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.insert_notifications_dedup(jsonb) from public;
grant execute on function public.insert_notifications_dedup(jsonb) to service_role;
