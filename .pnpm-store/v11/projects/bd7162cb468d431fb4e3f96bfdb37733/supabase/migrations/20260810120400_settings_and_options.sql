-- ===========================================================================
-- Star Gardens CRM — 05. Configurable business options
-- AGENTS.md §2: keep configurable options in the database, not scattered as
-- hard-coded text. §11.7: Admin manages these from the settings screens.
-- ===========================================================================

insert into public.app_settings (key, value, description) values
  ('max_upload_size_mb',
   '50'::jsonb,
   'Maximum size of a single upload in megabytes (§5.3).'),

  ('allowed_preview_extensions',
   '["pdf","jpg","jpeg","png","webp"]'::jsonb,
   'Extensions rendered inline in the browser (§5.2).'),

  ('allowed_download_extensions',
   '["doc","docx","xls","xlsx","ppt","pptx","dwg","dxf","skp","zip"]'::jsonb,
   'Extensions stored and downloadable but with no in-browser preview (§5.2).'),

  ('follow_up_reminder_lead_hours',
   '24'::jsonb,
   'How many hours before due_at a "due soon" reminder fires (§13).'),

  ('design_due_reminder_lead_hours',
   '48'::jsonb,
   'How many hours before a design due date a reminder fires (§13).'),

  ('duplicate_lookback_days',
   '365'::jsonb,
   'How far back duplicate mobile-number detection scans (§8.1).'),

  ('default_country_code',
   '"+91"'::jsonb,
   'Applied when an inbound lead has no explicit country code (§8.1).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Loss reasons (§7.1 "Manage configurable ... loss reasons")
-- ---------------------------------------------------------------------------
insert into public.config_options (group_key, value, label, sort_order) values
  ('lost_reason', 'BUDGET',            'Budget too high',              10),
  ('lost_reason', 'TIMELINE',          'Timeline mismatch',            20),
  ('lost_reason', 'COMPETITOR',        'Chose another vendor',         30),
  ('lost_reason', 'NOT_REACHABLE',     'Customer not reachable',       40),
  ('lost_reason', 'NOT_INTERESTED',    'No longer interested',         50),
  ('lost_reason', 'OUT_OF_SERVICE_AREA','Outside service area',        60),
  ('lost_reason', 'DUPLICATE',         'Duplicate enquiry',            70),
  ('lost_reason', 'OTHER',             'Other',                        99),

  -- Requirement categories used on the lead and site-visit forms.
  ('requirement_type', 'LANDSCAPE_DESIGN', 'Landscape design',         10),
  ('requirement_type', 'TERRACE_GARDEN',   'Terrace garden',           20),
  ('requirement_type', 'BALCONY_GARDEN',   'Balcony garden',           30),
  ('requirement_type', 'VERTICAL_GARDEN',  'Vertical garden',          40),
  ('requirement_type', 'INDOOR_PLANTS',    'Indoor plants',            50),
  ('requirement_type', 'OFFICE_PLANTS',    'Office plants',            60),
  ('requirement_type', 'PLANTS_ON_HIRE',   'Plants on hire',           70),
  ('requirement_type', 'KITCHEN_GARDEN',   'Kitchen garden',           80),
  ('requirement_type', 'GREEN_ROOF',       'Green roof',               90),
  ('requirement_type', 'MAINTENANCE',      'Maintenance / AMC',       100),
  ('requirement_type', 'OTHER',            'Other',                   999)
on conflict (group_key, value) do nothing;

-- ---------------------------------------------------------------------------
-- Default execution checklist (§8.5 step 4)
-- ---------------------------------------------------------------------------
insert into public.execution_task_templates (title, description, is_mandatory, sort_order) values
  ('Site preparation',        'Clear, level and prepare the site as per the approved design.', true,  10),
  ('Material procurement',    'Procure soil, planters, plants and hardscape materials.',       true,  20),
  ('Waterproofing check',     'Verify waterproofing before any soil or planter is placed.',    true,  30),
  ('Drainage layer',          'Install drainage media and filter fabric.',                     true,  40),
  ('Soil and media filling',  'Fill growing media to the specified depth.',                    true,  50),
  ('Hardscape installation',  'Install decking, pathways, edging and lighting.',               false, 60),
  ('Irrigation setup',        'Install and pressure-test the irrigation system.',              true,  70),
  ('Plantation',              'Plant as per the approved planting plan.',                      true,  80),
  ('Site cleanup',            'Remove debris and clean the site.',                             true,  90),
  ('Customer walkthrough',    'Walk the customer through the completed work.',                 true, 100),
  ('Handover and care notes', 'Share plant care and maintenance instructions.',                true, 110)
on conflict do nothing;
