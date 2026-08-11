-- Replace one Meta form mapping atomically. The editor submits the complete
-- mapping, so a failed insert must never leave the form with its old rows
-- deleted and no usable replacement.
create or replace function public.replace_meta_form_mapping(
  p_meta_form_id text,
  p_entries jsonb,
  p_is_active boolean default true
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
begin
  if not app.is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_meta_form_id), '') is null then
    raise exception 'Meta form id is required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'A mapping must contain at least one entry.' using errcode = '22023';
  end if;

  if (
    select count(*) filter (where value->>'crm_field' = 'customer_name') <> 1
        or count(*) filter (where value->>'crm_field' = 'mobile') <> 1
        or count(*) filter (where value->>'crm_field' = 'email') > 1
        or count(*) filter (where value->>'crm_field' = 'location_text') > 1
        or count(*) filter (where value->>'crm_field' = 'requirement_summary') > 1
        or count(*) filter (where nullif(btrim(value->>'meta_field_key'), '') is null) > 0
        or count(distinct value->>'meta_field_key') <> count(*)
    from jsonb_array_elements(p_entries)
  ) then
    raise exception 'The mapping is incomplete or contains duplicate fields.' using errcode = '22023';
  end if;

  delete from public.meta_field_mappings
  where meta_form_id = p_meta_form_id;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    insert into public.meta_field_mappings (
      meta_form_id,
      meta_field_key,
      meta_field_label,
      crm_field,
      is_active,
      created_by,
      updated_by
    ) values (
      p_meta_form_id,
      btrim(v_entry->>'meta_field_key'),
      nullif(btrim(v_entry->>'meta_field_label'), ''),
      (v_entry->>'crm_field')::public.meta_crm_field,
      p_is_active,
      auth.uid(),
      auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.replace_meta_form_mapping(text, jsonb, boolean) from public;
grant execute on function public.replace_meta_form_mapping(text, jsonb, boolean) to authenticated;
