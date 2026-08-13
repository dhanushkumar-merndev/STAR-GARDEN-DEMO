-- The dashboard snapshot now maintains its one-hour cache, so it performs an
-- INSERT/UPDATE and cannot remain STABLE. VOLATILE permits those writes while
-- the function's explicit Admin check continues to protect access.
alter function public.admin_dashboard_snapshot(timestamptz, timestamptz) volatile;

