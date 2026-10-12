-- E04b2a: owner-only read-only list of pending attendance requests.
-- No identity, email, nickname, private venue, ticket or decision grants.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton
    and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_event_attendance_requests') is null or
    to_regprocedure('public.feture_event_catalog_visible(public.feture_events,text)') is null
 then raise exception 'feture_attendance_and_catalog_required';end if;
end $$;

-- Stable opaque request identifier: the organizer cannot infer account hash
-- from a key. The real account FK stays service-role-only in prior table.
alter table public.feture_event_attendance_requests
 add column request_id uuid not null default gen_random_uuid();
create unique index feture_event_attendance_request_id
 on public.feture_event_attendance_requests(request_id);
create index feture_event_attendance_owner_queue
 on public.feture_event_attendance_requests(event_id,requested_at desc,request_id desc)
 where state='pending';

create function public.feture_event_attendance_owner_queue(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];cursor jsonb;eid uuid;after_at timestamptz;after_id uuid;
 item public.feture_events%rowtype;page jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
  jsonb_typeof(p_command) is distinct from 'object' or
  p_command->>'action' is distinct from 'events.attendanceRequests'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','cursor','id']::text[] or
  jsonb_typeof(p_command->'id') is distinct from 'string' or
  p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;
 cursor:=p_command->'cursor';
 if cursor is distinct from 'null'::jsonb then
  if jsonb_typeof(cursor) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(cursor) k)
     is distinct from array['at','id']::text[] or
    jsonb_typeof(cursor->'at') is distinct from 'string' or
    cursor->>'at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' or
    jsonb_typeof(cursor->'id') is distinct from 'string' or
    cursor->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  begin after_at:=(cursor->>'at')::timestamptz;after_id:=(cursor->>'id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
  if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
 end if;
 select * into item from public.feture_events where id=eid for share;
 if not found or item.owner_hash<>p_actor or item.state<>'published' or
  item.published_at is null or item.draft->>'visibility'<>'public' or
  (item.draft->>'endsAt')::timestamptz<=clock_timestamp() or
  not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'requestId',q.request_id,'requestedAt',q.requested_at,
  'state','pending') order by q.requested_at desc,q.request_id desc),'[]'::jsonb)
 into page from(
  select r.* from public.feture_event_attendance_requests r
  where r.event_id=eid and r.state='pending'
    and public.feture_peer_eligible(r.actor_hash)
    and not public.feture_pair_blocked(r.actor_hash,p_actor)
    and (after_at is null or (r.requested_at,r.request_id)<(after_at,after_id))
  order by r.requested_at desc,r.request_id desc limit 21
 )q;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x order by n)
   from jsonb_array_elements(page) with ordinality j(x,n)
   where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(page)>20 then
   jsonb_build_object('at',page->19->>'requestedAt',
     'id',page->19->>'requestId') else null end);
end $$;
revoke all on function public.feture_event_attendance_owner_queue(text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_event_attendance_owner_queue(text,jsonb)
 to service_role;
notify pgrst,'reload schema';
