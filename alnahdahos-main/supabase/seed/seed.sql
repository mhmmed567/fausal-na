-- DEV SEED ONLY. Safe to delete with supabase/seed/clean.sql
-- All rows are marked is_seed = true.

-- Demo staff accounts
-- admin@nahdha.local  / NahdhaAdmin2026!
-- rahma@nahdha.local  / RahmaAdmin2026!
-- doctor@nahdha.local / NahdhaDoctor2026!
-- staff@nahdha.local  / NahdhaStaff2026!
-- viewer@nahdha.local / NahdhaViewer2026!

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt(u.pass, extensions.gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
  jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@nahdha.local', 'NahdhaAdmin2026!', 'admin', 'Fatma Al Hinai'),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'rahma@nahdha.local', 'RahmaAdmin2026!', 'admin', 'رحمه'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'doctor@nahdha.local', 'NahdhaDoctor2026!', 'doctor', 'Dr. Salim Al Harthy'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'staff@nahdha.local', 'NahdhaStaff2026!', 'staff', 'Aisha Al Lawati'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'viewer@nahdha.local', 'NahdhaViewer2026!', 'viewer', 'Mohammed Al Rawahi')
) as u(id, email, pass, role, full_name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'admin@nahdha.local'),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'rahma@nahdha.local'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'doctor@nahdha.local'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'staff@nahdha.local'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'viewer@nahdha.local')
) as u(id, email)
where not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.categories (id, slug, name_en, name_ar, color, sort_order, is_seed) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'cardiovascular', 'Cardiovascular', 'قلب وأوعية', '#0f766e', 1, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'diabetes', 'Diabetes', 'سكري', '#b45309', 2, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'respiratory', 'Respiratory', 'تنفسي', '#0369a1', 3, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', 'renal', 'Renal', 'كلى', '#7c3aed', 4, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', 'neurology', 'Neurology', 'أعصاب', '#be185d', 5, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', 'gastrointestinal', 'Gastrointestinal', 'جهاز هضمي', '#047857', 6, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', 'other', 'Other', 'أخرى', '#57534e', 7, true)
on conflict (id) do nothing;

insert into public.medications (id, name, generic_name, category, notes, is_seed) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'Concor', 'Bisoprolol', 'Cardiovascular', 'Beta blocker', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'Metformin', 'Metformin', 'Diabetes', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'Amlodipine', 'Amlodipine', 'Cardiovascular', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'Aspirin', 'Acetylsalicylic acid', 'Cardiovascular', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'Losartan', 'Losartan', 'Cardiovascular', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'Omeprazole', 'Omeprazole', 'Gastrointestinal', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'Ventolin', 'Salbutamol', 'Respiratory', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'Atorvastatin', 'Atorvastatin', 'Cardiovascular', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'Gliclazide', 'Gliclazide', 'Diabetes', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'Insulin Glargine', 'Insulin glargine', 'Diabetes', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'Furosemide', 'Furosemide', 'Renal', null, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0012', 'Gabapentin', 'Gabapentin', 'Neurology', null, true)
on conflict (id) do nothing;

insert into public.conditions (id, name_en, name_ar, is_seed) values
  ('cccccccc-cccc-cccc-cccc-cccccccc0001', 'Hypertension', 'ارتفاع ضغط الدم', true),
  ('cccccccc-cccc-cccc-cccc-cccccccc0002', 'Type 2 Diabetes', 'سكري النوع الثاني', true),
  ('cccccccc-cccc-cccc-cccc-cccccccc0003', 'Asthma', 'ربو', true),
  ('cccccccc-cccc-cccc-cccc-cccccccc0004', 'Chronic Kidney Disease', 'قصور كلوي مزمن', true),
  ('cccccccc-cccc-cccc-cccc-cccccccc0005', 'Dyslipidemia', 'ارتفاع دهون الدم', true),
  ('cccccccc-cccc-cccc-cccc-cccccccc0006', 'GERD', 'ارتجاع معدي مريئي', true)
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('general', '{"org_name_ar":"صيدلية النهضة","org_name_en":"Al Nahdha Pharmacy","org_parent_ar":"مستشفى النهضة","org_parent_en":"Al Nahdha Hospital","phone":"+968 24000000","city":"Muscat"}'::jsonb)
on conflict (key) do nothing;

insert into public.mcp_clients (id, name, status, permissions, token_hash, token_prefix, created_by)
values (
  'dddddddd-dddd-dddd-dddd-dddddddd0001',
  'Mazen',
  'active',
  array[
    'patients.read','patients.write','messages.read','messages.write',
    'medications.read','medications.write','conditions.read','conditions.write',
    'notes.read','notes.write','categories.read','categories.write'
  ],
  '3ac4d0b0dee7feb921c6a435eab6efd0e273e6152d9c8eeecfd6fd8c7ce0ed28',
  'ndh_live_492cd18',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;
