-- ===========================================================================
-- Star Garden CRM — 08. Enum extensions for the Meta integration
--
-- Kept in its own migration on purpose. Postgres permits `ALTER TYPE ... ADD
-- VALUE` inside a transaction, but the new label cannot be *used* until that
-- transaction commits. Separating the additions from the tables and policies
-- that reference them means migration 09 can use them freely.
-- ===========================================================================

-- Webhook lifecycle (add-on §8).
--
-- The two additions matter operationally:
--   RECEIVED       — stored but not yet processed, so nothing is lost if the
--                    function dies between persisting and processing.
--   UNMAPPED_FORM  — the lead arrived from a form with no active field mapping.
--                    This is the state that must NOT discard the event: an
--                    Admin creates the mapping, then retries.
alter type public.webhook_processing_status add value if not exists 'RECEIVED';
alter type public.webhook_processing_status add value if not exists 'UNMAPPED_FORM';

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

-- Where a Meta lead-form answer lands in the CRM (add-on §6).
--
-- Deliberately short. Meta questions never map into call notes or follow-ups —
-- those are the BDM's own record of a conversation, and a later sync must never
-- overwrite them (add-on §6, §23).
create type public.meta_crm_field as enum (
  'customer_name',
  'mobile',
  'email',
  'location_text',
  'requirement_summary',
  'IGNORE'
);

create type public.meta_sync_type as enum (
  'CAMPAIGNS',
  'INSIGHTS',
  'WEBHOOK_REPLAY'
);

create type public.meta_sync_status as enum (
  'RUNNING',
  'SUCCESS',
  'PARTIAL',
  'FAILED'
);

create type public.meta_sync_trigger as enum (
  'CRON',
  'ADMIN_MANUAL'
);

-- How a campaign↔form link was established. A form can be reused across
-- campaigns, so the link is a relationship rather than a column on the form
-- (add-on §6).
create type public.meta_association_source as enum (
  'ADS_GRAPH',      -- derived from ad creative -> lead form
  'WEBHOOK',        -- observed on an incoming lead
  'MANUAL'          -- an Admin linked them by hand
);
