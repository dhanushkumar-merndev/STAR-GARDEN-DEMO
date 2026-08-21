-- Per-day follow-up aggregate for the calendar grid.
--
-- The grid used to be built by fetching every follow-up in the visible range
-- and grouping them in the component. That does not survive real volume: the
-- fetch was capped (limit 400, later 500), the rows come back ordered by
-- `due_at`, and so the cap was consumed by the first few busy days. Every day
-- after that rendered as empty — not "+N more", but blank — while its
-- drill-down correctly reported 25 follow-ups. The grid was lying.
--
-- The cell only ever shows two or three entries plus a count, so shipping
-- thousands of rows to render six per day was the wrong shape regardless of
-- correctness. This returns exactly what the grid draws:
--
--   [{ "day": "2026-08-16", "total": 25, "items": [ … p_per_day of them … ] }]
--
-- `security invoker` so RLS still decides which follow-ups the caller can see,
-- matching the other *_scope_counts functions.
--
-- Days are bucketed in Asia/Kolkata, the same timezone the admin dashboard
-- snapshot uses, so a follow-up due at 1 AM IST lands on the day the office
-- would call it.

create or replace function public.follow_up_calendar(
  p_from timestamptz,
  p_to timestamptz,
  p_assigned_to uuid,
  p_per_day int
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select
      f.id,
      f.lead_id,
      f.due_at,
      f.status,
      f.title,
      l.customer_name,
      (f.due_at at time zone 'Asia/Kolkata')::date as day
    from public.follow_ups f
    left join public.leads l on l.id = f.lead_id
    where f.due_at >= p_from
      and f.due_at <= p_to
      and f.status in ('OPEN', 'OVERDUE')
      and (p_assigned_to is null or f.assigned_to = p_assigned_to)
  ),
  ranked as (
    select
      visible.*,
      row_number() over (partition by visible.day order by visible.due_at) as rn,
      count(*) over (partition by visible.day) as day_total
    from visible
  )
  select coalesce(
    jsonb_agg(day_row order by day_row.day),
    '[]'::jsonb
  )
  from (
    select
      ranked.day,
      max(ranked.day_total) as total,
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.id,
          'lead_id', ranked.lead_id,
          'due_at', ranked.due_at,
          'status', ranked.status,
          'title', ranked.title,
          'customer_name', ranked.customer_name
        )
        order by ranked.due_at
      ) filter (where ranked.rn <= greatest(p_per_day, 1)) as items
    from ranked
    group by ranked.day
  ) as day_row;
$$;

revoke all on function public.follow_up_calendar(timestamptz, timestamptz, uuid, int) from public;
grant execute on function public.follow_up_calendar(timestamptz, timestamptz, uuid, int)
  to authenticated, service_role;

comment on function public.follow_up_calendar(timestamptz, timestamptz, uuid, int) is
  'Per-day follow-up counts plus the first p_per_day entries, for the calendar grid. RLS applies.';

-- The grid always filters on due_at within a range and on open statuses.
create index if not exists follow_ups_due_at_status_idx
  on public.follow_ups (due_at, status);
