-- ===========================================================================
-- Star Gardens CRM — lead codes carry the financial year
--
--   was:  SG-2026-001042   calendar year, one ever-growing six-digit counter
--   now:  SG-2026-27-001   Indian financial year, counted from 1 each April
--
-- The financial year is the unit the business actually reports in, so a code
-- that names it answers "which year's book is this lead in?" without a lookup.
-- Counting from 1 within the year is the other half of that: a three-digit
-- number is readable over a phone, which a six-digit running total is not.
--
-- A dedicated counter table rather than a sequence, because a sequence cannot
-- be reset per year without a scheduled job — and a job that has to run at
-- midnight on 1 April to keep numbering correct is a job that will one day not
-- run. Here the year rolls over the first time a lead is created in it.
-- ===========================================================================

create table if not exists public.lead_code_counters (
  -- 'YYYY-YY', e.g. '2026-27'.
  financial_year text primary key,
  last_value     integer not null default 0
);

comment on table public.lead_code_counters is
  'One row per financial year, holding the last lead number issued. Written only by app.assign_lead_code().';

-- No policies, on purpose. Nothing in a browser session has any business
-- reading or writing this — the only legitimate writer is the security-definer
-- trigger below, which runs as the owner and so is not subject to these.
alter table public.lead_code_counters enable row level security;

-- ---------------------------------------------------------------------------
-- The Indian financial year: 1 April to 31 March.
-- ---------------------------------------------------------------------------
create or replace function app.financial_year_label(at timestamptz)
returns text
language sql
immutable
as $$
  select case
    when extract(month from at at time zone 'Asia/Kolkata') >= 4
      then to_char(at at time zone 'Asia/Kolkata', 'YYYY') || '-' ||
           to_char((at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((at at time zone 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' ||
         to_char(at at time zone 'Asia/Kolkata', 'YY')
  end;
$$;

comment on function app.financial_year_label(timestamptz) is
  'Indian financial year label for a moment, in IST. April 2026 → 2026-27; February 2027 → 2026-27.';

-- ---------------------------------------------------------------------------
-- Lead code assignment
--
-- `security definer` so the counter row can be claimed despite RLS. The
-- `insert … on conflict … returning` is one statement and therefore atomic:
-- two leads created in the same instant take two different numbers, and the
-- row lock is held only for the length of that statement.
--
-- Padded to three digits but not truncated at three — the 1000th lead of a
-- year becomes -1000 rather than colliding with -000.
-- ---------------------------------------------------------------------------
create or replace function app.assign_lead_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fy   text;
  next_value integer;
begin
  if new.lead_code is null or btrim(new.lead_code) = '' then
    fy := app.financial_year_label(now());

    insert into public.lead_code_counters (financial_year, last_value)
    values (fy, 1)
    on conflict (financial_year)
      do update set last_value = public.lead_code_counters.last_value + 1
    returning last_value into next_value;

    new.lead_code := 'SG-' || fy || '-' || lpad(next_value::text, 3, '0');
  end if;
  return new;
end;
$$;

-- The old sequence is left in place rather than dropped: existing codes were
-- issued from it, and nothing is gained by removing the record of where they
-- came from. It is simply no longer advanced.
comment on sequence public.lead_code_seq is
  'Superseded by lead_code_counters (migration 20260820150000). Retained for provenance only.';
