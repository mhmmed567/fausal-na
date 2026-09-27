-- Removes development patient/demo records only.
-- Keeps staff logins, MCP Mazen client, categories, medications, and conditions.

delete from public.notes
where is_seed or patient_id in (select id from public.patients where is_seed);

delete from public.patient_medications
where is_seed or patient_id in (select id from public.patients where is_seed);

delete from public.patient_conditions
where is_seed or patient_id in (select id from public.patients where is_seed);

delete from public.patient_tags
where patient_id in (select id from public.patients where is_seed);

delete from public.patient_contacts
where patient_id in (select id from public.patients where is_seed);

delete from public.patient_categories
where patient_id in (select id from public.patients where is_seed);

delete from public.messages
where is_seed or patient_id in (select id from public.patients where is_seed);

delete from public.activity_logs
where metadata->>'seed' = 'true'
   or entity_id in (select id from public.patients where is_seed);

delete from public.patients where is_seed;
