-- When BDM work is disabled, the first Admin to start a call owns an
-- unassigned lead. The row lock makes this safe when multiple Admins act at
-- the same time: the first caller wins and later callers cannot overwrite it.
create or replace function public.claim_unassigned_lead(p_lead_id uuid)
returns public.leads
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads;
begin
  if not app.is_admin() then
    raise exception 'Only an Admin may claim an unassigned lead'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(
    (select value from public.app_settings where key = 'bdm_role_enabled'),
    'false'::jsonb
  ) <> 'false'::jsonb then
    raise exception 'Automatic Admin claiming is available only when BDM assignment is disabled'
      using errcode = 'check_violation';
  end if;

  select * into v_lead
    from public.leads
   where id = p_lead_id
   for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  -- Another Admin may have claimed it while this call was waiting for the row
  -- lock. Never steal the ownership in that case.
  if v_lead.assigned_bdm_id is not null then
    return v_lead;
  end if;

  update public.leads
     set assigned_bdm_id = auth.uid(),
         status = case when status in ('NEW', 'UNASSIGNED') then 'ASSIGNED'::public.lead_status
                       else status end,
         last_activity_at = now()
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_assignment_history (
    lead_id, from_user_id, to_user_id, reason, changed_by
  ) values (
    p_lead_id,
    null,
    auth.uid(),
    'Claimed automatically when the Admin started a call.',
    auth.uid()
  );

  insert into public.activities (lead_id, type, notes, created_by)
  values (
    p_lead_id,
    'ASSIGNMENT',
    'Lead claimed automatically when the Admin started a call.',
    auth.uid()
  );

  return v_lead;
end;
$$;

grant execute on function public.claim_unassigned_lead(uuid) to authenticated;
