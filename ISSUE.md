# List pages timing out at 10k leads — diagnosis and fix

Status: **fixed, pending your verification in the browser.**

## 1. It was not a virtualization problem

Virtualization only stops the *browser* painting thousands of DOM nodes. Every
one of these crashes happened on the **server**, inside a Server Component,
before a single row of HTML existed:

```
GET /follow-ups  200 in 8.6s   cause: 57014 canceling statement due to statement timeout
GET /designs     200 in 8.3s   ← same
GET /site-visits 200 in 8.3s   ← same
GET /leads       200 in 8.5s   ← same
```

The decisive evidence: **`/leads` already had server-side offset pagination.**
`listLeads` computes `from = (page-1) * pageSize` with `pageSize` 25 and calls
`.range(from, from + 24)` — it asks for 25 rows, not 10,000, and it still took
8.5 seconds. Pagination was never what was missing.

## 2. Root cause: a per-row RLS function

`leads` had this SELECT policy:

```sql
create policy leads_select on public.leads
  for select to authenticated
  using (app.can_read_lead(id));
```

`app.can_read_lead` is `security definer`, and Postgres **does not inline**
security-definer functions. So it was a real function call **per row**, and
each call ran:

- `app.is_active_user()` → a `profiles` lookup
- `app.is_admin()` → `app.current_user_role()` → another `profiles` lookup
- `exists (select 1 from leads l where l.id = p_lead_id …)` — re-querying
  `leads` by id for a row the scan already had in hand
- two more `exists` subqueries against `design_projects` and
  `execution_projects` ⨝ `execution_assignees`

That is ~6 index probes per row. `count: 'exact'` has to visit every matching
row, so a single "25 rows plus a total" query became ~60,000 probes. At ~100
seeded leads this was invisible; at 10,003 it fell off a cliff.

The same helper backed the SELECT policy on `follow_ups`, `site_visits`,
`design_projects` and `execution_projects` — which is why all five pages died
together rather than just leads.

## 3. Contributing cause: a migration that was never applied

`supabase migration list` confirmed `20260820160000_api_performance_hardening`
existed locally with `"remote":""` — never pushed. It defines the eight RPCs
the app calls:

`follow_up_scope_counts`, `site_visit_scope_counts`,
`design_project_scope_counts`, `execution_work_counts`,
`execution_project_scope_counts`, `lead_stage_counts`, `check_rate_limit`,
`insert_notifications_dedup`

Missing, every call returned `PGRST202` and each service fell back to **one
`count: 'exact'` per filter tab** — twelve concurrent full scans on the leads
page, each paying the per-row policy cost above.

## 4. What was changed

### Database

| Migration | What it does |
|---|---|
| `20260820160000_api_performance_hardening` | The eight missing RPCs. Pushed — was never applied. |
| `20260821100000_rls_initplan_hardening` | First attempt at the policy rewrite. **Superseded — see below.** |
| `20260821110000_rls_initplan_correction` | The policy rewrite as it now stands. |

Every SELECT policy on the five list tables now reads:

```sql
using (
  (select app.is_active_user())          -- InitPlan: evaluated once per query
  and (
    (select app.is_admin())              -- InitPlan: evaluated once per query
    or <row's own indexed column>        -- no function call, no subquery
    or <original security-definer helper>
  )
)
```

Wrapping a session-scoped call in `(select …)` lets the planner hoist it into
an InitPlan evaluated **once per query** instead of once per row. For an Admin
the second InitPlan returns true and the whole predicate short-circuits, so the
policy costs nothing per row — that is the 10k-lead case that was timing out.
A BDM matches on `assigned_bdm_id`, a column the scan already holds, using
`leads_assigned_bdm_idx`. Only the rarer designer / execution-staff paths reach
the helper.

Access semantics are unchanged: every added branch is a strict subset of what
the helper already returned true for.

#### Two bugs in `…100000`, caught before you saw them

The first version inlined the helpers' bodies into the policies outright. That
was wrong twice, and `…110000` fixes both:

1. **Recursion.** `site_visits_select` inlined a `site_visit_attendees` lookup.
   That table's own policy queries `public.site_visits` — which is precisely
   the "infinite recursion detected in policy" loop that migration
   `20260810121300` introduced `app.is_site_visit_attendee` to break. Restored
   to the security-definer helper.
2. **A privilege regression.** `is_site_visit_attendee` gates on
   `app.is_active_user()` internally; the inlined version dropped that gate, so
   a **deactivated** attendee would have regained read access to their visits,
   against §15. Restored.

There was a third, subtler hazard behind both: inlined `EXISTS` subqueries run
as the invoking user and so pick up RLS on the tables they touch, whereas the
security-definer helpers deliberately bypass it. Keeping the helpers as the
authority on *who may read what*, and using the rewrite only to hoist the
session checks, avoids that class of bug entirely.

### Application

`/leads` already paginated. The other four fetched a fixed slab (`limit: 100`,
or `400` for the month calendar) and rendered all of it with no controls —
which is why the Designs and Execution lists ran off the bottom of the screen.
Worse, they reported `items.length` — the page size — as if it were the total,
so truncation was silent.

- New `src/lib/pagination.ts` — `PaginatedResult<T>`, `DEFAULT_PAGE_SIZE` (25),
  `readPageParam`. A neutral module, following the `lib/leads/status-filters`
  precedent: the services are `server-only`, the control is a component.
- New `src/components/ui/pagination.tsx` — the Previous / Next control,
  extracted from the leads page so all five lists spell it the same way. Link-
  based, so the page number lives in the URL beside the other filters and a
  paged view stays shareable and back-button-restorable (§16).
- `listDesignProjects`, `listExecutionProjects`, `listFollowUps` and
  `listSiteVisits` now return `{ items, total, page, pageSize }`.
- Paging is **opt-in** via a `page` option. Dashboard panels that want ten rows
  keep their `limit`/`offset` behaviour and skip the `count: 'exact'`, which is
  a full scan and not worth paying for a ten-row widget.
- The four pages read `?page=`, render the control, and report `total` rather
  than `items.length` in their subtitles.
- **The follow-ups month calendar is deliberately not paged.** It needs every
  follow-up in the weeks it draws — a question about dates, not row counts.
  `listFollowUps` gained `from`/`to`, and the page now computes the same window
  the grid renders. The old `limit: 400` silently dropped work off the end of a
  busy month.

`npm run typecheck`, `npm run lint` and `npm test` (77 tests) all pass.

## 5. Still to verify

Reload `/leads`, `/follow-ups`, `/designs`, `/site-visits` and `/execution`.
Expected: sub-second, no `57014`, no `PGRST202` warnings in the server log.

I could not verify under a real authenticated session from here — the measured
timings below used the service-role key, which bypasses RLS and therefore
bypasses exactly the thing that was slow. Your browser is the real test.

For reference, with RLS bypassed and 10,003 leads, the underlying queries were
never the problem:

| Query | Time |
|---|---|
| Lead list page 1 + exact count | 51 ms |
| `IN_DESIGN` (inner join) | 68 ms |
| Search `ilike` across 3 columns | 204 ms |
| `lead_stage_counts` (all 12 tabs, one aggregate) | 555 ms |

## 6. On "so even a million rows can be handled"

Offset pagination is fine into the low tens of thousands, which covers this
dataset with room to spare. Past that, `OFFSET 50000` still makes Postgres walk
and discard 50,000 rows, and the answer is keyset (cursor) pagination — order
by `(created_at, id)` and carry the last row's values forward instead of a page
number.

The tradeoff is that keyset pagination gives up jumping to an arbitrary page
number, so it is worth doing when row counts actually approach that scale, not
before. The work above makes the app correct and fast at present volume.

Two things worth revisiting first, if the search path still feels slow:

- The `ilike '%…%'` filters in `applyLeadListFilters` cannot use a btree index.
  `20260812143000_query_performance_hardening` already added `pg_trgm` GIN
  indexes for them and **is** applied — worth confirming they are being used
  before adding more.
- The count fallbacks are still in the code. They exist for the deploy window
  when app code is live before its migration, but as this incident showed, a
  missing RPC degrades into a path that reliably times out and whose only
  signal is a `console.warn`. Either drop them (treat the migration as a hard
  dependency) or cap the fan-out, so a page renders without tab counts rather
  than 500ing.
