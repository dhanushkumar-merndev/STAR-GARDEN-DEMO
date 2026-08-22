# CLAUDE.md — standing engineering rules for this repo

This file is loaded automatically every session. It exists so scale-safety is
the default, not something re-derived after a production timeout. The
detailed CRM product spec lives in `AGENTS.md` (§-numbered, referenced from
migration comments); this file is the shorter, cross-project rule set that
applies to both `crm/` and `frontend/` — and to any project added later.

## The rule

**Assume every table reaches millions of rows, even when the demo/seed data
has a few hundred.** Before writing or approving any query, ask: does its
cost scale with the *size of the underlying data* (fine), or with the
*width of an input the caller controls* — a date range, a page size, an id
list (a red flag)? A query that is fast against 30 days of seed data can
still be O(range width) or O(row count) in disguise, and it will not fail
until someone picks a wider range or the table grows — which is exactly how
both incidents below reached production before anyone noticed.

## Two incidents this rule comes from

1. **Per-row RLS cost** (`crm/ISSUE.md`, `crm/supabase/migrations/20260821110000_rls_initplan_correction.sql`).
   A `security definer` helper was called once *per row* inside an RLS
   policy — invisible at ~100 seeded rows, a hard timeout at 10,000. Fix:
   wrap session-scoped checks in `(select …)` so Postgres hoists them into an
   InitPlan evaluated once per query, and prefer the row's own indexed column
   over a function call wherever ownership can be read directly off the row.

2. **Per-day correlated subqueries** (`crm/supabase/migrations/20260822110000_dashboard_trend_perf.sql`).
   A dashboard trend query ran 6 correlated subqueries *per day* in a
   caller-supplied date range — fine at the 30-day default (180 scans), a
   `57014 statement timeout` at a 577-day range a Super Admin actually picked
   (3,462 scans). Fix: one `GROUP BY` aggregate per table, `LEFT JOIN`ed onto
   the day series — proportional to how many rows exist, not to how many
   units (days) were asked for. A year-wide range now costs the same as a
   week-wide one.

The shape is the same both times: **replace "loop over N units, query once
per unit" with "query once, grouped by unit."** Applies to days, leads,
users, whatever the unit is — if you find yourself writing a subquery (or an
RPC call, or a fetch) inside a loop over rows/days/ids, that loop should
almost always become one set-based query instead.

## Concrete defaults

- **New list endpoints**: server-side pagination by default (offset +
  `count: 'exact'`, see `crm/src/lib/pagination.ts`), never fetch-all-and-slice
  client-side. Offset pagination is fine into the low tens of thousands —
  past that, switch to keyset (`order by (created_at, id)`, carry the last
  row forward) rather than optimizing offset further.
- **New admin/report RPCs that take a date range or other caller-controlled
  width**: test them against a wide/adversarial input before shipping — the
  full history of the table, not just the default window. If it must
  aggregate per-day (or per any generated series), use `GROUP BY` +
  `LEFT JOIN`, never a subquery re-run inside the series' `SELECT` list.
- **New RLS policies**: wrap session-scoped predicates (`is_admin()`,
  `current_user_role()`, anything not derived from the row itself) in
  `(select …)` for the InitPlan hoist. Prefer the row's own indexed column
  for ownership checks over a function call, and reserve
  `security definer` helpers for the cases that genuinely need to bypass RLS
  on a different table (and say so in a comment, so the next migration
  doesn't inline them back out and reintroduce the class of bug
  `20260821110000` fixed twice).
- **Any fallback path that only exists for a missing RPC / deploy window**
  (a `count: 'exact'` per filter tab, say) is itself a full scan per call —
  fine at seed-data scale, a real risk at production scale. Either treat the
  migration as a hard dependency or cap the fan-out; don't leave a silent
  `console.warn` as the only signal it degraded.

## When in doubt

If a new query's cost depends on a number the user typed into a date picker,
a filter, or a page-size field — rather than on `EXPLAIN ANALYZE` showing a
plan proportional to matched rows — stop and rewrite it before shipping,
even if nobody asked for a performance pass. This applies whether or not the
current seed/demo data is large enough to notice.
