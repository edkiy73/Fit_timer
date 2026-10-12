-- C02.2 staged reaction backend (no consumer UI, no live SQL application).
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;

create table public.feture_post_reactions (
 post_id uuid not null references public.feture_posts(id) on delete cascade,
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 kind text not null check(kind='like'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(post_id,account_hash,kind)
);
create index feture_post_reactions_account on public.feture_post_reactions(account_hash,post_id);
create table public.feture_post_reaction_operations (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 post_id uuid not null, -- no FK: deleted post cannot erase immutable retry ledger
 kind text not null check(kind='like'),
 active boolean not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,operation_id)
);
alter table public.feture_post_reactions enable row level security;
alter table public.feture_post_reaction_operations enable row level security;
revoke all on public.feture_post_reactions,public.feture_post_reaction_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_post_reactions to service_role;
grant select,insert on public.feture_post_reaction_operations to service_role;

create function public.feture_post_reaction_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action'; keys text[]; pid uuid; op uuid; desired boolean;
 source_post public.feture_posts%rowtype; receipt public.feture_post_reaction_operations%rowtype;
 count_likes bigint; user_liked boolean;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='posts.reactionState' then
  if keys is distinct from array['action','id']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='posts.reactionSet' then
  if keys is distinct from array['action','active','id','kind','operationId']::text[]
     or p_command->>'kind' is distinct from 'like'
     or jsonb_typeof(p_command->'active') is distinct from 'boolean'
     or jsonb_typeof(p_command->'operationId') is distinct from 'string'
     or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string'
    or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;
 if act='posts.reactionSet' then
  op:=(p_command->>'operationId')::uuid; desired:=(p_command->>'active')::boolean;
  -- Account profile lock serializes per-owner receipt replay and concurrent toggle intents.
  perform 1 from public.feture_profiles where account_hash=p_actor for update;
  if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select * into receipt from public.feture_post_reaction_operations
   where account_hash=p_actor and operation_id=op;
  if receipt.operation_id is not null and (receipt.post_id<>pid or receipt.kind<>'like' or receipt.active<>desired)
  then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 end if;
 select * into source_post from public.feture_posts where id=pid;
 if not found or not public.feture_post_visible(source_post,p_actor) then
  return jsonb_build_object('ok',false,'error','resource_not_found');
 end if;
 if act='posts.reactionSet' and receipt.operation_id is null then
  if desired then
   insert into public.feture_post_reactions(post_id,account_hash,kind)
    values(pid,p_actor,'like') on conflict do nothing;
  else
   delete from public.feture_post_reactions
    where post_id=pid and account_hash=p_actor and kind='like';
  end if;
  insert into public.feture_post_reaction_operations(account_hash,operation_id,post_id,kind,active)
   values(p_actor,op,pid,'like',desired);
 end if;
 -- Counts exclude disallowed, blocked or no-longer-eligible reactors.
 select count(*) into count_likes from public.feture_post_reactions r
 where r.post_id=pid and r.kind='like'
   and public.feture_post_visible(source_post,r.account_hash)
   and not public.feture_pair_blocked(p_actor,r.account_hash);
 select exists(select 1 from public.feture_post_reactions r
  where r.post_id=pid and r.account_hash=p_actor and r.kind='like') into user_liked;
 if act='posts.reactionState' then
  return jsonb_build_object('ok',true,'liked',user_liked,'likes',count_likes);
 end if;
 return jsonb_build_object('ok',true,'liked',user_liked,'likes',count_likes,
  'replayed',receipt.operation_id is not null);
end $$;
revoke all on function public.feture_post_reaction_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_reaction_command(text,jsonb) to service_role;
