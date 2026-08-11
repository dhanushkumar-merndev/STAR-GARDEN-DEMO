-- ===========================================================================
-- Star Gardens CRM — 07. Transactional operations
--
-- AGENTS.md §18: "Use database transactions for multi-record state transitions
-- such as assignment, approval, and execution handoff."
--
-- The Supabase JS client sends one statement per call, so a multi-row handoff
-- issued from Node would be several independent transactions — an approval
-- could land while the activity row that explains it did not. Each operation
-- below is therefore a single function: one call, one transaction, all rows or
-- none.
--
-- These are SECURITY INVOKER on purpose. They run as the calling user, so every
-- RLS policy from migration 04 still applies inside them, and the explicit
-- `app.*` checks at the top of each body are the second, independent layer that
-- §7.5 requires.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Keep `leads.next_action_at` in step with the earliest open follow-up.
--
-- §8.2: "A live lead should normally have a visible next action. The dashboard
-- must flag active leads with no next action." That flag is only trustworthy if
-- this column is maintained centrally rather than by each caller.
-- ---------------------------------------------------------------------------
create or replace function app.refresh_lead_next_action(p_lead_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_next timestamptz;
begin
  select min(due_at) into v_next
    from public.follow_ups
   where lead_id = p_lead_id
     and status in ('OPEN', 'OVERDUE');

  -- A scheduled visit is also a next action.
  select least(v_next, (
    select min(scheduled_start_at)
      from public.site_visits
     where lead_id = p_lead_id
       and status in ('SCHEDULED', 'RESCHEDULED', 'IN_PROGRESS')
  )) into v_next;

  update public.leads
     set next_action_at = v_next,
         last_activity_at = now()
   where id = p_lead_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead assignment (§8.1 step 6, §7.1)
--
-- Assignment and reassignment are Admin actions. One call writes the lead, the
-- history row and the timeline entry together.
-- ---------------------------------------------------------------------------
create or replace function public.assign_lead(
  p_lead_id uuid,
  p_to_user_id uuid,
  p_reason text default null
)
returns public.leads
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lead   public.leads;
  v_from   uuid;
  v_target public.profiles;
begin
  if not app.is_admin() then
    raise exception 'Only an Admin may assign or reassign leads'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  select * into v_target from public.profiles where id = p_to_user_id;
  if not found or not v_target.is_active then
    raise exception 'Assignee is not an active user' using errcode = 'check_violation';
  end if;

  if v_target.role <> 'BDM' and v_target.role <> 'ADMIN' then
    raise exception 'Leads may only be assigned to a BDM' using errcode = 'check_violation';
  end if;

  v_from := v_lead.assigned_bdm_id;

  if v_from is not distinct from p_to_user_id then
    return v_lead;
  end if;

  update public.leads
     set assigned_bdm_id = p_to_user_id,
         status = case when status in ('NEW', 'UNASSIGNED') then 'ASSIGNED'::public.lead_status
                       else status end,
         last_activity_at = now()
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_assignment_history (lead_id, from_user_id, to_user_id, reason, changed_by)
  values (p_lead_id, v_from, p_to_user_id, p_reason, auth.uid());

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    p_lead_id,
    'ASSIGNMENT',
    coalesce(p_reason, 'Lead assigned to ' || v_target.full_name),
    auth.uid()
  );

  return v_lead;
end;
$$;

-- ---------------------------------------------------------------------------
-- Design approval (§8.4 steps 7–9)
--
-- Approval must identify one exact version and move the project with it.
-- `app.enforce_single_approved_version` supersedes any earlier approval.
-- ---------------------------------------------------------------------------
create or replace function public.approve_design_version(
  p_version_id uuid,
  p_note text default null
)
returns public.design_versions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version public.design_versions;
  v_project public.design_projects;
begin
  select * into v_version from public.design_versions where id = p_version_id for update;
  if not found then
    raise exception 'Design version not found' using errcode = 'no_data_found';
  end if;

  select * into v_project from public.design_projects where id = v_version.design_project_id for update;

  -- Reviewing is the BDM/Admin side of the workflow (§7.2, §7.3).
  if not (app.is_admin() or app.can_write_lead(v_project.lead_id)) then
    raise exception 'Only the owning BDM or an Admin may approve a design'
      using errcode = 'insufficient_privilege';
  end if;

  -- A designer must not sign off their own upload.
  if v_version.uploaded_by = auth.uid() and not app.is_admin() then
    raise exception 'A designer cannot approve their own version'
      using errcode = 'insufficient_privilege';
  end if;

  if v_version.status not in ('READY_FOR_REVIEW', 'REVISION_REQUESTED') then
    raise exception 'Only a version marked ready for review can be approved (got %)', v_version.status
      using errcode = 'check_violation';
  end if;

  update public.design_versions
     set status = 'APPROVED',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_version_id
  returning * into v_version;

  update public.design_projects
     set status = 'APPROVED',
         approved_version_id = p_version_id,
         approved_by = auth.uid(),
         approved_at = now()
   where id = v_project.id;

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    v_project.lead_id,
    'DESIGN_UPDATE',
    coalesce(p_note, 'Approved design version ' || v_version.version_number),
    auth.uid()
  );

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revision request (§8.4 step 7)
-- ---------------------------------------------------------------------------
create or replace function public.request_design_revision(
  p_version_id uuid,
  p_notes text
)
returns public.design_versions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version public.design_versions;
  v_project public.design_projects;
begin
  if p_notes is null or btrim(p_notes) = '' then
    raise exception 'Revision notes are required' using errcode = 'check_violation';
  end if;

  select * into v_version from public.design_versions where id = p_version_id for update;
  if not found then
    raise exception 'Design version not found' using errcode = 'no_data_found';
  end if;

  select * into v_project from public.design_projects where id = v_version.design_project_id for update;

  if not (app.is_admin() or app.can_write_lead(v_project.lead_id)) then
    raise exception 'Only the owning BDM or an Admin may request a revision'
      using errcode = 'insufficient_privilege';
  end if;

  if v_version.status <> 'READY_FOR_REVIEW' then
    raise exception 'Only a version marked ready for review can be sent back (got %)', v_version.status
      using errcode = 'check_violation';
  end if;

  update public.design_versions
     set status = 'REVISION_REQUESTED',
         revision_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_version_id
  returning * into v_version;

  update public.design_projects
     set status = 'REVISION_REQUESTED'
   where id = v_project.id;

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    v_project.lead_id,
    'DESIGN_UPDATE',
    'Revision requested on version ' || v_version.version_number || ': ' || p_notes,
    auth.uid()
  );

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution handoff (§8.5)
--
-- The single most important transaction in the system: project, assignees and
-- the task checklist are created together, against one exact approved version.
-- The `guard_execution_source_version` trigger rejects anything else.
-- ---------------------------------------------------------------------------
create or replace function public.create_execution_project(
  p_lead_id uuid,
  p_approved_design_version_id uuid,
  p_title text default null,
  p_planned_start_at timestamptz default null,
  p_due_at timestamptz default null,
  p_assignee_ids uuid[] default '{}',
  p_use_template boolean default true
)
returns public.execution_projects
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_project   public.execution_projects;
  v_design    public.design_projects;
  v_assignee  uuid;
begin
  if not (app.is_admin() or app.can_write_lead(p_lead_id)) then
    raise exception 'Only the owning BDM or an Admin may start execution'
      using errcode = 'insufficient_privilege';
  end if;

  select dp.* into v_design
    from public.design_projects dp
    join public.design_versions dv on dv.design_project_id = dp.id
   where dv.id = p_approved_design_version_id
   for update;

  insert into public.execution_projects (
    lead_id, design_project_id, approved_design_version_id,
    title, status, planned_start_at, due_at, created_by
  )
  values (
    p_lead_id,
    v_design.id,
    p_approved_design_version_id,
    p_title,
    case when coalesce(array_length(p_assignee_ids, 1), 0) > 0
         then 'ASSIGNED'::public.execution_status
         else 'NOT_STARTED'::public.execution_status end,
    p_planned_start_at,
    p_due_at,
    auth.uid()
  )
  returning * into v_project;

  foreach v_assignee in array coalesce(p_assignee_ids, '{}')
  loop
    insert into public.execution_assignees (execution_project_id, user_id, assigned_by)
    values (v_project.id, v_assignee, auth.uid())
    on conflict do nothing;
  end loop;

  if p_use_template then
    insert into public.execution_tasks (
      execution_project_id, title, description, is_mandatory, sort_order, created_by
    )
    select v_project.id, t.title, t.description, t.is_mandatory, t.sort_order, auth.uid()
      from public.execution_task_templates t
     where t.is_active
     order by t.sort_order;
  end if;

  insert into public.activities (lead_id, type, notes, created_by)
  values (p_lead_id, 'EXECUTION_UPDATE', 'Execution project created from the approved design.', auth.uid());

  perform app.refresh_lead_next_action(p_lead_id);

  return v_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- Follow-up completion (§8.2)
-- ---------------------------------------------------------------------------
create or replace function public.complete_follow_up(
  p_follow_up_id uuid,
  p_notes text default null
)
returns public.follow_ups
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_follow_up public.follow_ups;
begin
  select * into v_follow_up from public.follow_ups where id = p_follow_up_id for update;
  if not found then
    raise exception 'Follow-up not found' using errcode = 'no_data_found';
  end if;

  if not (app.is_admin()
          or app.can_write_lead(v_follow_up.lead_id)
          or v_follow_up.assigned_to = auth.uid()) then
    raise exception 'You cannot complete this follow-up' using errcode = 'insufficient_privilege';
  end if;

  if v_follow_up.status = 'COMPLETED' then
    return v_follow_up;
  end if;

  update public.follow_ups
     set status = 'COMPLETED',
         completed_at = now(),
         completed_by = auth.uid(),
         notes = coalesce(nullif(btrim(p_notes), ''), notes)
   where id = p_follow_up_id
  returning * into v_follow_up;

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    v_follow_up.lead_id,
    'FOLLOW_UP_COMPLETED',
    coalesce(nullif(btrim(p_notes), ''), 'Completed: ' || v_follow_up.title),
    auth.uid()
  );

  perform app.refresh_lead_next_action(v_follow_up.lead_id);

  return v_follow_up;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead status change with its timeline entry (§9.1, §17)
-- ---------------------------------------------------------------------------
create or replace function public.change_lead_status(
  p_lead_id uuid,
  p_status public.lead_status,
  p_lost_reason text default null,
  p_note text default null
)
returns public.leads
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads;
  v_old  public.lead_status;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  if not app.can_write_lead(p_lead_id) then
    raise exception 'You cannot change this lead' using errcode = 'insufficient_privilege';
  end if;

  -- Reopening a dead lead is an Admin decision.
  if v_lead.status in ('LOST', 'CLOSED') and not app.is_admin() then
    raise exception 'Only an Admin may reopen a closed or lost lead'
      using errcode = 'insufficient_privilege';
  end if;

  v_old := v_lead.status;
  if v_old = p_status and p_lost_reason is null then
    return v_lead;
  end if;

  update public.leads
     set status = p_status,
         lost_reason = case when p_status = 'LOST' then p_lost_reason else lost_reason end,
         last_activity_at = now()
   where id = p_lead_id
  returning * into v_lead;

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    p_lead_id,
    case when p_status in ('LOST', 'CLOSED') then 'CLOSURE'::public.activity_type
         else 'STATUS_CHANGE'::public.activity_type end,
    coalesce(
      nullif(btrim(p_note), ''),
      'Status changed from ' || v_old || ' to ' || p_status
        || case when p_lost_reason is not null then ' (' || p_lost_reason || ')' else '' end
    ),
    auth.uid()
  );

  return v_lead;
end;
$$;

grant execute on function
  public.assign_lead(uuid, uuid, text),
  public.approve_design_version(uuid, text),
  public.request_design_revision(uuid, text),
  public.create_execution_project(uuid, uuid, text, timestamptz, timestamptz, uuid[], boolean),
  public.complete_follow_up(uuid, text),
  public.change_lead_status(uuid, public.lead_status, text, text)
to authenticated;

grant execute on function app.refresh_lead_next_action(uuid) to authenticated, service_role;
