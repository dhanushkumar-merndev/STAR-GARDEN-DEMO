# CONTINUE.md — Star Garden CRM build handoff

> Paste this file back to Claude to resume the build exactly where it stopped.
> Spec of record: [`../AGENTS.md`](../AGENTS.md). Section numbers below refer to it.

**Last updated:** 2026-08-10
**App location:** `crm/` (Next.js 15 App Router + TypeScript)

---

## 0. Context a fresh session needs

- The repo **root** is an existing, already-deployed **Vite + React marketing SPA**
  (`src/`, `index.html`, `vercel.json`). It is NOT the CRM and must not be rewritten.
- AGENTS.md §4.1 mandates Next.js, so the CRM was scaffolded as a **separate app in `crm/`**.
  The marketing site will later POST its contact form to the CRM's
  `POST /api/public/enquiry` endpoint to satisfy §11.8.
- The owner will supply **Supabase**, **Tigris**, and **Meta/Facebook** credentials later.
  Every variable they need is documented in [`crm/.env.example`](.env.example).
  Nothing is hard-coded; all three integrations fail soft when unconfigured.

---

## 1. Status board

| # | Area | State |
|---|------|-------|
| 1 | Scaffold: `package.json`, `tsconfig`, `next.config.ts`, postcss, `.env.example`, `vercel.json`, vitest | DONE |
| 2 | DB migrations: enums, tables, functions/triggers, RLS | DONE |
| 3 | DB seed + config options | TODO |
| 4 | `lib/`: supabase clients, session, permissions, Zod, phone/file utils, Tigris, audit, rate limit | TODO |
| 5 | `server/services` + `server/actions` | TODO |
| 6 | API routes: Meta webhook, public enquiry, presign, finalize, file access, cron, CSV export | TODO |
| 7 | UI: auth, dashboards, leads, follow-ups, visits, designs, execution, admin | TODO |
| 8 | Unit tests | TODO |
| 9 | `npm install` + typecheck + build verification | TODO |

---

## 2. Files written so far

```
crm/
  package.json          next.config.ts       tsconfig.json
  postcss.config.mjs    vitest.config.ts     vercel.json
  .env.example          .gitignore           CONTINUE.md
  supabase/migrations/
    20260810120000_init_enums.sql        -- §9 state machines as PG enums
    20260810120100_core_tables.sql       -- §10 all tables, indexes, constraints
    20260810120200_functions_triggers.sql-- RLS helpers + domain invariants
    20260810120300_rls_policies.sql      -- §7.5 RLS on all 21 tables
```

---

## 3. Decisions already locked in (do not re-litigate)

1. **CRM lives in `crm/`**, root marketing SPA untouched.
2. **RLS is layer two, not layer one.** Every server action re-checks
   authorization itself (§7.5). Normal reads/writes use the *user-scoped*
   Supabase client so RLS applies.
3. **`service_role` is used only** for: Meta webhook intake, public website
   enquiries, audit-log writes, notification fan-out to *other* users, and the
   reminder cron — each after the caller's own authorization check passed.
4. **RLS helper functions live in schema `app`**, are `SECURITY DEFINER` with a
   pinned `search_path`, so policies on `profiles` do not recurse.
5. **Deactivation is instant**: `app.is_active_user()` returns false, which makes
   every access predicate false (§15).
6. **Design history is immutable**: triggers block changing a version's identity
   and block deletes from `authenticated`/`anon` roles. No DELETE policy exists
   on `design_versions` or `audit_logs` (§5.6, §17, §18).
7. **Execution cannot start without an APPROVED version** belonging to the same
   lead — enforced by trigger `app.guard_execution_source_version`, not just app
   code (§8.5, §18).
8. **Exactly one approved design version** per project — trigger
   `app.enforce_single_approved_version` supersedes the previous one.
9. **Files: metadata in Postgres, bytes in private Tigris.** Object keys are
   UUID-based (§5.4); the original filename is never the storage path.
10. **No telephony.** `tel:` links only. A `CALL_ATTEMPT` timestamp records that
    the dialler opened — never that a call connected (§6.3).

---

## 4. Key schema facts to remember

- 21 tables, all with RLS enabled **and forced**.
- Enums: `user_role`, `lead_source`, `lead_status`, `site_visit_status`,
  `design_status`, `design_version_status`, `execution_status`,
  `execution_task_status`, `follow_up_status`, `activity_type`, `call_outcome`,
  `file_category`, `webhook_processing_status`, `notification_type`.
- Access predicates available to policies AND to app code via RPC:
  `app.can_read_lead`, `app.can_write_lead`, `app.can_read_design_project`,
  `app.can_read_execution_project`, `app.can_read_file`, `app.is_admin`,
  `app.is_active_user`, `app.current_user_role`.
- Lead codes auto-generate as `SG-YYYY-NNNNNN` from `lead_code_seq`.
- `profiles` rows are auto-provisioned by the `on_auth_user_created` trigger from
  `raw_user_meta_data` (`full_name`, `mobile`, `role`).
- `meta_webhook_events.provider_event_id` is UNIQUE → Meta retries are no-ops.
- `notifications` has a per-day dedupe unique index → cron reminders are idempotent.

---

## 5. Next steps, in order

1. Seed migration: `app_settings` (max upload MB), `config_options`
   (loss reasons, lead sources), `execution_task_templates`.
2. `src/lib/env.ts` — lazy, per-integration env validation (never throw at build).
3. `src/lib/supabase/{server,browser,admin,middleware}.ts` using `@supabase/ssr`.
4. `src/lib/permissions/` — mirror of the SQL predicates for server-side checks.
5. `src/lib/validation/` — shared Zod schemas (§15).
6. `src/lib/utils/phone.ts` — India normalization to last 10 digits (§8.1).
7. `src/lib/utils/files.ts` — extension/MIME allowlist, sanitization (§5.2, §5.3).
8. `src/lib/tigris/` — S3 client + presigned PUT/GET.
9. `src/server/services/*` — domain logic, transactions for assignment /
   approval / execution handoff (§18).
10. Route handlers, then UI, then tests.

---

## 6. Verification not yet run

`npm install`, `tsc --noEmit`, `next build`, and `vitest` have **not** been run
yet. Do this before claiming the build is production-ready.
