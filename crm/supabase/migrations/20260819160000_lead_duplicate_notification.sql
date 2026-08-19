-- ===========================================================================
-- Star Gardens CRM — Notify staff when a duplicate enquiry is blocked
--
-- The public enquiry form always shows the customer a success message even
-- when their number/email already belongs to a live lead (AGENTS.md §15 —
-- an anonymous form must not reveal who is already a customer). The attempt
-- was already recorded in audit_logs (LEAD_DUPLICATE_BLOCKED), but nothing
-- surfaced it to a human. This adds the missing notification type so the
-- lead's owner (or every Admin, if unowned) sees it and can open the
-- existing lead directly instead of the attempt going unnoticed.
-- ===========================================================================

alter type public.notification_type add value if not exists 'LEAD_DUPLICATE_ATTEMPT';
