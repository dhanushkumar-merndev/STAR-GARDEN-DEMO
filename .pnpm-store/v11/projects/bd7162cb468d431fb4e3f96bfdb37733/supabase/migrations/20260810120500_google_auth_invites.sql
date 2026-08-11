-- ===========================================================================
-- Star Gardens CRM — 06. Google-only staff authentication
--
-- Sign-in is Google OAuth exclusively: there is no password in this system, so
-- there is no password to leak, reuse or reset (AGENTS.md §11.1 treats the
-- reset screen as conditional — "when enabled"; it is not enabled here).
--
-- Because anyone on earth owns a Google account, "can authenticate" must not
-- mean "may use the CRM". Access is an explicit allowlist:
--
--   1. An Admin records an invite for a work email, with the role to grant.
--   2. That person signs in with Google.
--   3. The trigger below matches the verified Google email to an invite and
--      provisions an ACTIVE profile with the invited role.
--   4. An unmatched email still gets an auth.users row (Supabase creates it
--      before our trigger can object) but its profile is created INACTIVE with
--      no useful role. `app.is_active_user()` returns false, so every RLS
--      predicate in migration 04 evaluates false and the account can read
--      nothing at all (§15). The UI shows a "no access" notice.
--
-- Provisioning inactive-by-default rather than raising an exception is
-- deliberate: a raised exception surfaces to the user as an opaque
-- "Database error", and leaves the Admin no record that someone tried.
-- ===========================================================================

create table public.staff_invites (
  id          uuid primary key default gen_random_uuid(),

  -- The Google account address. Compared case-insensitively; Google always
  -- reports a normalized address, but users type invites by hand.
  email       text not null check (position('@' in email) > 1),

  full_name   text not null check (length(btrim(full_name)) between 1 and 120),
  mobile      text,
  role        public.user_role not null default 'BDM',

  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,

  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index staff_invites_email_key on public.staff_invites (lower(btrim(email)));
create index staff_invites_pending_idx on public.staff_invites (created_at desc)
  where accepted_at is null;

create trigger set_updated_at before update on public.staff_invites
  for each row execute function app.set_updated_at();

comment on table public.staff_invites is
  'Allowlist of Google addresses permitted to sign in, and the role each is '
  'granted on first sign-in. Removing an invite does NOT revoke an existing '
  'account — deactivate the profile for that (§15).';

-- ---------------------------------------------------------------------------
-- Profile additions for the Google flow
-- ---------------------------------------------------------------------------

-- Google's picture URL, used for the avatar. Purely cosmetic.
alter table public.profiles add column avatar_url text;

-- Distinguishes "never approved" from "approved then switched off", so the
-- Admin screen can separate access requests from deactivated staff.
alter table public.profiles add column approved_at timestamptz;
alter table public.profiles add column approved_by uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Replace the provisioning trigger from migration 03
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email   text := lower(btrim(new.email));
  v_invite  public.staff_invites%rowtype;
  v_name    text;
  v_mobile  text;
  v_avatar  text;
begin
  -- Google supplies these in raw_user_meta_data on the identity.
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Unnamed user'
  );
  v_avatar := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
  );
  v_mobile := nullif(btrim(new.raw_user_meta_data ->> 'mobile'), '');

  select * into v_invite
    from public.staff_invites
   where lower(btrim(email)) = v_email
   limit 1;

  insert into public.profiles (
    id, full_name, email, mobile, avatar_url, role, is_active, approved_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(v_invite.full_name), ''), v_name),
    new.email,
    coalesce(v_mobile, v_invite.mobile),
    v_avatar,
    coalesce(v_invite.role, 'BDM'),
    -- The whole gate, in one expression.
    v_invite.id is not null,
    case when v_invite.id is not null then now() end
  )
  on conflict (id) do nothing;

  if v_invite.id is not null and v_invite.accepted_at is null then
    update public.staff_invites
       set accepted_at = now(), accepted_by = new.id
     where id = v_invite.id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: invites are Admin-only in every direction
-- ---------------------------------------------------------------------------

alter table public.staff_invites enable row level security;
alter table public.staff_invites force row level security;

create policy staff_invites_select_admin on public.staff_invites
  for select to authenticated
  using (app.is_admin());

create policy staff_invites_write_admin on public.staff_invites
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Sign-in bookkeeping
--
-- `last_login_at` is written by the app on session establishment. A user may
-- only stamp their own row, and only with a value at or before now, so the
-- column cannot be used as a scratch field.
-- ---------------------------------------------------------------------------

create or replace function public.record_sign_in()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles
     set last_login_at = now()
   where id = auth.uid();
$$;

grant execute on function public.record_sign_in() to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap
--
-- Before the first Admin exists nobody can create invites through the UI, so
-- the very first invite is inserted by hand. See crm/README.md §"First sign-in".
--
--   insert into public.staff_invites (email, full_name, role)
--   values ('owner@stargarden.in', 'Owner Name', 'ADMIN');
-- ---------------------------------------------------------------------------
