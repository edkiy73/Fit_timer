-- C01.1: private drafts, explicit submission, moderation-first text feed.
-- No automatic publication, profile grants or private test projections.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;
 if exists(select 1 from public.feture_posts) then raise exception 'feture_posts_must_be_empty';end if;
end $$;
alter table public.feture_posts drop constraint feture_posts_body_check;
alter table public.feture_posts add constraint feture_posts_body_check check(char_length(body)<=3000);
alter table public.feture_posts add column kind text not null default 'text' check(kind in ('text','story','question'));
alter table public.feture_posts add column author_label text not null default '' check(char_length(author_label)<=80);
alter table public.feture_posts add column state text not null default 'draft' check(state in ('draft','pending','published','rejected','hidden','deleted'));
alter table public.feture_posts add column revision bigint not null default 1 check(revision>0);
alter table public.feture_posts add column updated_at timestamptz not null default clock_timestamp();
alter table public.feture_posts add column submitted_at timestamptz;
alter table public.feture_posts add column published_at timestamptz;
alter table public.feture_posts add constraint feture_posts_publication_shape check(state<>'published' or (audience='public' and published_at is not null and length(btrim(body))>0 and length(btrim(author_label))>0));
create index feture_posts_feed on public.feture_posts(published_at desc,id desc) where state='published' and audience='public';
create table public.feture_post_operations(
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,post_id uuid not null references public.feture_posts(id) on delete cascade,
 action text not null,payload_hash text not null,applied_revision bigint not null,created_at timestamptz not null default clock_timestamp(),primary key(account_hash,operation_id));
alter table public.feture_post_operations enable row level security;
revoke all on public.feture_post_operations from public,anon,authenticated,service_role;
grant select,insert on public.feture_post_operations to service_role;
create function public.feture_post_dto(p public.feture_posts,p_owner boolean) returns jsonb language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'text',p.body,'kind',p.kind,'authorLabel',p.author_label,'audience',p.audience,'state',p.state,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'publishedAt',p.published_at,'mine',p_owner);
$$;
create function public.feture_post_command(p_actor text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';pid uuid;op uuid;expected bigint;p public.feture_posts%rowtype;
 receipt public.feture_post_operations%rowtype;h text;keys text[];page jsonb;cur jsonb;cursor_at timestamptz;cursor_id uuid;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act in ('posts.feed','posts.mine') then
  if keys is distinct from array['action','cursor']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';
  if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin cursor_at:=(cur->>'at')::timestamptz;cursor_id:=(cur->>'id')::uuid;exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(cursor_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if act='posts.feed' and not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_post_dto(v,v.author_hash=p_actor),'at',case when act='posts.mine' then v.created_at else v.published_at end) order by case when act='posts.mine' then v.created_at else v.published_at end desc,v.id desc),'[]'::jsonb) into page from (
   select q.* from public.feture_posts q where q.state<>'deleted' and
    (case when act='posts.mine' then q.author_hash=p_actor else q.state='published' and q.audience='public' and public.feture_peer_eligible(q.author_hash) and not public.feture_pair_blocked(p_actor,q.author_hash) end)
    and (cursor_at is null or (case when act='posts.mine' then q.created_at else q.published_at end,q.id)<(cursor_at,cursor_id))
   order by case when act='posts.mine' then q.created_at else q.published_at end desc,q.id desc limit 21
  ) v;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x->'entry' order by ord) from jsonb_array_elements(page) with ordinality t(x,ord) where ord<=20),'[]'::jsonb),'nextCursor',case when jsonb_array_length(page)>20 then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if act='posts.read' then
  if keys is distinct from array['action','id']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='posts.save' then
  if keys is distinct from array['action','authorLabel','expectedRevision','id','kind','operationId','text']::text[] or jsonb_typeof(p_command->'kind') is distinct from 'string' or p_command->>'kind' not in ('text','story','question') or jsonb_typeof(p_command->'text') is distinct from 'string' or length(p_command->>'text')>3000 or (p_command->>'text') ~ '[\x01-\x09\x0b-\x1f\x7f]' or jsonb_typeof(p_command->'authorLabel') is distinct from 'string' or length(p_command->>'authorLabel')>80 or (p_command->>'authorLabel') ~ '[\x01-\x1f\x7f]' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act in ('posts.submit','posts.delete') then
  if keys is distinct from array['action','expectedRevision','id','operationId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;
 if act='posts.read' then
  select * into p from public.feture_posts where id=pid and state<>'deleted';
  if p.id is null or (p.author_hash<>p_actor and (p.state<>'published' or p.audience<>'public' or not public.feture_peer_eligible(p_actor) or not public.feture_peer_eligible(p.author_hash) or public.feture_pair_blocked(p_actor,p.author_hash))) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,p.author_hash=p_actor));
 end if;
 if jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,14})$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 op:=(p_command->>'operationId')::uuid;expected:=(p_command->>'expectedRevision')::bigint;
 -- Per-author lock serializes new IDs, operation receipts, quota and post revisions.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_post_operations where account_hash=p_actor and operation_id=op;
 select * into p from public.feture_posts where id=pid for update;
 if p.id is not null and p.author_hash<>p_actor then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if receipt.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',true);
 end if;
 if act<>'posts.delete' and not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if (p.id is null and (act<>'posts.save' or expected<>0)) or (p.id is not null and p.state='deleted') then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if p.id is not null and p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if act='posts.save' then
  if p.id is null then
   if (select count(*)>=100 from public.feture_posts where author_hash=p_actor and state<>'deleted') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   insert into public.feture_posts(id,author_hash,body,kind,author_label) values(pid,p_actor,p_command->>'text',p_command->>'kind',p_command->>'authorLabel') returning * into p;
  else
   update public.feture_posts set body=p_command->>'text',kind=p_command->>'kind',author_label=p_command->>'authorLabel',audience='private',state='draft',published_at=null,submitted_at=null,updated_at=clock_timestamp(),revision=revision+1 where id=pid returning * into p;
  end if;
 elsif act='posts.submit' then
  if p.state<>'draft' or length(btrim(p.body))=0 or length(btrim(p.author_label))=0 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if (select count(*)>=20 from public.feture_post_operations where account_hash=p_actor and created_at>clock_timestamp()-interval '1 day' and action='posts.submit') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
  update public.feture_posts set audience='public',state='pending',submitted_at=clock_timestamp(),published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 else
  update public.feture_posts set body='',author_label='',audience='private',state='deleted',submitted_at=null,published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 end if;
 insert into public.feture_post_operations(account_hash,operation_id,post_id,action,payload_hash,applied_revision) values(p_actor,op,pid,act,h,p.revision);
 return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',false);
end $$;
revoke all on function public.feture_post_dto(public.feture_posts,boolean),public.feture_post_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_dto(public.feture_posts,boolean),public.feture_post_command(text,jsonb) to service_role;
