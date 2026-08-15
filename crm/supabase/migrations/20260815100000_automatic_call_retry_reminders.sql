-- Retryable manual call outcomes create a callback due in 30 minutes. This
-- flag lets the reminder worker suppress the generic early warning and alert
-- the assigned BDM only once the callback is actually due.
alter table public.follow_ups
  add column if not exists is_automatic boolean not null default false;

comment on column public.follow_ups.is_automatic is
  'True when the CRM created this callback from No answer, Busy, or Switched off.';

-- Check every minute so a 30-minute callback is delivered within roughly one
-- minute of its due time. The notification unique index keeps retries safe.
do $$
declare
  reminder_job record;
begin
  for reminder_job in
    select jobid from cron.job where jobname = 'crm-hourly-reminders'
  loop
    perform cron.alter_job(job_id := reminder_job.jobid, schedule := '* * * * *');
  end loop;
end;
$$;
