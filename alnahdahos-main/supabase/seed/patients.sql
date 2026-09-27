-- DEV patient seed. Delete with supabase/seed/clean.sql

insert into public.patients (
  id, full_name, primary_phone, secondary_phone, email, status, category_id,
  last_contact_at, created_by, is_seed, created_at, updated_at
)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'Ahmed Al Balushi', '+96892123401', null, 'ahmed.b@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '2 hours', '11111111-1111-1111-1111-111111111111', true, now() - interval '40 days', now() - interval '2 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', 'Fatma Al Hinai', '+96892123402', '+96899110002', null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', now() - interval '1 day', '22222222-2222-2222-2222-222222222222', true, now() - interval '35 days', now() - interval '1 day'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0003', 'Mohammed Al Rawahi', '+96892123403', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', now() - interval '3 days', '33333333-3333-3333-3333-333333333333', true, now() - interval '28 days', now() - interval '3 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', 'Salim Al Harthy', '+96892123404', null, 'salim.h@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '5 hours', '11111111-1111-1111-1111-111111111111', true, now() - interval '20 days', now() - interval '5 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0005', 'Aisha Al Lawati', '+96892123405', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', now() - interval '8 days', '22222222-2222-2222-2222-222222222222', true, now() - interval '18 days', now() - interval '8 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0006', 'Khalid Al Zadjali', '+96892123406', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', now() - interval '12 hours', '11111111-1111-1111-1111-111111111111', true, now() - interval '15 days', now() - interval '12 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0007', 'Maryam Al Busaidi', '+96892123407', null, 'maryam.b@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', now() - interval '2 days', '22222222-2222-2222-2222-222222222222', true, now() - interval '12 days', now() - interval '2 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0008', 'Yousuf Al Siyabi', '+96892123408', null, null, 'inactive', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', now() - interval '20 days', '33333333-3333-3333-3333-333333333333', true, now() - interval '60 days', now() - interval '20 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0009', 'Nasser Al Mandhari', '+96892123409', '+96899220009', null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '6 hours', '11111111-1111-1111-1111-111111111111', true, now() - interval '9 days', now() - interval '6 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0010', 'Huda Al Kalbani', '+96892123410', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', now() - interval '4 days', '22222222-2222-2222-2222-222222222222', true, now() - interval '22 days', now() - interval '4 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0011', 'Said Al Shukaili', '+96892123411', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', now() - interval '30 minutes', '11111111-1111-1111-1111-111111111111', true, now() - interval '4 days', now() - interval '30 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0012', 'Laila Al Riyami', '+96892123412', null, 'laila.r@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', now() - interval '11 days', '33333333-3333-3333-3333-333333333333', true, now() - interval '45 days', now() - interval '11 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0013', 'Hamad Al Maawali', '+96892123413', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '1 hour', '22222222-2222-2222-2222-222222222222', true, now() - interval '7 days', now() - interval '1 hour'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0014', 'Zahra Al Farsi', '+96892123414', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', now() - interval '3 hours', '11111111-1111-1111-1111-111111111111', true, now() - interval '3 days', now() - interval '3 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0015', 'Omar Al Abri', '+96892123415', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', now() - interval '9 days', '22222222-2222-2222-2222-222222222222', true, now() - interval '25 days', now() - interval '9 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0016', 'Amina Al Amri', '+96892123416', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', now() - interval '7 hours', '33333333-3333-3333-3333-333333333333', true, now() - interval '6 days', now() - interval '7 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0017', 'Talal Al Ghaithi', '+96892123417', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', now() - interval '16 days', '11111111-1111-1111-1111-111111111111', true, now() - interval '50 days', now() - interval '16 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0018', 'Noor Al Maskari', '+96892123418', '+96899330018', 'noor.m@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005', now() - interval '2 days', '22222222-2222-2222-2222-222222222222', true, now() - interval '14 days', now() - interval '2 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0019', 'Bader Al Kharusi', '+96892123419', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '40 minutes', '11111111-1111-1111-1111-111111111111', true, now() - interval '2 days', now() - interval '40 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0020', 'Shaikha Al Habsi', '+96892123420', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', now() - interval '5 days', '33333333-3333-3333-3333-333333333333', true, now() - interval '11 days', now() - interval '5 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0021', 'Ibrahim Al Ajmi', '+96892123421', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006', now() - interval '8 hours', '22222222-2222-2222-2222-222222222222', true, now() - interval '8 days', now() - interval '8 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0022', 'Muna Al Aufi', '+96892123422', null, null, 'inactive', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0007', now() - interval '25 days', '11111111-1111-1111-1111-111111111111', true, now() - interval '70 days', now() - interval '25 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0023', 'Hassan Al Dghishi', '+96892123423', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004', now() - interval '1 day', '33333333-3333-3333-3333-333333333333', true, now() - interval '5 days', now() - interval '1 day'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0024', 'Reem Al Jahwari', '+96892123424', null, 'reem.j@example.om', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', now() - interval '9 hours', '22222222-2222-2222-2222-222222222222', true, now() - interval '1 day', now() - interval '9 hours'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0025', 'Abdullah Al Qasmi', '+96892123425', null, null, 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', now() - interval '15 minutes', '11111111-1111-1111-1111-111111111111', true, now() - interval '6 hours', now() - interval '15 minutes')
on conflict (id) do nothing;

insert into public.patient_medications (patient_id, medication_id, dosage, frequency, start_date, status, created_by, is_seed)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '5 mg', 'Once daily', current_date - 30, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', '5 mg', 'Once daily', current_date - 30, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', '20 mg', 'Nightly', current_date - 20, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '500 mg', 'Twice daily', current_date - 60, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', '30 mg', 'With breakfast', current_date - 40, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', '100 mcg', 'As needed', current_date - 15, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '2.5 mg', 'Once daily', current_date - 10, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', '81 mg', 'Once daily', current_date - 10, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', '20 mg', 'Before breakfast', current_date - 12, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', '40 mg', 'Morning', current_date - 8, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '850 mg', 'Twice daily', current_date - 90, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', '10 units', 'Nightly', current_date - 20, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0009', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', '50 mg', 'Once daily', current_date - 14, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '500 mg', 'Twice daily', current_date - 4, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0013', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '5 mg', 'Once daily', current_date - 7, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0016', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '500 mg', 'Twice daily', current_date - 6, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0019', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', '10 mg', 'Once daily', current_date - 2, 'active', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0025', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '5 mg', 'Once daily', current_date, 'active', '22222222-2222-2222-2222-222222222222', true);

insert into public.patient_conditions (patient_id, condition_id, status, notes, created_by, is_seed)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'cccccccc-cccc-cccc-cccc-cccccccc0001', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'cccccccc-cccc-cccc-cccc-cccccccc0005', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', 'cccccccc-cccc-cccc-cccc-cccccccc0002', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0003', 'cccccccc-cccc-cccc-cccc-cccccccc0003', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0006', 'cccccccc-cccc-cccc-cccc-cccccccc0004', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0007', 'cccccccc-cccc-cccc-cccc-cccccccc0002', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0014', 'cccccccc-cccc-cccc-cccc-cccccccc0006', 'active', 'Added manually', '22222222-2222-2222-2222-222222222222', true);

insert into public.notes (patient_id, body, created_by, is_seed)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', 'Called to confirm Concor refill. Patient reports blood pressure is stable.', '11111111-1111-1111-1111-111111111111', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', 'Asked about Metformin timing with meals. Advised to take with food.', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', 'Requested Aspirin 81 mg. File updated.', '33333333-3333-3333-3333-333333333333', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0011', 'New patient. Started Metformin this week.', '22222222-2222-2222-2222-222222222222', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0025', 'Walk-in for Concor. First visit recorded today.', '11111111-1111-1111-1111-111111111111', true);

insert into public.messages (patient_id, phone_number, direction, message_body, status, received_at, is_seed)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', '+96892123401', 'incoming', 'السلام عليكم، خلص كونكور، أقدر أجدد الوصفة؟', 'read', now() - interval '2 hours', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', '+96892123401', 'outgoing', 'وعليكم السلام، تقدر تمر الصيدلية اليوم بعد العصر.', 'sent', now() - interval '1 hour 40 minutes', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', '+96892123402', 'incoming', 'هل الميتفورمين مع الأكل ولا قبله؟', 'read', now() - interval '1 day', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0004', '+96892123404', 'incoming', 'I need Aspirin 81 mg please.', 'new', now() - interval '5 hours', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee0011', '+96892123411', 'incoming', 'بديت الميتفورمين اليوم', 'new', now() - interval '30 minutes', true),
  (null, '+96895550000', 'incoming', 'هل عندكم جهاز ضغط؟', 'new', now() - interval '3 hours', true);

insert into public.activity_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
select 'user', created_by, 'patient.created', 'patient', id, jsonb_build_object('seed', true)
from public.patients where is_seed;
