-- C03.2a: owner-managed private group drafts and moderation submission only.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
alter table public.feture_groups add column revision bigint not null default 1 check(revision>0);
create table public.feture_group_operations (
 actor_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 group_id uuid not null, -- No FK: group deletion must not erase immutable receipts.
 action text not null check(action in ('groups.save','groups.submit','groups.delete')),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,operation_id)
);
create index feture_group_operations_owner_date on public.feture_group_operations(actor_hash,created_at desc);
alter table public.feture_group_operations enable row level security;
revoke all on public.feture_group_operations from public,anon,authenticated,service_role;
grant select,insert on public.feture_group_operations to service_role;
create index feture_groups_mine on public.feture_groups(owner_hash,created_at desc,id desc);

create function public.feture_group_owner_dto(g public.feture_groups)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',g.id,'slug',g.slug,'title',g.title,'summary',g.summary,
   'rules',g.rules,'visibility',g.visibility,'state',g.state,'revision',g.revision,
   'createdAt',g.created_at,'updatedAt',g.updated_at,'publishedAt',g.published_at);
$$;
create function public.feture_group_owner_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';fields text[];cur jsonb;after_at timestamptz;after_id uuid;page jsonb;
 gid uuid;op uuid;expected bigint;digest text;receipt public.feture_group_operations%rowtype;
 record_group public.feture_groups%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if act='groups.mine' then
  if fields is distinct from array['action','cursor']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';
  if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
    jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' or
    cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin after_at:=(cur->>'at')::timestamptz;after_id:=(cur->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if not exists(select 1 from public.feture_profiles where account_hash=p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_group_owner_dto(g),
    'at',g.created_at) order by g.created_at desc,g.id desc),'[]'::jsonb) into page
  from (select x.* from public.feture_groups x where x.owner_hash=p_actor and x.state<>'deleted'
    and (after_at is null or (x.created_at,x.id)<(after_at,after_id))
    order by x.created_at desc,x.id desc limit 21) g;
  return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(x->'entry' order by n) from jsonb_array_elements(page)
     with ordinality t(x,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20
     then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if act='groups.save' then
  if fields is distinct from array['action','expectedRevision','id','operationId','rules','summary','title','visibility']::text[] or
    jsonb_typeof(p_command->'title') is distinct from 'string' or
    length(btrim(p_command->>'title')) not between 2 and 100 or
    (p_command->>'title') ~ '[[:cntrl:]]' or
    jsonb_typeof(p_command->'summary') is distinct from 'string' or
    length(p_command->>'summary')>500 or
    translate(p_command->>'summary',chr(9)||chr(10),'') ~ '[[:cntrl:]]' or
    jsonb_typeof(p_command->'rules') is distinct from 'string' or
    length(p_command->>'rules')>2000 or
    translate(p_command->>'rules',chr(9)||chr(10),'') ~ '[[:cntrl:]]' or
    p_command->>'visibility' not in ('public','closed')
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act in ('groups.submit','groups.delete') then
  if fields is distinct from array['action','expectedRevision','id','operationId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
    jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
    p_command->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,14})$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 gid:=(p_command->>'id')::uuid;op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_group_operations
   where actor_hash=p_actor and operation_id=op;
 if receipt.operation_id is not null and
   (receipt.group_id<>gid or receipt.action<>act or receipt.payload_hash<>digest)
 then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 select * into record_group from public.feture_groups where id=gid for update;
 if record_group.id is not null and record_group.owner_hash<>p_actor
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if act='groups.delete' then return jsonb_build_object('ok',true,'deleted',true,'replayed',true);end if;
  if record_group.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_group_owner_dto(record_group),'replayed',true);
 end if;
 if act<>'groups.delete' and not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if record_group.id is null then
  if act<>'groups.save' or expected<>0 or
    exists(select 1 from public.feture_group_operations where group_id=gid)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if (select count(*)>=15 from public.feture_groups where owner_hash=p_actor)
  then return jsonb_build_object('ok',false,'error','rate_limited');end if;
  insert into public.feture_groups(id,owner_hash,slug,title,summary,rules,visibility,state)
   values(gid,p_actor,'group-'||replace(gid::text,'-',''),p_command->>'title',p_command->>'summary',
    p_command->>'rules',p_command->>'visibility','draft') returning * into record_group;
 else
  if record_group.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  if act='groups.save' then
   update public.feture_groups set title=p_command->>'title',summary=p_command->>'summary',
    rules=p_command->>'rules',visibility=p_command->>'visibility',state='draft',
    published_at=null,updated_at=clock_timestamp(),revision=revision+1
    where id=gid returning * into record_group;
  elsif act='groups.submit' then
   if record_group.state<>'draft' or length(btrim(record_group.rules))<10
   then return jsonb_build_object('ok',false,'error','invalid_request');end if;
   if (select count(*)>=10 from public.feture_group_operations
      where actor_hash=p_actor and action='groups.submit' and created_at>clock_timestamp()-interval '1 day')
   then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   update public.feture_groups set state='pending',published_at=null,
     updated_at=clock_timestamp(),revision=revision+1
     where id=gid returning * into record_group;
  else
   delete from public.feture_groups where id=gid;
  end if;
 end if;
 insert into public.feture_group_operations(actor_hash,operation_id,group_id,action,payload_hash)
   values(p_actor,op,gid,act,digest);
 if act='groups.delete' then return jsonb_build_object('ok',true,'deleted',true,'replayed',false);end if;
 return jsonb_build_object('ok',true,'entry',public.feture_group_owner_dto(record_group),'replayed',false);
end $$;
revoke all on function public.feture_group_owner_dto(public.feture_groups),
  public.feture_group_owner_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_group_owner_dto(public.feture_groups),
  public.feture_group_owner_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
