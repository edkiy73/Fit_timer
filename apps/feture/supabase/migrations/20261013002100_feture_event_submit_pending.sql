-- E01c.1: submit owner's event draft to staff moderation. Never publishes to a catalog.
-- Requires E01b migration; no external viewers or staff review privileges added here.
do $$ begin
 if not exists(select 1 from feture_seed.environment
   where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_events') is null or to_regclass('public.feture_event_operations') is null
 then raise exception 'feture_e01b_migration_required';end if;
end $$;
alter table public.feture_events add column submitted_at timestamptz;
create index feture_events_pending_review on public.feture_events(submitted_at desc,id desc)
 where state='pending';

create function public.feture_event_submit_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];eid uuid;op uuid;expected bigint;row public.feture_events%rowtype;
 receipt public.feture_event_operations%rowtype;digest text;response jsonb;event_start timestamptz;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    jsonb_typeof(p_command) is distinct from 'object' or
    p_command->>'action' is distinct from 'events.submit'
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
 if not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 eid:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 -- Same lock as owner save: serializes receipts and current revision in parallel submits.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_operations
 where owner_hash=p_actor and operation_id=op;
 if found then
  if receipt.payload_hash<>digest then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return receipt.response || jsonb_build_object('replayed',true);
 end if;
 select * into row from public.feture_events
 where id=eid and owner_hash=p_actor for update;
 if not found or row.state='deleted'
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if row.state<>'draft' or row.revision<>expected
 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 -- Draft may have optional fields; publication requires actual descriptive content and upcoming date.
 if char_length(btrim(row.draft->>'title'))<2 or
    char_length(btrim(row.draft->>'description'))<10 or
    char_length(btrim(row.draft->>'conditions'))<2 or
    row.draft->>'format' not in ('online','offline')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 begin event_start:=(row.draft->>'startsAt')::timestamptz;
 exception when others then return jsonb_build_object('ok',false,'error','invalid_request');end;
 if not isfinite(event_start) or event_start<clock_timestamp()+interval '5 minutes'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if (select count(*)>=20 from public.feture_event_operations o
   where o.owner_hash=p_actor and o.created_at>clock_timestamp()-interval '1 day'
   and o.response->'entry'->>'state'='pending')
 then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 update public.feture_events
 set state='pending',revision=revision+1,submitted_at=clock_timestamp(),
     updated_at=clock_timestamp(),published_at=null
 where id=eid and owner_hash=p_actor returning * into row;
 response:=jsonb_build_object('ok',true,'entry',public.feture_event_owner_dto(row),'replayed',false);
 insert into public.feture_event_operations(owner_hash,operation_id,event_id,payload_hash,response)
 values(p_actor,op,eid,digest,response);
 return response;
end $$;
revoke all on function public.feture_event_submit_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_submit_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
