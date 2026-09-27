revoke all on public.mcp_oauth_state, public.notification_campaigns, public.notification_deliveries from anon;
revoke all on function public.search_patients(text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,int,int) from public,anon;
grant execute on function public.search_patients(text,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,boolean,int,int) to authenticated,service_role;
