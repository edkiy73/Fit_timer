-- E04b2b: owner-only moderation of pending attendance requests; no venue or ticket grants.
-- Depends on E04b1 requests, E04b2a opaque request ids, E03a public audience guard.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton
  and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_event_attendance_requests') is null or
    to_regprocedure('public.feture_event_catalog_visible(public.feture_events,text)') is null
 then raise exception 'feture_attendance_acl_required';end if;
 if not exists(select 1 from pg_constraint where
   conrelid='public.feture_event_attendance_requests'::regclass and
   conname='feture_event_attendance_requests_state_check')
 then raise exception 'feture_attendance_state_constraint_required';end if;
end $$;
alter table public.feture_event_attendance_requests
 drop constraint feture_event_attendance_requests_state_check;
alter table public.feture_event_attendance_requests
 add constraint feture_event_attendance_requests_state_check
 check(state in ('pending','approved','declined','withdrawn'));

-- A positive decision can never be converted back to a pending applicant request
-- simply by replaying the old applicant submit method. Withdrawal remains allowed.
create function public.feture_attendance_prevent_reactivation()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.state in ('approved','declined') and new.state='pending'
 then raise exception 'attendance_decision_requires_new_request_cycle';end if;
 return new;
end $$;
create trigger feture_attendance_prevent_reactivation_trigger
 before update on public.feture_event_attendance_requests
 for each row execute function public.feture_attendance_prevent_reactivation();

create table public.feture_event_attendance_decisions(
 owner_hash text not null check(owner_hash ~ '^[a-f0-9]{32}$'),
 account_generation text not null check(account_generation ~ '^[a-f0-9]{64}$'),
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 request_id uuid not null,
 action text not null check(action in ('approve','decline')),
 reason text not null check(reason in ('reviewed','capacity','policy','safety','other')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 applied_revision bigint not null check(applied_revision>=2),
 response jsonb not null check(jsonb_typeof(response)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_hash,account_generation,operation_id),
 check((action='approve' and reason='reviewed') or
       (action='decline' and reason<>'reviewed'))
);
create index feture_attendance_decisions_request on
 public.feture_event_attendance_decisions(event_id,request_id,created_at desc);
alter table public.feture_event_attendance_decisions enable row level security;
revoke all on public.feture_event_attendance_decisions from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_attendance_decisions to service_role;

create function public.feture_event_attendance_owner_decide(
 p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];eid uuid;rid uuid;op uuid;expected bigint;decision text;reason text;
 event_row public.feture_events%rowtype;
 request_row public.feture_event_attendance_requests%rowtype;
 receipt public.feture_event_attendance_decisions%rowtype;
 digest text;result jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or
    jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','decision','expectedRevision','id','operationId','reason','requestId']::text[] or
    p_command->>'action' is distinct from 'events.attendanceDecide' or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    (p_command->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'requestId') is distinct from 'string' or
    (p_command->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    (p_command->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    (p_command->>'expectedRevision') !~ '^[1-9][0-9]{0,14}$' or
    jsonb_typeof(p_command->'decision') is distinct from 'string' or
    p_command->>'decision' not in ('approve','decline') or
    jsonb_typeof(p_command->'reason') is distinct from 'string' or
    p_command->>'reason' not in ('reviewed','capacity','policy','safety','other')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if (p_command->>'decision'='approve' and p_command->>'reason'<>'reviewed') or
    (p_command->>'decision'='decline' and p_command->>'reason'='reviewed')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 eid:=(p_command->>'id')::uuid;
 rid:=(p_command->>'requestId')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 decision:=p_command->>'decision';
 reason:=p_command->>'reason';
 -- Consistent with owner cancellation: owner profile lock -> event lock -> request row.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found or not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into event_row from public.feture_events where id=eid for share;
 if not found or event_row.owner_hash<>p_actor or
    event_row.state<>'published' or event_row.published_at is null or
    event_row.draft->>'visibility'<>'public' or
    (event_row.draft->>'endsAt')::timestamptz<=clock_timestamp()
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into request_row from public.feture_event_attendance_requests
  where event_id=eid and request_id=rid for update;
 if not found or request_row.actor_hash=p_actor or
    not public.feture_peer_eligible(request_row.actor_hash) or
    public.feture_pair_blocked(request_row.actor_hash,p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_attendance_decisions
  where owner_hash=p_actor and account_generation=p_generation and operation_id=op;
 if found then
  if receipt.payload_hash<>digest
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if receipt.event_id=eid and receipt.request_id=rid and
     request_row.revision=receipt.applied_revision and
     ((receipt.action='approve' and request_row.state='approved') or
      (receipt.action='decline' and request_row.state='declined'))
  then return receipt.response||jsonb_build_object('replayed',true);end if;
  return jsonb_build_object('ok',false,'error','revision_conflict');
 end if;
 if request_row.state<>'pending' or request_row.revision<>expected
 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 update public.feture_event_attendance_requests set
  state=case when decision='approve' then 'approved' else 'declined' end,
  revision=revision+1,updated_at=clock_timestamp()
 where event_id=eid and request_id=rid returning * into request_row;
 result:=jsonb_build_object('ok',true,'request',jsonb_build_object(
  'requestId',request_row.request_id,'revision',request_row.revision,
  'state',request_row.state),'replayed',false);
 insert into public.feture_event_attendance_decisions(
  owner_hash,account_generation,operation_id,event_id,request_id,action,
  reason,payload_hash,applied_revision,response)
 values(p_actor,p_generation,op,eid,rid,decision,reason,digest,request_row.revision,result);
 return result;
end $$;
revoke all on function public.feture_attendance_prevent_reactivation(),
 public.feture_event_attendance_owner_decide(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_attendance_prevent_reactivation(),
 public.feture_event_attendance_owner_decide(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
