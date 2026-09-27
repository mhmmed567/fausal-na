-- Allow the MCP process to verify hashed tokens without selecting token_hash.
-- Admin JWT or service_role only. Never returns the hash or the raw token.

create or replace function public.mcp_authenticate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.mcp_clients%rowtype;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and private.current_role() is distinct from 'admin' then
    raise exception 'not authorized';
  end if;

  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select *
    into rec
  from public.mcp_clients
  where token_hash = public.hash_mcp_token(p_token)
    and status = 'active'
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', rec.id,
    'name', rec.name,
    'permissions', to_jsonb(rec.permissions)
  );
end;
$$;

revoke all on function public.mcp_authenticate(text) from public, anon;
grant execute on function public.mcp_authenticate(text) to authenticated, service_role;
