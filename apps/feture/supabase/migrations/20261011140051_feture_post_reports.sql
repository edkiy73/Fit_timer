-- C01.2b: post-version reports, no copied parent body or automatic sanction.
create table public.feture_post_reports(
 id uuid primary key,reporter_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 post_id uuid not null references public.feture_posts(id) on delete cascade,post_revision bigint not null,
 reason text not null check(reason in ('policy','privacy','nonconsent','minor','illegal','spam','other')),
 note text not null check(length(note)<=1000),payload_hash text not null,state text not null default 'open' check(state in ('open','resolved')),
 revision bigint not null default 1,created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,
 resolution text check(resolution in ('dismiss','hide')));
create unique index feture_post_report_open on public.feture_post_reports(reporter_hash,post_id) where state='open';
create index feture_post_reports_queue on public.feture_post_reports(created_at desc,id desc) where state='open';
create table public.feture_post_report_decisions(
 event_id uuid not null default gen_random_uuid() unique,actor_hash text not null,account_generation text not null,operation_id uuid not null,
 report_id uuid not null references public.feture_post_reports(id) on delete cascade,
 action text not null check(action in ('dismiss','hide')),reason text not null check(reason in ('reviewed','policy','privacy','nonconsent','minor','illegal','spam','other')),
 payload_hash text not null,revision bigint not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_hash,account_generation,operation_id));
alter table public.feture_post_reports enable row level security;
alter table public.feture_post_report_decisions enable row level security;
revoke all on public.feture_post_reports,public.feture_post_report_decisions from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_post_reports to service_role;
grant select,insert on public.feture_post_report_decisions to service_role;
create function public.feture_post_report_dto(r public.feture_post_reports) returns jsonb language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'postId',r.post_id,'postRevision',r.post_revision,'reason',r.reason,'state',r.state,'revision',r.revision,'createdAt',r.created_at,'resolvedAt',r.resolved_at,'resolution',r.resolution);
$$;
create function public.feture_post_report_command(p_actor text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
 if p.id is null or p.author_hash=p_actor or p.state<>'published' or p.audience<>'public' or not public.feture_peer_eligible(p_actor) or not public.feture_peer_eligible(p.author_hash) or public.feture_pair_blocked(p_actor,p.author_hash) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if p.revision<>(p_command->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if exists(select 1 from public.feture_post_reports where reporter_hash=p_actor and post_id=pid and state='open') then return jsonb_build_object('ok',false,'error','report_pending');end if;
 if (select count(*)>=5 from public.feture_post_reports where reporter_hash=p_actor and created_at>clock_timestamp()-interval '1 day') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 insert into public.feture_post_reports(id,reporter_hash,post_id,post_revision,reason,note,payload_hash) values(rid,p_actor,pid,p.revision,p_command->>'reason',p_command->>'note',h) returning * into r;
 return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',false);
end $$;
create function public.feture_post_report_review(p_actor text,p_generation text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
   select coalesce(jsonb_agg(public.feture_post_report_dto(v)||jsonb_build_object('note',v.note,'context',(select case when q.state='published' and q.audience='public' and q.revision=v.post_revision and public.feture_peer_eligible(q.author_hash) then jsonb_build_object('text',q.body,'authorLabel',q.author_label,'revision',q.revision) else null end from public.feture_posts q where q.id=v.post_id)) order by v.created_at desc,v.id desc),'[]'::jsonb) into page from (select q.* from public.feture_post_reports q where q.state='open' and (at_value is null or (q.created_at,q.id)<(at_value,after_id)) order by q.created_at desc,q.id desc limit 21) v;
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
 select * into r from public.feture_post_reports where id=r.id for update;
 if r.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if receipt.operation_id is not null then
  if receipt.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',true);
 end if;
 if r.state<>'open' or r.revision<>(p_command->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if decision='hide' then
  if p.id is null or p.state<>'published' or p.audience<>'public' or p.revision<>r.post_revision then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_posts set state='hidden',published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=p.id;
 end if;
 update public.feture_post_reports set state='resolved',resolution=decision,resolved_at=clock_timestamp(),revision=revision+1 where id=r.id returning * into r;
 insert into public.feture_post_report_decisions(actor_hash,account_generation,operation_id,report_id,action,reason,payload_hash,revision) values(p_actor,p_generation,op,r.id,decision,reason,h,r.revision);
 return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',false);
end $$;
revoke all on function public.feture_post_report_dto(public.feture_post_reports),public.feture_post_report_command(text,jsonb),public.feture_post_report_review(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_report_dto(public.feture_post_reports),public.feture_post_report_command(text,jsonb),public.feture_post_report_review(text,text,jsonb) to service_role;
