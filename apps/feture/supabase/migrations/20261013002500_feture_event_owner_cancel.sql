-- E02b: authenticated owner may cancel their event, even if age/consent expired.
-- Cancellation removes it from every active queue; it is NOT a deletion/refund.
-- Depends on E01b owner tables, E01c pending, E01e event states.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_events') is null or
   to_regclass('public.feture_event_operations') is null
 then raise exception 'feture_event_tables_required';end if;
end $$;
create function public.feture_event_cancel_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];eid uuid;op uuid;expected bigint;
 e public.feture_events%rowtype;receipt public.feture_event_operations%rowtype;
 digest text; result jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    jsonb_typeof(p_command) is distinct from 'object' or
    p_command->>'action' is distinct from 'events.cancel'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','expectedRevision','id','operationId']::text[] or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 -- Owner profile lock matches events.save/submit order and serializes operationId reuse.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_operations
  where owner_hash=p_actor and operation_id=op;
 if found then
  if receipt.payload_hash<>digest
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return receipt.response||jsonb_build_object('replayed',true);
 end if;
 select * into e from public.feture_events where id=eid for update;
 if not found or e.owner_hash<>p_actor or e.state='deleted'
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if e.state='cancelled' or e.revision<>expected
 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if e.state not in ('draft','pending','approved','rejected','published','hidden')
 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 update public.feture_events set state='cancelled',revision=revision+1,
  updated_at=clock_timestamp(),published_at=null
 where id=eid and owner_hash=p_actor returning * into e;
 -- Minimal cancellation projection even when adult consent expired.
 result:=jsonb_build_object('ok',true,'event',
  jsonb_build_object('id',e.id,'state','cancelled','revision',e.revision),
  'replayed',false);
 insert into public.feture_event_operations(owner_hash,operation_id,event_id,payload_hash,response)
 values(p_actor,op,eid,digest,result);
 return result;
end $$;
revoke all on function public.feture_event_cancel_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_cancel_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
