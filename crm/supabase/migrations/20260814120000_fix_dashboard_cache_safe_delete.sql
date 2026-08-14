-- pg-safeupdate rejects DELETE statements without a WHERE clause, including
-- those executed inside security-definer functions. Both predicate columns
-- are part of the cache table's primary key, so this still invalidates every
-- cached date range while remaining compatible with safe-update enforcement.
create or replace function public.refresh_admin_dashboard_cache()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'Dashboard refresh is Admin-only.' using errcode = '42501';
  end if;

  delete from public.admin_dashboard_cache
   where range_from is not null
     and range_to is not null;
end;
$$;

revoke all on function public.refresh_admin_dashboard_cache() from public;
grant execute on function public.refresh_admin_dashboard_cache() to authenticated;

comment on function public.refresh_admin_dashboard_cache() is
  'Admin-only manual invalidation of cached dashboard snapshots.';
