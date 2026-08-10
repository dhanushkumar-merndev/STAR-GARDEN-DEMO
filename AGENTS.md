# AGENTS.md — Star Garden CRM

## 1. Purpose

Build a simple, production-ready, mobile-first internal CRM for **Star Garden**.

The system must manage the complete operational flow:

1. Capture a lead from Meta Lead Ads, the public landing page, or manual entry.
2. Assign the lead to a Business Development Manager (BDM).
3. Let the BDM call the customer using the employee's normal SIM/mobile dialler.
4. Manually record call outcomes, notes, follow-ups, and site visits.
5. Assign qualified design work to a Landscape Designer.
6. Let the designer upload design versions securely.
7. Let the BDM/Admin review, download, and manually share the approved file with the customer.
8. Hand the approved design to the Execution Team.
9. Track execution tasks, progress, blockers, and completion.

This is an internal staff CRM. It is not a customer portal and it is not a multi-tenant SaaS product.

---

## 2. Product Principles

- Keep the MVP simple and operational.
- Prefer clear workflows over unnecessary automation.
- Build mobile-first because staff will commonly use the CRM through a phone browser.
- Enforce all permissions on the server and database, not only in the UI.
- Keep customer data and uploaded files private.
- Preserve a complete audit trail for assignments, status changes, downloads, and handoffs.
- Keep status values and configurable business options in the database rather than scattering hard-coded text throughout the application.
- Do not add unapproved modules or turn the CRM into an ERP.

---

## 3. Locked MVP Scope

### 3.1 Included

- Secure staff authentication.
- Four roles: Admin, BDM, Landscape Designer, and Execution Team.
- Meta Lead Ads webhook integration.
- Public landing-page enquiry form.
- Manual lead creation.
- Duplicate detection using normalized mobile number and optional email.
- Lead assignment and reassignment.
- Click-to-call using the employee's regular phone/SIM.
- Manual call outcome entry.
- Follow-up tasks and reminders.
- Site-visit scheduling and visit notes.
- Optional one-time location capture during check-in/check-out.
- Designer assignment and in-app notifications.
- Private design-file upload, version history, preview, and download.
- Design review, revision, and approval workflow.
- Execution project creation from an approved design.
- Execution tasks, progress, blockers, evidence uploads, and closure.
- Role-specific dashboards.
- Filtered CSV export for Admin.
- Audit logs.
- Responsive mobile/desktop web application.

### 3.2 Excluded

Do not implement the following in the MVP unless the project owner explicitly changes this document:

- Virtual phone number.
- Exotel, Twilio, Knowlarity, Airtel IQ, or any telephony API.
- Automatic call recording.
- Automatic call-duration or connected-call detection.
- Incoming-call identification.
- WhatsApp Business API or an in-CRM WhatsApp inbox.
- Automatic WhatsApp file sending.
- Customer login or customer portal.
- Public permanent design-file links.
- Continuous/background GPS tracking.
- Native Android or iOS applications.
- Accounting, GST invoicing, payroll, inventory, or vendor ERP.
- AI-generated landscape design.
- Redis, Kafka, BullMQ, or a separate microservice architecture unless a proven need appears.

---

## 4. Final Technical Architecture

Use the following architecture unless a blocker is documented.

### 4.1 Application

- **Frontend and backend:** Next.js App Router with TypeScript.
- **UI:** Tailwind CSS and shadcn/ui or equivalent accessible components.
- **Forms and validation:** React Hook Form with Zod.
- **Deployment:** Vercel or another compatible Next.js host.
- **Application APIs:** Next.js Route Handlers and Server Actions.
- **Design:** Responsive web app with an optional installable PWA shell.

A separate NestJS/Express backend is not required for this MVP.

### 4.2 Supabase Responsibilities

Use Supabase for:

- PostgreSQL database.
- Staff authentication and sessions.
- Row Level Security policies.
- Lead, activity, task, project, notification, and audit records.
- File metadata and file-access records.
- Optional Realtime updates for notifications and dashboards.

Do **not** store the same uploaded file in both Supabase Storage and Tigris.

### 4.3 Tigris Responsibilities

Use Tigris Object Storage for all uploaded binary files:

- Landscape designs.
- Design source files.
- Site-visit attachments.
- Execution progress evidence.
- Completion evidence.

Tigris buckets must remain private. Generate short-lived presigned URLs on the server for authorized upload, preview, or download operations.

### 4.4 Recommended Data Flow

1. The authenticated client requests an upload authorization from a server endpoint.
2. The server verifies the user's role and access to the related lead/project.
3. The server validates the requested filename, MIME type, category, and size.
4. The server creates a short-lived Tigris presigned upload URL.
5. The browser uploads directly to Tigris.
6. The client calls a finalize endpoint.
7. The server verifies the object and creates a `files` database record in Supabase.
8. When viewing/downloading, the server re-checks authorization and returns a short-lived signed read URL.
9. Every sensitive download is written to `audit_logs` and optionally `file_access_logs`.

Never expose Tigris secret keys, Supabase service-role keys, or unrestricted bucket credentials to the browser.

---

## 5. File Upload, Preview, and Download Rules

### 5.1 Storage Separation

- Supabase stores metadata only: filename, object key, MIME type, size, checksum, uploader, lead/project relation, version, approval state, and timestamps.
- Tigris stores the actual file bytes.
- Database deletion must not silently orphan storage objects.
- Storage deletion must not silently leave a live database record.
- Prefer soft deletion with an Admin-controlled cleanup process.

### 5.2 MVP File Types

#### Inline preview supported

- PDF: `.pdf`
- Images: `.jpg`, `.jpeg`, `.png`, `.webp`

Use a signed URL for preview. Images may use a standard image viewer. PDFs may use the browser PDF viewer or PDF.js.

#### Download-only supported

These may be stored and downloaded but do not require an in-browser preview:

- Microsoft Word: `.doc`, `.docx`
- Microsoft Excel: `.xls`, `.xlsx`
- PowerPoint: `.ppt`, `.pptx`
- CAD/design source: `.dwg`, `.dxf`, `.skp`
- Archives: `.zip`

The UI must clearly show **Preview unavailable — Download file** for download-only formats.

### 5.3 File Limits

- Default maximum file size: **50 MB per file**.
- Make the limit configurable in application settings.
- Reject zero-byte files.
- Validate both file extension and server-observed MIME type.
- Sanitize filenames and generate an internal UUID-based object key.
- Do not use the original filename as the unique storage path.
- Never allow executable or active web-content uploads such as `.exe`, `.apk`, `.bat`, `.cmd`, `.sh`, `.js`, `.html`, `.php`, or similar files.
- For files above the configured direct-upload limit, show a clear validation error. Multipart upload can be added later if genuinely required.

### 5.4 Object Key Convention

Use a predictable private key pattern, for example:

```text
leads/{leadId}/designs/{designProjectId}/v{versionNumber}/{fileId}-{safeFilename}
execution/{executionProjectId}/evidence/{taskId}/{fileId}-{safeFilename}
site-visits/{siteVisitId}/{fileId}-{safeFilename}
```

### 5.5 File Permissions

- **Admin:** Upload, view, download, archive, and manage all files.
- **BDM:** View/download files belonging to assigned leads; upload relevant customer/site attachments; cannot delete approved history.
- **Landscape Designer:** View related requirement information; upload design versions; view/download files for assigned design projects.
- **Execution Team:** View/download the approved design for assigned execution projects; upload execution evidence.
- **Customer/public user:** No direct file access in MVP.

The BDM may download an approved file and manually send it to the customer outside the CRM. Record the download in the audit log. The CRM cannot verify what happens after the file leaves the system.

### 5.6 Design Versioning

- Never overwrite an existing design version.
- Each upload creates a new immutable `design_versions` row.
- Version numbers are sequential per design project.
- Store a version note and uploader.
- Only one version may be marked as the current approved version.
- Old versions remain visible to authorized staff as read-only history.
- Execution handoff must reference the exact approved design version, not merely the latest file.

---

## 6. Call Management Without a Virtual Number

The project has no virtual number and no telephony API.

### 6.1 Required Call Flow

1. BDM opens a lead.
2. BDM clicks **Call Customer**.
3. The CRM opens the device dialler with a `tel:` link using the normalized customer number.
4. The call takes place through the BDM's normal SIM.
5. After the call, the BDM manually records the result.

### 6.2 Required Manual Call Fields

- Outcome:
  - Connected
  - No answer
  - Busy
  - Switched off
  - Invalid number
  - Call later
  - Interested
  - Not interested
- Notes.
- Next action.
- Follow-up date and time when required.
- Optional preferred site-visit date.
- Updated lead stage when appropriate.

### 6.3 Important Limitations

The CRM must not claim to automatically know:

- Whether the customer answered.
- Actual call duration.
- Exact call start/end time.
- Whether the call was missed.
- Call recording.
- Incoming-call details.
- Conversation content.

A timestamp created when the user clicks **Call Customer** is only an activity timestamp and is not proof that a call connected.

Use the feature name **Call Activity and Follow-up Management**, not **Telephony Integration**.

---

## 7. Roles and Authorization

Use a strict role enum:

```text
ADMIN
BDM
DESIGNER
EXECUTION
```

### 7.1 Admin

- View and manage all leads and projects.
- Create/deactivate users.
- Assign/reassign leads and projects.
- Manage configurable statuses, sources, loss reasons, and reminder rules.
- View reports, exports, audit logs, and file-access history.
- Approve or override handoffs when authorized.

### 7.2 BDM

- View leads assigned to them.
- Create a manual lead when permitted.
- Call via the normal device dialler.
- Log calls, notes, and follow-ups.
- Schedule and complete site visits.
- Mark whether landscape design is required.
- Request designer assignment.
- Review/download design versions for assigned leads.
- Request revision or mark customer/internal approval when permitted.
- View execution progress for their customers.

### 7.3 Landscape Designer

- View only assigned design projects and necessary related lead/site details.
- View visit requirements and optionally attend a scheduled visit.
- Upload new design versions.
- Add design notes.
- Mark a version ready for review.
- Respond to revision requests.
- Cannot view unrelated leads or execution projects.

### 7.4 Execution Team

- View assigned execution projects.
- View the exact approved design version.
- Update project status.
- Create/update assigned tasks when permitted.
- Add progress notes, blockers, due dates, and completion evidence.
- Cannot view unrelated leads or unapproved design versions.

### 7.5 Authorization Rules

- UI visibility is not security.
- Every server action, route handler, and database operation must re-check authorization.
- Use Supabase RLS as an additional enforcement layer.
- Never trust role, user ID, lead ID, or project ID supplied by the browser without server verification.
- The Supabase service-role key is server-only and must not be used as a shortcut that bypasses authorization logic.

---

## 8. Business Workflow

### 8.1 Lead Intake

Lead sources:

```text
META_FACEBOOK
META_INSTAGRAM
WEBSITE
MANUAL
OTHER
```

Flow:

1. Receive or create lead.
2. Normalize the mobile number to the last valid 10 Indian digits and store country code separately/default to `+91` where appropriate.
3. Search for an existing active lead with the same normalized mobile number.
4. Warn or merge according to Admin permissions; never silently create duplicates.
5. Save source and original source metadata.
6. Place new lead in the unassigned queue or assign it to a BDM.
7. Notify the assigned BDM.

### 8.2 BDM Qualification

The BDM:

- Calls the customer.
- Logs the outcome.
- Adds notes and requirements.
- Creates the next follow-up.
- Schedules a site visit when applicable.
- Marks the lead qualified, lost, or still under follow-up.

A live lead should normally have a visible next action. The dashboard must flag active leads with no next action.

### 8.3 Site Visit

Required fields:

- Scheduled start date/time.
- Customer/site address.
- Map link or coordinates when available.
- BDM attendee.
- Optional Landscape Designer attendee.
- Visit status.
- Visit notes.
- Requirement summary.
- Photos/attachments when permitted.
- Check-in/check-out timestamps.
- Optional single check-in/check-out coordinates after explicit browser permission.

Do not perform continuous location tracking. Do not collect location when the user has not actively checked in or shared it.

### 8.4 Design Handoff

1. BDM marks `design_required = true` after qualification/site visit.
2. Admin or authorized BDM assigns a Landscape Designer.
3. Designer receives an in-app notification.
4. Designer sees the requirement, site details, visit notes, and allowed attachments.
5. Designer uploads version 1 and marks it ready for review.
6. BDM/Admin reviews it.
7. Reviewer may request revision or approve the version.
8. Revisions create new versions; previous versions remain immutable.
9. Approval identifies one exact approved version.

### 8.5 Execution Handoff

1. Only an approved design version can create an execution project.
2. Copy/reference the customer, site, requirement, and approved design version.
3. Assign one or more execution staff/users.
4. Create tasks from a configurable checklist with optional custom tasks.
5. Track planned start, due date, progress, blockers, notes, and evidence.
6. Completion requires all mandatory tasks to be complete or an Admin override with a reason.
7. Close the project and retain the full history.

---

## 9. State Machines

Do not use one overloaded status column for every workflow. Keep lead, design, and execution states separate.

### 9.1 Lead Status

```text
NEW
UNASSIGNED
ASSIGNED
CONTACTED
FOLLOW_UP
SITE_VISIT_SCHEDULED
SITE_VISIT_COMPLETED
QUALIFIED
LOST
CLOSED
```

### 9.2 Site Visit Status

```text
SCHEDULED
RESCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

### 9.3 Design Status

```text
NOT_REQUIRED
REQUIRED
ASSIGNED
IN_PROGRESS
READY_FOR_REVIEW
REVISION_REQUESTED
APPROVED
CANCELLED
```

### 9.4 Execution Status

```text
NOT_STARTED
ASSIGNED
IN_PROGRESS
BLOCKED
READY_FOR_REVIEW
COMPLETED
CANCELLED
```

### 9.5 Follow-up Status

```text
OPEN
COMPLETED
CANCELLED
OVERDUE
```

Validate transitions server-side. Do not permit arbitrary direct jumps when required data or approvals are missing.

---

## 10. Minimum Database Model

Use UUID primary keys, `created_at`, `updated_at`, and actor fields where relevant.

### 10.1 `profiles`

- `id` references Supabase Auth user.
- `full_name`
- `mobile`
- `role`
- `is_active`
- `last_login_at`
- timestamps

### 10.2 `leads`

- `id`
- `lead_code`
- `customer_name`
- `mobile_country_code`
- `mobile_normalized`
- `email`
- `location_text`
- `site_address`
- `requirement_summary`
- `source`
- `source_reference`
- `meta_page_id`
- `meta_form_id`
- `meta_lead_id`
- `status`
- `assigned_bdm_id`
- `next_action_at`
- `last_activity_at`
- `lost_reason`
- `created_by`
- timestamps

Create unique protection for `meta_lead_id` when present. Add indexes for mobile, status, owner, next action, and creation date.

### 10.3 `lead_assignment_history`

- `id`
- `lead_id`
- `from_user_id`
- `to_user_id`
- `reason`
- `changed_by`
- `created_at`

### 10.4 `activities`

- `id`
- `lead_id`
- `type`
- `outcome`
- `notes`
- `activity_at`
- `created_by`
- timestamps

Activity types include call attempt, connected call, note, follow-up completion, site visit, assignment, design update, execution update, and closure.

### 10.5 `follow_ups`

- `id`
- `lead_id`
- `assigned_to`
- `title`
- `notes`
- `due_at`
- `status`
- `completed_at`
- `completed_by`
- timestamps

### 10.6 `site_visits`

- `id`
- `lead_id`
- `scheduled_start_at`
- `scheduled_end_at`
- `address`
- `latitude`
- `longitude`
- `map_url`
- `status`
- `check_in_at`
- `check_in_latitude`
- `check_in_longitude`
- `check_out_at`
- `check_out_latitude`
- `check_out_longitude`
- `notes`
- `requirement_summary`
- `created_by`
- timestamps

Use a join table `site_visit_attendees` for BDM/designer attendees.

### 10.7 `design_projects`

- `id`
- `lead_id`
- `assigned_designer_id`
- `status`
- `requirement_notes`
- `due_at`
- `approved_version_id`
- `approved_by`
- `approved_at`
- timestamps

### 10.8 `design_versions`

- `id`
- `design_project_id`
- `version_number`
- `file_id`
- `version_note`
- `status`
- `uploaded_by`
- `ready_for_review_at`
- timestamps

Unique key: `(design_project_id, version_number)`.

### 10.9 `execution_projects`

- `id`
- `lead_id`
- `design_project_id`
- `approved_design_version_id`
- `status`
- `planned_start_at`
- `due_at`
- `completed_at`
- `progress_percent`
- `blocker_summary`
- `created_by`
- timestamps

Use an assignment table if multiple execution users are allowed.

### 10.10 `execution_tasks`

- `id`
- `execution_project_id`
- `title`
- `description`
- `assigned_to`
- `is_mandatory`
- `status`
- `due_at`
- `completed_at`
- `sort_order`
- timestamps

### 10.11 `files`

- `id`
- `category`
- `object_key`
- `original_filename`
- `safe_filename`
- `mime_type`
- `extension`
- `size_bytes`
- `checksum`
- `lead_id` nullable
- `site_visit_id` nullable
- `design_project_id` nullable
- `execution_project_id` nullable
- `execution_task_id` nullable
- `uploaded_by`
- `is_archived`
- timestamps

At least one valid parent relation must be present. Enforce this in application logic and preferably a database check constraint.

### 10.12 `notifications`

- `id`
- `user_id`
- `type`
- `title`
- `body`
- `entity_type`
- `entity_id`
- `read_at`
- `created_at`

### 10.13 `audit_logs`

- `id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `before_data` JSONB
- `after_data` JSONB
- `ip_address` where safely available
- `user_agent` where safely available
- `created_at`

### 10.14 `meta_webhook_events`

- `id`
- `provider_event_id`
- `payload` JSONB
- `processing_status`
- `attempt_count`
- `last_error`
- `processed_at`
- `created_at`

Use a unique idempotency key so Meta retries cannot create duplicate leads.

---

## 11. Required Screens

### 11.1 Authentication

- Login.
- Forgot/reset password when enabled.
- Disabled-user handling.

### 11.2 Shared Application

- Mobile-first dashboard.
- Notification centre.
- Profile/logout.

### 11.3 Lead Screens

- My Leads.
- All Leads for Admin.
- Unassigned Leads for Admin.
- Lead filters and search.
- Lead detail with timeline.
- Create/edit manual lead.
- Assignment dialog.
- Call outcome dialog.
- Follow-up create/complete dialog.

### 11.4 Site Visit Screens

- Visit list/calendar.
- Schedule/reschedule visit.
- Visit detail.
- Check-in/check-out.
- Notes and attachments.

### 11.5 Design Screens

- Designer queue.
- Design project detail.
- Upload version.
- Version history.
- Preview/download.
- Request revision.
- Approve version.

### 11.6 Execution Screens

- Execution board/list.
- Project detail.
- Task checklist.
- Progress and blocker update.
- Evidence upload.
- Completion flow.

### 11.7 Admin Screens

- Users and roles.
- Configurable sources/status labels/reasons.
- Reports.
- Audit history.
- Integration status.
- File-limit settings.

### 11.8 Public Landing Page

- Brand and service information.
- Enquiry form.
- Validation and consent copy.
- Anti-spam protection.
- Success/error state.
- Form submissions create `WEBSITE` leads through the same normalized intake service used by other lead sources.

---

## 12. Dashboards and Reports

### 12.1 Admin Dashboard

Show:

- New leads today, this week, and this month.
- Unassigned leads.
- Leads by source, BDM, and status.
- Active leads with no next action.
- Overdue follow-ups.
- Upcoming and overdue site visits.
- Designs awaiting assignment, due, ready for review, or awaiting approval.
- Execution projects by status, due date, progress, and blocker.
- Recent assignments, approvals, downloads, and closures.

### 12.2 BDM Dashboard

Show:

- New assigned leads.
- Calls/follow-ups due today.
- Overdue follow-ups.
- Site visits today/upcoming.
- Designs ready for review.
- Revision/approval items.
- Active execution projects for assigned customers.

### 12.3 Designer Dashboard

Show:

- New assignments.
- Visits requiring attendance.
- Designs due.
- Revision requests.
- Recently uploaded versions.

### 12.4 Execution Dashboard

Show:

- New assignments.
- Tasks due today.
- Overdue tasks.
- Blocked projects.
- Projects nearing completion.

Reports must respect role permissions. CSV export is Admin-only unless explicitly expanded.

---

## 13. Notifications and Reminders

MVP notifications are in-app notifications.

Create notifications for:

- Lead assigned/reassigned to BDM.
- Follow-up due soon.
- Follow-up overdue.
- Site visit scheduled/rescheduled/cancelled.
- Designer assigned.
- Design due soon/overdue.
- Design version ready for review.
- Revision requested.
- Design approved.
- Execution project assigned.
- Execution task due/overdue.
- Execution project blocked.
- Project completed.

Use a simple scheduled job/cron for due-date reminders. Do not add a complex queue system until required by actual scale.

---

## 14. Meta Lead Ads Integration

- Implement webhook verification.
- Store the raw webhook event before processing.
- Verify authenticity according to Meta's supported mechanism.
- Fetch/map lead data using server-side credentials.
- Map form fields through configurable mappings.
- Normalize mobile/email data.
- Preserve Meta page, form, and lead identifiers.
- Make processing idempotent.
- Record failures and support safe retry.
- Do not block manual and website lead intake if Meta credentials are unavailable.

Secrets must be server-side environment variables only.

---

## 15. Security Requirements

- HTTPS only in production.
- Supabase Auth sessions with secure cookie handling appropriate to Next.js.
- Server-side authorization for every mutation and protected read.
- RLS enabled on business tables.
- Private Tigris bucket only.
- Short-lived signed URLs, preferably a few minutes or less.
- Do not store long-lived signed URLs in the database.
- Do not log access tokens, service-role keys, Tigris secrets, or full sensitive payloads unnecessarily.
- Validate input using shared Zod schemas.
- Use parameterized database access.
- Add rate limiting to public enquiry and auth-sensitive endpoints.
- Add anti-spam measures to the landing-page form.
- Record important mutations in the audit log.
- Deactivated users must immediately lose application access.
- Location collection must be opt-in and visit-scoped.
- Do not expose customer information in client-side bundles or public URLs.
- Consider malware scanning as a post-MVP hardening item; until then, use a strict allowlist and never execute uploaded content.

---

## 16. UX Requirements

- Optimize primary flows for a phone screen.
- Keep important actions within a few taps.
- Use large touch targets and readable typography.
- Show owner, status, and next action near the top of every lead.
- Display overdue items clearly without relying only on colour.
- Use confirmation dialogs for approval, handoff, archive, and destructive actions.
- Preserve filters when returning from a detail page.
- Show upload progress and understandable file errors.
- Show a clear current approved design badge.
- Warn users when downloading an outdated/non-approved version.
- Provide empty states and retry states, not blank screens.

---

## 17. Audit Events

At minimum, log:

- User created/deactivated/reactivated.
- Lead created/edited/assigned/reassigned.
- Lead status changed.
- Call outcome recorded.
- Follow-up created/completed/cancelled.
- Site visit scheduled/rescheduled/checked in/checked out/completed/cancelled.
- Designer assigned.
- Design version uploaded/downloaded/marked ready/revision requested/approved.
- Execution project created/assigned/status changed/completed.
- Execution task created/updated/completed.
- File uploaded/downloaded/archived/deleted.
- Export generated.

Audit history is append-only for normal application users.

---

## 18. Implementation Rules for Coding Agents

- Read this file before modifying the repository.
- Do not alter locked scope silently.
- Do not add telephony or WhatsApp dependencies.
- Do not replace Tigris with public/local storage.
- Do not use permanent public URLs for files.
- Do not put Supabase service-role or Tigris credentials in client code.
- Do not bypass RLS without a documented, server-side, authorization-checked reason.
- Do not delete historical design versions.
- Do not let execution start without an approved design version reference.
- Do not implement background GPS tracking.
- Do not add a separate backend or message queue merely for architectural preference.
- Keep domain logic in reusable server-side services, not duplicated across UI components.
- Use database transactions for multi-record state transitions such as assignment, approval, and execution handoff.
- Generate migrations for every schema change.
- Add tests for authorization and state transitions before marking a feature complete.
- Update this file and project documentation when an approved product decision changes.

---

## 19. Suggested Project Structure

```text
src/
  app/
    (auth)/
    (dashboard)/
      dashboard/
      leads/
      follow-ups/
      site-visits/
      designs/
      execution/
      notifications/
      reports/
      settings/
    api/
      meta/webhook/
      uploads/presign/
      uploads/finalize/
      files/[fileId]/access/
  components/
  features/
    auth/
    leads/
    activities/
    follow-ups/
    site-visits/
    designs/
    execution/
    files/
    notifications/
    reports/
  lib/
    auth/
    supabase/
    tigris/
    permissions/
    validation/
    audit/
    meta/
  server/
    services/
    repositories/
    actions/
  types/
supabase/
  migrations/
  seed.sql
tests/
  unit/
  integration/
  e2e/
```

The exact layout may adapt to the existing repository, but domain boundaries and server-side authorization must remain clear.

---

## 20. Testing Requirements

### 20.1 Unit Tests

- Mobile normalization.
- Duplicate detection.
- Role permission helpers.
- Status transition validation.
- File allowlist and filename sanitization.
- Design version numbering.
- Reminder calculation.

### 20.2 Integration Tests

- Manual lead creation.
- Meta webhook idempotency.
- Lead assignment and notification.
- Call activity plus follow-up creation.
- Site visit check-in/out without continuous location.
- Designer assignment.
- Presigned upload authorization.
- File metadata finalization.
- Unauthorized file access rejection.
- Design revision/version history.
- Design approval.
- Execution handoff transaction.
- Audit-log creation.

### 20.3 End-to-End Tests

At minimum, test:

1. Admin creates BDM, Designer, and Execution users.
2. Website/manual lead enters CRM.
3. Lead is assigned to BDM.
4. BDM opens dialler and records a call outcome.
5. BDM schedules and completes a site visit.
6. Designer is assigned and uploads two design versions.
7. BDM requests one revision and approves the second version.
8. BDM downloads the approved file.
9. Admin/BDM creates an execution handoff.
10. Execution user completes tasks and uploads evidence.
11. Admin sees the complete audit trail.
12. An unrelated role/user is denied access to the lead and private files.

---

## 21. Definition of Done

A feature is complete only when:

- The UI works on mobile and desktop.
- Server-side authorization is implemented.
- RLS or equivalent database protection is implemented.
- Validation and useful error states exist.
- Audit events are recorded where required.
- Loading, empty, and failure states are handled.
- Relevant unit/integration tests pass.
- No secret is exposed to the client.
- File access uses short-lived signed URLs.
- Documentation and migrations are updated.

---

## 22. Delivery Order

### Phase 1 — Foundation

- Next.js setup.
- Supabase Auth.
- Profiles and roles.
- RLS baseline.
- Manual leads.
- Lead list/detail.
- Assignment.
- Activities, follow-ups, notifications, and audit basics.

### Phase 2 — Intake and Site Visits

- Website enquiry form.
- Meta webhook and idempotency.
- Duplicate handling.
- Site-visit scheduling and check-in/out.
- Optional visit-scoped coordinates.

### Phase 3 — Design and Files

- Tigris private bucket integration.
- Presigned uploads/downloads.
- File metadata.
- Designer queue.
- Design versions.
- Preview/download.
- Review, revision, and approval.

### Phase 4 — Execution and Reporting

- Execution handoff.
- Project and task tracking.
- Progress evidence.
- Role dashboards.
- Admin reports and CSV export.

### Phase 5 — Hardening and Go-Live

- Full authorization review.
- Storage and file-access review.
- Backup/recovery procedures.
- Error monitoring.
- Performance review.
- UAT fixes.
- Production deployment and staff handover.

---

## 23. Final Acceptance Criteria

The MVP is accepted when all of the following work:

1. A Meta test lead is stored once with source metadata.
2. A website enquiry creates a Website-source lead.
3. An authorized user can create a manual lead.
4. Duplicate mobile numbers produce a clear warning or approved merge path.
5. Admin can assign a lead and the BDM receives a notification.
6. BDM can open the normal phone dialler and manually log the outcome.
7. BDM can create a dated follow-up visible on the dashboard.
8. BDM can schedule and complete a site visit.
9. The system does not continuously track staff location.
10. Designer assignment creates a notification.
11. Designer can upload at least two immutable design versions.
12. Authorized users can preview PDF/images and download supported files.
13. Unauthorized users cannot access private files, even with a guessed file ID.
14. BDM/Admin can approve one exact design version.
15. The approved version can be handed to Execution.
16. Execution can update tasks, progress, blockers, and evidence.
17. Admin can see key pipeline and overdue-work reports.
18. Critical actions have an actor and timestamp in the audit history.
19. The complete core workflow is usable from a standard mobile browser.

---

## 24. Approved Architecture Summary

```text
Next.js responsive CRM
        |
        |-- Supabase Auth: staff login and sessions
        |-- Supabase PostgreSQL: CRM records, roles, metadata, notifications, audit logs
        |-- Supabase RLS: database access control
        |-- Tigris private object storage: designs and attachments
        |-- Short-lived presigned URLs: secure upload/preview/download
        |-- Meta webhook: automatic Meta lead intake
        |-- tel: link: calls through the employee's normal SIM
```

This is the final MVP baseline for Star Garden CRM.
