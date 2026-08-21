-- ===========================================================================
-- Star Gardens CRM — journey tracking is decided per visit (§8.3, §11.7)
--
-- The global setting alone was not enough. Flipping it re-shaped visits that
-- were already booked, and in the worst case a designer standing on site with
-- "Reached site" recorded would have watched the rest of the chain vanish.
--
-- So the setting becomes a *default*, captured onto each visit when it is
-- booked. A visit runs to the end in the mode it started in; changing the
-- setting only affects the next booking. An Admin who genuinely wants the
-- change applied to open visits asks for that explicitly, and even then visits
-- with a journey already under way are left alone.
--
-- Defaults to true, and backfills to true, so nothing already in the database
-- changes behaviour when this lands.
-- ===========================================================================

alter table public.site_visits
  add column if not exists journey_tracking_enabled boolean not null default true;

comment on column public.site_visits.journey_tracking_enabled is
  'Whether this visit uses the Start journey → Reached site → Check out chain. Copied from app_settings.site_visit_journey_enabled when the visit is booked (§8.3).';

-- Every filter on this column also filters on status, and the open set is the
-- small one. Partial index rather than one over the whole history.
create index if not exists site_visits_open_journey_mode_idx
  on public.site_visits (journey_tracking_enabled)
  where status not in ('COMPLETED', 'CANCELLED');
