-- ===========================================================================
-- Star Garden CRM — 03. Functions and triggers
--
-- Contains:
--   a) generic updated_at maintenance
--   b) identity helpers used by RLS (SECURITY DEFINER, so policies on
--      `profiles` do not recurse into themselves)
--   c) access predicates: who may see which lead / design / execution / file
--   d) domain invariants enforced at the database level
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- (a) updated_at
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'leads', 'activities', 'follow_ups', 'site_visits',
    'design_projects', 'design_versions', 'execution_projects',
    'execution_tasks', 'files', 'config_options', 'execution_task_templates'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function app.set_updated_at()', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Identity helpers
--
-- SECURITY DEFINER + a pinned search_path. These read `profiles` while RLS is
-- active on `profiles`, so they must run as owner to avoid infinite recursion.
-- ---------------------------------------------------------------------------

create or replace function app.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active;
$$;

-- A deactivated user resolves to NULL here, which makes every predicate below
-- false — access is lost immediately, with no redeploy or session purge (§15).
create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.current_user_role() = 'ADMIN';
$$;

-- ---------------------------------------------------------------------------
-- (c) Access predicates
-- ---------------------------------------------------------------------------

-- Read access to a lead:
--   ADMIN            — everything
--   BDM              — leads assigned to them
--   DESIGNER         — leads behind a design project assigned to them (§7.3)
--   EXECUTION        — leads behind an execution project they are on (§7.4)
create or replace function app.can_read_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and (
    app.is_admin()
    or exists (
      select 1 from public.leads l
      where l.id = p_lead_id and l.assigned_bdm_id = auth.uid()
    )
    or exists (
      select 1 from public.design_projects dp
      where dp.lead_id = p_lead_id and dp.assigned_designer_id = auth.uid()
    )
    or exists (
      select 1
      from public.execution_projects ep
      join public.execution_assignees ea on ea.execution_project_id = ep.id
      where ep.lead_id = p_lead_id and ea.user_id = auth.uid()
    )
  );
$$;

-- Write access to lead-owned records is narrower than read access: designers
-- and execution staff never edit the lead itself.
create or replace function app.can_write_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and (
    app.is_admin()
    or exists (
      select 1 from public.leads l
      where l.id = p_lead_id and l.assigned_bdm_id = auth.uid()
    )
  );
$$;

create or replace function app.can_read_design_project(p_design_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and (
    app.is_admin()
    or exists (
      select 1 from public.design_projects dp
      where dp.id = p_design_project_id
        and (
          dp.assigned_designer_id = auth.uid()
          or exists (
            select 1 from public.leads l
            where l.id = dp.lead_id and l.assigned_bdm_id = auth.uid()
          )
        )
    )
  );
$$;

create or replace function app.can_read_execution_project(p_execution_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and (
    app.is_admin()
    or exists (
      select 1 from public.execution_assignees ea
      where ea.execution_project_id = p_execution_project_id
        and ea.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.execution_projects ep
      join public.leads l on l.id = ep.lead_id
      where ep.id = p_execution_project_id and l.assigned_bdm_id = auth.uid()
    )
  );
$$;

-- File visibility derives from whichever parent the file hangs off (§5.5).
-- Guessing a file id gains nothing without access to its parent (§23.13).
create or replace function app.can_read_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_active_user() and exists (
    select 1
    from public.files f
    left join public.site_visits sv on sv.id = f.site_visit_id
    where f.id = p_file_id
      and (
        app.is_admin()
        or (f.lead_id              is not null and app.can_read_lead(f.lead_id))
        or (sv.id                  is not null and app.can_read_lead(sv.lead_id))
        or (f.design_project_id    is not null and app.can_read_design_project(f.design_project_id))
        or (f.execution_project_id is not null and app.can_read_execution_project(f.execution_project_id))
        or (f.execution_task_id    is not null and exists (
              select 1 from public.execution_tasks et
              where et.id = f.execution_task_id
                and app.can_read_execution_project(et.execution_project_id)
            ))
      )
  );
$$;

grant execute on function
  app.current_user_role(),
  app.is_active_user(),
  app.is_admin(),
  app.can_read_lead(uuid),
  app.can_write_lead(uuid),
  app.can_read_design_project(uuid),
  app.can_read_execution_project(uuid),
  app.can_read_file(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (d) Domain invariants
-- ---------------------------------------------------------------------------

-- Human-friendly lead reference: SG-2026-001000
create or replace function app.assign_lead_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.lead_code is null or btrim(new.lead_code) = '' then
    new.lead_code := 'SG-' || to_char(now(), 'YYYY') || '-'
                  || lpad(nextval('public.lead_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger assign_lead_code
  before insert on public.leads
  for each row execute function app.assign_lead_code();

-- Provision a profile whenever an Admin creates an auth user. Role and name
-- travel in user_metadata from the admin API call.
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, mobile, role, is_active)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'mobile'), ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'BDM'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- Sequential, gap-free version numbers per design project (§5.6).
-- The advisory lock serialises concurrent uploads to the same project so two
-- designers cannot both claim version N.
create or replace function app.assign_design_version_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.design_project_id::text));

  if new.version_number is null or new.version_number = 0 then
    select coalesce(max(dv.version_number), 0) + 1
      into new.version_number
      from public.design_versions dv
     where dv.design_project_id = new.design_project_id;
  end if;

  return new;
end;
$$;

create trigger assign_design_version_number
  before insert on public.design_versions
  for each row execute function app.assign_design_version_number();

-- Design versions are immutable history: the payload identity of a version can
-- never change, only its review state (§5.6, §18).
create or replace function app.guard_design_version_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.design_project_id is distinct from old.design_project_id
     or new.version_number is distinct from old.version_number
     or new.file_id is distinct from old.file_id
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception
      'design_versions identity is immutable; upload a new version instead (AGENTS.md 5.6)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_design_version_immutability
  before update on public.design_versions
  for each row execute function app.guard_design_version_immutability();

create or replace function app.guard_history_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Application sessions (anon/authenticated) may never destroy history.
  -- Reserved for an Admin-controlled cleanup process running as service_role.
  if current_user in ('authenticated', 'anon') then
    raise exception
      '% rows are append-only history and cannot be deleted by application users', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

create trigger guard_design_version_delete
  before delete on public.design_versions
  for each row execute function app.guard_history_delete();

create trigger guard_audit_log_delete
  before delete on public.audit_logs
  for each row execute function app.guard_history_delete();

create trigger guard_audit_log_update
  before update on public.audit_logs
  for each row execute function app.guard_history_delete();

-- Exactly one approved version per design project (§5.6).
-- Approving a version supersedes any previously approved one.
create or replace function app.enforce_single_approved_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'APPROVED' and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED') then
    update public.design_versions
       set status = 'SUPERSEDED'
     where design_project_id = new.design_project_id
       and id <> new.id
       and status = 'APPROVED';
  end if;
  return new;
end;
$$;

create trigger enforce_single_approved_version
  after insert or update of status on public.design_versions
  for each row execute function app.enforce_single_approved_version();

-- An execution project may only reference an APPROVED version belonging to the
-- same lead. This is the database-level half of the §18 rule that execution
-- cannot start without an approved design.
create or replace function app.guard_execution_source_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status     public.design_version_status;
  v_lead_id    uuid;
begin
  select dv.status, dp.lead_id
    into v_status, v_lead_id
    from public.design_versions dv
    join public.design_projects dp on dp.id = dv.design_project_id
   where dv.id = new.approved_design_version_id;

  if v_status is null then
    raise exception 'approved_design_version_id % does not exist', new.approved_design_version_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_status <> 'APPROVED' then
    raise exception 'execution requires an APPROVED design version (got %)', v_status
      using errcode = 'check_violation';
  end if;

  if v_lead_id <> new.lead_id then
    raise exception 'approved design version belongs to a different lead'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger guard_execution_source_version
  before insert or update of approved_design_version_id on public.execution_projects
  for each row execute function app.guard_execution_source_version();

-- Keep progress_percent honest: derived from task completion unless an Admin
-- has explicitly overridden it.
create or replace function app.recalculate_execution_progress()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := coalesce(new.execution_project_id, old.execution_project_id);
  v_total      integer;
  v_done       integer;
begin
  select count(*), count(*) filter (where status = 'COMPLETED')
    into v_total, v_done
    from public.execution_tasks
   where execution_project_id = v_project_id
     and status <> 'CANCELLED';

  update public.execution_projects
     set progress_percent = case when v_total = 0 then 0
                                 else floor((v_done::numeric / v_total) * 100)::int end
   where id = v_project_id
     and progress_percent is distinct from (
       case when v_total = 0 then 0
            else floor((v_done::numeric / v_total) * 100)::int end
     );

  return null;
end;
$$;

-- Row-level: statement-level triggers have no NEW/OLD to read the project from.
create trigger recalculate_execution_progress
  after insert or update of status or delete on public.execution_tasks
  for each row execute function app.recalculate_execution_progress();
