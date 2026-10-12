-- E04b.1: request/withdraw attendance; NOT an admission, RSVP, payment or venue grant.
-- Requires E03a published-only catalogue ACL, E01b event store and current peer legal checks.
do $$ begin
 if not exists(select 1 from feture_seed.environment
   where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if;
 if to_regprocedure('public.feture_event_catalog_visible(public.feture_events,text)') is null
 then raise exception 'feture_event_catalog_acl_required';end if;
end $$;

create table public.feture_event_attendance_requests(
 event_id uuid not null references public.feture_events(id) on delete cascade,
 actor_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 state text not null check(state in ('pending','withdrawn')),
 revision bigint not null default 1 check(revision>0),
 requested_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(event_id,actor_hash)
);
create index feture_event_attendance_requests_actor
 on public.feture_event_attendance_requests(actor_hash,event_id);
alter table public.feture_event_attendance_requests enable row level security;
revoke all on public.feture_event_attendance_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_event_attendance_requests to service_role;

create table public.feture_event_attendance_operations(
 actor_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,operation_id)
);
alter table public.feture_event_attendance_operations enable row level security;
revoke all on public.feture_event_attendance_operations from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_attendance_operations to service_role;

create function public.feture_event_attendance_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 action text:=p_command->>'action'; fields text[];
 eid uuid;op uuid; item public.feture_events%rowtype;
 old_row public.feture_event_attendance_requests%rowtype;
 receipt public.feture_event_attendance_operations%rowtype;
 digest text; replay boolean:=false; current_state text;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
   jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if action='events.attendanceStatus' then
  if fields is distinct from array['action','id']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif action in ('events.attendanceRequest','events.attendanceWithdraw') then
  if fields is distinct from array['action','id','operationId']::text[] or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;
 -- Same actor-profile lock order as E04a RSVP and E01b owner writes. Prevents
 -- parallel first requests / stale operation reuse by the same actor.
 if action<>'events.attendanceStatus' then
  op:=(p_command->>'operationId')::uuid;
  perform 1 from public.feture_profiles where account_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 end if;
 if action='events.attendanceWithdraw' then
  -- Withdrawal remains possible after event cancellation, block, or consent expiry,
  -- but only if a request exists; never disclose event or organizer metadata.
  select * into old_row from public.feture_event_attendance_requests
   where event_id=eid and actor_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 else
  select * into item from public.feture_events where id=eid for share;
  if not found or item.owner_hash=p_actor or
    not public.feture_event_catalog_visible(item,p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 end if;
 if action='events.attendanceStatus' then
  select state into current_state from public.feture_event_attendance_requests
   where event_id=eid and actor_hash=p_actor;
  return jsonb_build_object('ok',true,'state',coalesce(current_state,'none'),'replayed',false);
 end if;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_attendance_operations
  where actor_hash=p_actor and operation_id=op;
 if found then
  if receipt.payload_hash<>digest
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  replay:=true;
 else
  if action='events.attendanceRequest' then
   select * into old_row from public.feture_event_attendance_requests
    where event_id=eid and actor_hash=p_actor for update;
   if found and old_row.state='pending'
   then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
   -- Limit number of simultaneous active requests; reserve room for withdrawal.
   if (select count(*)>=100 from public.feture_event_attendance_requests
       where actor_hash=p_actor and state='pending')
   then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   insert into public.feture_event_attendance_requests(event_id,actor_hash,state)
   values(eid,p_actor,'pending')
   on conflict(event_id,actor_hash) do update set
    state='pending',revision=public.feture_event_attendance_requests.revision+1,
    requested_at=clock_timestamp(),updated_at=clock_timestamp();
  else
   -- Only a withdrawal is allowed without current permission; no reactivation.
   update public.feture_event_attendance_requests
    set state='withdrawn',revision=revision+1,updated_at=clock_timestamp()
    where event_id=eid and actor_hash=p_actor and state<>'withdrawn';
  end if;
  insert into public.feture_event_attendance_operations(actor_hash,operation_id,event_id,payload_hash)
   values(p_actor,op,eid,digest);
 end if;
 select state into current_state from public.feture_event_attendance_requests
  where event_id=eid and actor_hash=p_actor;
 if action='events.attendanceWithdraw' then current_state:='withdrawn';end if;
 -- No organizer identity, private address, request list, attendee count,
 -- approval, price, tickets, or secure venue access can leave this command.
 return jsonb_build_object('ok',true,'state',coalesce(current_state,'none'),'replayed',replay);
end $$;
revoke all on function public.feture_event_attendance_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_attendance_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
