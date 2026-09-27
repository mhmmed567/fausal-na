-- Patient identity and explicit contact consent. Existing patients remain unknown.
alter table public.patients
  add column civil_id text,
  add column file_number text,
  add column communication_consent text not null default 'unknown' check (communication_consent in ('unknown','granted','denied')),
  add column consent_updated_at timestamptz,
  add column phone_status text not null default 'unknown' check (phone_status in ('unknown','valid','invalid','unreachable'));
create unique index patients_civil_id_unique on public.patients(civil_id) where civil_id is not null;
create unique index patients_file_number_unique on public.patients(file_number) where file_number is not null;

create function private.patient_consent_stamp() returns trigger language plpgsql set search_path='' as $$
begin
  new.civil_id := nullif(trim(new.civil_id),'');
  new.file_number := nullif(trim(new.file_number),'');
  if tg_op = 'INSERT' or new.communication_consent is distinct from old.communication_consent then
    new.consent_updated_at := now();
  end if;
  return new;
end; $$;
create trigger patient_consent_stamp before insert or update on public.patients for each row execute function private.patient_consent_stamp();

alter table public.messages
  add column sent_at timestamptz,
  add column failed_at timestamptz,
  add column delivery_error text;

create table public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 128),
  message_body text not null check (length(trim(message_body)) > 0),
  category_id uuid references public.categories(id),
  condition_id uuid references public.conditions(id),
  medication_id uuid references public.medications(id),
  scheduled_at timestamptz not null,
  timezone text not null default 'Asia/Muscat',
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  requested_by text not null,
  created_by_mcp uuid not null references public.mcp_clients(id),
  request_payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id),
  patient_id uuid not null references public.patients(id),
  phone_number text not null,
  consent_snapshot text not null,
  status text not null check (status in ('pending','sending','sent','failed','skipped')),
  reason text,
  claimed_at timestamptz,
  claimed_by uuid references public.mcp_clients(id),
  sent_at timestamptz,
  failed_at timestamptz,
  external_message_id text,
  message_id uuid references public.messages(id),
  created_at timestamptz not null default now(),
  unique(campaign_id,patient_id),
  check (status <> 'sent' or (sent_at is not null and external_message_id is not null))
);
create index notification_campaigns_due on public.notification_campaigns(scheduled_at) where status='scheduled';
create index notification_deliveries_queue on public.notification_deliveries(campaign_id,status);
create index notification_deliveries_patient on public.notification_deliveries(patient_id);
create index notification_deliveries_claimed_by on public.notification_deliveries(claimed_by);
create index notification_deliveries_message on public.notification_deliveries(message_id);
create index notification_campaigns_actor on public.notification_campaigns(created_by_mcp);
create index notification_campaigns_category on public.notification_campaigns(category_id);
create index notification_campaigns_condition on public.notification_campaigns(condition_id);
create index notification_campaigns_medication on public.notification_campaigns(medication_id);
alter table public.notification_campaigns enable row level security;
alter table public.notification_deliveries enable row level security;
create policy campaigns_read on public.notification_campaigns for select to authenticated using (private.is_active_user());
create policy deliveries_read on public.notification_deliveries for select to authenticated using (private.is_active_user());
create policy campaigns_write on public.notification_campaigns for all to authenticated using (private.has_any_role(array['admin','staff']::public.app_role[])) with check (private.has_any_role(array['admin','staff']::public.app_role[]));
create policy deliveries_write on public.notification_deliveries for all to authenticated using (private.has_any_role(array['admin','staff']::public.app_role[])) with check (private.has_any_role(array['admin','staff']::public.app_role[]));
grant select,insert,update on public.notification_campaigns, public.notification_deliveries to authenticated,service_role;

create function public.notification_campaign_create(p_actor uuid, p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.notification_campaigns%rowtype; a public.mcp_clients%rowtype; total int;
begin
  select * into a from public.mcp_clients where id=p_actor and status='active' and 'messages.write'=any(permissions);
  if not found then raise exception 'Missing permission: messages.write'; end if;
  select * into c from public.notification_campaigns where idempotency_key=p_input->>'idempotency_key';
  if found then
    if c.created_by_mcp <> p_actor or c.request_payload <> p_input then raise exception 'idempotency_key conflict'; end if;
    return to_jsonb(c);
  end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(p_input->>'timezone','Asia/Muscat')) then raise exception 'Invalid timezone'; end if;
  if coalesce(p_input->>'scheduled_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'scheduled_at requires explicit timezone offset'; end if;
  if p_input->>'category_id' is null and p_input->>'condition_id' is null and p_input->>'medication_id' is null and jsonb_array_length(coalesce(p_input->'patient_ids','[]'))=0 then raise exception 'Explicit audience required'; end if;
  insert into public.notification_campaigns(idempotency_key,message_body,category_id,condition_id,medication_id,scheduled_at,timezone,requested_by,created_by_mcp,request_payload)
  values(p_input->>'idempotency_key',p_input->>'message_body',(p_input->>'category_id')::uuid,(p_input->>'condition_id')::uuid,(p_input->>'medication_id')::uuid,(p_input->>'scheduled_at')::timestamptz,coalesce(p_input->>'timezone','Asia/Muscat'),a.name,p_actor,p_input) returning * into c;
  insert into public.notification_deliveries(campaign_id,patient_id,phone_number,consent_snapshot,status,reason)
  select c.id,p.id,p.primary_phone,p.communication_consent,
    case when p.communication_consent='granted' and p.phone_status='valid' then 'pending' else 'skipped' end,
    case when p.communication_consent<>'granted' then 'consent_not_granted' when p.phone_status<>'valid' then 'phone_not_valid' else null end
  from public.patients p where p.archived_at is null and p.status='active'
    and (c.category_id is null or p.category_id=c.category_id or exists(select 1 from public.patient_categories pc where pc.patient_id=p.id and pc.category_id=c.category_id))
    and (c.condition_id is null or exists(select 1 from public.patient_conditions pc where pc.patient_id=p.id and pc.condition_id=c.condition_id and pc.status='active'))
    and (not (p_input ? 'patient_ids') or p.id in (select value::uuid from jsonb_array_elements_text(p_input->'patient_ids')))
    and (c.medication_id is null or c.category_id is not null or c.condition_id is not null or p_input ? 'patient_ids' or exists(select 1 from public.patient_medications pm where pm.patient_id=p.id and pm.medication_id=c.medication_id and pm.status='active'));
  get diagnostics total=row_count;
  if total=0 then raise exception 'No matching active patients'; end if;
  if not exists(select 1 from public.notification_deliveries where campaign_id=c.id and status='pending') then
    update public.notification_campaigns set status='completed' where id=c.id returning * into c;
  end if;
  perform public.log_activity('mcp',p_actor,'notification.scheduled','notification_campaign',c.id,jsonb_build_object('recipients',total));
  return to_jsonb(c);
end; $$;

-- Claims are atomic. Recheck consent/phone at dispatch; do not automatically retry uncertain sends.
create function public.notification_claim_due(p_actor uuid,p_limit int default 20) returns jsonb language plpgsql security invoker set search_path=public as $$
declare d record; claimed jsonb := '[]';
begin
  if not exists(select 1 from public.mcp_clients where id=p_actor and status='active' and 'messages.write'=any(permissions)) then raise exception 'Missing permission: messages.write'; end if;
  for d in select nd.id,nd.campaign_id,p.primary_phone,p.communication_consent,p.phone_status,p.archived_at,p.status as patient_status,nc.message_body
    from public.notification_deliveries nd join public.notification_campaigns nc on nc.id=nd.campaign_id join public.patients p on p.id=nd.patient_id
    where nd.status='pending' and nc.status='scheduled' and nc.scheduled_at<=now()
    order by nc.scheduled_at,nd.id limit greatest(1,least(p_limit,100)) for update of nd skip locked
  loop
    if d.communication_consent<>'granted' or d.phone_status<>'valid' or d.archived_at is not null or d.patient_status<>'active' then
      update public.notification_deliveries set status='skipped',reason='consent_or_contact_changed' where id=d.id;
    else
      update public.notification_deliveries set status='sending',claimed_at=now(),claimed_by=p_actor,phone_number=d.primary_phone where id=d.id;
      claimed := claimed || jsonb_build_array(jsonb_build_object('delivery_id',d.id,'campaign_id',d.campaign_id,'phone_number',d.primary_phone,'message_body',d.message_body,'idempotency_key',d.id));
    end if;
    if not exists(select 1 from public.notification_deliveries where campaign_id=d.campaign_id and status in ('pending','sending')) then update public.notification_campaigns set status='completed' where id=d.campaign_id; end if;
  end loop;
  return claimed;
end; $$;

create function public.notification_delivery_result(p_actor uuid,p_delivery uuid,p_status text,p_external_id text default null,p_error text default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare d public.notification_deliveries%rowtype; c public.notification_campaigns%rowtype; mid uuid;
begin
  if not exists(select 1 from public.mcp_clients where id=p_actor and status='active' and 'messages.write'=any(permissions)) then raise exception 'Missing permission: messages.write'; end if;
  select * into d from public.notification_deliveries where id=p_delivery for update;
  if not found then raise exception 'Delivery not found'; end if;
  if d.claimed_by is distinct from p_actor then raise exception 'Delivery belongs to another dispatcher'; end if;
  if d.status in ('sent','failed') then
    if d.status=p_status and d.external_message_id is not distinct from p_external_id then return to_jsonb(d); end if;
    raise exception 'Delivery already finalized';
  end if;
  if d.status<>'sending' or p_status not in ('sent','failed') then raise exception 'Invalid delivery transition'; end if;
  if p_status='sent' and nullif(trim(p_external_id),'') is null then raise exception 'Provider receipt required'; end if;
  if p_status='failed' and nullif(trim(p_error),'') is null then raise exception 'Failure reason required'; end if;
  select * into c from public.notification_campaigns where id=d.campaign_id;
  insert into public.messages(patient_id,phone_number,direction,message_body,status,external_message_id,sent_at,failed_at,delivery_error,metadata)
    values(d.patient_id,d.phone_number,'outgoing',c.message_body,p_status::public.message_status,p_external_id,case when p_status='sent' then now() end,case when p_status='failed' then now() end,p_error,jsonb_build_object('campaign_id',c.id,'delivery_id',d.id)) returning id into mid;
  update public.notification_deliveries set status=p_status,external_message_id=p_external_id,reason=p_error,message_id=mid,sent_at=case when p_status='sent' then now() end,failed_at=case when p_status='failed' then now() end where id=d.id returning * into d;
  if not exists(select 1 from public.notification_deliveries where campaign_id=c.id and status in ('pending','sending')) then update public.notification_campaigns set status='completed' where id=c.id; end if;
  perform public.log_activity('mcp',p_actor,'notification.'||p_status,'notification_delivery',d.id,jsonb_build_object('campaign_id',c.id,'message_id',mid));
  return to_jsonb(d);
end; $$;

-- Persistent OAuth client registration, one-use codes, and revocation across restarts.
create table public.mcp_oauth_state (
  key text primary key,
  value jsonb not null default '{}',
  expires_at timestamptz not null
);
alter table public.mcp_oauth_state enable row level security;
create policy oauth_admin on public.mcp_oauth_state for all to authenticated using(private.current_role()='admin') with check(private.current_role()='admin');
grant select,insert,update,delete on public.mcp_oauth_state to authenticated,service_role;

revoke all on function public.notification_campaign_create(uuid,jsonb), public.notification_claim_due(uuid,int), public.notification_delivery_result(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.notification_campaign_create(uuid,jsonb), public.notification_claim_due(uuid,int), public.notification_delivery_result(uuid,uuid,text,text,text) to authenticated,service_role;

drop function public.search_patients(text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,int,int);
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
  archived_at timestamptz,
  civil_id text,
  file_number text,
  communication_consent text,
  phone_status text
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
    p.archived_at,
    p.civil_id,
    p.file_number,
    p.communication_consent,
    p.phone_status
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
      or p.civil_id ilike '%' || q || '%'
      or p.file_number ilike '%' || q || '%'
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

