-- C02.3a: pending-first community comments. Publication by staff is a separate reviewed slice.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_post_comments (
 id uuid primary key,
 post_id uuid not null references public.feture_posts(id) on delete cascade,
 parent_id uuid references public.feture_post_comments(id) on delete cascade,
 author_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 body text not null check(char_length(body)<=1200),
 state text not null default 'pending' check(state in ('pending','published','hidden','deleted')),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check(parent_id is null or parent_id<>id),
 check(state<>'deleted' or body='')
);
create index feture_post_comments_page on public.feture_post_comments(post_id,created_at desc,id desc);
create index feture_post_comments_owner on public.feture_post_comments(author_hash,created_at desc);
create table public.feture_post_comment_operations (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 comment_id uuid not null, -- not an FK: parent cascade must not erase immutable receipts
 payload_hash text not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,operation_id)
);
alter table public.feture_post_comments enable row level security;
alter table public.feture_post_comment_operations enable row level security;
revoke all on public.feture_post_comments,public.feture_post_comment_operations from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_post_comments to service_role;
grant select,insert on public.feture_post_comment_operations to service_role;

create function public.feture_post_comment_dto(p public.feture_post_comments,p_mine boolean)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'postId',p.post_id,'parentId',p.parent_id,
  'text',p.body,'state',p.state,'revision',p.revision,'mine',p_mine,
  'createdAt',p.created_at,'updatedAt',p.updated_at);
$$;
create function public.feture_post_comment_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';keys text[];cid uuid;pid uuid;parent_uuid uuid;
 op uuid;expected bigint;h text;receipt public.feture_post_comment_operations%rowtype;
 comment_row public.feture_post_comments%rowtype; parent_row public.feture_post_comments%rowtype;
 post_row public.feture_posts%rowtype;cur jsonb;after_at timestamptz;after_id uuid;page jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='comments.page' then
  if keys is distinct from array['action','cursor','postId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if jsonb_typeof(p_command->'postId') is distinct from 'string' or
    p_command->>'postId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  pid:=(p_command->>'postId')::uuid;
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
  select * into post_row from public.feture_posts where id=pid;
  if not found or not public.feture_post_visible(post_row,p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_post_comment_dto(v,v.author_hash=p_actor),'at',v.created_at)
         order by v.created_at desc,v.id desc),'[]'::jsonb) into page
   from (select c.* from public.feture_post_comments c
     where c.post_id=pid and c.state='published'
     and (c.parent_id is null or exists(select 1 from public.feture_post_comments p
       where p.id=c.parent_id and p.post_id=pid and p.parent_id is null and p.state='published'))
     and (after_at is null or (c.created_at,c.id)<(after_at,after_id))
     order by c.created_at desc,c.id desc limit 21) v;
  return jsonb_build_object('ok',true,
    'items',coalesce((select jsonb_agg(x->'entry' order by n)
      from jsonb_array_elements(page) with ordinality j(x,n) where n<=20),'[]'::jsonb),
    'nextCursor',case when jsonb_array_length(page)>20
      then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if act='comments.read' then
  if keys is distinct from array['action','id']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='comments.create' then
  if keys is distinct from array['action','id','operationId','parentId','postId','text']::text[]
     or jsonb_typeof(p_command->'postId') is distinct from 'string'
     or p_command->>'postId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or (p_command->'parentId'<>'null'::jsonb and (jsonb_typeof(p_command->'parentId') is distinct from 'string'
     or p_command->>'parentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='comments.edit' then
  if keys is distinct from array['action','expectedRevision','id','operationId','text']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='comments.delete' then
  if keys is distinct from array['action','expectedRevision','id','operationId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or
   p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 cid:=(p_command->>'id')::uuid;
 if act='comments.read' then
  select * into comment_row from public.feture_post_comments where id=cid;
  if not found or comment_row.state='deleted' then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select * into post_row from public.feture_posts where id=comment_row.post_id;
  if not found or not public.feture_post_visible(post_row,p_actor) or
    (comment_row.author_hash<>p_actor and (comment_row.state<>'published' or
       (comment_row.parent_id is not null and not exists(select 1 from public.feture_post_comments p
          where p.id=comment_row.parent_id and p.post_id=comment_row.post_id and p.parent_id is null and p.state='published'))))
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_post_comment_dto(comment_row,comment_row.author_hash=p_actor));
 end if;
 if jsonb_typeof(p_command->'operationId') is distinct from 'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act in ('comments.create','comments.edit') then
  if jsonb_typeof(p_command->'text') is distinct from 'string'
     or char_length(btrim(p_command->>'text'))<1 or char_length(p_command->>'text')>1200
     or (p_command->>'text')~'[\x00-\x08\x0b-\x1f\x7f]'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 end if;
 if act<>'comments.create' then
  if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or
     p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  expected:=(p_command->>'expectedRevision')::bigint;
 end if;
 op:=(p_command->>'operationId')::uuid;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_post_comment_operations
   where account_hash=p_actor and operation_id=op;
 if receipt.operation_id is not null and (receipt.comment_id<>cid or receipt.payload_hash<>h)
 then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 select * into comment_row from public.feture_post_comments where id=cid for update;
 if comment_row.id is not null and comment_row.author_hash<>p_actor
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if comment_row.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_post_comment_dto(comment_row,true),'replayed',true);
 end if;
 if act='comments.create' then
  if comment_row.id is not null then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  pid:=(p_command->>'postId')::uuid;
  select * into post_row from public.feture_posts where id=pid;
  if not found or not public.feture_post_visible(post_row,p_actor)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if p_command->'parentId'<>'null'::jsonb then
   parent_uuid:=(p_command->>'parentId')::uuid;
   select * into parent_row from public.feture_post_comments where id=parent_uuid;
   if not found or parent_row.post_id<>pid or parent_row.parent_id is not null or parent_row.state<>'published'
   then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  end if;
  if (select count(*)>=20 from public.feture_post_comments
       where author_hash=p_actor and created_at>clock_timestamp()-interval '1 day')
  then return jsonb_build_object('ok',false,'error','rate_limited');end if;
  insert into public.feture_post_comments(id,post_id,parent_id,author_hash,body)
   values(cid,pid,parent_uuid,p_actor,p_command->>'text') returning * into comment_row;
 else
  if comment_row.id is null or comment_row.state='deleted'
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if comment_row.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  if act='comments.edit' then
   select * into post_row from public.feture_posts where id=comment_row.post_id;
   if not found or not public.feture_post_visible(post_row,p_actor)
   then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
   update public.feture_post_comments set body=p_command->>'text',state='pending',
     revision=revision+1,updated_at=clock_timestamp() where id=cid returning * into comment_row;
  else
   -- Deletion must remain available after the post becomes private or consent expires.
   update public.feture_post_comments set body='',state='deleted',
     revision=revision+1,updated_at=clock_timestamp() where id=cid returning * into comment_row;
  end if;
 end if;
 insert into public.feture_post_comment_operations(account_hash,operation_id,comment_id,payload_hash)
  values(p_actor,op,cid,h);
 return jsonb_build_object('ok',true,'entry',public.feture_post_comment_dto(comment_row,true),'replayed',false);
end $$;
revoke all on function public.feture_post_comment_command(text,jsonb) from public,anon,authenticated;
revoke all on function public.feture_post_comment_dto(public.feture_post_comments,boolean) from public,anon,authenticated;
grant execute on function public.feture_post_comment_command(text,jsonb) to service_role;
grant execute on function public.feture_post_comment_dto(public.feture_post_comments,boolean) to service_role;
