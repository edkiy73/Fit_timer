-- E03b: manager-only second-stage public publication after immutable moderation approval.
-- Never expose exact venues, join links, ticket URLs or unreviewed media.
do $$ begin
 if not exists(select 1 from feture_seed.environment
  where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regclass('public.feture_event_reviews') is null or
  to_regprocedure('public.feture_event_catalog_visible(public.feture_events,text)') is null
 then raise exception 'feture_event_review_and_catalog_required';end if;
end $$;
create table public.feture_event_publications(
 actor_hash text not null check(actor_hash ~ '^[a-f0-9]{32}$'),
 account_generation text not null check(account_generation ~ '^[a-f0-9]{64}$'),
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 approved_draft_hash text not null check(approved_draft_hash ~ '^[a-f0-9]{64}$'),
 applied_revision bigint not null check(applied_revision>=3),
 response jsonb not null check(jsonb_typeof(response)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,account_generation,operation_id)
);
create index feture_event_publications_event on public.feture_event_publications(event_id,created_at desc);
alter table public.feture_event_publications enable row level security;
revoke all on public.feture_event_publications from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_publications to service_role;

create function public.feture_event_staff_publish(
 p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 fields text[];role_status jsonb;eid uuid;op uuid;expected bigint;
 e public.feture_events%rowtype;receipt public.feture_event_publications%rowtype;
 digest text;draft_digest text;result jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or
    p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or
    jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 -- Synchronized with live operator role changes and revocation.
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 role_status:=public.feture_operator_bound_command(
  p_actor,p_generation,null,false,jsonb_build_object('action','status'));
 if role_status->>'role' is distinct from 'manager' or not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if (select count(*) from jsonb_object_keys(p_command)) <>4 or
    not (p_command ? 'action' and p_command ? 'expectedRevision' and
         p_command ? 'id' and p_command ? 'operationId') or
    p_command->>'action' is distinct from 'publish' or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    (p_command->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    (p_command->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    (p_command->>'expectedRevision') !~ '^[1-9][0-9]{0,14}$'
 then return jsonb_build_object('ok',false,'error','invalid_request','debug',jsonb_build_object(
  'fields',fields,'action',p_command->>'action',
  'idtype',jsonb_typeof(p_command->'id'),'optype',jsonb_typeof(p_command->'operationId'),
  'revtype',jsonb_typeof(p_command->'expectedRevision'),
  'rawId',p_command->>'id','rawOp',p_command->>'operationId',
  'badId',(p_command->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
 eid:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 -- Keep publication/cancellation serialized on event row; retries after a
 -- cancellation do not return stale 'published' success.
 select * into e from public.feture_events where id=eid for update;
 if not found or e.state='deleted' then
  return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if e.owner_hash=p_actor then
  return jsonb_build_object('ok',false,'error','review_required');end if;
 select * into receipt from public.feture_event_publications
  where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 if found then
  if receipt.payload_hash<>digest then
   return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if e.state='published' and e.revision=receipt.applied_revision then
   return receipt.response||jsonb_build_object('replayed',true);end if;
  return jsonb_build_object('ok',false,'error','revision_conflict');
 end if;
 if e.state<>'approved' or e.revision<>expected then
  return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if not public.feture_peer_eligible(e.owner_hash) or
    e.draft->>'visibility'<>'public' or
    e.draft->'privateLocation' is distinct from 'null'::jsonb or
    e.draft->'privateJoinUrl' is distinct from 'null'::jsonb or
    e.draft->'ticketUrl' is distinct from 'null'::jsonb or
    (e.draft->>'startsAt')::timestamptz<=clock_timestamp() or
    (e.draft->>'endsAt')::timestamptz<=clock_timestamp()
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 draft_digest:=encode(sha256(convert_to(e.draft::text,'UTF8')),'hex');
 -- Current exact revision and draft must have passed a distinct prior review.
 if not exists(select 1 from public.feture_event_reviews r
   where r.event_id=eid and r.action='approve'
    and r.applied_revision=e.revision and r.draft_hash=draft_digest)
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 update public.feture_events set state='published',revision=revision+1,
  published_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=eid returning * into e;
 result:=jsonb_build_object('ok',true,
  'event',jsonb_build_object('id',e.id,'state','published','revision',e.revision),
  'replayed',false);
 insert into public.feture_event_publications(actor_hash,account_generation,
  operation_id,event_id,payload_hash,approved_draft_hash,applied_revision,response)
 values(p_actor,p_generation,op,eid,digest,draft_digest,e.revision,result);
 return result;
end $$;
revoke all on function public.feture_event_staff_publish(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_event_staff_publish(text,text,jsonb)
 to service_role;
notify pgrst,'reload schema';
,
  'badOp',(p_command->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
 eid:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 -- Keep publication/cancellation serialized on event row; retries after a
 -- cancellation do not return stale 'published' success.
 select * into e from public.feture_events where id=eid for update;
 if not found or e.state='deleted' then
  return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if e.owner_hash=p_actor then
  return jsonb_build_object('ok',false,'error','review_required');end if;
 select * into receipt from public.feture_event_publications
  where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 if found then
  if receipt.payload_hash<>digest then
   return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if e.state='published' and e.revision=receipt.applied_revision then
   return receipt.response||jsonb_build_object('replayed',true);end if;
  return jsonb_build_object('ok',false,'error','revision_conflict');
 end if;
 if e.state<>'approved' or e.revision<>expected then
  return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if not public.feture_peer_eligible(e.owner_hash) or
    e.draft->>'visibility'<>'public' or
    e.draft->'privateLocation' is distinct from 'null'::jsonb or
    e.draft->'privateJoinUrl' is distinct from 'null'::jsonb or
    e.draft->'ticketUrl' is distinct from 'null'::jsonb or
    (e.draft->>'startsAt')::timestamptz<=clock_timestamp() or
    (e.draft->>'endsAt')::timestamptz<=clock_timestamp()
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 draft_digest:=encode(sha256(convert_to(e.draft::text,'UTF8')),'hex');
 -- Current exact revision and draft must have passed a distinct prior review.
 if not exists(select 1 from public.feture_event_reviews r
   where r.event_id=eid and r.action='approve'
    and r.applied_revision=e.revision and r.draft_hash=draft_digest)
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 update public.feture_events set state='published',revision=revision+1,
  published_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=eid returning * into e;
 result:=jsonb_build_object('ok',true,
  'event',jsonb_build_object('id',e.id,'state','published','revision',e.revision),
  'replayed',false);
 insert into public.feture_event_publications(actor_hash,account_generation,
  operation_id,event_id,payload_hash,approved_draft_hash,applied_revision,response)
 values(p_actor,p_generation,op,eid,digest,draft_digest,e.revision,result);
 return result;
end $$;
revoke all on function public.feture_event_staff_publish(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_event_staff_publish(text,text,jsonb)
 to service_role;
notify pgrst,'reload schema';
));end if;
 eid:=(p_command->>'id')::uuid;
 op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 -- Keep publication/cancellation serialized on event row; retries after a
 -- cancellation do not return stale 'published' success.
 select * into e from public.feture_events where id=eid for update;
 if not found or e.state='deleted' then
  return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if e.owner_hash=p_actor then
  return jsonb_build_object('ok',false,'error','review_required');end if;
 select * into receipt from public.feture_event_publications
  where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 if found then
  if receipt.payload_hash<>digest then
   return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if e.state='published' and e.revision=receipt.applied_revision then
   return receipt.response||jsonb_build_object('replayed',true);end if;
  return jsonb_build_object('ok',false,'error','revision_conflict');
 end if;
 if e.state<>'approved' or e.revision<>expected then
  return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if not public.feture_peer_eligible(e.owner_hash) or
    e.draft->>'visibility'<>'public' or
    e.draft->'privateLocation' is distinct from 'null'::jsonb or
    e.draft->'privateJoinUrl' is distinct from 'null'::jsonb or
    e.draft->'ticketUrl' is distinct from 'null'::jsonb or
    (e.draft->>'startsAt')::timestamptz<=clock_timestamp() or
    (e.draft->>'endsAt')::timestamptz<=clock_timestamp()
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 draft_digest:=encode(sha256(convert_to(e.draft::text,'UTF8')),'hex');
 -- Current exact revision and draft must have passed a distinct prior review.
 if not exists(select 1 from public.feture_event_reviews r
   where r.event_id=eid and r.action='approve'
    and r.applied_revision=e.revision and r.draft_hash=draft_digest)
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 update public.feture_events set state='published',revision=revision+1,
  published_at=clock_timestamp(),updated_at=clock_timestamp()
 where id=eid returning * into e;
 result:=jsonb_build_object('ok',true,
  'event',jsonb_build_object('id',e.id,'state','published','revision',e.revision),
  'replayed',false);
 insert into public.feture_event_publications(actor_hash,account_generation,
  operation_id,event_id,payload_hash,approved_draft_hash,applied_revision,response)
 values(p_actor,p_generation,op,eid,digest,draft_digest,e.revision,result);
 return result;
end $$;
revoke all on function public.feture_event_staff_publish(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_event_staff_publish(text,text,jsonb)
 to service_role;
notify pgrst,'reload schema';
