-- P01/P04 + blocking prerequisite: exact server projections and revocable grants.
do $$ begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required'; end if; end $$;
create unique index feture_one_production_age_policy on public.feture_verification_policies(environment) where environment='production' and enabled;
create function public.feture_profile_fields_valid(p text[]) returns boolean language sql immutable security invoker set search_path=pg_catalog as $$
 select p is not null and cardinality(p)<=7 and cardinality(p)=(select count(distinct x) from unnest(p) x)
 and not exists(select 1 from unnest(p) x where x is null or x not in ('nickname','about','pronouns','identity','orientation','relationships','city'));
$$;
alter table public.feture_profile_details add public_fields text[] not null default '{}' check(public.feture_profile_fields_valid(public_fields)),
 add granted_fields text[] not null default '{}' check(public.feture_profile_fields_valid(granted_fields)),
 add disclosure_revision bigint not null default 0 check(disclosure_revision between 0 and 9007199254740991),
 add constraint feture_profile_disjoint_visibility check(not(public_fields && granted_fields));
create table public.feture_blocks (
 blocker_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 blocked_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),primary key(blocker_hash,blocked_hash),check(blocker_hash<>blocked_hash));
create index feture_blocks_reverse on public.feture_blocks(blocked_hash,blocker_hash);
create function public.feture_pair_blocked(a text,b text) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.feture_blocks where (blocker_hash=a and blocked_hash=b) or (blocker_hash=b and blocked_hash=a));
$$;
create function public.feture_peer_eligible(p_owner text) returns boolean language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.feture_verification_attempts a join public.feture_verification_policies p on (p.issuer,p.environment,p.version)=(a.issuer,a.environment,a.policy_version)
 where a.account_hash=p_owner and a.current and a.state='verified' and a.environment='production' and p.enabled and p.threshold=18
 and a.proof_expires_at>clock_timestamp() and a.proof_issued_at<=clock_timestamp() and a.proof_expires_at<=a.proof_issued_at+p.proof_lifetime_ms*interval '1 millisecond')
 and coalesce((public.feture_consent_status(p_owner,'ru')->>'accepted')::boolean,false);
$$;
create function public.feture_scopes_valid(p text[]) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select p is not null and cardinality(p)<=30 and cardinality(p)=(select count(distinct x) from unnest(p) x)
 and not exists(select 1 from unnest(p) x where x is null or not(x=any(array['profile:nickname','profile:about','profile:pronouns','profile:identity','profile:orientation','profile:relationships','profile:city']) or exists(select 1 from public.feture_interests i where x='interest:'||i.id)));
$$;
create table public.feture_access_requests (
 id uuid primary key,owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 viewer_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 requested_scopes text[] not null check(public.feture_scopes_valid(requested_scopes)),requested_message boolean not null default false,payload_hash text not null,
 state text not null default 'pending' check(state in ('pending','approved','declined','cancelled','expired')),
 decision_hash text,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '7 days',
 check(owner_hash<>viewer_hash),check(cardinality(requested_scopes)<=30),check(payload_hash ~ '^[a-f0-9]{64}$'),check(decision_hash is null or decision_hash ~ '^[a-f0-9]{64}$'));
create index feture_access_requests_owner on public.feture_access_requests(owner_hash,created_at desc,id);
create index feture_access_requests_viewer on public.feture_access_requests(viewer_hash,created_at desc,id);
create unique index feture_access_one_pending on public.feture_access_requests(owner_hash,viewer_hash) where state='pending';
create table public.feture_scoped_grants (
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 viewer_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 request_id uuid not null unique references public.feture_access_requests(id) on delete cascade,
 scopes text[] not null check(public.feture_scopes_valid(scopes)),can_message boolean not null default false,
 granted_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,revoked_at timestamptz,
 primary key(owner_hash,viewer_hash),check(owner_hash<>viewer_hash),check(expires_at>granted_at and expires_at<=granted_at+interval '90 days'),check(cardinality(scopes)<=30));
create index feture_scoped_grants_viewer on public.feture_scoped_grants(viewer_hash,owner_hash);
alter table public.feture_blocks enable row level security;
alter table public.feture_access_requests enable row level security;
alter table public.feture_scoped_grants enable row level security;
revoke all on public.feture_blocks,public.feture_access_requests,public.feture_scoped_grants from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_blocks to service_role;
grant select,insert,update,delete on public.feture_access_requests,public.feture_scoped_grants to service_role;

create function public.feture_access_request(p_viewer text,p_target uuid,p_id uuid,p_scopes text[],p_message boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare owner_key text;r public.feture_access_requests%rowtype;h text;s text[];
begin
 if p_viewer is null or p_viewer !~ '^[a-f0-9]{32}$' or p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or not public.feture_scopes_valid(p_scopes) or p_message is null or (cardinality(p_scopes)=0 and not p_message) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select account_hash into owner_key from public.feture_profile_details where profile_id=p_target;
 if owner_key is null or owner_key=p_viewer then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 perform 1 from public.feture_profiles where account_hash in (owner_key,p_viewer) order by account_hash for update;
 if public.feture_pair_blocked(owner_key,p_viewer) or not public.feture_peer_eligible(owner_key) or not public.feture_peer_eligible(p_viewer) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 s:=array(select x from unnest(p_scopes) x order by x);h:=encode(sha256(convert_to(jsonb_build_object('viewer',p_viewer,'target',p_target,'scopes',s,'message',p_message)::text,'UTF8')),'hex');
 select * into r from public.feture_access_requests where id=p_id;
 if found then
  if r.payload_hash<>h or r.viewer_hash<>p_viewer then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'requestId',r.id);
 end if;
 update public.feture_access_requests set state='expired' where owner_hash=owner_key and viewer_hash=p_viewer and state='pending' and expires_at<=clock_timestamp();
 select * into r from public.feture_access_requests where owner_hash=owner_key and viewer_hash=p_viewer and state='pending';
 if found then return jsonb_build_object('ok',false,'error','request_pending');end if;
 insert into public.feture_access_requests(id,owner_hash,viewer_hash,requested_scopes,requested_message,payload_hash) values(p_id,owner_key,p_viewer,s,p_message,h);
 return jsonb_build_object('ok',true,'requestId',p_id);
end $$;
create function public.feture_access_decide(p_owner text,p_id uuid,p_decision text,p_scopes text[],p_message boolean,p_days integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.feture_access_requests%rowtype;h text;s text[];t timestamptz;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_decision is null or p_decision not in ('approve','decline') or not public.feture_scopes_valid(p_scopes) or p_message is null or p_days is null or p_days not between 1 and 90 or (p_decision='decline' and (cardinality(p_scopes)>0 or p_message)) or (p_decision='approve' and cardinality(p_scopes)=0 and not p_message) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select * into r from public.feture_access_requests where id=p_id and owner_hash=p_owner;
 if not found then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 perform 1 from public.feture_profiles where account_hash in (r.owner_hash,r.viewer_hash) order by account_hash for update;
 select * into r from public.feture_access_requests where id=p_id for update;
 if public.feture_pair_blocked(r.owner_hash,r.viewer_hash) or not public.feture_peer_eligible(r.owner_hash) or not public.feture_peer_eligible(r.viewer_hash) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 s:=array(select x from unnest(p_scopes) x order by x);h:=encode(sha256(convert_to(jsonb_build_object('decision',p_decision,'scopes',s,'message',p_message,'days',p_days)::text,'UTF8')),'hex');
 if r.decision_hash=h then return jsonb_build_object('ok',true);end if;
 if r.state<>'pending' or r.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','request_closed');end if;
 if not(s<@r.requested_scopes) or (p_message and not r.requested_message) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if p_decision='approve' and exists(select 1 from unnest(s) scope where
  (scope like 'profile:%' and not exists(select 1 from public.feture_profile_details d where d.account_hash=p_owner and substring(scope from 9)=any(d.granted_fields))) or
  (scope like 'interest:%' and not exists(select 1 from public.feture_interest_states i where i.account_hash=p_owner and i.interest_id=substring(scope from 10) and i.visibility='granted' and not i.deleted))) then return jsonb_build_object('ok',false,'error','scope_not_available');end if;
 t:=clock_timestamp();update public.feture_access_requests set state=case p_decision when 'approve' then 'approved' else 'declined' end,decision_hash=h where id=p_id;
 if p_decision='approve' then
  insert into public.feture_scoped_grants(owner_hash,viewer_hash,request_id,scopes,can_message,granted_at,expires_at) values(p_owner,r.viewer_hash,p_id,s,p_message,t,t+p_days*interval '1 day')
  on conflict(owner_hash,viewer_hash) do update set request_id=excluded.request_id,scopes=excluded.scopes,can_message=excluded.can_message,granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=null;
 end if;return jsonb_build_object('ok',true);
end $$;
create function public.feture_access_close(p_actor text,p_id uuid,p_kind text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.feture_access_requests%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select * into r from public.feture_access_requests where id=p_id;
 if not found or p_kind is null or p_kind not in ('cancel','revoke') or (p_kind='cancel' and r.viewer_hash<>p_actor) or (p_kind='revoke' and r.owner_hash<>p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 perform 1 from public.feture_profiles where account_hash in (r.owner_hash,r.viewer_hash) order by account_hash for update;
 if p_kind='cancel' then update public.feture_access_requests set state='cancelled' where id=p_id and state='pending';
 else update public.feture_scoped_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where request_id=p_id and owner_hash=p_actor;end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.feture_profile_disclosure(p_owner text,p_expected bigint,p_public text[],p_granted text[]) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n bigint;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not public.feture_profile_fields_valid(p_public) or not public.feture_profile_fields_valid(p_granted) or p_public&&p_granted or p_expected is null or p_expected<0 or p_expected>=9007199254740991 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 update public.feture_profile_details set public_fields=p_public,granted_fields=p_granted,disclosure_revision=disclosure_revision+1 where account_hash=p_owner and disclosure_revision=p_expected returning disclosure_revision into n;
 if not found then return jsonb_build_object('ok',false,'error','revision_conflict');end if;return jsonb_build_object('ok',true,'revision',n);
end $$;
create function public.feture_block_set(p_actor text,p_target uuid,p_blocked boolean) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare other_key text;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select account_hash into other_key from public.feture_profile_details where profile_id=p_target;
 if other_key is null or other_key=p_actor or p_blocked is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 insert into public.feture_profiles(account_hash) values(p_actor) on conflict do nothing;
 perform 1 from public.feture_profiles where account_hash in (p_actor,other_key) order by account_hash for update;
 if p_blocked then
  insert into public.feture_blocks(blocker_hash,blocked_hash) values(p_actor,other_key) on conflict do nothing;
  update public.feture_scoped_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where (owner_hash=p_actor and viewer_hash=other_key) or (owner_hash=other_key and viewer_hash=p_actor);
  update public.feture_access_requests set state='cancelled' where state='pending' and ((owner_hash=p_actor and viewer_hash=other_key) or (owner_hash=other_key and viewer_hash=p_actor));
 else delete from public.feture_blocks where blocker_hash=p_actor and blocked_hash=other_key;end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.feture_profile_visible(p_owner text,p_viewer text) returns jsonb language sql volatile security invoker set search_path=pg_catalog,public as $$
 with g as (select scopes,can_message from public.feture_scoped_grants where owner_hash=p_owner and viewer_hash=p_viewer and revoked_at is null and expires_at>clock_timestamp()),
 fields as (select coalesce(jsonb_object_agg(f.key,f.value),'{}'::jsonb) data from public.feture_profile_details d cross join lateral jsonb_each(d.data) f where d.account_hash=p_owner
 and (f.key=any(d.public_fields) or (f.key=any(d.granted_fields) and 'profile:'||f.key=any(coalesce((select scopes from g),'{}'::text[]))))),
 interests as (select coalesce(jsonb_agg(jsonb_build_object('interestId',i.interest_id,'stance',i.stance,'experience',i.experience,'boundary',i.boundary,'boundaryNote',i.boundary_note,'intensity',i.intensity) order by i.interest_id),'[]'::jsonb) data from public.feture_interest_states i where i.account_hash=p_owner and not i.deleted
 and (i.visibility='public' or (i.visibility='granted' and 'interest:'||i.interest_id=any(coalesce((select scopes from g),'{}'::text[])))))
 select jsonb_build_object('fields',(select data from fields),'interests',(select data from interests),'canMessage',coalesce((select can_message from g),false));
$$;
create function public.feture_profile_project(p_viewer text,p_target uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare owner_key text;
begin
 select account_hash into owner_key from public.feture_profile_details where profile_id=p_target;
 if owner_key is null or public.feture_pair_blocked(owner_key,p_viewer) or not public.feture_peer_eligible(owner_key) or not public.feture_peer_eligible(p_viewer) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 return jsonb_build_object('ok',true,'id',p_target,'isOwner',owner_key=p_viewer,'projection',public.feture_profile_visible(owner_key,case when owner_key=p_viewer then null else p_viewer end));
end $$;
create function public.feture_profile_preview(p_owner text,p_viewer text) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if p_viewer is not null and (p_viewer=p_owner or public.feture_pair_blocked(p_owner,p_viewer) or not public.feture_peer_eligible(p_viewer)) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 return jsonb_build_object('ok',true,'projection',public.feture_profile_visible(p_owner,p_viewer));
end $$;
revoke all on function public.feture_profile_preview(text,text) from public,anon,authenticated;
grant execute on function public.feture_profile_preview(text,text) to service_role;
create function public.feture_access_list(p_actor text,p_kind text,p_after uuid,p_limit integer) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare items jsonb;last_id uuid;n integer;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_kind is null or p_kind not in ('requests','grants','blocks') or p_limit is null or p_limit not between 1 and 30 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 with records as (
  select r.id,jsonb_build_object('id',r.id,'peerId',d.profile_id,'direction',case when r.owner_hash=p_actor then 'incoming' else 'outgoing' end,
  'scopes',r.requested_scopes,'canMessage',r.requested_message,'state',case when r.state='pending' and r.expires_at<=clock_timestamp() then 'expired' else r.state end,'expiresAt',r.expires_at) item
  from public.feture_access_requests r join public.feture_profile_details d on d.account_hash=case when r.owner_hash=p_actor then r.viewer_hash else r.owner_hash end
  where p_kind='requests' and (r.owner_hash=p_actor or r.viewer_hash=p_actor)
  union all
  select g.request_id,jsonb_build_object('id',g.request_id,'peerId',d.profile_id,'direction',case when g.owner_hash=p_actor then 'outgoing' else 'incoming' end,
  'scopes',g.scopes,'canMessage',g.can_message,'state',case when g.revoked_at is not null then 'revoked' when g.expires_at<=clock_timestamp() then 'expired' else 'active' end,'expiresAt',g.expires_at)
  from public.feture_scoped_grants g join public.feture_profile_details d on d.account_hash=case when g.owner_hash=p_actor then g.viewer_hash else g.owner_hash end
  where p_kind='grants' and (g.owner_hash=p_actor or g.viewer_hash=p_actor)
  union all
  select d.profile_id,jsonb_build_object('id',d.profile_id,'peerId',d.profile_id,'direction','outgoing','scopes','[]'::jsonb,'canMessage',false,'state','blocked','expiresAt',null)
  from public.feture_blocks b join public.feture_profile_details d on d.account_hash=b.blocked_hash where p_kind='blocks' and b.blocker_hash=p_actor
 ), page as(select * from records where p_after is null or id>p_after order by id limit p_limit+1),shown as(select * from page order by id limit p_limit)
 select coalesce((select jsonb_agg(item order by id) from shown),'[]'::jsonb),(select id from shown order by id desc limit 1),(select count(*) from page) into items,last_id,n;
 return jsonb_build_object('ok',true,'items',items,'nextCursor',case when n>p_limit then last_id else null end);
end $$;
revoke all on function public.feture_access_list(text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.feture_access_list(text,text,uuid,integer) to service_role;
-- Helpers never become public endpoints; service-role only after fresh Core actor checks.
revoke all on function public.feture_profile_fields_valid(text[]),public.feture_pair_blocked(text,text),public.feture_peer_eligible(text),public.feture_scopes_valid(text[]),public.feture_access_request(text,uuid,uuid,text[],boolean),public.feture_access_decide(text,uuid,text,text[],boolean,integer),public.feture_access_close(text,uuid,text),public.feture_profile_disclosure(text,bigint,text[],text[]),public.feture_block_set(text,uuid,boolean),public.feture_profile_visible(text,text),public.feture_profile_project(text,uuid) from public,anon,authenticated;
grant execute on function public.feture_profile_fields_valid(text[]),public.feture_pair_blocked(text,text),public.feture_peer_eligible(text),public.feture_scopes_valid(text[]),public.feture_access_request(text,uuid,uuid,text[],boolean),public.feture_access_decide(text,uuid,text,text[],boolean,integer),public.feture_access_close(text,uuid,text),public.feture_profile_disclosure(text,bigint,text[],text[]),public.feture_block_set(text,uuid,boolean),public.feture_profile_visible(text,text),public.feture_profile_project(text,uuid) to service_role;
