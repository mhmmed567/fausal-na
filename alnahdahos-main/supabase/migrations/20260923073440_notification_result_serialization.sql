create or replace function public.notification_delivery_result(p_actor uuid,p_delivery uuid,p_status text,p_external_id text default null,p_error text default null) returns jsonb language plpgsql security invoker set search_path=public as $$
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
  select * into c from public.notification_campaigns where id=d.campaign_id for update;
  insert into public.messages(patient_id,phone_number,direction,message_body,status,external_message_id,sent_at,failed_at,delivery_error,metadata)
    values(d.patient_id,d.phone_number,'outgoing',c.message_body,p_status::public.message_status,p_external_id,case when p_status='sent' then now() end,case when p_status='failed' then now() end,p_error,jsonb_build_object('campaign_id',c.id,'delivery_id',d.id)) returning id into mid;
  update public.notification_deliveries set status=p_status,external_message_id=p_external_id,reason=p_error,message_id=mid,sent_at=case when p_status='sent' then now() end,failed_at=case when p_status='failed' then now() end where id=d.id returning * into d;
  if not exists(select 1 from public.notification_deliveries where campaign_id=c.id and status in ('pending','sending')) then update public.notification_campaigns set status='completed' where id=c.id; end if;
  perform public.log_activity('mcp',p_actor,'notification.'||p_status,'notification_delivery',d.id,jsonb_build_object('campaign_id',c.id,'message_id',mid));
  return to_jsonb(d);
end; $$;

