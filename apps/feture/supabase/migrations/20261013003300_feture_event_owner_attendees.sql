-- E04c1: private organizer-only RSVP + approved applicant roster.
-- No per-user decline lists, contact fields, profile grants or hidden display names.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and
  project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_event_rsvps') is null or
    to_regclass('public.feture_event_attendance_requests') is null or
    to_regclass('public.feture_profile_details') is null
 then raise exception 'feture_owner_roster_dependencies_missing';end if;
end $$;

-- Stable opaque UUID for event RSVP row; never expose the person's account hash.
alter table public.feture_event_rsvps
 add column participation_id uuid not null default gen_random_uuid();
create unique index feture_event_rsvps_participation_id
 on public.feture_event_rsvps(participation_id);
create index feture_event_rsvps_owner_roster on
 public.feture_event_rsvps(event_id,updated_at desc,participation_id desc)
 where status in ('interested','going');

create function public.feture_event_owner_attendees(p_actor text,p_command jsonb)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];eid uuid;cursor jsonb;after_at timestamptz;after_id uuid;
 event_row public.feture_events%rowtype;page jsonb;totals jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    jsonb_typeof(p_command) is distinct from 'object' or
    p_command->>'action' is distinct from 'events.attendees'
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
 select * into event_row from public.feture_events where id=eid;
 if not found or event_row.owner_hash<>p_actor or
    event_row.state<>'published' or event_row.published_at is null or
    event_row.draft->>'visibility'<>'public' or
    (event_row.draft->>'endsAt')::timestamptz<=clock_timestamp() or
    not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;

 -- Aggregates only; declined viewers never appear individually.
 select jsonb_build_object(
  'interested',count(*) filter(where s.kind='rsvp' and s.status='interested'),
  'going',count(*) filter(where s.kind='rsvp' and s.status='going'),
  'rsvpDeclined',count(*) filter(where s.kind='rsvp' and s.status='declined'),
  'requestsPending',count(*) filter(where s.kind='request' and s.status='pending'),
  'requestsApproved',count(*) filter(where s.kind='request' and s.status='approved'),
  'requestsDeclined',count(*) filter(where s.kind='request' and s.status='declined')
 ) into totals from (
  select 'rsvp'::text kind,r.status,r.actor_hash from public.feture_event_rsvps r where r.event_id=eid
  union all
  select 'request',q.state,q.actor_hash from public.feture_event_attendance_requests q where q.event_id=eid
 )s
 where public.feture_peer_eligible(s.actor_hash) and
   not public.feture_pair_blocked(s.actor_hash,p_actor);

 -- Profile nickname must be explicitly public at *read time*. NULL otherwise.
 -- Never infer personal identity from non-public account/display fields.
 select coalesce(jsonb_agg(jsonb_build_object(
  'participationId',v.participation_id,'kind',v.kind,'status',v.status,
  'updatedAt',v.updated_at,'displayName',v.nickname)
  order by v.updated_at desc,v.participation_id desc),'[]'::jsonb)
 into page from (
  select source.*,
   case when 'nickname'=any(d.public_fields) and
        jsonb_typeof(d.data->'nickname')='string' and
        char_length(trim(d.data->>'nickname')) between 1 and 80
    then d.data->>'nickname' else null end as nickname
  from(
   select r.participation_id,r.actor_hash,'rsvp'::text as kind,
      r.status,r.updated_at
    from public.feture_event_rsvps r
    where r.event_id=eid and r.status in ('interested','going')
   union all
   select q.request_id,q.actor_hash,'request',q.state,q.updated_at
    from public.feture_event_attendance_requests q
    where q.event_id=eid and q.state='approved'
  )source
  left join public.feture_profile_details d on d.account_hash=source.actor_hash
  where public.feture_peer_eligible(source.actor_hash)
   and not public.feture_pair_blocked(source.actor_hash,p_actor)
   and (after_at is null or (source.updated_at,source.participation_id)<(after_at,after_id))
  order by source.updated_at desc,source.participation_id desc limit 21
 )v;
 return jsonb_build_object('ok',true,'items',
   coalesce((select jsonb_agg(x order by n)
     from jsonb_array_elements(page) with ordinality j(x,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20 then
     jsonb_build_object('at',page->19->>'updatedAt','id',page->19->>'participationId')
     else null end,
   'counts',totals);
end $$;
revoke all on function public.feture_event_owner_attendees(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_owner_attendees(text,jsonb) to service_role;
notify pgrst,'reload schema';
