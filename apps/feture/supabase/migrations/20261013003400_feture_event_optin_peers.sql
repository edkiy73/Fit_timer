-- E04c2: attendee-to-attendee visibility ONLY after current, explicit RSVP opt-in.
-- No private profile, declined, withdrawn, approvals, pending applications or viewer history.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regprocedure('public.feture_event_catalog_visible(public.feture_events,text)') is null or
    to_regclass('public.feture_event_rsvps') is null or
    to_regclass('public.feture_profile_details') is null
 then raise exception 'feture_peer_roster_dependencies_missing';end if;
 if not exists(select 1 from information_schema.columns where
  table_schema='public' and table_name='feture_event_rsvps' and
  column_name='participation_id')
 then raise exception 'feture_peer_roster_participation_id_required';end if;
end $$;

create function public.feture_event_attendee_peers(p_actor text,p_command jsonb)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];eid uuid;cursor jsonb;after_at timestamptz;after_id uuid;
 event_row public.feture_events%rowtype;entries jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    jsonb_typeof(p_command) is distinct from 'object' or
    p_command->>'action' is distinct from 'events.peers'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','cursor','id']::text[] or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;cursor:=p_command->'cursor';
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
 select * into event_row from public.feture_events where id=eid;
 if not found or event_row.owner_hash=p_actor or
    not public.feture_event_catalog_visible(event_row,p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;

 -- Requiring the viewer's own opt-in prevents silent membership enumeration
 -- by other registered users, passive readers or non-opted-in RSVP holders.
 if not exists(select 1 from public.feture_event_rsvps me
   where me.event_id=eid and me.actor_hash=p_actor and
    me.status in ('interested','going') and me.visible_to_attendees)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'participationId',v.participation_id,'status',v.status,
  'displayName',v.nickname,'updatedAt',v.updated_at)
  order by v.updated_at desc,v.participation_id desc),'[]'::jsonb)
 into entries from(
  select r.participation_id,r.status,r.updated_at,
    d.data->>'nickname' as nickname
  from public.feture_event_rsvps r
  join public.feture_profile_details d on d.account_hash=r.actor_hash
  where r.event_id=eid and r.status in ('interested','going') and
    r.visible_to_attendees and 'nickname'=any(d.public_fields) and
    jsonb_typeof(d.data->'nickname')='string' and
    char_length(trim(d.data->>'nickname')) between 1 and 80 and
    public.feture_peer_eligible(r.actor_hash) and
    not public.feture_pair_blocked(r.actor_hash,event_row.owner_hash) and
    not public.feture_pair_blocked(r.actor_hash,p_actor) and
    (after_at is null or (r.updated_at,r.participation_id)<(after_at,after_id))
  order by r.updated_at desc,r.participation_id desc limit 21
 )v;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x order by n)
   from jsonb_array_elements(entries) with ordinality j(x,n) where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(entries)>20 then
   jsonb_build_object('at',entries->19->>'updatedAt',
      'id',entries->19->>'participationId')
   else null end);
end $$;
revoke all on function public.feture_event_attendee_peers(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_attendee_peers(text,jsonb) to service_role;
notify pgrst,'reload schema';
