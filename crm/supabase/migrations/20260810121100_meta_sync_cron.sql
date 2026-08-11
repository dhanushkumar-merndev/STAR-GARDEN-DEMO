-- Scheduled Meta sync. Secrets are resolved at execution time from Supabase
-- Vault; no credential is embedded in migration history.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'meta-campaign-sync',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/meta-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'
        ),
        'x-internal-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_internal_secret'
        )
      ),
      body := jsonb_build_object('source', 'cron')
    );
  $$
);

select cron.schedule(
  'meta-insights-sync',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/meta-insights-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'
        ),
        'x-internal-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'meta_sync_internal_secret'
        )
      ),
      body := jsonb_build_object('source', 'cron')
    );
  $$
);

-- Application reminders also use Supabase Cron. `app_url` is the deployed CRM
-- origin (for example https://crm.stargarden.in) and
-- `reminder_cron_secret` is the same value as the app's CRON_SECRET.
select cron.schedule(
  'crm-hourly-reminders',
  '0 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
        || '/api/cron/reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret'
        )
      ),
      body := jsonb_build_object('source', 'supabase_cron')
    );
  $$
);
