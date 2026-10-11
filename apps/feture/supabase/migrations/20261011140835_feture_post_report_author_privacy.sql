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
   select coalesce(jsonb_agg(public.feture_post_report_dto(v)||jsonb_build_object('note',v.note,'context',(select case when q.state='published' and q.audience='public' and q.revision=v.post_revision and public.feture_peer_eligible(q.author_hash) then jsonb_build_object('text',q.body,'authorLabel',q.author_label,'revision',q.revision) else null end from public.feture_posts q where q.id=v.post_id)) order by v.created_at desc,v.id desc),'[]'::jsonb) into page from (select q.* from public.feture_post_reports q where q.state='open' and exists(select 1 from public.feture_posts parent where parent.id=q.post_id and parent.author_hash<>p_actor) and (at_value is null or (q.created_at,q.id)<(at_value,after_id)) order by q.created_at desc,q.id desc limit 21) v;
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
  if p.id is null or p.state<>'published' or p.audience<>'public' or p.revision<>r.post_revision then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_posts set state='hidden',published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=p.id;
 end if;
 update public.feture_post_reports set state='resolved',resolution=decision,resolved_at=clock_timestamp(),revision=revision+1 where id=r.id returning * into r;
 insert into public.feture_post_report_decisions(actor_hash,account_generation,operation_id,report_id,action,reason,payload_hash,revision) values(p_actor,p_generation,op,r.id,decision,reason,h,r.revision);
 return jsonb_build_object('ok',true,'report',public.feture_post_report_dto(r),'replayed',false);
end $$;
