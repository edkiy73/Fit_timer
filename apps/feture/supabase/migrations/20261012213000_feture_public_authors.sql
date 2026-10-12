-- C02.4a independent opt-in public identity; not included in any consumer DTO yet.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_public_authors (
 account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,
 public_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp()
);
create table public.feture_public_author_operations (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 action text not null check(action in ('authors.enable','authors.disable','authors.rotate')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,operation_id)
);
alter table public.feture_public_authors enable row level security;
alter table public.feture_public_author_operations enable row level security;
revoke all on public.feture_public_authors,public.feture_public_author_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_public_authors to service_role;
grant select,insert on public.feture_public_author_operations to service_role;

create function public.feture_public_author_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';keys text[];op uuid;receipt public.feture_public_author_operations%rowtype;
 current_id uuid;hash_payload text;was_replayed boolean:=false;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='authors.status' then
  if keys is distinct from array['action']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act in ('authors.disable','authors.rotate') then
  if keys is distinct from array['action','operationId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='authors.enable' then
  if keys is distinct from array['action','consent','operationId']::text[]
   or p_command->'consent' is distinct from 'true'::jsonb
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act<>'authors.status' and (jsonb_typeof(p_command->'operationId') is distinct from 'string'
  or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- Core authenticates actor; profile lock serializes all author requests and immutable receipts.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act<>'authors.status' then
  op:=(p_command->>'operationId')::uuid;
  hash_payload:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into receipt from public.feture_public_author_operations
    where account_hash=p_actor and operation_id=op;
  if receipt.operation_id is not null then
   if receipt.action<>act or receipt.payload_hash<>hash_payload
   then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
   was_replayed:=true;
  end if;
 end if;
 select public_id into current_id from public.feture_public_authors where account_hash=p_actor;
 if act<>'authors.status' and not was_replayed then
  if act in ('authors.enable','authors.rotate') and not public.feture_peer_eligible(p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if act='authors.enable' and current_id is null then
   insert into public.feture_public_authors(account_hash) values(p_actor)
    returning public_id into current_id;
  elsif act='authors.disable' then
   -- Future follow edges referencing public_id must cascade on DELETE, never survive revoke.
   delete from public.feture_public_authors where account_hash=p_actor;
   current_id:=null;
  elsif act='authors.rotate' then
   if current_id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
   delete from public.feture_public_authors where account_hash=p_actor;
   insert into public.feture_public_authors(account_hash) values(p_actor)
    returning public_id into current_id;
  end if;
  insert into public.feture_public_author_operations(account_hash,operation_id,action,payload_hash)
   values(p_actor,op,act,hash_payload);
 end if;
 return jsonb_build_object('ok',true,'enabled',current_id is not null,
   'publicAuthorId',current_id,'replayed',was_replayed);
end $$;
revoke all on function public.feture_public_author_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_public_author_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
