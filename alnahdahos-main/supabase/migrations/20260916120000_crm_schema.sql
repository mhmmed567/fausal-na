-- Al Nahdha Hospital / Pharmacy CRM
-- Clean schema for a traditional staff CRM (no AI tables).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$ begin
  create type public.app_role as enum ('admin', 'doctor', 'staff', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.patient_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.catalog_status as enum ('active', 'inactive', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.medication_link_status as enum ('active', 'discontinued');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.condition_link_status as enum ('active', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_direction as enum ('incoming', 'outgoing');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_status as enum ('new', 'read', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.actor_type as enum ('user', 'mcp', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.mcp_client_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email citext unique,
  role public.app_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  color text,
  status public.catalog_status not null default 'active',
  sort_order int not null default 0,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.conditions (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  status public.catalog_status not null default 'active',
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_en)
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  category text,
  status public.catalog_status not null default 'active',
  notes text,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  primary_phone text not null,
  secondary_phone text,
  email citext,
  status public.patient_status not null default 'active',
  category_id uuid references public.categories (id) on delete set null,
  last_contact_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_phone)
);

create table if not exists public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  label text,
  phone text,
  email citext,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_categories (
  patient_id uuid not null references public.patients (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (patient_id, category_id)
);

create table if not exists public.patient_tags (
  patient_id uuid not null references public.patients (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (patient_id, tag_id)
);

create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete restrict,
  dosage text,
  frequency text,
  start_date date,
  end_date date,
  status public.medication_link_status not null default 'active',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  condition_id uuid not null references public.conditions (id) on delete restrict,
  status public.condition_link_status not null default 'active',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  phone_number text not null,
  direction public.message_direction not null,
  message_body text not null default '',
  status public.message_status not null default 'new',
  external_message_id text unique,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type public.actor_type not null default 'user',
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.mcp_client_status not null default 'active',
  permissions text[] not null default '{}',
  token_hash text,
  token_prefix text,
  last_used_at timestamptz,
  last_tool_call text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.mcp_clients (id) on delete set null,
  tool text not null,
  action text,
  entity_type text,
  entity_id uuid,
  success boolean not null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists patients_category_idx on public.patients (category_id);
create index if not exists patients_status_idx on public.patients (status) where archived_at is null;
create index if not exists patients_archived_idx on public.patients (archived_at);
create index if not exists patients_last_contact_idx on public.patients (last_contact_at desc nulls last);
create index if not exists patients_created_idx on public.patients (created_at desc);
create index if not exists patients_name_trgm_idx on public.patients using gin (full_name extensions.gin_trgm_ops);
create index if not exists patients_phone_idx on public.patients (primary_phone);
create index if not exists patient_medications_patient_idx on public.patient_medications (patient_id);
create index if not exists patient_medications_med_idx on public.patient_medications (medication_id);
create index if not exists patient_conditions_patient_idx on public.patient_conditions (patient_id);
create index if not exists notes_patient_idx on public.notes (patient_id) where deleted_at is null;
create index if not exists notes_body_trgm_idx on public.notes using gin (body extensions.gin_trgm_ops);
create index if not exists messages_patient_idx on public.messages (patient_id, received_at desc);
create index if not exists messages_phone_idx on public.messages (phone_number, received_at desc);
create index if not exists messages_received_idx on public.messages (received_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_entity_idx on public.activity_logs (entity_type, entity_id, created_at desc);
create index if not exists mcp_logs_created_idx on public.mcp_logs (created_at desc);
create index if not exists mcp_logs_client_idx on public.mcp_logs (client_id, created_at desc);
create unique index if not exists mcp_clients_token_hash_uidx on public.mcp_clients (token_hash) where token_hash is not null;
create index if not exists medications_name_trgm_idx on public.medications using gin (name extensions.gin_trgm_ops);
create index if not exists medications_generic_trgm_idx on public.medications using gin (generic_name extensions.gin_trgm_ops);
