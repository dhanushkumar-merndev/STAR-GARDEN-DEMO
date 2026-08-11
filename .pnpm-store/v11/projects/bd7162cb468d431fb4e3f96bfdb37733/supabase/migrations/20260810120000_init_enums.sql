-- ===========================================================================
-- Star Gardens CRM — 01. Extensions, private schema, enums
-- AGENTS.md §9 (state machines), §10 (data model)
--
-- Status values live in the database as enums so the application never
-- scatters hard-coded strings (§2).
-- ===========================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- Private schema for security-definer helpers used by RLS policies.
-- Not exposed through PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles (§7)
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'ADMIN',
  'BDM',
  'DESIGNER',
  'EXECUTION'
);

-- ---------------------------------------------------------------------------
-- Lead intake (§8.1)
-- ---------------------------------------------------------------------------
create type public.lead_source as enum (
  'META_FACEBOOK',
  'META_INSTAGRAM',
  'WEBSITE',
  'MANUAL',
  'OTHER'
);

-- ---------------------------------------------------------------------------
-- Lead status (§9.1)
-- ---------------------------------------------------------------------------
create type public.lead_status as enum (
  'NEW',
  'UNASSIGNED',
  'ASSIGNED',
  'CONTACTED',
  'FOLLOW_UP',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETED',
  'QUALIFIED',
  'LOST',
  'CLOSED'
);

-- ---------------------------------------------------------------------------
-- Site visit status (§9.2)
-- ---------------------------------------------------------------------------
create type public.site_visit_status as enum (
  'SCHEDULED',
  'RESCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

-- ---------------------------------------------------------------------------
-- Design status (§9.3) — applies to the design PROJECT
-- ---------------------------------------------------------------------------
create type public.design_status as enum (
  'NOT_REQUIRED',
  'REQUIRED',
  'ASSIGNED',
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'CANCELLED'
);

-- Per-VERSION lifecycle. Distinct from the project status so history stays
-- readable after the project moves on (§5.6).
create type public.design_version_status as enum (
  'DRAFT',
  'READY_FOR_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'SUPERSEDED'
);

-- ---------------------------------------------------------------------------
-- Execution status (§9.4)
-- ---------------------------------------------------------------------------
create type public.execution_status as enum (
  'NOT_STARTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',
  'READY_FOR_REVIEW',
  'COMPLETED',
  'CANCELLED'
);

create type public.execution_task_status as enum (
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED'
);

-- ---------------------------------------------------------------------------
-- Follow-up status (§9.5)
-- ---------------------------------------------------------------------------
create type public.follow_up_status as enum (
  'OPEN',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE'
);

-- ---------------------------------------------------------------------------
-- Activity timeline (§10.4)
-- ---------------------------------------------------------------------------
create type public.activity_type as enum (
  'CALL_ATTEMPT',
  'CALL_OUTCOME',
  'NOTE',
  'FOLLOW_UP_CREATED',
  'FOLLOW_UP_COMPLETED',
  'SITE_VISIT',
  'ASSIGNMENT',
  'STATUS_CHANGE',
  'DESIGN_UPDATE',
  'EXECUTION_UPDATE',
  'CLOSURE'
);

-- Manual call outcomes (§6.2). The CRM records what the BDM reports; it never
-- claims to detect connection state on its own (§6.3).
create type public.call_outcome as enum (
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'INVALID_NUMBER',
  'CALL_LATER',
  'INTERESTED',
  'NOT_INTERESTED'
);

-- ---------------------------------------------------------------------------
-- Files (§5)
-- ---------------------------------------------------------------------------
create type public.file_category as enum (
  'DESIGN_VERSION',
  'DESIGN_SOURCE',
  'SITE_VISIT_ATTACHMENT',
  'EXECUTION_EVIDENCE',
  'COMPLETION_EVIDENCE',
  'LEAD_ATTACHMENT'
);

-- ---------------------------------------------------------------------------
-- Meta webhook processing (§10.14)
-- ---------------------------------------------------------------------------
create type public.webhook_processing_status as enum (
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'IGNORED'
);

create type public.notification_type as enum (
  'LEAD_ASSIGNED',
  'LEAD_REASSIGNED',
  'FOLLOW_UP_DUE_SOON',
  'FOLLOW_UP_OVERDUE',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_RESCHEDULED',
  'SITE_VISIT_CANCELLED',
  'DESIGNER_ASSIGNED',
  'DESIGN_DUE_SOON',
  'DESIGN_OVERDUE',
  'DESIGN_READY_FOR_REVIEW',
  'DESIGN_REVISION_REQUESTED',
  'DESIGN_APPROVED',
  'EXECUTION_ASSIGNED',
  'EXECUTION_TASK_DUE',
  'EXECUTION_TASK_OVERDUE',
  'EXECUTION_BLOCKED',
  'EXECUTION_COMPLETED'
);
