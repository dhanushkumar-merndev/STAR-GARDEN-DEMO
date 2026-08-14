# CAD + Landscape Material Estimation — Current Project Technical Response

**Prepared from:** the current repository, migrations, application code, and project instructions  
**Review date:** 14 August 2026  
**Application inspected:** `STAR-GARDEN-DEMO/crm`  

## Status terminology

- **IMPLEMENTED** means the capability is evidenced in the current code or migrations.
- **NOT IMPLEMENTED** means the capability is absent from the current application.
- **UNKNOWN** means the repository cannot establish the business, operational, hosting, or CAD-domain answer.
- This document contains no credentials, tokens, connection strings, or customer data.

## Executive summary

The current product is **Star Gardens CRM**, a single-company, responsive internal operations CRM. It covers lead intake, BDM follow-up, site visits, immutable landscape-design versions, review/approval, execution handoff, execution tasks/evidence, accounts, a limited read-only customer portal, reports, notifications, audit logging, Meta Lead Ads integration, SMTP email, private Tigris file storage, and Supabase authorization/RLS.

It is **not currently a CAD-processing, material-estimation, or BOQ system**. It can privately store and download DWG, DXF, and SKP files, but it does not parse them, preview them, extract geometry/metadata, map layers or blocks, calculate quantities, manage a material master, generate a BOQ, display a 2D/3D model, compare geometry, or run CAD background jobs.

---

## 1. Current application overview

- **Product name:** Star Gardens CRM.
- **Problem solved:** manages the operational journey from lead capture through assignment, calls/follow-ups, site visits, design review/versioning, execution handoff, task progress, evidence, closure, reporting, and audit history.
- **Completed major modules:**
  - Google-only staff/customer authentication and invitation/allowlist provisioning.
  - Role dashboards and responsive staff shell.
  - Manual, website, and Meta lead intake; normalization and duplicate handling.
  - Lead assignment, activities, call outcomes, follow-ups, and notifications.
  - Site visits, journey start/check-in/check-out coordinates, notes, and attachments.
  - Landscape design projects, assigned designer, immutable single-file versions, review, revision, and approval.
  - Private Tigris uploads/downloads with Supabase metadata.
  - Execution projects, assignees, tasks, blockers, evidence, progress, and completion.
  - Admin users/settings/options, reports/CSV, accounts, audit history, integration monitoring.
  - Meta Edge Functions/sync/mapping and SMTP email.
  - Limited customer portal for read-only project/account progress.
- **Under development:** ongoing CRM UI/refinement and test coverage. The worktree contains current uncommitted changes. No CAD-processing module is under development in the inspected code.
- **Planned but not started:** CAD processing, CAD/SKP viewers, material estimation, material master, BOQ, CAD tickets/annotations, procurement, inventory, and AI assistance are **NOT IMPLEMENTED**. Whether they are approved roadmap items is **UNKNOWN**.
- **Real customer usage:** **UNKNOWN**. Code includes development seed data and production-oriented configuration. Repository notes say migrations and Meta Edge Functions were deployed to a linked Supabase project, but live operational usage is not proven by the repository.
- **Tenancy:** single-company. This is explicitly not a multi-tenant SaaS product.
- **Company isolation:** not applicable; there is no organization/tenant key.
- **Expected initial users/concurrency:** **UNKNOWN**.
- **Production deployment:** Vercel configuration exists and repository notes refer to a linked production Supabase project. A currently live Next.js production deployment/domain is **UNKNOWN**.

## 2. Frontend stack

Exact locally installed versions at review time:

| Area | Current implementation |
|---|---|
| Framework | Next.js App Router **16.3.0** |
| UI runtime | React **19.2.8**, React DOM **19.2.8** |
| Language | TypeScript **5.9.3**, strict mode |
| UI components | Custom accessible components plus Radix UI primitives; not a stock shadcn installation |
| CSS | Tailwind CSS **4.3.3** plus global CSS |
| Client state | Local React state; no Redux or Zustand |
| Server state | Server Components, Server Actions, Route Handlers, Supabase client; no TanStack Query or SWR |
| Forms | Mostly native forms, controlled React forms, and Server Actions. React Hook Form **7.85.0** is installed but is not the dominant pattern found in current forms |
| Validation | Zod **3.25.76** plus shared server schemas |
| Charts | ECharts **6.1.0** |
| Maps | MapLibre GL **5.24.0** |
| Notifications | Sonner toast UI and in-app database notifications |

- **Web-only:** yes, responsive Next.js web application.
- **Native mobile app:** **NOT IMPLEMENTED**.
- **PWA:** a web manifest and installable shell assets exist; offline business-data support is **NOT IMPLEMENTED**.
- **WebGL/Canvas/SVG/3D:** MapLibre uses browser graphics for maps and ECharts renders charts. Icons are SVG. There is no CAD canvas, Three.js, Babylon.js, model renderer, or custom geometry viewer.

## 3. Backend architecture

- **Primary backend:** Supabase hosted services are intended and used for Auth and PostgreSQL. Whether the linked instance is Supabase Cloud rather than self-hosted is strongly implied but formally **UNKNOWN**.
- **PostgreSQL version:** **UNKNOWN** from repository code.
- **Separate Node API:** no separate Express/Nest backend. Next.js is the application backend.
- **Next.js APIs/Server Actions:** **IMPLEMENTED**.
- **Supabase Edge Functions:** **IMPLEMENTED** for Meta:
  - `meta-webhook`: verification, signature checking, raw event persistence, field mapping, idempotent Meta lead intake, audit events.
  - `meta-sync`: campaign/form synchronization from Meta Graph API.
  - `meta-insights-sync`: daily campaign insights synchronization.
- **Python backend:** **NOT IMPLEMENTED**.
- **Docker:** no application Dockerfile or current container deployment configuration.
- **Microservices:** **NOT IMPLEMENTED**.
- **Redis/queue:** **NOT IMPLEMENTED**. Scheduled work uses Supabase `pg_cron`/`pg_net`; no Redis, Kafka, BullMQ, or message broker.

## 4. Trigger.dev

Trigger.dev is **NOT IMPLEMENTED**.

- Version: **NOT IMPLEMENTED**.
- Hosted/self-hosted: **NOT IMPLEMENTED**.
- Jobs/triggers/file processing/email/report/AI jobs: **NOT IMPLEMENTED**.
- Trigger.dev retries/progress/failure handling/long-running jobs: **NOT IMPLEMENTED**.
- Current scheduled jobs instead use Supabase Cron:
  - hourly reminder route;
  - Meta campaign sync schedule;
  - Meta insights sync schedule.
- Meta sync jobs are documented as installed but paused until credentials are configured. This is separate from Trigger.dev.

## 5. Supabase database

### Existing tables

The migration set currently defines these 33 application tables:

1. `profiles`
2. `staff_invites`
3. `leads`
4. `lead_assignment_history`
5. `activities`
6. `follow_ups`
7. `site_visits`
8. `site_visit_attendees`
9. `design_projects`
10. `design_versions`
11. `execution_projects`
12. `execution_assignees`
13. `execution_tasks`
14. `files`
15. `file_access_logs`
16. `notifications`
17. `audit_logs`
18. `meta_webhook_events`
19. `meta_ad_accounts`
20. `meta_campaigns`
21. `meta_lead_forms`
22. `meta_campaign_forms`
23. `meta_field_mappings`
24. `meta_campaign_daily_insights`
25. `meta_sync_runs`
26. `email_logs`
27. `app_settings`
28. `config_options`
29. `execution_task_templates`
30. `rate_limit_hits`
31. `lead_accounts`
32. `lead_portal_access`
33. `admin_dashboard_cache`

### Domain mapping

- **Organizations/clients:** no organization table. Customer identity is primarily stored on `leads`; portal email grants use `lead_portal_access`.
- **Users:** Supabase Auth users plus `profiles`; pending allowlist entries use `staff_invites`.
- **Projects:** `design_projects`, `execution_projects`; the operational/customer root is a `lead`.
- **Files/documents:** `files` metadata and `file_access_logs`; bytes are not in Postgres.
- **Tickets/tasks:** `execution_tasks` and `follow_ups`. General CAD/review tickets are **NOT IMPLEMENTED**.
- **Approvals:** exact approved version is stored on `design_projects.approved_version_id`, with reviewer/timestamps on project/version rows. There is no generic approvals table.
- **Materials/products:** **NOT IMPLEMENTED**.
- **Quotations/BOQs:** **NOT IMPLEMENTED**. `lead_accounts` is only an agreed-value/payment/closure record, not a quotation or BOQ.
- **Execution:** `execution_projects`, `execution_assignees`, `execution_tasks`, and evidence in `files`.
- **Audit:** `audit_logs`, plus `file_access_logs`, `email_logs`, Meta event/sync logs.
- **Primary keys:** UUID primary keys are standard for core business records. Some configuration/cache/integration identities use text/composite keys.
- **Soft deletes:** not universal. Files use `is_archived`, `archived_at`, `archived_by`; portal grants use `revoked_at`; staff use `is_active`; Meta records retain presence flags. Immutable design versions cannot be deleted by normal users.
- **Timestamps:** `created_at`/`updated_at` are standard on mutable domain tables, with actor/timestamp fields where applicable.
- **Migrations:** established under `supabase/migrations/`; 23 migration files are currently present.

The sanitized schema source of truth is the SQL under `supabase/migrations/`.

## 6. Supabase RLS/security

- **RLS:** enabled and forced on application business tables by migrations. Policies exist for role/scoped reads and writes.
- **Tenant isolation:** not applicable; single-company.
- **Data isolation:** based on active profile, staff role, assigned BDM, assigned designer, site-visit attendance, execution assignment, lead ownership, customer portal email grant, and entity relationships.
- **Branch/site isolation:** no branch model. Site access follows the related lead/site visit/design/execution permissions.
- **Roles:** yes.
- **Separate granular permission table:** **NOT IMPLEMENTED**. Permissions are coded role/relationship predicates rather than user-specific permission records.
- **Data scope separate from role:** partially. A role defines capabilities; assignment/ownership defines which records are reachable.
- **Admins across organizations:** there are no organizations; Admin has company-wide access.
- **Audit:** append-oriented `audit_logs` plus sensitive file access logging.
- **Supabase Storage policies:** not applicable. Supabase Storage is not used for binary files.
- **File access:** server authorization plus private Tigris short-lived presigned URLs; metadata also has RLS.
- **Privileged operations:** a server-only Supabase service-role client is restricted to specific headless/cross-user operations such as public intake, Meta processing, audit/email logging, notification fan-out, and reminders. Normal user work uses the session-scoped client and server authorization.
- **RLS policy source:** `supabase/migrations/20260810120300_rls_policies.sql` plus later migrations for added tables and policy fixes.

## 7. Authentication

- **Provider:** Supabase Auth.
- **Email/password:** **NOT IMPLEMENTED**.
- **Phone OTP:** **NOT IMPLEMENTED**.
- **Email OTP:** **NOT IMPLEMENTED**.
- **Google login:** **IMPLEMENTED**, Google OAuth only.
- **Microsoft login:** **NOT IMPLEMENTED**.
- **MFA:** **NOT IMPLEMENTED**.
- **Invitation:** **IMPLEMENTED** through `staff_invites` email allowlisting and profile provisioning.
- **User roles:** yes.
- **Organization membership:** **NOT IMPLEMENTED**.
- **Project membership:** assignment relationships exist for designers, execution staff, BDM ownership, visit attendees, and portal grants; no generic membership table.

## 8. Existing roles and capabilities

Actual enum roles are `ADMIN`, `BDM`, `DESIGNER`, `EXECUTION`, and `CLIENT` (read-only customer portal).

| Capability | Admin | BDM | Landscape Designer | Execution | Client |
|---|---:|---:|---:|---:|---:|
| Create operational project/handoff | Yes | Owning BDM where allowed | No | No | No |
| Upload design versions | **No** | No | Assigned designer only | No | No |
| Revise design | Review/request revision | Request revision where authorized | Upload new immutable version | No | No |
| View/download design files | Yes | Assigned/owned lead | Assigned project | Exact approved execution version | Limited approved project data/files where portal exposes them |
| View CAD as CAD | **NOT IMPLEMENTED** for all roles; download only |
| Raise/edit CAD tickets | **NOT IMPLEMENTED** |
| Approve design | Yes | Owning BDM where authorized | No self-approval | No | No |
| See costs | Company-wide accounts | No dedicated cost permission | No | No | Own limited account summary in portal |
| Modify material rates | **NOT IMPLEMENTED** |
| Generate/approve BOQ | **NOT IMPLEMENTED** |
| Start execution | Yes | Owning BDM with approved version | No | No | No |
| Update execution work | Yes | Limited owning-BDM corrections/read visibility | No | Assigned execution staff | Read-only portal status |

## 9. Existing project structure

Current hierarchy:

```text
Single Star Gardens company
└─ Lead / customer job
   ├─ Activities and follow-ups
   ├─ Site visits
   │  ├─ Attendees
   │  └─ Attachments
   ├─ One active design project
   │  ├─ Assigned designer
   │  ├─ Immutable design versions (one file per version)
   │  └─ Exact approved version
   ├─ One active execution project
   │  ├─ Exact approved design-version reference
   │  ├─ Execution assignees
   │  ├─ Tasks
   │  └─ Evidence files
   ├─ Optional account record
   └─ Optional customer portal grants
```

- **One client with multiple projects:** there is no normalized client entity. The same person could have multiple leads, but they are separate jobs and duplicates are detected primarily by normalized mobile/email.
- **Multiple sites per project:** no project/site entity model. A lead has site fields and may have multiple site-visit records.
- **Multiple designs per project:** one active `design_project` per lead; cancelled projects may be historical. Each active design has multiple versions.
- **Multiple versions:** yes.
- **Revision/versioning:** yes, immutable sequential versions.
- **Approved version locked:** yes; approval references one exact version and further version uploads are blocked after approval.
- **Old versions:** remain visible/downloadable to authorized staff as history.

## 10. File upload system

- **Supabase Storage:** no.
- **Binary storage:** private Tigris Object Storage bucket; bucket name is environment configuration and is not included here.
- **Default maximum:** 50 MB per file, configurable in application settings.
- **Upload path:** authenticated browser requests server authorization, then uploads directly to Tigris using a short-lived presigned URL, then calls finalize.
- **Signed URLs:** yes, for upload/read; configured defaults are 300 seconds upload and 120 seconds download, capped at 900 seconds.
- **Privacy:** private objects; no permanent public file links.
- **Multipart/resumable:** **NOT IMPLEMENTED**.
- **Progress:** **IMPLEMENTED** with XHR upload progress and retry UI.
- **Antivirus/malware scan:** **NOT IMPLEMENTED**.
- **Validation:** extension allowlist, forbidden executable/web types, requested MIME validation, server-observed object metadata validation, non-zero/max-size checks, sanitized filename, UUID object key.
- **Original filenames:** preserved as metadata; not used as unique storage keys.
- **Checksum/hash:** stored when supplied, otherwise Tigris ETag may be recorded. This is not a guaranteed cryptographic content hash.
- **Duplicate-file detection:** **NOT IMPLEMENTED** as a content-deduplication workflow.
- **Preview:** PDF/images only. DOC/DOCX/XLS/XLSX/PPT/PPTX/DWG/DXF/SKP/ZIP are download-only.

## 11. Design package requirement

The proposed multi-file package is **NOT the current structure**.

- Current structure: one `design_version` has exactly one required `file_id`.
- A version containing DWG + SKP + PDF + images as sibling files is **NOT IMPLEMENTED**.
- Mandatory package contents: **UNKNOWN**.
- Multiple DWG/PDF/SKP/reference images in one version: **NOT IMPLEMENTED**.
- File categories: broad operational categories exist (`DESIGN_VERSION`, `DESIGN_SOURCE`, visit/evidence/lead categories), but package-level semantic categories such as master CAD/model/presentation/reference are **NOT IMPLEMENTED**.
- Manual category assignment: **NOT IMPLEMENTED** for a design package.
- Automatic type detection: extension and MIME are detected/validated; semantic role detection is **NOT IMPLEMENTED**.

Business decisions needed: whether a design version should become a package, which file roles are required, cardinality per role, and whether a version can be amended after creation.

## 12. CAD file requirements

All real-world CAD-domain answers are **UNKNOWN**:

- AutoCAD/DWG versions, DXF frequency, 2D/3D mix, typical/maximum sizes.
- XREFs, blocks/dynamic blocks, layer quality, hatches, dimensions, text/MTEXT, splines, solids, proxy objects.
- units, geolocation, coordinates, and scale reliability.

Current application behavior: `.dwg` and `.dxf` are accepted up to the configured file limit and are download-only. No contents are inspected.

## 13. Sample CAD files

- Sample CAD files supplied with this request: **NONE**.
- File metadata and expected extraction outputs: **UNKNOWN**.
- Required next input: 3–5 anonymized real DWG/DXF files with version, size, known contents, and manually verified expected quantities.

## 14. SketchUp requirements

All SketchUp domain answers are **UNKNOWN**. Direct `.skp` storage/download is supported, but parsing/preview is **NOT IMPLEMENTED**.

- SketchUp versions/sizes/model organization/metadata/standard components: **UNKNOWN**.
- GLB/GLTF/DAE sidecar export acceptance: **UNKNOWN**; these formats are not currently allowlisted.
- Direct SKP upload from day one: current CRM accepts SKP, but whether this is mandatory for the proposed CAD MVP is **UNKNOWN**.
- Sample SKP files supplied: **NONE**.

## 15. 3D viewer

All listed 3D viewer capabilities are **NOT IMPLEMENTED**, including rotate, zoom, pan, views, layers, selection, metadata, measurements, sections, annotations, screenshots, and version comparison.

Required viewer capabilities are a product/domain decision and remain **UNKNOWN**.

## 16. CAD metadata extraction

Every listed DWG/DXF extraction capability is **NOT IMPLEMENTED**: layers, blocks/instances, text, dimensions, coordinates, handles, lengths, areas, diameters, colors, materials, volume, elevation, custom attributes, and block attributes.

The exact required extraction set is **UNKNOWN** pending sample files and the manual estimating workflow.

## 17. Landscape CAD standards

- Existing layer convention: **UNKNOWN**.
- Standard block library/names: **UNKNOWN**.
- Designer compliance: **UNKNOWN**.
- Ability to enforce templates/blocks or warn/reject: **UNKNOWN** as a business decision and **NOT IMPLEMENTED** technically.

## 18. Non-standard CAD mapping

Unknown-layer mapping, remembered mappings, company/project/global scope, AI suggestions, and human approval are all **NOT IMPLEMENTED**. Preferred behavior is **UNKNOWN**.

Because the current product is single-company, a future company-specific mapping would presently be effectively global to Star Gardens unless a tenancy model is introduced.

## 19. Material master

A material database/master is **NOT IMPLEMENTED**. None of the listed fields—SKU, category, supplier, units, rates, tax, wastage, coverage, density, pack size, MOQ, stock, specifications, or CAD mappings—have a current material schema.

## 20. Material categories

Actual required material categories are **UNKNOWN**. No category master exists. The example category list has not been approved in current product documentation.

## 21. Material calculation rules

AREA-, LENGTH-, COUNT-, and VOLUME-based material calculations are **NOT IMPLEMENTED**. Actual material/formula lists and verified examples are **UNKNOWN**.

## 22. Derived materials

Derived/component materials, formulas, project/client variants, and estimator overrides are **NOT IMPLEMENTED**. Required examples and rules are **UNKNOWN**.

## 23. Wastage/allowances

Material/project/client wastage, approval, rounding, and pack-size logic are **NOT IMPLEMENTED**. Business rules are **UNKNOWN**.

## 24. BOQ

BOQ functionality is **NOT IMPLEMENTED**. There is no BOQ header/item schema and none of the requested quantity/rate/labour/tax/supplier fields exist as BOQ lines.

`lead_accounts` stores only total agreed amount, amount received, generated balance, currency, payment status, invoice reference/date, notes, and closure. It must not be mistaken for a BOQ, quotation, procurement, or costing engine.

## 25. BOQ approval

The proposed extraction → verification → estimator → BOQ → approval workflow is **NOT IMPLEMENTED**. Editors, verifiers, approvers, locks, revisions, customer approval, and change orders are **UNKNOWN**.

## 26. Current design approval workflow

Current project statuses:

```text
NOT_REQUIRED → REQUIRED → ASSIGNED → IN_PROGRESS
→ READY_FOR_REVIEW → REVISION_REQUESTED → APPROVED
or CANCELLED
```

Current version statuses:

```text
DRAFT → READY_FOR_REVIEW → REVISION_REQUESTED → APPROVED
or SUPERSEDED
```

Actual flow:

1. BDM determines design is required after qualification/site visit.
2. Admin or authorized owning BDM assigns a Landscape Designer.
3. Assigned designer uploads a new immutable version.
4. Designer marks it ready for review.
5. Admin/authorized owning BDM requests revision or approves.
6. Revision is a new version; old version remains history.
7. Approval records one exact version.
8. Execution handoff must reference that approved version.

There is no separate customer design-review state or automatic client approval flow.

## 27. Design revision/versioning

- Every current design upload creates a new version: yes.
- Add files to existing version: **NOT IMPLEMENTED**.
- Designer delete old version: no.
- Delete approved version: no.
- Preserve originals: stored privately; history is immutable. Formal forever-retention/backup policy is **UNKNOWN**.
- Visual/geometry comparison: **NOT IMPLEMENTED**.
- Quantity differences between versions: **NOT IMPLEMENTED**.

## 28. Tickets/change requests

A general ticket/change-request system is **NOT IMPLEMENTED**. Revision notes exist on design versions, and execution tasks/follow-ups exist, but they do not provide CAD object IDs, coordinates, screenshots, priorities, or a general ticket lifecycle.

## 29. Viewer annotations

CAD/model/PDF/image coordinate pins and persistent version-linked annotations are **NOT IMPLEMENTED**. Requirements are **UNKNOWN**.

## 30. PDF viewer

- Current: browser/native inline PDF preview through a signed URL and authorized download.
- Multi-page rendering: browser-dependent.
- Explicit custom zoom/pan/thumbnails/search/annotation/shapes/measurement/stamp/print controls: **NOT IMPLEMENTED**.

## 31. Image viewer

- Current: authorized inline preview and download for JPG/JPEG/PNG/WebP.
- Custom zoom/pan/full-screen/annotations/shapes/comparison: **NOT IMPLEMENTED**.

## 32. CAD/SKP/PDF/image relationships

Object-level linking is **NOT IMPLEMENTED**. A multi-file design-version package is also **NOT IMPLEMENTED**; currently each version references one file. Whether package-level grouping is sufficient is **UNKNOWN**.

## 33. Execution module

**IMPLEMENTED current workflow:**

1. Exact design version approved.
2. Admin/authorized owning BDM creates execution handoff.
3. One or more execution users assigned.
4. Tasks created from configurable templates and/or custom tasks.
5. Planned dates, due dates, task status, blockers, notes, progress, and evidence tracked.
6. Project statuses: `NOT_STARTED`, `ASSIGNED`, `IN_PROGRESS`, `BLOCKED`, `READY_FOR_REVIEW`, `COMPLETED`, `CANCELLED`.
7. Completion requires mandatory tasks, unless Admin supplies an override reason.

The example trade stages (procurement, hardscape, irrigation, etc.) are not hard-coded stages; they can currently be represented only as configurable/custom execution tasks.

## 34. Material execution tracking

Per-material estimated/requested/purchased/delivered/installed/damaged/returned tracking is **NOT IMPLEMENTED**.

- Inventory: **NOT IMPLEMENTED**.
- Procurement: **NOT IMPLEMENTED**.
- Purchase orders: **NOT IMPLEMENTED**.

## 35. Project progress

- Task progress: **IMPLEMENTED**.
- Project progress percentage: **IMPLEMENTED**, recalculated from tasks.
- Photos/evidence: **IMPLEMENTED** through private file uploads.
- Daily reports: **NOT IMPLEMENTED** as a dedicated module.
- Site engineer updates: execution users can update assigned work; no `SITE_ENGINEER` role.
- Customer progress view: limited read-only portal is **IMPLEMENTED**.
- Material consumption/planned-vs-actual quantity/cost: **NOT IMPLEMENTED**.

## 36. Current API structure

### Next.js Route Handlers

```text
src/app/api/
  accounts/export/route.ts
  cron/reminders/route.ts
  files/[fileId]/access/route.ts
  health/route.ts
  public/enquiry/route.ts
  reports/export/route.ts
  uploads/presign/route.ts
  uploads/finalize/route.ts
```

OAuth callback: `src/app/auth/callback/route.ts`.

### Server Action modules

```text
src/server/actions/
  accounts.ts
  admin.ts
  auth.ts
  files.ts
  leads.ts
  notifications.ts
  portal.ts
  workflow.ts
```

### Supabase Edge Functions

```text
supabase/functions/
  meta-webhook/index.ts
  meta-sync/index.ts
  meta-insights-sync/index.ts
  _shared/{config,db,lead-fields,meta}.ts
```

- Trigger.dev: **NOT IMPLEMENTED**.
- Python services: **NOT IMPLEMENTED**.
- External APIs/services: Supabase, Tigris S3-compatible API, Meta Graph API, Google OAuth, generic SMTP, optional Cloudflare Turnstile, Google Maps links, WhatsApp `wa.me` deep links.

## 37. Current folder structure

```text
repository root/
  src/                     Vite marketing website
  public/                  marketing assets
  crm/
    src/
      app/                 Next.js routes and screens
      components/          UI/domain components
      lib/                 auth, Supabase, Tigris, permissions, validation, audit, etc.
      server/
        actions/
        services/
      types/database.ts
    supabase/
      migrations/
      functions/
      seed.sql
    tests/unit/
    public/
    scripts/
```

There is no `trigger/`, Python service, CAD processor, or viewer package.

## 38. Git repository/tooling

- Repository: one Git repository containing a root Vite marketing site and nested `crm/` Next.js application; operationally monorepo-like but without a root workspace connecting both apps.
- Current branch: `main`.
- Branch strategy: **UNKNOWN**.
- Remote: GitHub repository configured; URL omitted from this shareable technical response unless specifically required.
- CRM package manager artifacts: both `pnpm-lock.yaml` and `package-lock.json` exist; a `pnpm-workspace.yaml` is present in `crm/`. The active/authoritative package manager convention should be confirmed.
- Node requirement: `>=20.9.0`.
- Relevant sanitized configuration is present: `package.json`, lockfiles, `tsconfig.json`, `next.config.ts`, `vercel.json`, `.env.example`, migrations, and Edge Functions.
- Supabase CLI project config (`supabase/config.toml`): not present in the inspected tree.
- Trigger.dev config: **NOT IMPLEMENTED**.
- Secrets: `.env` exists locally and must never be shared. Only `.env.example`/`.env.deployment.example` are safe templates.

## 39. Hosting/infrastructure

- Frontend target: Vercel-compatible Next.js; `vercel.json` declares Next.js.
- Confirmed live frontend host/domain: **UNKNOWN**.
- Database/Auth: linked Supabase project documented; region and exact hosting mode **UNKNOWN**.
- Object storage: Tigris private bucket, S3-compatible endpoint; exact bucket/limits beyond app's 50 MB default are **UNKNOWN**.
- Scheduled jobs: Supabase Cron (`pg_cron` + `pg_net` + Vault).
- Trigger.dev region: **NOT IMPLEMENTED**.
- CDN/custom domain/server duration: **UNKNOWN**.

## 40. CAD processing infrastructure

Current separate CAD-processing infrastructure is **NOT IMPLEMENTED**.

- Docker/Python/background worker permission: **UNKNOWN** business/infrastructure decision.
- 5–30 minute jobs and multi-GB RAM allowance: **UNKNOWN**.
- Additional servers acceptable: **UNKNOWN**.
- Must stay only on Vercel/Supabase: **UNKNOWN**.

Architecturally, long-running CAD conversion/extraction should not be placed in ordinary short-lived Next.js requests. A separate queued/containerized processor would be a new architecture requiring explicit approval because the current MVP intentionally avoids microservices/queues without demonstrated need.

## 41. File-processing UX

- Current upload statuses: local selection/validation, uploading percentage, success/failure, retry/finalization.
- Queued/processing/extracting geometry/generating preview/calculating quantities: **NOT IMPLEMENTED**.
- Continue after browser closes: direct object upload/finalize does not provide an independent processing job; CAD processing is **NOT IMPLEMENTED**.
- Completion notification for processing: **NOT IMPLEMENTED**.
- Existing notification channels available for future integration: in-app and SMTP email. Automatic WhatsApp sending is intentionally **NOT IMPLEMENTED**.

## 42. Performance expectations

- Application default maximum file: 50 MB.
- Typical/maximum CAD, SKP, PDF sizes: **UNKNOWN**.
- Files per design project: multiple versions are allowed, but one file per version; business maximum is not specified.
- Objects/model, simultaneous uploads, CAD processing time, viewer opening time: **UNKNOWN** / processing and viewer **NOT IMPLEMENTED**.

## 43. Mobile requirements

- Site-team mobile access: **IMPLEMENTED** as responsive web UI for phone/tablet.
- Site photos/evidence upload from mobile: **IMPLEMENTED**.
- Visit-scoped geolocation: **IMPLEMENTED** for journey/check-in/check-out; no background tracking.
- Offline access: **NOT IMPLEMENTED**.
- CAD/3D viewer on mobile/desktop: **NOT IMPLEMENTED**.
- QR material/asset identification: **NOT IMPLEMENTED**.
- Required future viewer device scope: **UNKNOWN**.

## 44. AI requirements

No AI provider or AI feature is currently used. All listed AI capabilities are **NOT IMPLEMENTED**. Desired AI capabilities are **UNKNOWN**.

Any future quantity calculation should be deterministic, versioned, auditable, and human-reviewed; AI suggestions should not silently become approved quantities.

## 45. Notifications

### Existing channels

- In-app notifications: **IMPLEMENTED**.
- SMTP email: **IMPLEMENTED** for configured workflow messages.
- WhatsApp: only manual deep links that open the user's/customer's WhatsApp; automatic/API messaging is **NOT IMPLEMENTED**.
- SMS: **NOT IMPLEMENTED**.
- Push notifications: **NOT IMPLEMENTED**.

### Current event coverage

Current CRM includes lead assignment, reminder, visit, design assignment/version/revision/approval, execution assignment/blocker/completion events across in-app and selected email workflows.

- Design uploaded/ready/revision/approved: substantially **IMPLEMENTED**.
- Ticket assigned: **NOT IMPLEMENTED** because tickets do not exist.
- BOQ approved: **NOT IMPLEMENTED**.
- Execution started/assigned: execution notifications exist; exact desired “started” notification behavior should be confirmed.

## 46. Audit requirements

Current audit supports actor, action, entity, before/after JSON, request metadata where safely available, and timestamp.

- Who uploaded a design/date/time/version: **IMPLEMENTED**.
- Who approved/exact approved version: **IMPLEMENTED**.
- File downloads/access: **IMPLEMENTED**.
- Original approved design checksum: exact version/file reference and stored checksum/ETag field exist; a guaranteed cryptographic hash policy is **NOT IMPLEMENTED**.
- Material mappings/calculated quantities/overrides/reasons: **NOT IMPLEMENTED**, because material estimation does not exist.

## 47. Existing screens

Implemented screens/routes include dashboards, leads/details/forms, follow-ups, site visits/maps, design queue/project/version history/upload/review, execution board/project/tasks/evidence, notifications, accounts, reports/export, users/roles, settings/options/audit, integrations/Meta mapping/issues/ads, profile, login, and customer portal.

- CAD viewer: **NOT IMPLEMENTED**.
- Materials: **NOT IMPLEMENTED**.
- BOQ: **NOT IMPLEMENTED**.
- General tickets: **NOT IMPLEMENTED**.
- Screenshots/video were not generated as part of this code-based response. Existing application access or a separate screenshot pack is required.

## 48. Current problems/technical debt

Evidence-backed known items:

- `src/types/database.ts` is hand-maintained; repository notes recommend regenerating/diffing against the linked Supabase schema.
- Unit tests exist and pass, but the full required integration/E2E workflow suite is not present.
- Both npm and pnpm lockfiles exist in `crm/`; one package manager should be declared authoritative.
- There is no CAD-domain schema or processing boundary; adding it directly to request/response paths would be risky.
- One design version currently equals one file, which conflicts with the proposed multi-file design-package model.
- No antivirus scanning exists for uploaded design files.
- Current architecture/modules that should not be silently replaced: Supabase Auth/Postgres/RLS, private Tigris storage, immutable design versions, exact approved-version execution handoff, server authorization, visit-scoped location only, and normal-SIM `tel:` calls.
- Slow areas/production bugs/database replacements planned: **UNKNOWN** beyond repository notes and current fixes.

## 49. Business priority

Priority ranking for CAD upload, viewers, extraction, mapping, quantities, costing, BOQ, tickets, procurement, inventory, execution, and AI is **UNKNOWN**. It must be supplied by the product owner and CAD/estimation team.

The current application already has basic CAD/SKP file upload/download and execution tracking, but “CAD upload” currently means private storage only—not processing or preview.

## 50. MVP definition for CAD/material estimation

The existing CRM MVP is defined separately in the project instructions. A CAD/material-estimation MVP has **not been approved or defined**.

### MUST HAVE

**UNKNOWN — product decision required.** At minimum, discovery must first establish real file standards, sample expected outputs, units, mappings, formulas, verification, and approval ownership.

### SHOULD HAVE

**UNKNOWN.**

### LATER

**UNKNOWN.**

No CAD automation should be committed to an MVP before Section 53 and real sample-project validation are completed.

## 51. Deadline

- First demo: **UNKNOWN**.
- CAD MVP deadline: **UNKNOWN**.
- Waiting customer/fixed launch: **UNKNOWN**.

## 52. Development team

Frontend/backend/Python/CAD expert/design/QA/DevOps headcount and experience are **UNKNOWN**.

The repository history/current workspace alone cannot reliably identify team capacity.

## 53. Most important domain question

The repository cannot answer how Star Gardens manually converts CAD into a material BOQ. This must be answered by the estimator/CAD team.

Required workshop output:

1. exact layers inspected;
2. blocks counted;
3. areas measured;
4. lengths measured;
5. formulas and unit conversions;
6. wastage/rounding/pack rules;
7. manually entered non-CAD information;
8. common drawing/estimation mistakes;
9. verifier and reconciliation method;
10. final approval/lock criteria.

**Status: UNKNOWN — blocking discovery input for a trustworthy estimation engine.**

## 54. Example real project

No anonymized completed CAD estimation project was supplied. DWG/DXF, SKP, PDF, images, BOQ, quotation, revisions, and actual installed quantities are **UNKNOWN/unavailable**.

This example is required to compare CAD-derived, estimator-approved, and actual quantities before selecting automation scope.

## 55. Technical files available to share safely

Safe after a final secret review:

- `crm/package.json`
- `crm/pnpm-lock.yaml` or `crm/package-lock.json` after selecting the authoritative package manager
- `crm/tsconfig.json`
- `crm/next.config.ts`
- `crm/vercel.json`
- `crm/.env.example` and `.env.deployment.example` only
- `crm/supabase/migrations/*.sql`
- `crm/supabase/functions/**` source
- `crm/src/app/api/**`
- `crm/src/server/actions/**`
- `crm/src/server/services/files.ts`
- `crm/src/lib/permissions/**`
- `crm/src/lib/tigris/**`
- `crm/src/lib/utils/files.ts`
- `crm/src/components/files/**`
- sanitized folder tree and selected screenshots

Not currently available because they are **NOT IMPLEMENTED** or were not supplied:

- Trigger.dev jobs/config
- Python CAD service
- material/BOQ/ticket schemas
- CAD/SKP viewers
- 3–5 real CAD samples
- 2–3 SKP samples
- sample PDF/project BOQ/quotation/actual quantities

Never share `.env`, Supabase service-role keys, Tigris credentials, Meta tokens, SMTP credentials, cron secrets, Vault contents, database passwords, customer payloads, or generated signed URLs.

---

## Decisions required before CAD/estimation architecture starts

1. Provide the manual estimating process from Section 53.
2. Provide anonymized real sample projects and verified expected outputs.
3. Decide whether one design version becomes a multi-file immutable package.
4. Define supported CAD/SKP versions, units, XREF handling, and file-size envelope.
5. Define the CAD layer/block standard and unknown-layer approval workflow.
6. Define the material master, deterministic formulas, wastage, rounding, and overrides.
7. Define estimator/reviewer/approver roles and BOQ revision/change-order states.
8. Rank the viewer, extraction, BOQ, ticketing, procurement, inventory, and AI priorities.
9. Approve or reject a separate queued/containerized CAD-processing service.
10. Set demo/MVP dates and expected load.
