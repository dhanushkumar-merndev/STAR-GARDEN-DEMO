-- ===========================================================================
-- Star Garden CRM — local development seed
--
-- Run against a LOCAL Supabase stack only (`supabase db reset`). Never run
-- this against production: it creates accounts with known passwords.
--
-- Creates one user per role. Password for all four: StarGarden#2026
-- The `on_auth_user_created` trigger provisions the matching profile rows.
-- ===========================================================================

do $$
declare
  v_admin_id     uuid := '11111111-1111-1111-1111-111111111111';
  v_bdm_id       uuid := '22222222-2222-2222-2222-222222222222';
  v_designer_id  uuid := '33333333-3333-3333-3333-333333333333';
  v_execution_id uuid := '44444444-4444-4444-4444-444444444444';
  v_password     text := crypt('StarGarden#2026', gen_salt('bf'));
  v_lead_id      uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@stargarden.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Asha Admin","role":"ADMIN","mobile":"9800000001"}'::jsonb,
     now(), now()),

    (v_bdm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bdm@stargarden.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Bharat BDM","role":"BDM","mobile":"9800000002"}'::jsonb,
     now(), now()),

    (v_designer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'designer@stargarden.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Divya Designer","role":"DESIGNER","mobile":"9800000003"}'::jsonb,
     now(), now()),

    (v_execution_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'execution@stargarden.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Eshan Execution","role":"EXECUTION","mobile":"9800000004"}'::jsonb,
     now(), now())
  on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email', now(), now(), now()
  from auth.users u
  where u.id in (v_admin_id, v_bdm_id, v_designer_id, v_execution_id)
  on conflict do nothing;

  -- A couple of demo leads so the dashboards are not empty on first run.
  insert into public.leads (
    customer_name, mobile_country_code, mobile_normalized, email,
    location_text, requirement_summary, source, status,
    assigned_bdm_id, created_by, next_action_at
  )
  values
    ('Ramesh Kumar', '+91', '9845012345', 'ramesh@example.com',
     'Whitefield, Bengaluru', 'Terrace garden for a 1200 sqft terrace.',
     'WEBSITE', 'ASSIGNED', v_bdm_id, v_admin_id, now() + interval '1 day'),
    ('Priya Nair', '+91', '9845067890', null,
     'Koramangala, Bengaluru', 'Balcony garden and indoor plants.',
     'META_FACEBOOK', 'UNASSIGNED', null, v_admin_id, null)
  on conflict do nothing
  returning id into v_lead_id;

  raise notice 'Seed complete. Login with admin@stargarden.test / StarGarden#2026';
end;
$$;
