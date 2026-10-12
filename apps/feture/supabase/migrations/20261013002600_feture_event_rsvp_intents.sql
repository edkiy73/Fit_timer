-- E04a: minimal RSVP intent for already published PUBLIC events only.
-- No public event catalogue, list of attendees, exact venue, ticket purchase or group grants.
-- Depends on E01b events and P01 public.feture_peer_eligible/feture_pair_blocked.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_events') is null or
   to_regprocedure('public.feture_pair_blocked(text,text)') is null
 then raise exception 'feture_events_or_pair_access_required';end if;
end $$;

create table public.feture_event_rsvps(
 event_id uuid not null references public.feture_events(id) on delete cascade,
 actor_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 status text not null check(status in ('interested','going','declined','withdrawn')),
 visible_to_attendees boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(event_id,actor_hash),
 check (status in ('interested','going') or not visible_to_attendees)
);
create index feture_event_rsvps_actor on public.feture_event_rsvps(actor_hash,event_id);
alter table public.feture_event_rsvps enable row level security;
revoke all on public.feture_event_rsvps from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_event_rsvps to service_role;

create table public.feture_event_rsvp_operations(
 actor_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,operation_id)
);
alter table public.feture_event_rsvp_operations enable row level security;
revoke all on public.feture_event_rsvp_operations from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_rsvp_operations to service_role;

create function public.feture_event_rsvp_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 action text:=p_command->>'action'; fields text[]; eid uuid; op uuid;
 event_row public.feture_events%rowtype;current_rsvp public.feture_event_rsvps%rowtype;
 old_op public.feture_event_rsvp_operations%rowtype;
 desired text;is_public boolean;is_withdraw boolean;payload_digest text;
 count_interested bigint;count_going bigint;was_replay boolean:=false; result jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if action='events.rsvpStatus' then
  if fields is distinct from array['action','id']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif action='events.rsvpSet' then
  if fields is distinct from array['action','id','operationId','status','visibleToAttendees']::text[] or
     jsonb_typeof(p_command->'operationId') is distinct from 'string' or
     p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
     jsonb_typeof(p_command->'status') is distinct from 'string' or
     p_command->>'status' not in ('interested','going','declined','withdrawn') or
     jsonb_typeof(p_command->'visibleToAttendees') is distinct from 'boolean' or
     (p_command->>'status' in ('declined','withdrawn') and
       p_command->'visibleToAttendees'='true'::jsonb)
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;
 desired:=p_command->>'status';
 is_withdraw:=action='events.rsvpSet' and desired='withdrawn';
 -- For expiry and block: authenticated owner can still withdraw existing RSVP
 -- without learning event data. A fresh/positive RSVP is always adult+consent gated.
 if action='events.rsvpSet' then
  op:=(p_command->>'operationId')::uuid;
  perform 1 from public.feture_profiles where account_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 end if;
 if is_withdraw then
  select * into current_rsvp from public.feture_event_rsvps
   where event_id=eid and actor_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 else
  select * into event_row from public.feture_events where id=eid for share;
  if not found or event_row.state<>'published' or event_row.published_at is null or
     event_row.draft->>'visibility'<>'public' or
     event_row.owner_hash=p_actor or
     not public.feture_peer_eligible(p_actor) or
     not public.feture_peer_eligible(event_row.owner_hash) or
     public.feture_pair_blocked(p_actor,event_row.owner_hash) or
     (event_row.draft->>'endsAt')::timestamptz<=clock_timestamp()
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 end if;
 if action='events.rsvpSet' then
  payload_digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into old_op from public.feture_event_rsvp_operations
   where actor_hash=p_actor and operation_id=op;
  if found then
   if old_op.payload_hash<>payload_digest
   then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
   was_replay:=true;
  else
   insert into public.feture_event_rsvps(
    event_id,actor_hash,status,visible_to_attendees)
   values(eid,p_actor,desired,coalesce((p_command->>'visibleToAttendees')::boolean,false))
   on conflict(event_id,actor_hash) do update set
    status=excluded.status,
    visible_to_attendees=excluded.visible_to_attendees,
    revision=public.feture_event_rsvps.revision+1,
    updated_at=clock_timestamp();
   insert into public.feture_event_rsvp_operations(
    actor_hash,operation_id,event_id,payload_hash)
   values(p_actor,op,eid,payload_digest);
  end if;
 end if;
 -- Every replay returns CURRENT own status; never an old affirmative RSVP after withdrawal.
 select * into current_rsvp from public.feture_event_rsvps
  where event_id=eid and actor_hash=p_actor;
 if is_withdraw then
  return jsonb_build_object('ok',true,'status','withdrawn',
   'visibleToAttendees',false,'counts',
     jsonb_build_object('interested',null,'going',null),
   'replayed',was_replay);
 end if;
 -- Counts are aggregate only, and no status rows or actor hashes leave this RPC.
 -- A revoked/blockee RSVP cannot inflate counts or be visible to a newly blocked viewer.
 select count(*) filter(where r.status='interested'),
        count(*) filter(where r.status='going')
 into count_interested,count_going
 from public.feture_event_rsvps r
 where r.event_id=eid and
   public.feture_peer_eligible(r.actor_hash) and
   not public.feture_pair_blocked(r.actor_hash,event_row.owner_hash);
 return jsonb_build_object('ok',true,
  'status',coalesce(current_rsvp.status,'none'),
  'visibleToAttendees',coalesce(current_rsvp.visible_to_attendees,false),
  'counts',jsonb_build_object(
    'interested',case when count_interested>=5 then count_interested else null end,
    'going',case when count_going>=5 then count_going else null end),
  'replayed',was_replay);
end $$;
revoke all on function public.feture_event_rsvp_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_rsvp_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
