-- ===========================================================================
-- Star Gardens CRM — staff archive (AGENTS.md §7.1, §11.7, §15)
--
-- Deactivation and archiving answer two different questions and so cannot be
-- the same column:
--
--   is_active    — access. An inactive profile can read nothing, immediately.
--   archived_at  — attention. An Admin who has finished with a leaver should
--                  not scroll past them for the rest of the CRM's life.
--
-- Archiving implies deactivation, never the reverse. An archived row that could
-- still sign in would be a hidden active account, which is precisely what a
-- Google allowlist exists to prevent — so the implication is a check
-- constraint, not a convention the application layer is trusted to remember.
--
-- Unarchiving therefore restores visibility only. Access is granted back by
-- ticking "Active access" as a separate, deliberate act.
-- ===========================================================================

alter table public.profiles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null;

comment on column public.profiles.archived_at is
  'Set when an Admin files a staff row away. Implies is_active = false (see profiles_archived_is_inactive).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_archived_is_inactive'
  ) then
    alter table public.profiles
      add constraint profiles_archived_is_inactive
      check (archived_at is null or not is_active);
  end if;
end;
$$;

-- Partial: the archive is the small set. Every other query on this table wants
-- the rows where archived_at is null, which the existing indexes already serve.
create index if not exists profiles_archived_idx
  on public.profiles (archived_at desc)
  where archived_at is not null;

-- ---------------------------------------------------------------------------
-- Privilege guard
--
-- The existing trigger stops a non-Admin editing their own role or reactivating
-- themselves. Archiving is the same class of decision — left out, a Designer
-- could unarchive themselves back into the directory — so it joins the list.
-- ---------------------------------------------------------------------------
create or replace function app.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.archived_at is distinct from old.archived_at then
    raise exception 'only an Admin may change role, activation state or archive state'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
