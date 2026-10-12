-- C02.4d1: private viewer-owned follow/mute (no feed/UI changes in this slice).
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_author_relationships (
 viewer_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 target_id uuid not null references public.feture_public_authors(public_id) on delete cascade,
 kind text not null check(kind in ('follow','mute')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(viewer_hash,target_id,kind)
);
create index feture_author_relationships_page on public.feture_author_relationships
 (viewer_hash,kind,created_at desc,target_id desc);
create table public.feture_author_relationship_operations (
 viewer_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 target_id uuid not null, -- No FK: revoked/rotated target must not erase immutable retry receipt.
 kind text not null check(kind in ('follow','mute')),
 active boolean not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(viewer_hash,operation_id)
);
create index feture_author_relationship_operations_rate on public.feture_author_relationship_operations(viewer_hash,created_at desc);
alter table public.feture_author_relationships enable row level security;
alter table public.feture_author_relationship_operations enable row level security;
revoke all on public.feture_author_relationships,public.feture_author_relationship_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_author_relationships to service_role;
grant select,insert on public.feture_author_relationship_operations to service_role;

create function public.feture_author_relationship_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action'; keys text[];requested_kind text; public_id uuid;post_id uuid; op_id uuid;
 desired boolean;payload_hash text;receipt public.feture_author_relationship_operations%rowtype;
 target_owner text;source_post public.feture_posts%rowtype;active_now boolean;
 cursor_value jsonb;cursor_at timestamptz;cursor_id uuid;page jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='relationships.mine' then
  if keys is distinct from array['action','cursor','kind']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='relationships.state' then
  if keys is distinct from array['action','postId','publicAuthorId','kind']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='relationships.set' then
  if keys is distinct from array['action','active','kind','operationId','postId','publicAuthorId']::text[] or
   jsonb_typeof(p_command->'operationId') is distinct from 'string' or
   p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   jsonb_typeof(p_command->'active') is distinct from 'boolean'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 requested_kind:=p_command->>'kind';
 if jsonb_typeof(p_command->'kind') is distinct from 'string' or requested_kind not in ('follow','mute')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act='relationships.mine' then
  cursor_value:=p_command->'cursor';
  if cursor_value is distinct from 'null'::jsonb then
   if jsonb_typeof(cursor_value) is distinct from 'object' or
      (select array_agg(k order by k) from jsonb_object_keys(cursor_value) k) is distinct from array['at','id']::text[] or
      jsonb_typeof(cursor_value->'at') is distinct from 'string' or jsonb_typeof(cursor_value->'id') is distinct from 'string' or
      cursor_value->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin cursor_at:=(cursor_value->>'at')::timestamptz;cursor_id:=(cursor_value->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(cursor_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if not public.feture_peer_eligible(p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',v.target_id,'at',v.created_at)
        order by v.created_at desc,v.target_id desc),'[]'::jsonb) into page
  from (
    select r.target_id,r.created_at from public.feture_author_relationships r
    join public.feture_public_authors a on a.public_id=r.target_id
    where r.viewer_hash=p_actor and r.kind=requested_kind
      and a.account_hash<>p_actor
      and public.feture_peer_eligible(a.account_hash)
      and not public.feture_pair_blocked(p_actor,a.account_hash)
      and exists(select 1 from public.feture_posts p
        where p.author_hash=a.account_hash and p.state='published' and p.audience='public'
         and public.feture_post_visible(p,p_actor))
      and (cursor_at is null or (r.created_at,r.target_id)<(cursor_at,cursor_id))
    order by r.created_at desc,r.target_id desc limit 21
  ) v;
  return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(x order by n) from jsonb_array_elements(page)
     with ordinality t(x,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20
     then jsonb_build_object('at',page->19->>'at','id',page->19->>'id') else null end);
 end if;
 if jsonb_typeof(p_command->'publicAuthorId') is distinct from 'string' or
    p_command->>'publicAuthorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 public_id:=(p_command->>'publicAuthorId')::uuid;
 if act='relationships.set' then
  desired:=(p_command->>'active')::boolean;
  if (desired and jsonb_typeof(p_command->'postId') is distinct from 'string') or
      (not desired and p_command->'postId' is distinct from 'null'::jsonb)
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else
  if jsonb_typeof(p_command->'postId') is distinct from 'string'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 end if;
 if act='relationships.state' or desired then
  if p_command->>'postId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  post_id:=(p_command->>'postId')::uuid;
 end if;
 if act='relationships.set' then
  op_id:=(p_command->>'operationId')::uuid;
  -- Serializes all actions by a viewer, including immutable receipt checks.
  perform 1 from public.feture_profiles where account_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  payload_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select * into receipt from public.feture_author_relationship_operations
   where viewer_hash=p_actor and operation_id=op_id;
  if receipt.operation_id is not null and
    (receipt.payload_hash<>payload_hash or receipt.target_id<>public_id or receipt.kind<>requested_kind or receipt.active<>desired)
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 end if;
 if act='relationships.state' or desired then
  -- Public post is a capability *only while* it and both accounts remain eligible.
  select * into source_post from public.feture_posts where id=post_id;
  if not found or source_post.state<>'published' or source_post.audience<>'public' or
    not public.feture_peer_eligible(p_actor) or not public.feture_peer_eligible(source_post.author_hash) or
    source_post.author_hash=p_actor or public.feture_pair_blocked(p_actor,source_post.author_hash) or
    not public.feture_post_visible(source_post,p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select a.account_hash into target_owner from public.feture_public_authors a
   where a.public_id=public_id for key share;
  if not found or target_owner<>source_post.author_hash
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 end if;
 if act='relationships.set' and receipt.operation_id is null then
  if desired then
   if not exists(select 1 from public.feture_author_relationships
     where viewer_hash=p_actor and target_id=public_id and kind=requested_kind) then
    if (select count(*)>=200 from public.feture_author_relationships
      where viewer_hash=p_actor and kind=requested_kind)
    then return jsonb_build_object('ok',false,'error','rate_limited');end if;
    if (select count(*)>=30 from public.feture_author_relationship_operations
      where viewer_hash=p_actor and created_at>clock_timestamp()-interval '1 hour' and active)
    then return jsonb_build_object('ok',false,'error','rate_limited');end if;
    insert into public.feture_author_relationships(viewer_hash,target_id,kind)
      values(p_actor,public_id,requested_kind) on conflict do nothing;
   end if;
  else
   -- Owner-controlled cleanup requires neither author visibility nor current 18+ proof.
   delete from public.feture_author_relationships
    where viewer_hash=p_actor and target_id=public_id and kind=requested_kind;
  end if;
  insert into public.feture_author_relationship_operations(viewer_hash,operation_id,payload_hash,target_id,kind,active)
   values(p_actor,op_id,payload_hash,public_id,requested_kind,desired);
 end if;
 select exists(select 1 from public.feture_author_relationships
   where viewer_hash=p_actor and target_id=public_id and kind=requested_kind) into active_now;
 return case when act='relationships.state'
  then jsonb_build_object('ok',true,'active',active_now)
  else jsonb_build_object('ok',true,'active',active_now,'replayed',receipt.operation_id is not null) end;
end $$;
revoke all on function public.feture_author_relationship_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_author_relationship_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
