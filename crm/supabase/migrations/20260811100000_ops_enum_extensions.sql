-- ===========================================================================
-- Star Gardens CRM — 15. Enum extensions for the operations upgrade
--
-- Postgres will not let a value added by `alter type ... add value` be USED in
-- the same transaction that added it, and Supabase runs each migration file in
-- one transaction. So every new enum value lands here, alone, and migration 16
-- is free to reference them. This mirrors what migration 08 did for Meta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CLIENT: the customer's own read-only login (portal add-on §9).
--
-- BDM is deliberately left in place. Two Admins currently do the BDM calling
-- themselves, but the role stays so a dedicated BDM/BDO can be split out later
-- without a data migration.
-- ---------------------------------------------------------------------------
alter type public.user_role add value if not exists 'CLIENT';

-- ---------------------------------------------------------------------------
-- Timeline entries for the two new surfaces.
-- ---------------------------------------------------------------------------
alter type public.activity_type add value if not exists 'ACCOUNT_UPDATE';
alter type public.activity_type add value if not exists 'PORTAL_ACCESS';

-- ---------------------------------------------------------------------------
-- Notifications.
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'ROLE_ASSIGNED';
alter type public.notification_type add value if not exists 'ACCOUNT_RECORDED';
alter type public.notification_type add value if not exists 'ACCOUNT_CLOSED';
alter type public.notification_type add value if not exists 'CLIENT_PORTAL_INVITED';
alter type public.notification_type add value if not exists 'SITE_VISIT_STARTED';
alter type public.notification_type add value if not exists 'SITE_VISIT_ARRIVED';

-- ---------------------------------------------------------------------------
-- Money on a closed job (§accounts).
--
-- WRITTEN_OFF exists so a job that will never be paid can leave the open
-- receivables list without pretending it was collected.
-- ---------------------------------------------------------------------------
create type public.payment_status as enum (
  'PENDING',
  'PARTIAL',
  'PAID',
  'WRITTEN_OFF'
);

-- ---------------------------------------------------------------------------
-- Journey to a site visit.
--
-- Three discrete, user-pressed states — not a tracking feed. The designer taps
-- "Start" when they leave and "Reached site" when they arrive; nothing is
-- sampled in between (§3.2, §18).
-- ---------------------------------------------------------------------------
create type public.visit_journey_status as enum (
  'NOT_STARTED',
  'EN_ROUTE',
  'ARRIVED'
);
