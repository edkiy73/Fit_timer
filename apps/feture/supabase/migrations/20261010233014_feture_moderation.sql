-- P03: manual profile cases. Other content adapters are added with their domains.
do $$ begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required'; end if; end $$;
create table public.feture_reports (
 id uuid primary key,reporter_hash text references public.feture_profiles(account_hash) on delete set null,
 target_id uuid not null,target_kind text not null check(target_kind='profile'),
 subject_hash text references public.feture_profiles(account_hash) on delete set null,
 reason text not null check(reason in ('harassment','privacy','nonconsent','minor','illegal','spam','other')),
 note text not null check(char_length(note)<=1000),selected_field text check(selected_field in ('nickname','about','pronouns','identity','orientation','relationships','city')),
 snapshot jsonb not null default '{}' check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=10000),payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 priority smallint not null check(priority between 1 and 3),state text not null default 'open' check(state in ('open','reviewing','resolved')),
 revision bigint not null default 1 check(revision between 1 and 9007199254740991),
 automatic_state text not null default 'manual_required' check(automatic_state in ('manual_required','flagged','clear')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp());
create index feture_report_owner on public.feture_reports(reporter_hash,id);
create index feture_report_queue on public.feture_reports(state,priority desc,created_at,id);
create index feture_report_subject on public.feture_reports(subject_hash,id);
create table public.feture_moderation_decisions (
 id uuid primary key,case_id uuid not null,
 operator_label text not null check(operator_label='core-admin'),
 action text not null check(action in ('dismiss','hide','suspend','restore')),
 reason text not null check(reason in ('policy','abuse','age','illegal','insufficient','appeal')),
 days integer not null check(days between 1 and 365),payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp());
create index feture_decisions_case on public.feture_moderation_decisions(case_id,created_at);
create table public.feture_moderation_restrictions (
 account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,
 case_id uuid references public.feture_reports(id) on delete set null,
 state text not null check(state in ('hidden','suspended')),reason text not null check(reason in ('policy','abuse','age','illegal')),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),lifted_at timestamptz);
create index feture_restriction_case on public.feture_moderation_restrictions(case_id);
create table public.feture_moderation_appeals (
 id uuid primary key,case_id uuid not null references public.feture_reports(id) on delete cascade,
 author_hash text references public.feture_profiles(account_hash) on delete set null,
 text text not null check(char_length(text) between 1 and 1000),payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'open' check(state in ('open','resolved')),
 created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,
 decision_id uuid references public.feture_moderation_decisions(id));
create unique index feture_one_open_appeal on public.feture_moderation_appeals(case_id,author_hash) where state='open';
create index feture_appeal_author on public.feture_moderation_appeals(author_hash,id);
create index feture_appeal_decision on public.feture_moderation_appeals(decision_id);
alter table public.feture_reports enable row level security;
alter table public.feture_moderation_decisions enable row level security;
alter table public.feture_moderation_restrictions enable row level security;
alter table public.feture_moderation_appeals enable row level security;
revoke all on public.feture_reports,public.feture_moderation_decisions,public.feture_moderation_restrictions,public.feture_moderation_appeals from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_reports,public.feture_moderation_restrictions,public.feture_moderation_appeals to service_role;
grant select,insert on public.feture_moderation_decisions to service_role;

create function public.feture_report_create(p_actor text,p_id uuid,p_target uuid,p_reason text,p_note text,p_field text,p_snapshot_allowed boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.feture_reports%rowtype;target_key text;h text;visible jsonb;snapshot jsonb:='{}';n integer;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p_target is null or p_snapshot_allowed is null or p_reason is null or p_reason not in ('harassment','privacy','nonconsent','minor','illegal','spam','other') or p_note is null or char_length(p_note)>1000 or (p_field is not null and p_field not in ('nickname','about','pronouns','identity','orientation','relationships','city')) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 insert into public.feture_profiles(account_hash) values(p_actor) on conflict do nothing;perform 1 from public.feture_profiles where account_hash=p_actor for update;
 h:=encode(sha256(convert_to(jsonb_build_object('actor',p_actor,'target',p_target,'reason',p_reason,'note',p_note,'field',p_field)::text,'UTF8')),'hex');
 select * into r from public.feture_reports where id=p_id;
 if found then if r.reporter_hash<>p_actor or r.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;return jsonb_build_object('ok',true,'reportId',p_id);end if;
 select count(*) into n from public.feture_reports where reporter_hash=p_actor and created_at>clock_timestamp()-interval '1 day';
 if n>=10 then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 select account_hash into target_key from public.feture_profile_details where profile_id=p_target;
 -- Unknown/blocked/unverified targets do not expose existence or private content to the reporter.
 if p_snapshot_allowed and target_key is not null and target_key<>p_actor and p_field is not null and not public.feture_pair_blocked(p_actor,target_key) and public.feture_peer_eligible(p_actor) and public.feture_peer_eligible(target_key) then
  visible:=public.feture_profile_visible(target_key,p_actor)->'fields';
  if visible ? p_field then snapshot:=jsonb_build_object('field',p_field,'text',visible->p_field);end if;
 end if;
 insert into public.feture_reports(id,reporter_hash,target_id,target_kind,subject_hash,reason,note,selected_field,snapshot,payload_hash,priority)
 values(p_id,p_actor,p_target,'profile',target_key,p_reason,p_note,p_field,snapshot,h,case when p_reason in ('minor','illegal') then 3 when p_reason in ('nonconsent','privacy') then 2 else 1 end);
 return jsonb_build_object('ok',true,'reportId',p_id);
end $$;
create function public.feture_moderation_decide(p_id uuid,p_case uuid,p_expected bigint,p_action text,p_reason text,p_days integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.feture_reports%rowtype;d public.feture_moderation_decisions%rowtype;h text;t timestamptz;
begin
 if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p_case is null or p_expected is null or p_expected<1 or p_expected>=9007199254740991 or p_action is null or p_action not in ('dismiss','hide','suspend','restore') or p_reason is null or p_reason not in ('policy','abuse','age','illegal','insufficient','appeal') or p_days is null or p_days not between 1 and 365 or (p_action in ('hide','suspend') and p_reason in ('insufficient','appeal')) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-moderation-operation:'||p_id::text,0));
 h:=encode(sha256(convert_to(jsonb_build_object('case',p_case,'expected',p_expected,'action',p_action,'reason',p_reason,'days',p_days)::text,'UTF8')),'hex');
 select * into d from public.feture_moderation_decisions where id=p_id;
 if found then if d.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;return jsonb_build_object('ok',true);end if;
 select * into r from public.feture_reports where id=p_case;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 -- All sanctions acquire subject profile before case; pair writers share that profile lock.
 if r.subject_hash is not null then perform 1 from public.feture_profiles where account_hash=r.subject_hash for update;end if;
 select * into r from public.feture_reports where id=p_case for update;
 if r.revision<>p_expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if p_action<>'dismiss' and r.subject_hash is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if p_action='restore' and not exists(select 1 from public.feture_moderation_restrictions where account_hash=r.subject_hash and case_id=p_case) then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 t:=clock_timestamp();
 insert into public.feture_moderation_decisions values(p_id,p_case,'core-admin',p_action,p_reason,p_days,h,t);
 if p_action in ('hide','suspend') then
  insert into public.feture_moderation_restrictions(account_hash,case_id,state,reason,expires_at,created_at) values(r.subject_hash,p_case,case when p_action='hide' then 'hidden' else 'suspended' end,p_reason,t+p_days*interval '1 day',t)
  on conflict(account_hash) do update set case_id=excluded.case_id,state=excluded.state,reason=excluded.reason,expires_at=excluded.expires_at,created_at=excluded.created_at,lifted_at=null;
  update public.feture_scoped_grants set revoked_at=coalesce(revoked_at,t) where owner_hash=r.subject_hash or viewer_hash=r.subject_hash;
  update public.feture_access_requests set state='cancelled' where state='pending' and (owner_hash=r.subject_hash or viewer_hash=r.subject_hash);
 elsif p_action='restore' then
  -- An old case cannot lift a newer case's restriction.
  update public.feture_moderation_restrictions set lifted_at=coalesce(lifted_at,t) where account_hash=r.subject_hash and case_id=p_case;
  if not found then raise exception 'feture_restriction_changed';end if;
 end if;
 update public.feture_reports set state='resolved',revision=revision+1,updated_at=t where id=p_case;
 update public.feture_moderation_appeals set state='resolved',resolved_at=t,decision_id=p_id where case_id=p_case and state='open';
 return jsonb_build_object('ok',true);
end $$;
create function public.feture_appeal_create(p_actor text,p_id uuid,p_case uuid,p_text text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare h text;a public.feture_moderation_appeals%rowtype;r public.feture_reports%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p_text is null or char_length(p_text) not between 1 and 1000 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 select * into r from public.feture_reports where id=p_case and subject_hash=p_actor;
 if not found or not exists(select 1 from public.feture_moderation_restrictions where account_hash=p_actor and case_id=p_case) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 h:=encode(sha256(convert_to(jsonb_build_object('actor',p_actor,'case',p_case,'text',p_text)::text,'UTF8')),'hex');
 select * into a from public.feture_moderation_appeals where id=p_id;
 if found then if a.author_hash<>p_actor or a.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;return jsonb_build_object('ok',true,'appealId',p_id);end if;
 if exists(select 1 from public.feture_moderation_appeals where author_hash=p_actor and case_id=p_case and state='open') then return jsonb_build_object('ok',false,'error','appeal_pending');end if;
 if (select count(*)>=5 from public.feture_moderation_appeals where author_hash=p_actor and created_at>clock_timestamp()-interval '1 day') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 insert into public.feture_moderation_appeals(id,case_id,author_hash,text,payload_hash) values(p_id,p_case,p_actor,p_text,h);
 return jsonb_build_object('ok',true,'appealId',p_id);
end $$;
create or replace function public.feture_peer_eligible(p_owner text) returns boolean language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.feture_verification_attempts a join public.feture_verification_policies p on (p.issuer,p.environment,p.version)=(a.issuer,a.environment,a.policy_version)
 where a.account_hash=p_owner and a.current and a.state='verified' and a.environment='production' and p.enabled and p.threshold=18
 and a.proof_expires_at>clock_timestamp() and a.proof_issued_at<=clock_timestamp() and a.proof_expires_at<=a.proof_issued_at+p.proof_lifetime_ms*interval '1 millisecond')
 and coalesce((public.feture_consent_status(p_owner,'ru')->>'accepted')::boolean,false)
 and not exists(select 1 from public.feture_moderation_restrictions where account_hash=p_owner and lifted_at is null and expires_at>clock_timestamp());
$$;
create or replace function public.feture_profile_preview(p_owner text,p_viewer text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not public.feture_peer_eligible(p_owner) or (p_viewer is not null and (p_viewer=p_owner or public.feture_pair_blocked(p_owner,p_viewer) or not public.feture_peer_eligible(p_viewer))) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 return jsonb_build_object('ok',true,'projection',public.feture_profile_visible(p_owner,p_viewer));
end $$;
create function public.feture_moderation_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$begin raise exception 'feture_immutable_moderation_audit';end $$;
create trigger feture_moderation_no_rewrite before update or delete on public.feture_moderation_decisions for each row execute function public.feture_moderation_immutable();
revoke all on function public.feture_report_create(text,uuid,uuid,text,text,text,boolean),public.feture_moderation_decide(uuid,uuid,bigint,text,text,integer),public.feture_appeal_create(text,uuid,uuid,text),public.feture_moderation_immutable() from public,anon,authenticated;
grant execute on function public.feture_report_create(text,uuid,uuid,text,text,text,boolean),public.feture_moderation_decide(uuid,uuid,bigint,text,text,integer),public.feture_appeal_create(text,uuid,uuid,text) to service_role;

create function public.feture_moderation_own(p_actor text,p_kind text,p_after uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare items jsonb;n integer;last_id uuid;restriction jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_kind is null or p_kind not in ('reports','appeals') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 with entries as (
 select r.id,jsonb_build_object('id',r.id,'caseId',r.id,'state',r.state,'createdAt',r.created_at) item from public.feture_reports r where p_kind='reports' and r.reporter_hash=p_actor
 union all
 select a.id,jsonb_build_object('id',a.id,'caseId',a.case_id,'state',a.state,'createdAt',a.created_at) from public.feture_moderation_appeals a where p_kind='appeals' and a.author_hash=p_actor),
 page as(select * from entries where p_after is null or id>p_after order by id limit 31),shown as(select * from page order by id limit 30)
 select coalesce((select jsonb_agg(item order by id) from shown),'[]'::jsonb),(select count(*) from page),(select id from shown order by id desc limit 1) into items,n,last_id;
 select jsonb_build_object('caseId',case_id,'state',state,'reason',reason,'expiresAt',expires_at,'active',lifted_at is null and expires_at>clock_timestamp()) into restriction from public.feture_moderation_restrictions where account_hash=p_actor;
 return jsonb_build_object('ok',true,'items',items,'nextCursor',case when n>30 then last_id else null end,'restriction',restriction);
end $$;
create function public.feture_moderation_queue(p_kind text,p_after uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare items jsonb;n integer;last_id uuid;priority_value integer;at_value timestamptz;
begin
 if p_kind is null or p_kind not in ('cases','appeals') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if p_after is not null then
  if p_kind='cases' then select priority,created_at into priority_value,at_value from public.feture_reports where id=p_after;
  else select r.priority,a.created_at into priority_value,at_value from public.feture_moderation_appeals a join public.feture_reports r on r.id=a.case_id where a.id=p_after;end if;
  if not found then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
 end if;
 with entries as (
  select r.id,r.priority,r.created_at,jsonb_build_object('id',r.id,'caseId',r.id,'targetId',r.target_id,'reason',r.reason,'note',r.note,'state',r.state,'revision',r.revision,'snapshot',r.snapshot,'priority',r.priority,'createdAt',r.created_at,'appealText',null) item
  from public.feture_reports r where p_kind='cases' and r.state in ('open','reviewing')
  union all
  select a.id,r.priority,a.created_at,jsonb_build_object('id',a.id,'caseId',r.id,'targetId',r.target_id,'reason',r.reason,'note',r.note,'state',r.state,'revision',r.revision,'snapshot',r.snapshot,'priority',r.priority,'createdAt',a.created_at,'appealText',a.text)
  from public.feture_moderation_appeals a join public.feture_reports r on r.id=a.case_id where p_kind='appeals' and a.state='open'
 ),page as(select * from entries where p_after is null or priority<priority_value or (priority=priority_value and (created_at>at_value or (created_at=at_value and id>p_after))) order by priority desc,created_at,id limit 31),
 shown as(select * from page order by priority desc,created_at,id limit 30)
 select coalesce((select jsonb_agg(item order by priority desc,created_at,id) from shown),'[]'::jsonb),(select count(*) from page),(select id from shown order by priority,created_at desc,id desc limit 1) into items,n,last_id;
 return jsonb_build_object('ok',true,'items',items,'nextCursor',case when n>30 then last_id else null end);
end $$;
revoke all on function public.feture_moderation_own(text,text,uuid),public.feture_moderation_queue(text,uuid) from public,anon,authenticated;
grant execute on function public.feture_moderation_own(text,text,uuid),public.feture_moderation_queue(text,uuid) to service_role;
