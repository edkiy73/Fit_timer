-- C02.3b1: staff comment review. Prelaunch only, additive FetUre namespace.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_post_comment_reviews (
 event_id uuid not null default gen_random_uuid() unique,
 actor_hash text not null,
 account_generation text not null check(account_generation ~ '^[a-f0-9]{64}$'),
 operation_id uuid not null,
 comment_id uuid not null references public.feture_post_comments(id) on delete cascade,
 decision text not null check(decision in ('approve','hide','reopen')),
 reason text not null check(reason in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')),
 payload_hash text not null,
 revision bigint not null check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_hash,account_generation,operation_id)
);
create index feture_comment_review_audit_page on public.feture_post_comment_reviews(created_at desc,event_id desc);
alter table public.feture_post_comment_reviews enable row level security;
revoke all on public.feture_post_comment_reviews from public,anon,authenticated,service_role;
grant select,insert on public.feture_post_comment_reviews to service_role;

create function public.feture_post_comment_review_command(p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';role_state jsonb;my_role text;keys text[];
 cur jsonb;cursor_at timestamptz;cursor_id uuid;page jsonb;
 cid uuid;op uuid;expected bigint;decision text;reason text;h text;
 comment_row public.feture_post_comments%rowtype;source_post public.feture_posts%rowtype;
 receipt public.feture_post_comment_reviews%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_generation is null or
   p_generation !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act not in ('queue','audit','decide') or act is null
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- Exactly the current personal Core account generation, not an email claim.
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 role_state:=public.feture_operator_bound_command(p_actor,p_generation,null,false,'{"action":"status"}'::jsonb);
 my_role:=role_state->>'role';
 if role_state->>'ok'<>'true' or (act='audit' and my_role not in ('manager','auditor')) or
   (act<>'audit' and my_role<>'manager')
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act<>'audit' and not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act in ('queue','audit') then
  if keys is distinct from array['action','cursor']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';
  if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or
      (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
      jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' or
      cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin cursor_at:=(cur->>'at')::timestamptz;cursor_id:=(cur->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(cursor_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
  if act='queue' then
   -- Review only comments attached to a currently readable publicly published post.
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'postId',v.post_id,
     'parentId',v.parent_id,'text',v.body,'state',v.state,'revision',v.revision,
     'at',v.created_at) order by v.created_at desc,v.id desc),'[]'::jsonb) into page
   from (
     select c.* from public.feture_post_comments c
     join public.feture_posts p on p.id=c.post_id
     where c.state in ('pending','published','hidden')
       and p.state='published' and p.audience='public'
       and public.feture_post_visible(p,p_actor)
       and (cursor_at is null or (c.created_at,c.id)<(cursor_at,cursor_id))
     order by c.created_at desc,c.id desc limit 21
   ) v;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',v.event_id,'commentId',v.comment_id,
     'decision',v.decision,'reason',v.reason,'revision',v.revision,'at',v.created_at)
      order by v.created_at desc,v.event_id desc),'[]'::jsonb) into page
   from (
     select r.* from public.feture_post_comment_reviews r
     where cursor_at is null or (r.created_at,r.event_id)<(cursor_at,cursor_id)
     order by r.created_at desc,r.event_id desc limit 21
   ) v;
  end if;
  return jsonb_build_object('ok',true,
   'items',coalesce((select jsonb_agg(x order by n) from jsonb_array_elements(page)
     with ordinality t(x,n) where n<=20),'[]'::jsonb),
   'nextCursor',case when jsonb_array_length(page)>20
    then jsonb_build_object('at',page->19->>'at','id',page->19->>'id') else null end);
 end if;
 if keys is distinct from array['action','decision','expectedRevision','id','operationId','reason']::text[]
   or jsonb_typeof(p_command->'id') is distinct from 'string'
   or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or jsonb_typeof(p_command->'operationId') is distinct from 'string'
   or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
   or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
   or p_command->>'decision' not in ('approve','hide','reopen')
   or p_command->>'reason' not in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 cid:=(p_command->>'id')::uuid;op:=(p_command->>'operationId')::uuid;
 expected:=(p_command->>'expectedRevision')::bigint;
 decision:=p_command->>'decision';reason:=p_command->>'reason';
 if (decision in ('approve','reopen') and reason<>'reviewed') or
    (decision='hide' and reason='reviewed')
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 h:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.feture_post_comment_reviews
  where actor_hash=p_actor and account_generation=p_generation and operation_id=op;
 if receipt.operation_id is not null and receipt.payload_hash<>h
 then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 select * into comment_row from public.feture_post_comments where id=cid for update;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into source_post from public.feture_posts where id=comment_row.post_id;
 if not found or source_post.state<>'published' or source_post.audience<>'public'
   or not public.feture_post_visible(source_post,p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  return jsonb_build_object('ok',true,'entry',
   jsonb_build_object('id',comment_row.id,'state',comment_row.state,'revision',comment_row.revision),
   'replayed',true);
 end if;
 if comment_row.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if comment_row.author_hash=p_actor or source_post.author_hash=p_actor
 then return jsonb_build_object('ok',false,'error','review_required');end if;
 if (decision='approve' and comment_row.state<>'pending') or
    (decision='hide' and comment_row.state not in ('pending','published')) or
    (decision='reopen' and comment_row.state<>'hidden')
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if decision='approve' then
  if not public.feture_peer_eligible(comment_row.author_hash) or
     not public.feture_peer_eligible(source_post.author_hash)
  then return jsonb_build_object('ok',false,'error','review_required');end if;
  if comment_row.parent_id is not null and not exists(
   select 1 from public.feture_post_comments parent_comment
   where parent_comment.id=comment_row.parent_id and parent_comment.post_id=comment_row.post_id
     and parent_comment.parent_id is null and parent_comment.state='published'
     and public.feture_peer_eligible(parent_comment.author_hash))
  then return jsonb_build_object('ok',false,'error','review_required');end if;
 end if;
 update public.feture_post_comments set state=case decision when 'approve' then 'published'
   when 'hide' then 'hidden' else 'pending' end,
   revision=revision+1,updated_at=clock_timestamp()
 where id=cid returning * into comment_row;
 insert into public.feture_post_comment_reviews(actor_hash,account_generation,operation_id,
  comment_id,decision,reason,payload_hash,revision)
 values(p_actor,p_generation,op,cid,decision,reason,h,comment_row.revision);
 return jsonb_build_object('ok',true,'entry',
  jsonb_build_object('id',comment_row.id,'state',comment_row.state,'revision',comment_row.revision),
  'replayed',false);
end $$;
revoke all on function public.feture_post_comment_review_command(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.feture_post_comment_review_command(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
