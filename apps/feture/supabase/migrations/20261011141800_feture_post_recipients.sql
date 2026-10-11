-- C01.3: selected post recipients, opaque account-bound codes, immediate revocation.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;
end $$;
alter table public.feture_posts add column planned_audience text not null default 'public' check(planned_audience in ('public','granted'));
alter table public.feture_posts drop constraint feture_posts_publication_shape;
alter table public.feture_posts add constraint feture_posts_publication_shape check(state<>'published' or (audience in ('public','granted') and published_at is not null and length(btrim(body))>0 and length(btrim(author_label))>0));
create table public.feture_post_addresses(account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,code uuid not null unique default gen_random_uuid());
create table public.feture_post_recipients(post_id uuid not null references public.feture_posts(id) on delete cascade,code uuid not null references public.feture_post_addresses(code) on delete cascade,primary key(post_id,code));
create index feture_post_recipients_code on public.feture_post_recipients(code,post_id);
create table public.feture_post_address_operations(account_hash text not null references public.feture_profiles(account_hash) on delete cascade,operation_id uuid not null,primary key(account_hash,operation_id));
alter table public.feture_post_addresses enable row level security;
alter table public.feture_post_recipients enable row level security;
alter table public.feture_post_address_operations enable row level security;
revoke all on public.feture_post_addresses,public.feture_post_recipients,public.feture_post_address_operations from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_post_addresses,public.feture_post_recipients to service_role;
grant update(code) on public.feture_post_addresses to service_role;
grant select,insert on public.feture_post_address_operations to service_role;
create function public.feture_post_visible(p public.feture_posts,p_actor text) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select p.state='published' and public.feture_peer_eligible(p_actor) and public.feture_peer_eligible(p.author_hash) and not public.feture_pair_blocked(p_actor,p.author_hash) and
 (p.audience='public' or p.audience='granted' and (p.author_hash=p_actor or exists(select 1 from public.feture_post_recipients r join public.feture_post_addresses a on a.code=r.code where r.post_id=p.id and a.account_hash=p_actor)));
$$;
create function public.feture_post_address_command(p_actor text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';keys text[];op uuid;address uuid;replayed boolean:=false;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='posts.address' then
  if keys is distinct from array['action']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='posts.rotateAddress' then
  if keys is distinct from array['action','operationId']::text[] or jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  op:=(p_command->>'operationId')::uuid;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='posts.rotateAddress' then
  replayed:=exists(select 1 from public.feture_post_address_operations where account_hash=p_actor and operation_id=op);
  if not replayed then
   -- Delete cascades every previously issued selected-post permission. Never restore on retry.
   delete from public.feture_post_addresses where account_hash=p_actor;
   insert into public.feture_post_address_operations values(p_actor,op);
  end if;
 end if;
 insert into public.feture_post_addresses(account_hash) values(p_actor) on conflict do nothing;
 select code into address from public.feture_post_addresses where account_hash=p_actor;
 return jsonb_build_object('ok',true,'code',address,'replayed',replayed);
end $$;
create or replace function public.feture_post_dto(p public.feture_posts,p_owner boolean) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'text',p.body,'kind',p.kind,'authorLabel',p.author_label,'audience',p.audience,'state',p.state,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,'publishedAt',p.published_at,'mine',p_owner,'plannedAudience',p.planned_audience,'recipientCodes',case when p_owner then coalesce((select jsonb_agg(r.code order by r.code) from public.feture_post_recipients r where r.post_id=p.id),'[]'::jsonb) else '[]'::jsonb end);
$$;
create or replace function public.feture_post_command(p_actor text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
    (case when act='posts.mine' then q.author_hash=p_actor else public.feture_post_visible(q,p_actor) end)
    and (cursor_at is null or (case when act='posts.mine' then q.created_at else q.published_at end,q.id)<(cursor_at,cursor_id))
   order by case when act='posts.mine' then q.created_at else q.published_at end desc,q.id desc limit 21
  ) v;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x->'entry' order by ord) from jsonb_array_elements(page) with ordinality t(x,ord) where ord<=20),'[]'::jsonb),'nextCursor',case when jsonb_array_length(page)>20 then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
 end if;
 if act='posts.read' then
  if keys is distinct from array['action','id']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='posts.save' then
  if keys is distinct from array['action','authorLabel','expectedRevision','id','kind','operationId','plannedAudience','recipientCodes','text']::text[] or jsonb_typeof(p_command->'kind') is distinct from 'string' or p_command->>'kind' not in ('text','story','question') or jsonb_typeof(p_command->'text') is distinct from 'string' or length(p_command->>'text')>3000 or (p_command->>'text') ~ '[\x01-\x09\x0b-\x1f\x7f]' or jsonb_typeof(p_command->'authorLabel') is distinct from 'string' or length(p_command->>'authorLabel')>80 or (p_command->>'authorLabel') ~ '[\x01-\x1f\x7f]' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='posts.revokeRecipient' then
  if keys is distinct from array['action','code','expectedRevision','id','operationId']::text[] or jsonb_typeof(p_command->'code') is distinct from 'string' or p_command->>'code' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act in ('posts.submit','posts.delete') then
  if keys is distinct from array['action','expectedRevision','id','operationId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;
 if act='posts.read' then
  select * into p from public.feture_posts where id=pid and state<>'deleted';
  if p.id is null or (p.author_hash<>p_actor and (not public.feture_post_visible(p,p_actor))) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
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
 if act not in ('posts.delete','posts.revokeRecipient') and not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if (p.id is null and (act<>'posts.save' or expected<>0)) or (p.id is not null and p.state='deleted') then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if p.id is not null and p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if act='posts.save' then
  if jsonb_typeof(p_command->'plannedAudience') is distinct from 'string' or p_command->>'plannedAudience' not in ('public','granted') or jsonb_typeof(p_command->'recipientCodes') is distinct from 'array' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if jsonb_array_length(p_command->'recipientCodes')>20 or (p_command->>'plannedAudience'='public' and jsonb_array_length(p_command->'recipientCodes')<>0) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if exists(select 1 from jsonb_array_elements(p_command->'recipientCodes') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if (select count(distinct (v#>>'{}')::uuid) from jsonb_array_elements(p_command->'recipientCodes') v)<>jsonb_array_length(p_command->'recipientCodes') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  -- Validate the entire audience before mutating the post; no partial grant or account directory.
  perform a.code from public.feture_post_addresses a where a.code in (select (v#>>'{}')::uuid from jsonb_array_elements(p_command->'recipientCodes') v) order by a.code for key share;
  if exists(select 1 from jsonb_array_elements(p_command->'recipientCodes') v where not exists(select 1 from public.feture_post_addresses a where a.code=(v#>>'{}')::uuid and a.account_hash<>p_actor and public.feture_peer_eligible(a.account_hash) and not public.feture_pair_blocked(p_actor,a.account_hash))) then return jsonb_build_object('ok',false,'error','recipient_unavailable');end if;
  if p.id is null then
   if (select count(*)>=100 from public.feture_posts where author_hash=p_actor and state<>'deleted') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   insert into public.feture_posts(id,author_hash,body,kind,author_label) values(pid,p_actor,p_command->>'text',p_command->>'kind',p_command->>'authorLabel') returning * into p;
  else
   update public.feture_posts set body=p_command->>'text',kind=p_command->>'kind',author_label=p_command->>'authorLabel',audience='private',state='draft',published_at=null,submitted_at=null,updated_at=clock_timestamp(),revision=revision+1 where id=pid returning * into p;
  end if;
  delete from public.feture_post_recipients where post_id=pid;
  insert into public.feture_post_recipients(post_id,code) select pid,(v#>>'{}')::uuid from jsonb_array_elements(p_command->'recipientCodes') v;
  update public.feture_posts set planned_audience=p_command->>'plannedAudience' where id=pid returning * into p;
 elsif act='posts.submit' then
  if (p.planned_audience='granted' and not exists(select 1 from public.feture_post_recipients where post_id=pid)) or p.state<>'draft' or length(btrim(p.body))=0 or length(btrim(p.author_label))=0 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if (select count(*)>=20 from public.feture_post_operations where account_hash=p_actor and created_at>clock_timestamp()-interval '1 day' and action='posts.submit') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
  update public.feture_posts set audience=planned_audience,state='pending',submitted_at=clock_timestamp(),published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 elsif act='posts.revokeRecipient' then
  delete from public.feture_post_recipients where post_id=pid and code=(p_command->>'code')::uuid;
  update public.feture_posts set revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 else
  delete from public.feture_post_recipients where post_id=pid;
  update public.feture_posts set body='',author_label='',audience='private',state='deleted',submitted_at=null,published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 end if;
 insert into public.feture_post_operations(account_hash,operation_id,post_id,action,payload_hash,applied_revision) values(p_actor,op,pid,act,h,p.revision);
 return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',false);
end $$;
create or replace function public.feture_post_review_command(p_actor text,p_generation text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';my_role text;permission jsonb;keys text[];pid uuid;op uuid;expected bigint;decision text;reason text;p public.feture_posts%rowtype;receipt public.feture_post_reviews%rowtype;h text;page jsonb;cur jsonb;cursor_at timestamptz;cursor_id uuid;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act is null or act not in ('queue','audit','decide') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- Same lock as role updates: revoked/stale account generation has no authority.
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 permission:=public.feture_operator_bound_command(p_actor,p_generation,null,false,jsonb_build_object('action','status'));
 my_role:=permission->>'role';
 if my_role is null or (act='audit' and my_role not in ('manager','auditor')) or (act<>'audit' and my_role<>'manager') then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act in ('queue','decide') and not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','review_required');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act in ('queue','audit') then
  if keys is distinct from array['action','cursor']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin cursor_at:=(cur->>'at')::timestamptz;cursor_id:=(cur->>'id')::uuid;exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(cursor_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if act='queue' then
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'text',v.body,'authorLabel',v.author_label,'kind',v.kind,'audience',v.audience,'state',v.state,'revision',v.revision,'submittedAt',v.submitted_at) order by v.submitted_at desc,v.id desc),'[]'::jsonb) into page from (
    select q.* from public.feture_posts q where q.state in ('pending','published','hidden') and q.audience in ('public','granted') and q.submitted_at is not null and (cursor_at is null or (q.submitted_at,q.id)<(cursor_at,cursor_id)) order by q.submitted_at desc,q.id desc limit 21
   ) v;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',v.event_id,'postId',v.post_id,'action',v.action,'reason',v.reason,'revision',v.revision,'at',v.created_at) order by v.created_at desc,v.event_id desc),'[]'::jsonb) into page from (
    select r.* from public.feture_post_reviews r where (cursor_at is null or (r.created_at,r.event_id)<(cursor_at,cursor_id)) order by r.created_at desc,r.event_id desc limit 21
   ) v;
  end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x order by ord) from jsonb_array_elements(page) with ordinality t(x,ord) where ord<=20),'[]'::jsonb),'nextCursor',case when jsonb_array_length(page)>20 then jsonb_build_object('at',case when act='queue' then page->19->>'submittedAt' else page->19->>'at' end,'id',page->19->>'id') else null end);
 end if;
 if act<>'decide' or keys is distinct from array['action','decision','expectedRevision','id','operationId','reason']::text[] or jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$' or jsonb_typeof(p_command->'decision') is distinct from 'string' or p_command->>'decision' not in ('approve','reject','hide','reopen') or jsonb_typeof(p_command->'reason') is distinct from 'string' or p_command->>'reason' not in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;op:=(p_command->>'operationId')::uuid;expected:=(p_command->>'expectedRevision')::bigint;decision:=p_command->>'decision';reason:=p_command->>'reason';
 if (decision in ('approve','reopen') and reason<>'reviewed') or (decision in ('hide','reject') and reason='reviewed') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_post_reviews where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 -- Post owner commands lock profile then post. This function never locks profiles.
 select * into p from public.feture_posts where id=pid for update;
 if p.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if receipt.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'post',jsonb_build_object('id',p.id,'state',p.state,'revision',p.revision),'replayed',true);
 end if;
 if p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if p.audience not in ('public','granted') or p.state in ('draft','deleted') or (decision in ('approve','reject') and p.state<>'pending') or (decision='hide' and p.state<>'published') or (decision='reopen' and p.state<>'hidden') then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if decision='approve' and (p.author_hash=p_actor or not public.feture_peer_eligible(p.author_hash)) then return jsonb_build_object('ok',false,'error','review_required');end if;
 update public.feture_posts set state=case decision when 'approve' then 'published' when 'reject' then 'rejected' when 'hide' then 'hidden' else 'pending' end,published_at=case when decision='approve' then clock_timestamp() else null end,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 insert into public.feture_post_reviews(actor_hash,account_generation,operation_id,post_id,action,reason,payload_hash,revision) values(p_actor,p_generation,op,pid,decision,reason,h,p.revision);
 return jsonb_build_object('ok',true,'post',jsonb_build_object('id',p.id,'state',p.state,'revision',p.revision),'replayed',false);
end $$;
create or replace function public.feture_post_report_command(p_actor text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';keys text[];rid uuid;pid uuid;p public.feture_posts%rowtype;r public.feture_post_reports%rowtype;h text;page jsonb;cur jsonb;at_value timestamptz;after_id uuid;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='posts.reports' then
  if keys is distinct from array['action','cursor']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin at_value:=(cur->>'at')::timestamptz;after_id:=(cur->>'id')::uuid;exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(at_value) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  select coalesce(jsonb_agg(public.feture_post_report_dto(v) order by v.created_at desc,v.id desc),'[]'::jsonb) into page from (select q.* from public.feture_post_reports q where q.reporter_hash=p_actor and (at_value is null or (q.created_at,q.id)<(at_value,after_id)) order by q.created_at desc,q.id desc limit 21) v;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x order by ord) from jsonb_array_elements(page) with ordinality t(x,ord) where ord<=20),'[]'::jsonb),'nextCursor',case when jsonb_array_length(page)>20 then jsonb_build_object('at',page->19->>'createdAt','id',page->19->>'id') else null end);
 end if;
 if act is distinct from 'posts.report' or keys is distinct from array['action','expectedRevision','id','note','reason','reportId']::text[] or jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'reportId') is distinct from 'string' or p_command->>'reportId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$' or jsonb_typeof(p_command->'reason') is distinct from 'string' or p_command->>'reason' not in ('policy','privacy','nonconsent','minor','illegal','spam','other') or jsonb_typeof(p_command->'note') is distinct from 'string' or length(p_command->>'note')>1000 or (p_command->>'note') ~ '[\x01-\x09\x0b-\x1f\x7f]' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 rid:=(p_command->>'reportId')::uuid;pid:=(p_command->>'id')::uuid;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into r from public.feture_post_reports where id=rid;h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 if r.id is not null then
  if r.reporter_hash<>p_actor then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if r.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',true);
 end if;
 select * into p from public.feture_posts where id=pid for update;
 if p.id is null or p.author_hash=p_actor or not public.feture_post_visible(p,p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if p.revision<>(p_command->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if exists(select 1 from public.feture_post_reports where reporter_hash=p_actor and post_id=pid and state='open') then return jsonb_build_object('ok',false,'error','report_pending');end if;
 if (select count(*)>=5 from public.feture_post_reports where reporter_hash=p_actor and created_at>clock_timestamp()-interval '1 day') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 insert into public.feture_post_reports(id,reporter_hash,post_id,post_revision,reason,note,payload_hash) values(rid,p_actor,pid,p.revision,p_command->>'reason',p_command->>'note',h) returning * into r;
 return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',false);
end $$;
-- Even a staff manager must not inspect/resolve complaints about their own post.
create or replace function public.feture_post_report_review(p_actor text,p_generation text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';my_role text;keys text[];r public.feture_post_reports%rowtype;p public.feture_posts%rowtype;receipt public.feture_post_report_decisions%rowtype;op uuid;h text;page jsonb;cur jsonb;at_value timestamptz;after_id uuid;decision text;reason text;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_generation is null or p_generation !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_command) is distinct from 'object' or act is null or act not in ('reports','resolveReport','reportAudit') then return jsonb_build_object('ok',false,'error','forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 my_role:=public.feture_operator_bound_command(p_actor,p_generation,null,false,jsonb_build_object('action','status'))->>'role';
 if my_role is null or (act='reportAudit' and my_role not in ('manager','auditor')) or (act<>'reportAudit' and my_role<>'manager') then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act<>'reportAudit' and not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','review_required');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act in ('reports','reportAudit') then
  if keys is distinct from array['action','cursor']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin at_value:=(cur->>'at')::timestamptz;after_id:=(cur->>'id')::uuid;exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(at_value) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if act='reports' then
   select coalesce(jsonb_agg(public.feture_post_report_dto(v)||jsonb_build_object('note',v.note,'context',(select case when q.revision=v.post_revision and public.feture_post_visible(q,v.reporter_hash) then jsonb_build_object('text',q.body,'authorLabel',q.author_label,'revision',q.revision) else null end from public.feture_posts q where q.id=v.post_id)) order by v.created_at desc,v.id desc),'[]'::jsonb) into page from (select q.* from public.feture_post_reports q where q.state='open' and exists(select 1 from public.feture_posts parent where parent.id=q.post_id and parent.author_hash<>p_actor) and (at_value is null or (q.created_at,q.id)<(at_value,after_id)) order by q.created_at desc,q.id desc limit 21) v;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',v.event_id,'reportId',v.report_id,'action',v.action,'reason',v.reason,'revision',v.revision,'at',v.created_at) order by v.created_at desc,v.event_id desc),'[]'::jsonb) into page from (select e.* from public.feture_post_report_decisions e where at_value is null or (e.created_at,e.event_id)<(at_value,after_id) order by e.created_at desc,e.event_id desc limit 21) v;
  end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x order by ord) from jsonb_array_elements(page) with ordinality t(x,ord) where ord<=20),'[]'::jsonb),'nextCursor',case when jsonb_array_length(page)>20 then jsonb_build_object('at',case when act='reports' then page->19->>'createdAt' else page->19->>'at' end,'id',page->19->>'id') else null end);
 end if;
 if keys is distinct from array['action','decision','expectedRevision','id','operationId','reason']::text[] or jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$' or jsonb_typeof(p_command->'decision') is distinct from 'string' or p_command->>'decision' not in ('dismiss','hide') or jsonb_typeof(p_command->'reason') is distinct from 'string' or p_command->>'reason' not in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 op:=(p_command->>'operationId')::uuid;decision:=p_command->>'decision';reason:=p_command->>'reason';
 if (decision='dismiss' and reason<>'reviewed') or (decision='hide' and reason='reviewed') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');select * into receipt from public.feture_post_report_decisions where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 -- Read relation, then lock parent before report; creation uses profile→parent.
 select * into r from public.feture_post_reports where id=(p_command->>'id')::uuid;if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into p from public.feture_posts where id=r.post_id for update;
 if p.id is null or p.author_hash=p_actor then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into r from public.feture_post_reports where id=r.id for update;
 if r.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if receipt.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',true);
 end if;
 if r.state<>'open' or r.revision<>(p_command->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if decision='hide' then
  if p.id is null or p.revision<>r.post_revision or not public.feture_post_visible(p,r.reporter_hash) then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_posts set state='hidden',published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=p.id;
 end if;
 update public.feture_post_reports set state='resolved',resolution=decision,resolved_at=clock_timestamp(),revision=revision+1 where id=r.id returning * into r;
 insert into public.feture_post_report_decisions(actor_hash,account_generation,operation_id,report_id,action,reason,payload_hash,revision) values(p_actor,p_generation,op,r.id,decision,reason,h,r.revision);
 return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',false);
end $$;
revoke all on function public.feture_post_visible(public.feture_posts,text),public.feture_post_address_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_visible(public.feture_posts,text),public.feture_post_address_command(text,jsonb) to service_role;
