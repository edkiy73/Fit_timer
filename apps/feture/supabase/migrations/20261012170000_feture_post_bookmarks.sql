-- C02.1: private, revocable saved posts. This migration is staged; production rollout requires approval.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then
  raise exception 'feture_prelaunch_required';
 end if;
end $$;

create table public.feture_post_bookmarks (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 post_id uuid not null references public.feture_posts(id) on delete cascade,
 saved_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,post_id)
);
create index feture_post_bookmarks_page on public.feture_post_bookmarks(account_hash,saved_at desc,post_id desc);
create table public.feture_post_bookmark_operations (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 action text not null check (action in ('posts.bookmarkSave','posts.bookmarkRemove')),
 post_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,operation_id)
);
alter table public.feture_post_bookmarks enable row level security;
alter table public.feture_post_bookmark_operations enable row level security;
revoke all on public.feture_post_bookmarks,public.feture_post_bookmark_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_post_bookmarks to service_role;
grant select,insert on public.feture_post_bookmark_operations to service_role;

create function public.feture_post_bookmark_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action'; keys text[]; pid uuid; op uuid;
 cur jsonb;cursor_at timestamptz;cursor_id uuid; page jsonb; post_record public.feture_posts%rowtype;
 receipt public.feture_post_bookmark_operations%rowtype; saved boolean;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='posts.bookmarks' then
  if keys is distinct from array['action','cursor']::text[] then
   return jsonb_build_object('ok',false,'error','invalid_request');
  end if;
  cur:=p_command->'cursor';
  if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or
      (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
      jsonb_typeof(cur->'at') is distinct from 'string' or
      jsonb_typeof(cur->'id') is distinct from 'string' or
      cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin
    cursor_at:=(cur->>'at')::timestamptz;
    cursor_id:=(cur->>'id')::uuid;
   exception when others then
    return jsonb_build_object('ok',false,'error','invalid_cursor');
   end;
   if not isfinite(cursor_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if not public.feture_peer_eligible(p_actor) then
   return jsonb_build_object('ok',false,'error','resource_not_found');
  end if;
  -- Always recheck the original post's current audience, age, consent, blocks and state.
  select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_post_dto(v.post,v.author_hash=p_actor),'at',v.saved_at)
          order by v.saved_at desc,v.post_id desc),'[]'::jsonb)
   into page from (
    select b.post_id,b.saved_at,p.author_hash,p as post
      from public.feture_post_bookmarks b
      join public.feture_posts p on p.id=b.post_id
     where b.account_hash=p_actor
       and public.feture_post_visible(p,p_actor)
       and (cursor_at is null or (b.saved_at,b.post_id)<(cursor_at,cursor_id))
     order by b.saved_at desc,b.post_id desc limit 21
   ) v;
  return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(e->'entry' order by n)
     from jsonb_array_elements(page) with ordinality x(e,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20
     then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if act not in ('posts.bookmarkSave','posts.bookmarkRemove') or
    keys is distinct from array['action','id','operationId']::text[] or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;op:=(p_command->>'operationId')::uuid;
 -- One owner lock serializes concurrent saves/removals and the operation receipt.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 -- Check immutable owner-owned receipt before a potentially unrelated target's visibility.
 select * into receipt from public.feture_post_bookmark_operations
  where account_hash=p_actor and operation_id=op;
 if found and (receipt.action<>act or receipt.post_id<>pid) then
  return jsonb_build_object('ok',false,'error','operation_conflict');
 end if;
 select * into post_record from public.feture_posts where id=pid;
 if not found or not public.feture_post_visible(post_record,p_actor) then
  return jsonb_build_object('ok',false,'error','resource_not_found');
 end if;
 if receipt.operation_id is not null then
  select exists(select 1 from public.feture_post_bookmarks
   where account_hash=p_actor and post_id=pid) into saved;
  return jsonb_build_object('ok',true,'saved',saved,'replayed',true);
 end if;
 if act='posts.bookmarkSave' then
  insert into public.feture_post_bookmarks(account_hash,post_id)
   values(p_actor,pid) on conflict do nothing;
 else
  delete from public.feture_post_bookmarks where account_hash=p_actor and post_id=pid;
 end if;
 insert into public.feture_post_bookmark_operations(account_hash,operation_id,action,post_id)
  values(p_actor,op,act,pid);
 return jsonb_build_object('ok',true,'saved',act='posts.bookmarkSave','replayed',false);
end $$;
revoke all on function public.feture_post_bookmark_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_bookmark_command(text,jsonb) to service_role;
