-- Functions, triggers, and Row Level Security for Al Nahdha CRM.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  )
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security invoker
set search_path = public
as $$
  select private.current_role()
$$;

grant execute on function public.current_user_role() to authenticated;

-- Role helpers used by RLS
create or replace function private.has_any_role(roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_role() = any (roles)
$$;

-- Keep profile in sync with auth.users
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  incoming_role public.app_role;
begin
  incoming_role := coalesce((new.raw_app_meta_data->>'role')::public.app_role, 'viewer');
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    incoming_role
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Sync role into app_metadata (never user_metadata)
create or replace function private.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_profile_role_changed on public.profiles;
create trigger on_profile_role_changed
  after insert or update of role on public.profiles
  for each row execute function private.sync_profile_role();

-- Generic updated_at
do $$ 
declare
  t text;
begin
  foreach t in array array[
    'profiles','categories','conditions','medications','patients',
    'patient_medications','patient_conditions','notes','mcp_clients','settings'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      t
    );
  end loop;
end $$;

-- Activity helper
create or replace function public.log_activity(
  p_actor_type public.actor_type,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.activity_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_type, p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.log_activity(public.actor_type, uuid, text, text, uuid, jsonb) to authenticated, service_role;

-- Link messages by phone
create or replace function private.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g')
$$;

create or replace function private.link_message_patient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched uuid;
begin
  if new.patient_id is null then
    select id into matched
    from public.patients
    where archived_at is null
      and (
        private.normalize_phone(primary_phone) = private.normalize_phone(new.phone_number)
        or private.normalize_phone(secondary_phone) = private.normalize_phone(new.phone_number)
      )
    order by updated_at desc
    limit 1;
    if matched is not null then
      new.patient_id := matched;
    end if;
  end if;

  if new.patient_id is not null then
    update public.patients
    set last_contact_at = coalesce(new.received_at, now())
    where id = new.patient_id
      and (last_contact_at is null or last_contact_at < coalesce(new.received_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists messages_link_patient on public.messages;
create trigger messages_link_patient
  before insert on public.messages
  for each row execute function private.link_message_patient();

-- After linking a new patient, attach existing unlinked messages
create or replace function public.link_patient_messages(p_patient_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  rec public.patients%rowtype;
begin
  select * into rec from public.patients where id = p_patient_id;
  if not found then
    return 0;
  end if;
  update public.messages
  set patient_id = p_patient_id
  where patient_id is null
    and (
      private.normalize_phone(phone_number) = private.normalize_phone(rec.primary_phone)
      or (rec.secondary_phone is not null and private.normalize_phone(phone_number) = private.normalize_phone(rec.secondary_phone))
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.link_patient_messages(uuid) to authenticated, service_role;

-- Patient search used by UI and MCP
create or replace function public.search_patients(
  p_query text default null,
  p_category text default null,
  p_status text default null,
  p_medication text default null,
  p_last_contact_from timestamptz default null,
  p_last_contact_to timestamptz default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_include_archived boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  full_name text,
  primary_phone text,
  secondary_phone text,
  email citext,
  status public.patient_status,
  category_id uuid,
  category_name_en text,
  category_name_ar text,
  medications_count bigint,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  q text := nullif(trim(coalesce(p_query, '')), '');
  q_phone text := case when q is not null then private.normalize_phone(q) else null end;
begin
  return query
  select
    p.id,
    p.full_name,
    p.primary_phone,
    p.secondary_phone,
    p.email,
    p.status,
    p.category_id,
    c.name_en,
    c.name_ar,
    (select count(*) from public.patient_medications pm where pm.patient_id = p.id and pm.status = 'active') as medications_count,
    p.last_contact_at,
    p.created_at,
    p.updated_at,
    p.archived_at
  from public.patients p
  left join public.categories c on c.id = p.category_id
  where (p_include_archived or p.archived_at is null)
    and (p_status is null or p.status::text = p_status)
    and (
      p_category is null
      or c.slug = p_category
      or c.name_en ilike p_category
      or c.name_ar ilike p_category
      or p.category_id::text = p_category
    )
    and (p_last_contact_from is null or p.last_contact_at >= p_last_contact_from)
    and (p_last_contact_to is null or p.last_contact_at < p_last_contact_to)
    and (p_created_from is null or p.created_at >= p_created_from)
    and (p_created_to is null or p.created_at < p_created_to)
    and (
      p_medication is null
      or exists (
        select 1
        from public.patient_medications pm
        join public.medications m on m.id = pm.medication_id
        where pm.patient_id = p.id
          and (
            m.name ilike '%' || p_medication || '%'
            or coalesce(m.generic_name, '') ilike '%' || p_medication || '%'
          )
      )
    )
    and (
      q is null
      or p.full_name ilike '%' || q || '%'
      or (q_phone <> '' and (
        private.normalize_phone(p.primary_phone) like '%' || q_phone || '%'
        or private.normalize_phone(coalesce(p.secondary_phone, '')) like '%' || q_phone || '%'
      ))
      or exists (
        select 1 from public.categories c2
        where c2.id = p.category_id
          and (c2.name_en ilike '%' || q || '%' or c2.name_ar ilike '%' || q || '%')
      )
      or exists (
        select 1
        from public.patient_medications pm
        join public.medications m on m.id = pm.medication_id
        where pm.patient_id = p.id
          and (m.name ilike '%' || q || '%' or coalesce(m.generic_name,'') ilike '%' || q || '%')
      )
      or exists (
        select 1 from public.notes n
        where n.patient_id = p.id
          and n.deleted_at is null
          and n.body ilike '%' || q || '%'
      )
    )
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

grant execute on function public.search_patients(text, text, text, text, timestamptz, timestamptz, timestamptz, timestamptz, boolean, int, int)
  to authenticated, service_role;

create or replace function public.patient_full_profile(p_patient_id uuid default null, p_phone text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  pid uuid;
  result jsonb;
begin
  if p_patient_id is not null then
    pid := p_patient_id;
  elsif p_phone is not null then
    select id into pid
    from public.patients
    where private.normalize_phone(primary_phone) = private.normalize_phone(p_phone)
       or private.normalize_phone(coalesce(secondary_phone,'')) = private.normalize_phone(p_phone)
    limit 1;
  end if;

  if pid is null then
    return null;
  end if;

  select jsonb_build_object(
    'patient', to_jsonb(p) || jsonb_build_object(
      'category', case when c.id is null then null else jsonb_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar) end
    ),
    'medications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id,
        'dosage', pm.dosage,
        'frequency', pm.frequency,
        'status', pm.status,
        'start_date', pm.start_date,
        'end_date', pm.end_date,
        'notes', pm.notes,
        'medication', jsonb_build_object('id', m.id, 'name', m.name, 'generic_name', m.generic_name)
      ) order by pm.created_at desc)
      from public.patient_medications pm
      join public.medications m on m.id = pm.medication_id
      where pm.patient_id = pid
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'status', pc.status,
        'notes', pc.notes,
        'created_at', pc.created_at,
        'created_by', pc.created_by,
        'condition', jsonb_build_object('id', cond.id, 'name_en', cond.name_en, 'name_ar', cond.name_ar)
      ) order by pc.created_at desc)
      from public.patient_conditions pc
      join public.conditions cond on cond.id = pc.condition_id
      where pc.patient_id = pid
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'body', n.body,
        'created_by', n.created_by,
        'created_at', n.created_at,
        'updated_at', n.updated_at
      ) order by n.created_at desc)
      from public.notes n
      where n.patient_id = pid and n.deleted_at is null
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', msg.id,
        'phone_number', msg.phone_number,
        'direction', msg.direction,
        'message_body', msg.message_body,
        'status', msg.status,
        'received_at', msg.received_at
      ) order by msg.received_at desc)
      from (
        select * from public.messages
        where patient_id = pid
        order by received_at desc
        limit 20
      ) msg
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'entity_type', a.entity_type,
        'created_at', a.created_at,
        'actor_type', a.actor_type
      ) order by a.created_at desc)
      from (
        select * from public.activity_logs
        where entity_id = pid
        order by created_at desc
        limit 20
      ) a
    ), '[]'::jsonb)
  )
  into result
  from public.patients p
  left join public.categories c on c.id = p.category_id
  where p.id = pid;

  return result;
end;
$$;

grant execute on function public.patient_full_profile(uuid, text) to authenticated, service_role;

-- Dashboard stats
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  month_start timestamptz := date_trunc('month', now());
  day_start timestamptz := date_trunc('day', now());
begin
  return jsonb_build_object(
    'total_patients', (select count(*) from public.patients where archived_at is null),
    'new_patients_this_month', (select count(*) from public.patients where archived_at is null and created_at >= month_start),
    'messages_today', (select count(*) from public.messages where received_at >= day_start),
    'active_patients', (select count(*) from public.patients where archived_at is null and status = 'active'),
    'medications', (select count(*) from public.medications where status = 'active'),
    'categories', (select count(*) from public.categories where status = 'active')
  );
end;
$$;

grant execute on function public.dashboard_stats() to authenticated, service_role;

-- Admin user management (security definer, admin-only)
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if private.current_role() is distinct from 'admin' then
    raise exception 'not authorized';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_role::text),
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_id,
    jsonb_build_object('sub', new_id::text, 'email', lower(p_email), 'email_verified', true),
    'email',
    new_id::text,
    now(), now(), now()
  );

  return new_id;
end;
$$;

grant execute on function public.admin_create_user(text, text, text, public.app_role) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role, p_is_active boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.current_role() is distinct from 'admin' then
    raise exception 'not authorized';
  end if;
  update public.profiles
  set role = p_role, is_active = p_is_active
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.app_role, boolean) to authenticated;

-- Hash helper for MCP tokens (UI sends plaintext once; we store sha256)
create or replace function public.hash_mcp_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

grant execute on function public.hash_mcp_token(text) to authenticated, service_role;

---------------------------------------------------------------------
-- RLS
---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.conditions enable row level security;
alter table public.medications enable row level security;
alter table public.patients enable row level security;
alter table public.patient_contacts enable row level security;
alter table public.patient_categories enable row level security;
alter table public.patient_tags enable row level security;
alter table public.patient_medications enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;
alter table public.activity_logs enable row level security;
alter table public.mcp_clients enable row level security;
alter table public.mcp_logs enable row level security;
alter table public.settings enable row level security;

-- Profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.is_active_user());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = private.current_role());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (private.current_role() = 'admin')
  with check (private.current_role() = 'admin');

-- Catalog read for all active users
create policy categories_select on public.categories
  for select to authenticated using (private.is_active_user());
create policy categories_write on public.categories
  for all to authenticated
  using (private.current_role() = 'admin')
  with check (private.current_role() = 'admin');

create policy tags_select on public.tags
  for select to authenticated using (private.is_active_user());
create policy tags_write on public.tags
  for all to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));

create policy conditions_select on public.conditions
  for select to authenticated using (private.is_active_user());
create policy conditions_write on public.conditions
  for all to authenticated
  using (private.has_any_role(array['admin','doctor']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor']::public.app_role[]));

create policy medications_select on public.medications
  for select to authenticated using (private.is_active_user());
create policy medications_write on public.medications
  for all to authenticated
  using (private.has_any_role(array['admin','doctor']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor']::public.app_role[]));

-- Patients: all roles can read; admin/doctor/staff can write
create policy patients_select on public.patients
  for select to authenticated using (private.is_active_user());
create policy patients_insert on public.patients
  for insert to authenticated
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));
create policy patients_update on public.patients
  for update to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));
create policy patients_delete on public.patients
  for delete to authenticated
  using (private.current_role() = 'admin');

-- Contacts / tags / extra categories follow patient write rules
create policy patient_contacts_select on public.patient_contacts
  for select to authenticated using (private.is_active_user());
create policy patient_contacts_write on public.patient_contacts
  for all to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));

create policy patient_categories_select on public.patient_categories
  for select to authenticated using (private.is_active_user());
create policy patient_categories_write on public.patient_categories
  for all to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));

create policy patient_tags_select on public.patient_tags
  for select to authenticated using (private.is_active_user());
create policy patient_tags_write on public.patient_tags
  for all to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));

-- Medications on patients: doctor + admin write; staff/viewer read
create policy patient_medications_select on public.patient_medications
  for select to authenticated using (private.is_active_user());
create policy patient_medications_write on public.patient_medications
  for all to authenticated
  using (private.has_any_role(array['admin','doctor']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor']::public.app_role[]));

create policy patient_conditions_select on public.patient_conditions
  for select to authenticated using (private.is_active_user());
create policy patient_conditions_write on public.patient_conditions
  for all to authenticated
  using (private.has_any_role(array['admin','doctor']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor']::public.app_role[]));

-- Notes: doctor + staff + admin write
create policy notes_select on public.notes
  for select to authenticated using (private.is_active_user() and deleted_at is null);
create policy notes_insert on public.notes
  for insert to authenticated
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));
create policy notes_update on public.notes
  for update to authenticated
  using (private.has_any_role(array['admin','doctor','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','doctor','staff']::public.app_role[]));

-- Messages: staff + admin write; doctor/viewer read
create policy messages_select on public.messages
  for select to authenticated using (private.is_active_user());
create policy messages_write on public.messages
  for all to authenticated
  using (private.has_any_role(array['admin','staff']::public.app_role[]))
  with check (private.has_any_role(array['admin','staff']::public.app_role[]));

-- Activity: read for all; insert via function
create policy activity_select on public.activity_logs
  for select to authenticated using (private.is_active_user());
create policy activity_insert on public.activity_logs
  for insert to authenticated
  with check (private.is_active_user());

-- MCP: admin only
create policy mcp_clients_admin on public.mcp_clients
  for all to authenticated
  using (private.current_role() = 'admin')
  with check (private.current_role() = 'admin');

create policy mcp_logs_admin on public.mcp_logs
  for select to authenticated
  using (private.current_role() = 'admin');

create policy mcp_logs_insert_service on public.mcp_logs
  for insert to authenticated
  with check (private.current_role() = 'admin');

-- Settings
create policy settings_select on public.settings
  for select to authenticated using (private.is_active_user());
create policy settings_write on public.settings
  for all to authenticated
  using (private.current_role() = 'admin')
  with check (private.current_role() = 'admin');

-- Lock down anon
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Hide MCP token hashes from the Data API role via column privilege
revoke select (token_hash) on public.mcp_clients from authenticated;
grant select (
  id, name, status, permissions, token_prefix, last_used_at, last_tool_call,
  created_by, created_at, updated_at
) on public.mcp_clients to authenticated;

grant execute on all functions in schema public to authenticated;

-- Service role keeps full access (bypass RLS + all columns)
grant all on all tables in schema public to service_role;
grant select (token_hash) on public.mcp_clients to service_role;
