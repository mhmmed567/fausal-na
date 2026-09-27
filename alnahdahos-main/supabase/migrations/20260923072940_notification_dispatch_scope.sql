drop function public.notification_claim_due(uuid,int);
create function public.notification_claim_due(p_actor uuid,p_limit int default 20,p_campaign_id uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$
declare d record; claimed jsonb := '[]';
begin
  if not exists(select 1 from public.mcp_clients where id=p_actor and status='active' and 'messages.write'=any(permissions)) then raise exception 'Missing permission: messages.write'; end if;
  for d in select nd.id,nd.campaign_id,p.primary_phone,p.communication_consent,p.phone_status,p.archived_at,p.status as patient_status,nc.message_body
    from public.notification_deliveries nd join public.notification_campaigns nc on nc.id=nd.campaign_id join public.patients p on p.id=nd.patient_id
    where (p_campaign_id is null or nc.id=p_campaign_id) and nd.status='pending' and nc.status='scheduled' and nc.scheduled_at<=now()
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


revoke all on function public.notification_claim_due(uuid,int,uuid) from public,anon;
grant execute on function public.notification_claim_due(uuid,int,uuid) to authenticated,service_role;
