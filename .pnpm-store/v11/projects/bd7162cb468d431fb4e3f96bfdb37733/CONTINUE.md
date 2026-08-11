# CONTINUE.md — Star Gardens CRM build status

> Paste this file back to Claude to resume exactly where the build stopped.
> Specs of record: [`../AGENTS.md`](../AGENTS.md) plus the two add-on briefs
> (Meta integration, SMTP email) captured in §9 below.

**Last updated:** 2026-08-10
**App location:** `crm/` (Next.js 16.3 App Router + TypeScript)
**Verification state:** typecheck, zero-warning lint and production build pass ·
12 Meta mapping tests pass · production dependency audit reports 0 vulnerabilities

---

## 1. Status board

| # | Area | State | Notes |
|---|------|-------|-------|
| 1 | Scaffold, config, env template | **DONE** | |
| 2 | DB migrations 01–05 (enums, tables, triggers, RLS, seed options) | **DONE** | |
| 3 | Google-only auth (migration 06) | **DONE** | invite allowlist |
| 4 | Transactional RPCs (migration 07) | **DONE** | assignment, approval, handoff |
| 5 | `lib/` — session, permissions, guards, validation, phone, files, Tigris, audit, notifications, rate limit, state machines, settings | **DONE** | |
| 6 | `server/services/` — leads, intake, activities, follow-ups, visits, designs, execution, files, users, dashboard, reports, reminders | **DONE** | |
| 7 | `server/actions/` — leads, workflow, admin, files, notifications, auth | **DONE** | |
| 8 | API routes — public enquiry, presign, finalize, file access, reminders, export, health, auth callback | **DONE** | Meta webhook runs only as a Supabase Edge Function |
| 9 | UI — design system, shell, login, 4 role dashboards, leads, follow-ups, visits, designs, execution, notifications, reports, settings, profile | **DONE** | |
| 10 | SMTP email service + templates + `email_logs` (migration 09) | **DONE** | Brevo removed per revised brief |
| 11 | Email wiring into workflows | **DONE** | lead, visit, design and execution assignment/revision |
| 12 | Meta add-on migrations (08, 10) | **DONE** | campaigns, forms, mappings, insights, sync runs, lead attribution, RLS |
| 13 | Meta mapping engine + services | **DONE** | transactional replace RPC + mapped intake |
| 14 | Supabase Edge Functions (`meta-webhook`, `meta-sync`, `meta-insights-sync`) | **DONE** | Graph v25 pinned in shared config |
| 15 | Supabase Cron (pg_cron + Vault) | **DONE** | Reminders active; Meta jobs installed and paused until Meta credentials are supplied; no Vercel Cron |
| 16 | Admin UI — Email settings, Meta Integration, Meta Ads, Users | **DONE** | virtualized/paginated large tables; active-work guard |
| 17 | Tests | **PARTIAL** | Meta mapping: 12 passing; remaining suites pending |
| 18 | Docs — README, EMAIL_SETUP.md, META_INTEGRATION_SETUP.md, AGENTS.md update | **TODO** | |

---

## 2. What exists right now

### 2.1 Database — 13 migrations

```
supabase/migrations/
  20260810120000_init_enums.sql          §9 state machines as PG enums
  20260810120100_core_tables.sql         §10 tables, indexes, constraints
  20260810120200_functions_triggers.sql  RLS helpers + domain invariants
  20260810120300_rls_policies.sql        §7.5 RLS on all business tables
  20260810120400_settings_and_options.sql  app_settings, config_options, task templates
  20260810120500_google_auth_invites.sql   staff_invites allowlist + auth trigger
  20260810120600_transactional_rpcs.sql    assign/approve/handoff in one transaction
  20260810120700_meta_enum_extensions.sql  webhook states + meta enums
  20260810120800_email_logs.sql            email delivery log
  20260810120900_meta_integration.sql      campaigns, forms, mappings, insights, sync runs
  20260810121000_transactional_meta_mapping.sql  atomic mapping replacement RPC
  20260810121100_meta_sync_cron.sql         Supabase Cron schedules via Vault
  20260810121200_pause_unconfigured_meta_cron.sql  quiet until Meta secrets exist
```

**28 tables**, all with RLS enabled *and forced*.

All 13 migrations are applied to the linked production Supabase project and
the local/remote migration histories match.

### 2.2 Decisions locked in — do not re-litigate

1. **CRM lives in `crm/`.** The repo root is the existing Vite marketing SPA and
   is untouched. The marketing site will POST to `POST /api/public/enquiry`.
2. **Google OAuth only.** No passwords anywhere. Access is an explicit
   allowlist: an Admin adds a Google address to `staff_invites`, and the
   `on_auth_user_created` trigger provisions an **active** profile with that
   role. An un-allowlisted Google account gets an **inactive** profile that can
   read nothing, and appears to the Admin as an access request.
3. **RLS is layer two, not layer one.** Every server action re-checks
   authorization itself. Normal reads/writes use the *user-scoped* client.
4. **`service_role` is used only** for: Meta webhook intake, public website
   enquiries, audit-log writes, email-log writes, notification fan-out to
   *other* users, and the reminder cron — each after the caller's own check.
5. **Design history is immutable.** Triggers block identity changes and block
   deletes from `authenticated`/`anon`. No DELETE policy exists.
6. **Execution cannot start without an APPROVED version** belonging to the same
   lead — enforced by trigger, RPC *and* service, three independent layers.
7. **Files: metadata in Postgres, bytes in private Tigris.** Upload uses a
   signed HMAC token so the finalize step cannot be tampered with.
8. **No telephony.** `tel:` links only. A `CALL_ATTEMPT` records that the
   dialler opened — never that a call connected.
9. **Email is provider-independent SMTP** (nodemailer). No Brevo, no hard-coded
   host. Email never rolls back a business action.
10. **All scheduled work uses Supabase Cron.** Meta sync calls Edge Functions;
    the hourly reminder schedule calls the authenticated Next.js reminder route.
    There is no Vercel Cron configuration.

### 2.3 Key schema facts

- Access predicates usable from policies and app code:
  `app.can_read_lead`, `app.can_write_lead`, `app.can_read_design_project`,
  `app.can_read_execution_project`, `app.can_read_file`, `app.is_admin`,
  `app.is_active_user`, `app.current_user_role`.
- Lead codes auto-generate as `SG-YYYY-NNNNNN`.
- `leads.meta_lead_id` is UNIQUE when present → Meta retries cannot duplicate.
- `notifications` has a per-day dedupe index → cron reminders are idempotent,
  and that same index gates the email send, so no duplicate mail either.
- `meta_field_mappings` has a partial unique index so one CRM destination can be
  claimed by at most one active Meta field per form.

---

## 3. Next steps, in order

### Step 1 — Finish email wiring (completed)

`src/server/services/leads.ts` already sends `leadAssignedEmail`. Repeat the
same three-line pattern in:

| File | Function | Template to use |
|------|----------|-----------------|
| `services/site-visits.ts` | `scheduleSiteVisit`, `rescheduleSiteVisit` | `siteVisitAssignedEmail` |
| `services/designs.ts` | `assignDesigner` | `designAssignedEmail` |
| `services/designs.ts` | `requestRevision` | `designRevisionEmail` |
| `services/execution.ts` | `createExecutionProject`, `assignExecutionStaff` | `executionAssignedEmail` |

The pattern:

```ts
await notify({ /* …existing… */, skipEmail: true });

await sendStaffEmail({
  userId: recipientId,
  rendered: designAssignedEmail({ /* … */ }),
  emailType: 'design.assigned',
  relatedEntityType: 'design_project',
  relatedEntityId: project.id,
});
```

`skipEmail: true` stops the generic fallback duplicating the richer template.

### Step 2 — Meta mapping engine (completed)

Create `src/server/services/meta-mapping.ts`:

- `listCampaigns()`, `listFormsForCampaign(campaignId)` — read from
  `meta_campaigns` / `meta_campaign_forms` / `meta_lead_forms`. **No Graph call**
  — the Ads screen must read synced data only.
- `getFormMapping(metaFormId)` — active rows from `meta_field_mappings`.
- `saveFormMapping(user, { metaFormId, entries[] })` — Admin-only. Validate:
  - `customer_name` mapped exactly once — required
  - `mobile` mapped exactly once — required
  - `email` / `location_text` / `requirement_summary` at most once each
  - one Meta field cannot claim two CRM destinations
  - reject the whole save if invalid; never persist a partial mapping
- `applyMapping(fieldData, mapping)` — pure function, returns
  `{ customerName, mobile, email, locationText, requirementSummary }`.
  **Unit-test this** (it is the highest-value test in the add-on).

Lead intake now runs exclusively in the `meta-webhook` Supabase Edge Function,
uses the saved mapping, and sets `UNMAPPED_FORM` (not `FAILED`) when no complete
active mapping exists. The superseded Next.js Meta webhook was removed.

### Step 3 — Supabase Edge Functions (completed)

Create `crm/supabase/functions/`:

```
_shared/
  meta-client.ts    Graph fetch, pagination, signature verify, pinned API version
  supabase.ts       service-role client for functions
  auth.ts           verifyAdminCaller() and verifyServiceCaller()
meta-webhook/index.ts
meta-sync/index.ts
meta-insights-sync/index.ts
```

Rules that must hold:

- **Pin the Graph version in `_shared/meta-client.ts` only.** No version string
  anywhere else.
- `meta-webhook`: GET verification + POST `X-Hub-Signature-256` over the **raw**
  body. Store the event **before** processing. Idempotent on `leadgen_id`.
- `meta-sync` / `meta-insights-sync`: accept either (a) a service call carrying
  the internal secret, or (b) a signed-in user whose **database** role is an
  active ADMIN — never a role claim from the browser.
- Insights: upsert on `(meta_campaign_id, insight_date)`. `cost_per_lead` must
  be `null` when `leads = 0`.
- A failed sync must never delete campaign rows — set
  `is_present_in_latest_sync = false` instead.

Deploy: `supabase functions deploy meta-webhook --no-verify-jwt` (webhook only;
the other two keep JWT verification).

### Step 4 — Supabase Cron (completed)

Migration using `pg_cron` + `pg_net`, reading the service key from Vault so no
secret appears in migration text:

```sql
select cron.schedule('meta-campaign-sync', '*/10 * * * *', $$ … $$);
select cron.schedule('meta-insights-sync', '*/30 * * * *', $$ … $$);
```

Vault contains the project URL, service-role key, internal sync token, app URL,
and a one-way reminder token. `crm-hourly-reminders` is active. The two Meta
jobs remain installed but inactive until the six Meta values in
`supabase/functions/.env.example` are configured; enable them with the SQL
shown in migration `20260810121200_pause_unconfigured_meta_cron.sql`.

### Step 5 — Admin UI (completed)

| Route | Contents |
|-------|----------|
| `/settings/integrations` | Email panel (status, sender, last sent/failed, **Send test email** — Admin-only, rate-limited) + Meta panel (connection state, ad account, campaign counts, last campaign sync, last insights sync, last successful webhook, failed count, unmapped count, **Sync now**) |
| `/settings/integrations/mapping` | Campaign → form → field mapping editor with preview and validation |
| `/settings/integrations/issues` | `UNMAPPED_FORM` / `FAILED` webhook events with a **Retry** action |
| `/marketing/meta-ads` | Campaign table: Campaign, Status, Spend today, Leads today, CPL, Impressions, Clicks, Mapped forms, Last synced |
| `/settings/users` | Staff list, invites, access requests, role/activation editing — **with the active-work warning** below |

**Active-work warning (add-on §10):** before deactivating or changing the role
of a user, count their assigned leads, open follow-ups, upcoming site visits,
active design projects and open execution tasks. Show the counts and require
reassignment rather than silently orphaning the work.

Add `Marketing` to the nav for ADMIN in
`src/components/shell/navigation.tsx`.

### Step 6 — Tests (`tests/unit/*.test.ts`, vitest)

Vitest is configured and the Meta mapping suite is complete. Remaining priority order:

1. `phone.test.ts` — normalization + duplicate-detection equivalence
2. `files.test.ts` — allowlist, forbidden extensions, sanitization, object keys
3. `state-machines.test.ts` — legal/illegal transitions, completion override
4. `permissions.test.ts` — role predicates
5. `meta-mapping.test.ts` — validation rules + `applyMapping` (**12 passing**)
6. `email.test.ts` — missing SMTP does not throw; error redaction strips secrets

### Step 7 — Docs

- `README.md` — setup, Google OAuth console callbacks, `crm.stargarden.in`
  subdomain deployment
- `EMAIL_SETUP.md` — SMTP host/port/user/password/from, per the add-on's 10 steps
- `META_INTEGRATION_SETUP.md` — Meta app, webhook URL, permissions, Edge Function
  deployment, Supabase secrets, cron jobs, mapping usage, retry/recovery
- `AGENTS.md` — record the three approved decisions that changed the baseline:
  Google-only auth, SMTP email, Supabase Cron for Meta

---

## 4. How to run it locally

```bash
cd crm
npm install
cp .env.example .env.local     # fill in as credentials arrive
npm run dev                    # http://localhost:3000
```

Nothing is required to *build*. Supabase, Tigris, Meta and SMTP are each
validated lazily at first use, so the app boots and shows a setup notice.

**Verification commands** (all currently used):

```bash
npm run typecheck   # tsc --noEmit          → currently passes
npm run build       # next build            → currently passes
npm run lint        # eslint                 → currently passes, zero warnings
npm test            # vitest run             → 12 tests pass
npm audit --omit=dev                         # 0 vulnerabilities
```

## 5. Database setup

```bash
# Local
supabase start
supabase db reset            # runs migrations + seed.sql

# Remote
supabase link --project-ref <ref>
supabase db push
```

Then allowlist yourself — this is the **one manual step** without which nobody
can sign in:

```sql
insert into public.staff_invites (email, full_name, role)
values ('you@yourdomain.com', 'Your Name', 'ADMIN');
```

Sign in with Google at `/login` using that exact address.

---

## 6. Environment variables

All documented in [`.env.example`](.env.example). Grouped by integration; each
group fails soft when absent:

| Group | Effect when missing |
|-------|--------------------|
| Supabase | App shows a setup notice; nothing works |
| Tigris | File upload/preview/download disabled; everything else works |
| Meta | Ad-lead intake disabled; manual + website intake unaffected |
| SMTP | Email disabled; in-app notifications unaffected |
| Cron secret | Optional; a one-way token is derived from the service-role key when omitted |

---

## 7. Known gaps and risks

1. **`src/types/database.ts` is hand-written.** It now includes FK
   `Relationships` so embedded selects type correctly. Once the project is
   linked, run `npm run db:types` and diff — the hand-written file is the
   reference for what *should* be there.
2. **Production migrations are current.** `supabase db push` succeeded and
   `supabase migration list` shows all 13 versions on both local and remote.
3. **`@supabase/ssr` had to be upgraded** from 0.5.2 to 0.12.x: 0.5.2 passes
   generics positionally to a `SupabaseClient` whose arity changed in
   supabase-js 2.112, which silently collapsed every query type to `never`.
   Do not downgrade.
4. **Meta production credentials are not supplied yet.** The webhook and sync
   functions are deployed, but real Meta traffic requires the six Meta values
   documented in `supabase/functions/.env.example`. The two sync cron jobs are
   intentionally paused until those values exist.
5. **No E2E tests.** AGENTS.md §20.3 lists a 12-step scenario; none automated.

---

## 8. File map

```
crm/
  src/
    app/
      (auth)/login/              Google sign-in, no-access and deactivated states
      (dashboard)/               authenticated shell + all business screens
      api/                       enquiry, presign, finalize, file access, reminders, export, health
      auth/callback/             OAuth code exchange
    components/
      ui/                        buttons, fields, dialog, badges, empty states
      shell/                     desktop sidebar + mobile bottom nav
      leads/ designs/ execution/ site-visits/ files/ notifications/ settings/ forms/
    lib/
      auth/ permissions/ validation/ utils/ tigris/ audit/ notifications/ email/ meta/
      env.ts  errors.ts  rate-limit.ts  settings.ts  state-machines.ts
    server/
      services/                  domain logic (the only place business rules live)
      actions/                   thin 'use server' wrappers
    types/database.ts            hand-written schema types
  supabase/
    migrations/                  13 files
    seed.sql                     local demo data
    functions/                   deployed Meta webhook/campaign/insights Edge Functions
  tests/unit/                    Meta mapping suite (12 passing)
```

---

## 9. Add-on briefs applied

Two briefs arrived after the baseline and both are authoritative over
`AGENTS.md` where they conflict:

1. **Meta integration add-on** — Supabase Edge Functions + Supabase Cron for
   campaign/insights sync, campaign & form field mapping, lead attribution,
   admin monitoring, user management with active-work warnings.
   *Explicitly forbids Vercel Cron for Meta sync.*
2. **SMTP email add-on** — provider-independent SMTP, `email_logs`, admin
   status + test email. *Explicitly forbids Brevo*, which supersedes an earlier
   instruction to use it. The Brevo module was removed.

`AGENTS.md` still needs updating to record all of this (Step 7).
