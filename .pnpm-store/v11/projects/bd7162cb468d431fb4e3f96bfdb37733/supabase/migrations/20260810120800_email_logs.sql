-- ===========================================================================
-- Star Gardens CRM — 09. Email delivery log
--
-- Email is a secondary notification channel: a business action never rolls
-- back because a message failed to send. That makes a durable record of what
-- was attempted essential — otherwise a silently broken mailbox looks
-- identical to a quiet week.
--
-- The table stores WHAT was sent and WHETHER it worked. It never stores SMTP
-- credentials, auth exchanges or message bodies.
-- ===========================================================================

create type public.email_log_status as enum (
  'PENDING',
  'SENT',
  'FAILED'
);

create table public.email_logs (
  id                  uuid primary key default gen_random_uuid(),

  recipient           text not null,
  email_type          text not null,

  related_entity_type text,
  related_entity_id   uuid,

  subject             text not null,
  status              public.email_log_status not null default 'PENDING',

  -- Message id returned by the SMTP server, for tracing with the provider.
  provider_message_id text,

  -- Redacted before it reaches this column: several providers echo the AUTH
  -- exchange into the failure message, which is the mailbox password in base64.
  error_summary       text,

  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index email_logs_created_idx on public.email_logs (created_at desc);
create index email_logs_status_idx  on public.email_logs (status, created_at desc);
create index email_logs_type_idx    on public.email_logs (email_type, created_at desc);
create index email_logs_entity_idx  on public.email_logs (related_entity_type, related_entity_id);

comment on table public.email_logs is
  'Delivery record for outbound email. Never stores credentials or bodies.';

-- ---------------------------------------------------------------------------
-- RLS: Admin-readable, never client-written
--
-- Rows are inserted by the email service with the service-role client, the
-- same pattern as audit_logs — a browser session must not be able to forge a
-- delivery record.
-- ---------------------------------------------------------------------------

alter table public.email_logs enable row level security;
alter table public.email_logs force row level security;

create policy email_logs_select_admin on public.email_logs
  for select to authenticated
  using (app.is_admin());

-- No INSERT / UPDATE / DELETE policy is defined, by design.
