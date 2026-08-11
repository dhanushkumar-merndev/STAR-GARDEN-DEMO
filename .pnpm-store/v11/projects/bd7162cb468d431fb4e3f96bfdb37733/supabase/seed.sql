-- ===========================================================================
-- Star Gardens CRM — local development seed
--
-- Run against a LOCAL Supabase stack only (`supabase db reset`).
--
-- Sign-in is Google-only (migration 06), so there are no passwords here. This
-- seed does two things:
--
--   1. Allowlists four demo addresses, one per role, in `staff_invites`.
--   2. Creates matching auth.users + google identities and demo pipeline data,
--      so dashboards, timelines and queues are not empty on first run.
--
-- To actually SIGN IN locally you still need Google OAuth configured in
-- `supabase/config.toml`, and your own Google address allowlisted:
--
--   insert into public.staff_invites (email, full_name, role)
--   values ('you@gmail.com', 'Your Name', 'ADMIN');
--
-- NEVER run this file against production.
-- ===========================================================================

do $$
declare
  v_admin_id     uuid := '11111111-1111-1111-1111-111111111111';
  v_bdm_id       uuid := '22222222-2222-2222-2222-222222222222';
  v_designer_id  uuid := '33333333-3333-3333-3333-333333333333';
  v_execution_id uuid := '44444444-4444-4444-4444-444444444444';
  v_lead_a       uuid;
  v_lead_b       uuid;
  v_lead_c       uuid;
begin
  -- -------------------------------------------------------------------------
  -- 1. Allowlist. Must exist BEFORE the auth.users insert, because the
  --    on_auth_user_created trigger reads it to decide role and active state.
  -- -------------------------------------------------------------------------
  insert into public.staff_invites (email, full_name, mobile, role) values
    ('admin@stargarden.test',     'Asha Admin',       '9800000001', 'ADMIN'),
    ('bdm@stargarden.test',       'Bharat BDM',       '9800000002', 'BDM'),
    ('designer@stargarden.test',  'Divya Designer',   '9800000003', 'DESIGNER'),
    ('execution@stargarden.test', 'Eshan Execution',  '9800000004', 'EXECUTION')
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- 2. Auth users. No encrypted_password column is set — these accounts exist
  --    only as the owners of the seeded rows below.
  -- -------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@stargarden.test', now(),
     '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Asha Admin","name":"Asha Admin"}'::jsonb, now(), now()),

    (v_bdm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bdm@stargarden.test', now(),
     '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Bharat BDM","name":"Bharat BDM"}'::jsonb, now(), now()),

    (v_designer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'designer@stargarden.test', now(),
     '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Divya Designer","name":"Divya Designer"}'::jsonb, now(), now()),

    (v_execution_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'execution@stargarden.test', now(),
     '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Eshan Execution","name":"Eshan Execution"}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'google', now(), now(), now()
  from auth.users u
  where u.id in (v_admin_id, v_bdm_id, v_designer_id, v_execution_id)
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- 3. Demo pipeline
  -- -------------------------------------------------------------------------
  insert into public.leads (
    customer_name, mobile_country_code, mobile_normalized, email,
    location_text, site_address, requirement_summary, source, status,
    assigned_bdm_id, created_by, next_action_at, design_required
  )
  values ('Ramesh Kumar', '+91', '9845012345', 'ramesh@example.com',
          'Whitefield, Bengaluru', '12, Palm Meadows, Whitefield, Bengaluru 560066',
          'Terrace garden for a 1200 sqft terrace. Wants low-maintenance planting.',
          'WEBSITE', 'QUALIFIED', v_bdm_id, v_admin_id, now() + interval '1 day', true)
  returning id into v_lead_a;

  insert into public.leads (
    customer_name, mobile_country_code, mobile_normalized, email,
    location_text, requirement_summary, source, status, created_by
  )
  values ('Priya Nair', '+91', '9845067890', null,
          'Koramangala, Bengaluru', 'Balcony garden and indoor plants.',
          'META_FACEBOOK', 'UNASSIGNED', v_admin_id)
  returning id into v_lead_b;

  insert into public.leads (
    customer_name, mobile_country_code, mobile_normalized,
    location_text, requirement_summary, source, status,
    assigned_bdm_id, created_by, next_action_at
  )
  values ('Anil Desai', '+91', '9900112233',
          'Indiranagar, Bengaluru', 'Office plants on hire for a 40-seat office.',
          'MANUAL', 'FOLLOW_UP', v_bdm_id, v_bdm_id, now() - interval '2 days')
  returning id into v_lead_c;

  insert into public.activities (lead_id, type, outcome, notes, created_by) values
    (v_lead_a, 'CALL_OUTCOME', 'CONNECTED',
     'Discussed terrace waterproofing. Customer keen, wants a design first.', v_bdm_id),
    (v_lead_c, 'CALL_OUTCOME', 'CALL_LATER',
     'Asked to call back after the 15th.', v_bdm_id);

  -- One overdue follow-up so the "overdue" dashboard tile has something in it.
  insert into public.follow_ups (lead_id, assigned_to, title, due_at, status, created_by) values
    (v_lead_c, v_bdm_id, 'Call back about office plants quote',
     now() - interval '1 day', 'OPEN', v_bdm_id),
    (v_lead_a, v_bdm_id, 'Share design timeline',
     now() + interval '1 day', 'OPEN', v_bdm_id);

  insert into public.site_visits (
    lead_id, scheduled_start_at, address, status, notes, requirement_summary, created_by
  )
  values (v_lead_a, now() - interval '3 days',
          '12, Palm Meadows, Whitefield, Bengaluru 560066', 'COMPLETED',
          'Measured terrace. Existing waterproofing is sound.',
          '1200 sqft terrace, needs drainage layer and raised planters.', v_bdm_id);

  insert into public.design_projects (
    lead_id, assigned_designer_id, status, requirement_notes, due_at, created_by
  )
  values (v_lead_a, v_designer_id, 'IN_PROGRESS',
          'Raised planters along the parapet, seating deck in the centre.',
          now() + interval '4 days', v_admin_id);

  raise notice 'Seed complete. Allowlist your own Google address in staff_invites to sign in.';
end;
$$;
