-- `follow_up_calendar` returned the *stored* `status` column verbatim. That
-- column is only ever written as 'OPEN', 'COMPLETED' or 'CANCELLED' —
-- nothing in this app ever flips a row to 'OVERDUE' as its due date passes.
-- 'OVERDUE' has always been a *computed* concept instead: the Overdue tab's
-- own filter is `status in ('OPEN','OVERDUE') and due_at < now()`, deriving
-- it at query time rather than trusting a column that is never updated.
--
-- The calendar grid skipped that derivation and just echoed the stored
-- value, so a follow-up sitting at 'OPEN' days after its due date rendered
-- as if it were still current — grey, not red — while the exact same row
-- correctly showed red on every other screen that computes the status
-- properly. This makes the calendar do the same computation everyone else
-- already does.
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
      case
        when f.status = 'OPEN' and f.due_at < now() then 'OVERDUE'
        else f.status
      end as status,
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
