-- E01b: owner-only FetUre event drafts. No public publication, ticket sale or participant list.
-- Requires existing FetUre profiles, current adult+documents helper and prelaunch environment.
do $$ begin
 if not exists(select 1 from feture_seed.environment
               where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if;
 if to_regclass('public.feture_events') is not null or to_regclass('public.feture_event_operations') is not null
 then raise exception 'feture_events_schema_already_exists'; end if;
end $$;

create table public.feture_events (
 id uuid primary key,
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 draft jsonb not null check(jsonb_typeof(draft)='object'),
 state text not null default 'draft' check(state in ('draft','pending','published','hidden','cancelled','deleted')),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 check(state<>'published' or published_at is not null)
);
create index feture_events_owner_cursor on public.feture_events(owner_hash,created_at desc,id desc);
alter table public.feture_events enable row level security;
revoke all on public.feture_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_events to service_role;

create table public.feture_event_operations (
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 event_id uuid not null references public.feture_events(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 response jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_hash,operation_id)
);
alter table public.feture_event_operations enable row level security;
revoke all on public.feture_event_operations from public,anon,authenticated,service_role;
grant select,insert on public.feture_event_operations to service_role;

create function public.feture_event_owner_dto(e public.feture_events)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',e.id,'revision',e.revision,'state',e.state,
  'draft',e.draft,'createdAt',e.created_at,'updatedAt',e.updated_at);
$$;

create function public.feture_event_owner_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action'; fields text[]; draft_fields text[];
 event_id uuid;op_id uuid;expected bigint;old public.feture_events%rowtype;
 receipt public.feture_event_operations%rowtype; payload_hash text;
 payload jsonb; start_at timestamptz;end_at timestamptz;cursor jsonb;
 after_at timestamptz;after_id uuid; page jsonb; new_response jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$'
   or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if act='events.mine' then
  if fields is distinct from array['action','cursor']::text[] then
   return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cursor:=p_command->'cursor';
  if cursor is distinct from 'null'::jsonb then
   if jsonb_typeof(cursor) is distinct from 'object' or
     (select array_agg(k order by k) from jsonb_object_keys(cursor) k) is distinct from array['at','id']::text[] or
     jsonb_typeof(cursor->'at') is distinct from 'string' or
     (cursor->>'at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or
     jsonb_typeof(cursor->'id') is distinct from 'string' or
     cursor->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin after_at:=(cursor->>'at')::timestamptz;after_id:=(cursor->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
 elsif act='events.read' then
  if fields is distinct from array['action','id']::text[] then
   return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='events.save' then
  if fields is distinct from array['action','draft','expectedRevision','id','operationId']::text[] then
   return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else
  -- submit, catalog and cancel deliberately unavailable before moderation/audience ACL.
  return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 -- Always recheck live eligibility, including legal-document and age expiry, before ANY reads/replays.
 if not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='events.mine' then
  select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_event_owner_dto(v),
      'at',v.created_at) order by v.created_at desc,v.id desc),'[]'::jsonb) into page
  from (select * from public.feture_events
        where owner_hash=p_actor and state<>'deleted'
        and (after_at is null or (created_at,id)<(after_at,after_id))
        order by created_at desc,id desc limit 21) v;
  return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(x->'entry' order by n)
       from jsonb_array_elements(page) with ordinality j(x,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20
       then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 event_id:=(p_command->>'id')::uuid;
 if act='events.read' then
  select * into old from public.feture_events where id=event_id and owner_hash=p_actor and state<>'deleted';
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_event_owner_dto(old));
 end if;
 if jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    p_command->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,14})$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 op_id:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 payload:=p_command->'draft';
 if jsonb_typeof(payload) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into draft_fields from jsonb_object_keys(payload) k;
 if draft_fields is distinct from array['city','conditions','description','endsAt','format','language',
   'price','privateJoinUrl','privateLocation','publicLocation','startsAt','summary','ticketUrl','timeZone','title','visibility']::text[]
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if exists(select 1 from unnest(array['title','summary','description','conditions','format','visibility',
   'startsAt','endsAt','timeZone','language','city','publicLocation']::text[]) k
   where jsonb_typeof(payload->k) is distinct from 'string')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if char_length(payload->>'title')>120 or char_length(btrim(payload->>'title'))<2 or
    char_length(payload->>'summary')>500 or char_length(payload->>'description')>6000 or
    char_length(payload->>'conditions')>3000 or char_length(payload->>'city')>120 or
    char_length(payload->>'publicLocation')>200 or char_length(payload->>'timeZone')>64 or
    payload->>'title' ~ '[\x00-\x1f\x7f]' or payload->>'description' ~ '[\x00-\x08\x0b-\x1f\x7f]' or
    payload->>'format' not in ('online','offline') or payload->>'visibility' not in ('private','public') or
    payload->>'language' !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$' or
    jsonb_typeof(payload->'privateLocation') not in ('string','null') or
    jsonb_typeof(payload->'privateJoinUrl') not in ('string','null') or
    jsonb_typeof(payload->'ticketUrl') not in ('string','null') or
    (payload->>'privateLocation' is not null and char_length(payload->>'privateLocation')>500)
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=payload->>'timeZone')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if (payload->>'format'='online' and (payload->'privateLocation'<>'null'::jsonb or payload->>'publicLocation'<>'')) or
    (payload->>'format'='offline' and (payload->'privateJoinUrl'<>'null'::jsonb or btrim(payload->>'city')=''))
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if exists(select 1 from (values(payload->>'privateJoinUrl'),(payload->>'ticketUrl')) v(link)
   where link is not null and
   (char_length(link)>1500 or link !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^\s]*)?$'
    or link ~* 'https://[^/]*(@|:([0-9]+))'))
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if payload->'price'<>'null'::jsonb and
    (jsonb_typeof(payload->'price') is distinct from 'object' or
     (select array_agg(k order by k) from jsonb_object_keys(payload->'price') k) is distinct from array['amountMinor','currency']::text[] or
     jsonb_typeof(payload->'price'->'amountMinor') is distinct from 'number' or
     (payload->'price'->>'amountMinor') !~ '^[1-9][0-9]{0,11}$' or
     (payload->'price'->>'amountMinor')::numeric>100000000000 or
     (payload->'price'->>'currency') !~ '^[A-Z]{3}$')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if (payload->>'startsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' or
    (payload->>'endsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 begin start_at:=(payload->>'startsAt')::timestamptz;end_at:=(payload->>'endsAt')::timestamptz;
 exception when others then return jsonb_build_object('ok',false,'error','invalid_request');end;
 if not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- Serialize all changes and receipts per owner, avoiding parallel first-save races.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 payload_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_event_operations
 where owner_hash=p_actor and operation_id=op_id;
 if found then
  if receipt.payload_hash<>payload_hash then
   return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  -- Immutable first result, not a projection of possibly edited current row.
  return receipt.response || jsonb_build_object('replayed',true);
 end if;
 select * into old from public.feture_events where id=event_id for update;
 if found and old.owner_hash<>p_actor then
  return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if old.id is null then
  if expected<>0 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if (select count(*)>=100 from public.feture_events where owner_hash=p_actor and state<>'deleted')
  then return jsonb_build_object('ok',false,'error','rate_limited');end if;
  insert into public.feture_events(id,owner_hash,draft) values(event_id,p_actor,payload)
  returning * into old;
 else
  if old.state<>'draft' then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  if old.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_events set draft=payload,revision=revision+1,updated_at=clock_timestamp()
   where id=event_id and owner_hash=p_actor returning * into old;
 end if;
 new_response:=jsonb_build_object('ok',true,'entry',public.feture_event_owner_dto(old),'replayed',false);
 insert into public.feture_event_operations(owner_hash,operation_id,event_id,payload_hash,response)
 values(p_actor,op_id,event_id,payload_hash,new_response);
 return new_response;
end $$;

revoke all on function public.feture_event_owner_dto(public.feture_events),
 public.feture_event_owner_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_event_owner_dto(public.feture_events),
 public.feture_event_owner_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
