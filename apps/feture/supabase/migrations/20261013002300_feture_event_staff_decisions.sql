-- E01e.1: manager decision is NOT publication. Approved events remain completely private.
-- Depends on E01b owner drafts, E01c pending submit and E01d bound manager roles.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_events') is null or to_regclass('public.feture_event_operations') is null
 then raise exception 'feture_e01b_required';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.feture_events'::regclass
   and conname='feture_events_state_check')
 then raise exception 'feture_event_state_constraint_missing';end if;
end $$;
-- No already-published entries are exposed by this change; no catalog RPC is added.
alter table public.feture_events drop constraint feture_events_state_check;
alter table public.feture_events add constraint feture_events_state_check
 check(state in ('draft','pending','approved','rejected','published','hidden','cancelled','deleted'));

create table public.feture_event_reviews(
 actor_hash text not null check(actor_hash ~ '^[a-f0-9]{32}$'),
 account_generation text not null check(account_generation ~ '^[a-f0-9]{64}$'),
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 action text not null check(action in ('approve','reject')),
 reason text not null check(reason in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 draft_hash text not null check(draft_hash ~ '^[a-f0-9]{64}$'),
 applied_revision bigint not null check(applied_revision>1),
 response jsonb not null check(jsonb_typeof(response)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,account_generation,operation_id)
);
create index feture_event_reviews_event on public.feture_event_reviews(event_id,created_at desc);
alter table public.feture_event_reviews enable row level security;
revoke all on public.feture_event_reviews from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_reviews to service_role;

create function public.feture_event_staff_decide(
 p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];role_status jsonb;event_id uuid;op uuid;expected bigint;
 event_row public.feture_events%rowtype;receipt public.feture_event_reviews%rowtype;
 decision text;reason text;payload_digest text;draft_digest text;result jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or
    jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 -- Same advisory lock as role mutation: revoked or stale generation never decides.
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 role_status:=public.feture_operator_bound_command(
  p_actor,p_generation,null,false,jsonb_build_object('action','status'));
 if role_status->>'role' is distinct from 'manager' or not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if fields is distinct from array['action','decision','expectedRevision','id','operationId','reason']::text[] or
    p_command->>'action' is distinct from 'decide' or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    (p_command->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    (p_command->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    (p_command->>'expectedRevision') !~ '^[1-9][0-9]{0,14}$' or
    jsonb_typeof(p_command->'decision') is distinct from 'string' or
    p_command->>'decision' not in ('approve','reject') or
    jsonb_typeof(p_command->'reason') is distinct from 'string' or
    p_command->>'reason' not in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 decision:=p_command->>'decision';reason:=p_command->>'reason';
 if (decision='approve' and reason<>'reviewed') or
    (decision='reject' and reason='reviewed')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 event_id:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 payload_digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_reviews
  where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 if found then
  if receipt.payload_hash<>payload_digest
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return receipt.response || jsonb_build_object('replayed',true);
 end if;
 -- Never lock a profile after event row: owner writes take profile then event lock.
 select * into event_row from public.feture_events where id=event_id for update;
 if not found or event_row.state='deleted'
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if event_row.owner_hash=p_actor
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 if event_row.state<>'pending' or event_row.revision<>expected
 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if not public.feture_peer_eligible(event_row.owner_hash)
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 if decision='approve' then
  -- Approval does not authorize unexamined private venues, meeting links or ticket links.
  if event_row.draft->'privateLocation' is distinct from 'null'::jsonb or
     event_row.draft->'privateJoinUrl' is distinct from 'null'::jsonb or
     event_row.draft->'ticketUrl' is distinct from 'null'::jsonb or
     (event_row.draft->>'startsAt')::timestamptz<=clock_timestamp()
  then return jsonb_build_object('ok',false,'error','review_required');end if;
 end if;
 draft_digest:=encode(sha256(convert_to(event_row.draft::text,'UTF8')),'hex');
 update public.feture_events
  set state=case when decision='approve' then 'approved' else 'rejected' end,
      revision=revision+1,updated_at=clock_timestamp(),published_at=null
  where id=event_id returning * into event_row;
 result:=jsonb_build_object('ok',true,'event',jsonb_build_object(
  'id',event_row.id,'state',event_row.state,'revision',event_row.revision),
  'replayed',false);
 insert into public.feture_event_reviews(
  actor_hash,account_generation,operation_id,event_id,action,reason,
  payload_hash,draft_hash,applied_revision,response)
 values(p_actor,p_generation,op,event_id,decision,reason,
  payload_digest,draft_digest,event_row.revision,result);
 return result;
end $$;
revoke all on function public.feture_event_staff_decide(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_staff_decide(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
