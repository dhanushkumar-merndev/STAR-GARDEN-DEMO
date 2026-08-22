-- `app.assign_lead_code()` treated `lead_code_counters` as the sole source of
-- truth for "the next free number in this financial year." It is not: any
-- lead ever inserted with an explicit `lead_code` — a seed script, a bulk
-- import, a restore — claims a number the counter knows nothing about. The
-- 10,000-lead load-testing seed for the §22 timeout incident did exactly
-- that, landing in a contiguous block (…-10787 through …-20786) well ahead of
-- the counter at the time. The counter has since drifted past that block
-- from ordinary use, but nothing stopped it landing back inside a taken
-- range — which is exactly what produced the
-- `duplicate key value violates unique constraint "leads_lead_code_key"`
-- error a real lead creation just hit.
--
-- The fix: never hand out a candidate without checking it is actually free,
-- and keep advancing the counter past any that are not. The counter stays
-- the fast path — this only costs an extra existence check per attempt, and
-- only ever loops when a collision is real.
create or replace function app.assign_lead_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fy         text;
  next_value integer;
  candidate  text;
  attempts   integer := 0;
  -- A run of taken numbers this long would mean the counter and the table
  -- have drifted apart by more than one seed load's worth — at that point a
  -- loud failure is more useful than a trigger silently spinning through
  -- thousands of existence checks per insert (the exact shape of the §22
  -- per-row-cost incident this codebase already paid to learn from once).
  max_attempts constant integer := 200;
begin
  if new.lead_code is null or btrim(new.lead_code) = '' then
    fy := app.financial_year_label(now());

    loop
      insert into public.lead_code_counters (financial_year, last_value)
      values (fy, 1)
      on conflict (financial_year)
        do update set last_value = public.lead_code_counters.last_value + 1
      returning last_value into next_value;

      candidate := 'SG-' || fy || '-' || lpad(next_value::text, 3, '0');

      exit when not exists (select 1 from public.leads where lead_code = candidate);

      attempts := attempts + 1;
      if attempts >= max_attempts then
        raise exception
          'Could not find a free lead code for financial year % after % attempts — the counter and the leads table have drifted further apart than a single seed load. Check lead_code_counters against max(lead_code) for this year.',
          fy, attempts
          using errcode = 'unique_violation';
      end if;
    end loop;

    new.lead_code := candidate;
  end if;
  return new;
end;
$$;
