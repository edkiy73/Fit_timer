-- E03a: safe, read-only published PUBLIC event catalogue. No venue/ticket/attendee payloads.
-- Requires E01b events, current legal/age eligibility, pair-block protection.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton
   and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_events') is null or
    to_regprocedure('public.feture_pair_blocked(text,text)') is null
 then raise exception 'feture_event_catalog_dependencies_missing';end if;
end $$;

-- No new public rows can be created with this migration. Only staff-vetted future
-- publication RPC can make state='published'; that workflow is separately gated.
create function public.feture_event_catalog_visible(e public.feture_events,p_actor text)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select e.state='published' and e.published_at is not null
  and e.draft->>'visibility'='public'
  and public.feture_peer_eligible(p_actor)
  and public.feture_peer_eligible(e.owner_hash)
  and not public.feture_pair_blocked(p_actor,e.owner_hash)
  and (e.draft->>'endsAt')::timestamptz>clock_timestamp();
$$;
create function public.feture_event_public_card(e public.feture_events)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'id',e.id,'revision',e.revision,
  'title',e.draft->>'title','summary',e.draft->>'summary',
  'description',e.draft->>'description','conditions',e.draft->>'conditions',
  'format',e.draft->>'format','startsAt',e.draft->>'startsAt',
  'endsAt',e.draft->>'endsAt','timeZone',e.draft->>'timeZone',
  'language',e.draft->>'language','city',e.draft->>'city',
  'publicLocation',e.draft->>'publicLocation','price',e.draft->'price',
  'hasExternalTickets',e.draft->'ticketUrl'<>'null'::jsonb);
$$;
create function public.feture_event_catalog_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';fields text[];cursor jsonb;
 after_at timestamptz;after_id uuid;target_id uuid;
 item public.feture_events%rowtype;entries jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
   jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if act='events.catalog' then
  if fields is distinct from array['action','cursor']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cursor:=p_command->'cursor';
  if cursor is distinct from 'null'::jsonb then
   if jsonb_typeof(cursor) is distinct from 'object' or
      (select array_agg(k order by k) from jsonb_object_keys(cursor) k)
        is distinct from array['at','id']::text[] or
      jsonb_typeof(cursor->'at') is distinct from 'string' or
      (cursor->>'at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or
      jsonb_typeof(cursor->'id') is distinct from 'string' or
      cursor->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin after_at:=(cursor->>'at')::timestamptz; after_id:=(cursor->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
 elsif act='events.preview' then
  if fields is distinct from array['action','id']::text[] or
     jsonb_typeof(p_command->'id') is distinct from 'string' or
     p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  target_id:=(p_command->>'id')::uuid;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='events.preview' then
  select * into item from public.feture_events where id=target_id;
  if not found or not public.feture_event_catalog_visible(item,p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_event_public_card(item));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'entry',public.feture_event_public_card(v),'at',v.draft->>'startsAt')
   order by (v.draft->>'startsAt')::timestamptz,v.id),'[]'::jsonb)
 into entries from (
  select e.* from public.feture_events e
  where public.feture_event_catalog_visible(e,p_actor)
   and (after_at is null or ((e.draft->>'startsAt')::timestamptz,e.id)>(after_at,after_id))
  order by (e.draft->>'startsAt')::timestamptz,e.id
  limit 21
 ) v;
 return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(x->'entry' order by n)
     from jsonb_array_elements(entries) with ordinality j(x,n)
     where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(entries)>20 then
     jsonb_build_object('at',entries->19->>'at','id',entries->19->'entry'->>'id')
     else null end);
end $$;
revoke all on function public.feture_event_catalog_visible(public.feture_events,text),
 public.feture_event_public_card(public.feture_events),
 public.feture_event_catalog_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_catalog_visible(public.feture_events,text),
 public.feture_event_public_card(public.feture_events),
 public.feture_event_catalog_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
