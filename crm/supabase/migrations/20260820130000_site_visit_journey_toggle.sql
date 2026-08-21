-- ===========================================================================
-- Star Gardens CRM — site visit journey tracking switch (AGENTS.md §8.3, §11.7)
--
-- Journey tracking is the "Start journey → Reached site → Check out" chain on a
-- site visit. It is genuinely useful once designers are travelling to sites all
-- day, and pure friction while visits are being closed from the office.
--
-- Rather than tearing the feature out and rebuilding it later, it becomes a
-- setting. With it off, a visit is completed in one step; with it on, the full
-- chain returns and every historical journey record is still there — nothing
-- about this switch touches stored data.
--
-- Defaults to true so existing behaviour is unchanged by the migration itself.
-- ===========================================================================

insert into public.app_settings (key, value, description) values
  ('site_visit_journey_enabled',
   'true'::jsonb,
   'When false, site visits skip the journey/check-in/check-out chain and are completed in one step (§8.3).')
on conflict (key) do nothing;
