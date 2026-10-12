-- E01d.1: Manager-only read-only pending event queue. No decision/publication ability.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if;
 if to_regclass('public.feture_events') is null then raise exception 'feture_events_required'; end if;
end $$;
create function public.feture_event_staff_queue(p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];cur jsonb;after_at timestamptz;after_id uuid;
 permission jsonb;page jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or
    jsonb_typeof(p_command) is distinct from 'object' or
    p_command->>'action' is distinct from 'queue'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 -- Synchronize role read with role revocation/update.
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 permission:=public.feture_operator_bound_command(
   p_actor,p_generation,null,false,jsonb_build_object('action','status'));
 if permission->>'role' is distinct from 'manager' or not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','cursor']::text[]
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 cur:=p_command->'cursor';
 if cur is distinct from 'null'::jsonb then
  if jsonb_typeof(cur) is distinct from 'object' or
   (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
   jsonb_typeof(cur->'at') is distinct from 'string' or
   jsonb_typeof(cur->'id') is distinct from 'string' or
   cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  begin after_at:=(cur->>'at')::timestamptz;after_id:=(cur->>'id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
  if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
 end if;
 -- Strict whitelist: no owner hash, exact address, private join URL, external ticket URL or participant details.
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',v.id,'revision',v.revision,'state','pending','submittedAt',v.submitted_at,
  'title',v.draft->>'title','summary',v.draft->>'summary',
  'description',v.draft->>'description','conditions',v.draft->>'conditions',
  'format',v.draft->>'format','visibility',v.draft->>'visibility',
  'startsAt',v.draft->>'startsAt','endsAt',v.draft->>'endsAt',
  'timeZone',v.draft->>'timeZone') order by v.submitted_at desc,v.id desc),'[]'::jsonb)
 into page from (
  select * from public.feture_events
  where state='pending' and submitted_at is not null
    and (after_at is null or (submitted_at,id)<(after_at,after_id))
  order by submitted_at desc,id desc limit 21
 ) v;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x order by n)
    from jsonb_array_elements(page) with ordinality p(x,n) where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(page)>20 then
    jsonb_build_object('at',page->19->>'submittedAt','id',page->19->>'id')
   else null end);
end $$;
revoke all on function public.feture_event_staff_queue(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_staff_queue(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
