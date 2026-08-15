-- Permanent one-time contact reveal marker. Unlike a pending call attempt,
-- this remains set after an outcome is recorded.
alter table public.leads
  add column if not exists first_call_attempt_at timestamptz;

update public.leads lead
set first_call_attempt_at = first_attempt.at
from (
  select activity.lead_id, min(activity.activity_at) as at
  from public.activities activity
  where activity.type = 'CALL_ATTEMPT'
  group by activity.lead_id
) first_attempt
where first_attempt.lead_id = lead.id
  and lead.first_call_attempt_at is null;

comment on column public.leads.first_call_attempt_at is
  'Set on the first authorized dialler-open event; permanently unlocks contact details for staff.';
