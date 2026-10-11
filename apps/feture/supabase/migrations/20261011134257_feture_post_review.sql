-- C01.2: personal manager review, metadata-only auditor journal.
create table public.feture_post_reviews(
 event_id uuid not null default gen_random_uuid() unique,actor_hash text not null,account_generation text not null,operation_id uuid not null,
 post_id uuid not null references public.feture_posts(id) on delete cascade,
 action text not null check(action in ('approve','reject','hide','reopen')),
 reason text not null check(reason in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')),
 payload_hash text not null,revision bigint not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_hash,account_generation,operation_id));
alter table public.feture_post_reviews enable row level security;
revoke all on public.feture_post_reviews from public,anon,authenticated,service_role;
grant select,insert on public.feture_post_reviews to service_role;
create function public.feture_post_review_command(p_actor text,p_generation text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'text',v.body,'authorLabel',v.author_label,'kind',v.kind,'state',v.state,'revision',v.revision,'submittedAt',v.submitted_at) order by v.submitted_at desc,v.id desc),'[]'::jsonb) into page from (
    select q.* from public.feture_posts q where q.state in ('pending','published','hidden') and q.audience='public' and q.submitted_at is not null and (cursor_at is null or (q.submitted_at,q.id)<(cursor_at,cursor_id)) order by q.submitted_at desc,q.id desc limit 21
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
 if p.audience<>'public' or p.state in ('draft','deleted') or (decision in ('approve','reject') and p.state<>'pending') or (decision='hide' and p.state<>'published') or (decision='reopen' and p.state<>'hidden') then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if decision='approve' and (p.author_hash=p_actor or not public.feture_peer_eligible(p.author_hash)) then return jsonb_build_object('ok',false,'error','review_required');end if;
 update public.feture_posts set state=case decision when 'approve' then 'published' when 'reject' then 'rejected' when 'hide' then 'hidden' else 'pending' end,published_at=case when decision='approve' then clock_timestamp() else null end,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 insert into public.feture_post_reviews(actor_hash,account_generation,operation_id,post_id,action,reason,payload_hash,revision) values(p_actor,p_generation,op,pid,decision,reason,h,p.revision);
 return jsonb_build_object('ok',true,'post',jsonb_build_object('id',p.id,'state',p.state,'revision',p.revision),'replayed',false);
end $$;
revoke all on function public.feture_post_review_command(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_review_command(text,text,jsonb) to service_role;
