-- Meta credentials are external project configuration and cannot be safely
-- invented during deployment. Keep the jobs installed but quiet until
-- META_AD_ACCOUNT_ID, META_ADS_ACCESS_TOKEN, META_PAGE_ACCESS_TOKEN,
-- META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN and META_ALLOWED_PAGE_IDS have
-- been configured on the Edge Functions project.
--
-- Enable them after configuration with:
--   select cron.alter_job(job_id := jobid, active := true)
--   from cron.job
--   where jobname in ('meta-campaign-sync', 'meta-insights-sync');
do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid
    from cron.job
    where jobname in ('meta-campaign-sync', 'meta-insights-sync')
  loop
    perform cron.alter_job(job_id := scheduled_job.jobid, active := false);
  end loop;
end;
$$;
