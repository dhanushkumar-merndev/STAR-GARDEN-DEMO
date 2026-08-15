-- Admin-only, email-OTP protected permanent lead purge.
-- Challenges are server-only: no RLS policy intentionally grants browser access.

create table public.lead_purge_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  lead_ids uuid[] not null check (cardinality(lead_ids) between 1 and 100),
  code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  created_at timestamptz not null default now()
);

create index lead_purge_challenges_admin_idx
  on public.lead_purge_challenges(admin_user_id, created_at desc);

alter table public.lead_purge_challenges enable row level security;
alter table public.lead_purge_challenges force row level security;

-- Called only with the service-role after the Server Action has authenticated
-- the Admin. The function independently rechecks that actor and challenge.
create or replace function public.purge_leads_for_verified_challenge(
  p_challenge_id uuid,
  p_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_ids uuid[];
  v_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_user_id and role = 'ADMIN' and is_active
  ) then
    raise exception 'Active Admin required';
  end if;

  select lead_ids into v_lead_ids
  from public.lead_purge_challenges
  where id = p_challenge_id
    and admin_user_id = p_actor_user_id
    and verified_at is not null
    and consumed_at is null
    and expires_at > now()
  for update;

  if v_lead_ids is null then
    raise exception 'Invalid or expired purge verification';
  end if;

  -- Break the design project/version reference cycle before cascading the
  -- complete lead graph. Execution rows disappear through their lead FK.
  update public.design_projects
  set approved_version_id = null
  where lead_id = any(v_lead_ids);

  delete from public.leads where id = any(v_lead_ids);
  get diagnostics v_count = row_count;

  update public.lead_purge_challenges
  set consumed_at = now()
  where id = p_challenge_id;

  insert into public.audit_logs(
    actor_user_id, action, entity_type, before_data, after_data
  ) values (
    p_actor_user_id,
    'LEADS_PERMANENTLY_DELETED',
    'lead_batch',
    jsonb_build_object('lead_ids', to_jsonb(v_lead_ids)),
    jsonb_build_object('deleted_count', v_count, 'otp_verified', true)
  );

  return v_count;
end;
$$;

revoke all on function public.purge_leads_for_verified_challenge(uuid, uuid) from public;
grant execute on function public.purge_leads_for_verified_challenge(uuid, uuid) to service_role;

