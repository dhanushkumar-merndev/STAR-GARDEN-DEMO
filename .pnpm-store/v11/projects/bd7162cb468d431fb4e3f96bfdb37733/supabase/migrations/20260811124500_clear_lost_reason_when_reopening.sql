-- A lost reason describes only a LOST lead.  Retaining it after an Admin
-- reopens the lead makes the header contradict the active workflow.
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
  v_old public.lead_status;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  if not app.can_write_lead(p_lead_id) then
    raise exception 'You cannot change this lead' using errcode = 'insufficient_privilege';
  end if;

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
         lost_reason = case when p_status = 'LOST' then p_lost_reason else null end,
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
