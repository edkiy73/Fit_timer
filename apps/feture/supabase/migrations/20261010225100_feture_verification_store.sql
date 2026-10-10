-- A04.3: no provider/policy is enabled by this migration. No Core tables change.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required'; end if;
end $$;
create table public.feture_verification_policies (
 issuer text not null check(issuer ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 environment text not null check(environment in ('sandbox','production')),
 version text not null check(version ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 threshold integer not null check(threshold=18),
 proof_lifetime_ms bigint not null check(proof_lifetime_ms between 60000 and 31622400000),
 attempt_lifetime_ms integer not null check(attempt_lifetime_ms between 60000 and 3600000),
 retention_days integer not null check(retention_days between 1 and 3650),
 enabled boolean not null default false,
 primary key(issuer,environment,version));
create table public.feture_verification_attempts (
 id uuid primary key,
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 issuer text not null, environment text not null, policy_version text not null,
 provider_reference text check(provider_reference ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 current boolean not null default true,
 state text not null default 'pending' check(state in ('pending','verified','rejected','revoked')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, last_event_at timestamptz,
 proof_issued_at timestamptz, proof_expires_at timestamptz,
 identity_verified boolean not null default false,
 foreign key(issuer,environment,policy_version) references public.feture_verification_policies(issuer,environment,version),
 unique(issuer,environment,provider_reference),
 check(expires_at>created_at),
 check((state='verified' and proof_issued_at is not null and proof_expires_at is not null and proof_expires_at>proof_issued_at and proof_issued_at>=created_at and proof_issued_at<expires_at)
    or (state<>'verified' and proof_issued_at is null and proof_expires_at is null and not identity_verified)));
create unique index feture_verification_current on public.feture_verification_attempts(account_hash) where current;
create index feture_verification_owner on public.feture_verification_attempts(account_hash,created_at);
create index feture_verification_expiry on public.feture_verification_attempts(expires_at);
create table public.feture_verification_events (
 issuer text not null, environment text not null, event_id text not null check(event_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 attempt_id uuid not null references public.feture_verification_attempts(id) on delete cascade,
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null default clock_timestamp(),
 primary key(issuer,environment,event_id));
create index feture_verification_events_attempt on public.feture_verification_events(attempt_id);
alter table public.feture_verification_policies enable row level security;
alter table public.feture_verification_attempts enable row level security;
alter table public.feture_verification_events enable row level security;
revoke all on public.feture_verification_policies,public.feture_verification_attempts,public.feture_verification_events from public,anon,authenticated,service_role;
grant select on public.feture_verification_policies to service_role;
grant select,insert,update,delete on public.feture_verification_attempts,public.feture_verification_events to service_role;

create function public.feture_verification_reserve(p_owner text,p_id uuid,p_issuer text,p_environment text,p_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.feture_verification_attempts%rowtype; p public.feture_verification_policies%rowtype; t timestamptz;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_id is null then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 select * into p from public.feture_verification_policies where issuer=p_issuer and environment=p_environment and version=p_version and enabled;
 if not found then return jsonb_build_object('ok',false,'error','verification_unavailable'); end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-verification-attempt:'||p_id::text,0));
 insert into public.feture_profiles(account_hash) values(p_owner) on conflict do nothing;
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 select * into a from public.feture_verification_attempts where id=p_id;
 if found then
  if a.account_hash<>p_owner or a.issuer<>p_issuer or a.environment<>p_environment or a.policy_version<>p_version or not a.current then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
  return jsonb_build_object('ok',true,'attempt',to_jsonb(a),'replayed',true);
 end if;
 -- Do not replace a valid proof with a pending request.
 if exists(select 1 from public.feture_verification_attempts where account_hash=p_owner and current and state='verified' and proof_expires_at>clock_timestamp() and issuer=p_issuer and environment=p_environment and policy_version=p_version) then
  return jsonb_build_object('ok',false,'error','already_verified');
 end if;
 update public.feture_verification_attempts set current=false where account_hash=p_owner and current;
 t:=clock_timestamp();
 insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,created_at,expires_at)
 values(p_id,p_owner,p_issuer,p_environment,p_version,t,t+p.attempt_lifetime_ms*interval '1 millisecond') returning * into a;
 return jsonb_build_object('ok',true,'attempt',to_jsonb(a),'replayed',false);
end $$;

create function public.feture_verification_bind(p_owner text,p_id uuid,p_reference text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.feture_verification_attempts%rowtype;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_reference is null or p_reference !~ '^[A-Za-z0-9_.:-]{1,160}$' then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 select * into a from public.feture_verification_attempts where id=p_id and account_hash=p_owner for update;
 if not found or not a.current or a.state<>'pending' or a.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
 if a.provider_reference is not null and a.provider_reference<>p_reference then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
 update public.feture_verification_attempts set provider_reference=p_reference where id=p_id returning * into a;
 return jsonb_build_object('ok',true,'attempt',to_jsonb(a));
end $$;

create function public.feture_verification_apply(p_event jsonb,p_digest text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.feture_verification_attempts%rowtype; p public.feture_verification_policies%rowtype;
 e public.feture_verification_events%rowtype; event_at timestamptz; t timestamptz; outcome text;
begin
 if jsonb_typeof(p_event) is distinct from 'object' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 if not(p_event ?& array['eventId','attemptId','providerReference','issuer','environment','policyVersion','threshold','occurredAt','outcome','adult','identity'])
 or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('eventId','attemptId','providerReference','issuer','environment','policyVersion','threshold','occurredAt','outcome','adult','identity'))
 or exists(select 1 from unnest(array['eventId','providerReference','issuer','policyVersion']) k where jsonb_typeof(p_event->k) is distinct from 'string' or p_event->>k !~ '^[A-Za-z0-9_.:-]{1,160}$')
 or jsonb_typeof(p_event->'attemptId') is distinct from 'string' or p_event->>'attemptId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or jsonb_typeof(p_event->'environment') is distinct from 'string' or p_event->>'environment' not in ('sandbox','production') or p_event->'threshold'<>'18'::jsonb
 or jsonb_typeof(p_event->'occurredAt') is distinct from 'number' or p_event->>'occurredAt' !~ '^[0-9]{1,16}$'
 or jsonb_typeof(p_event->'outcome') is distinct from 'string' or p_event->>'outcome' not in ('approved','rejected','revoked')
 or jsonb_typeof(p_event->'adult') is distinct from 'boolean' or jsonb_typeof(p_event->'identity') is distinct from 'boolean'
 then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 outcome:=p_event->>'outcome';
 if (outcome='approved' and p_event->'adult'<>'true'::jsonb) or (outcome<>'approved' and (p_event->'adult'<>'false'::jsonb or p_event->'identity'<>'false'::jsonb)) then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 t:=clock_timestamp();event_at:=to_timestamp((p_event->>'occurredAt')::numeric/1000);
 -- One global event key across owners, then one account row: duplicate first deliveries serialize.
 perform pg_advisory_xact_lock(hashtextextended('feture-verification-event:'||jsonb_build_array(p_event->>'issuer',p_event->>'environment',p_event->>'eventId')::text,0));
 select * into a from public.feture_verification_attempts where id=(p_event->>'attemptId')::uuid;
 if not found then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
 perform 1 from public.feture_profiles where account_hash=a.account_hash for update;
 if not found then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
 select * into a from public.feture_verification_attempts where id=(p_event->>'attemptId')::uuid for update;
 if not found or not a.current or a.provider_reference is null or a.provider_reference<>p_event->>'providerReference' or a.issuer<>p_event->>'issuer' or a.environment<>p_event->>'environment' or a.policy_version<>p_event->>'policyVersion' then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
 select * into p from public.feture_verification_policies where issuer=a.issuer and environment=a.environment and version=a.policy_version and enabled;
 if not found then return jsonb_build_object('ok',false,'error','verification_unavailable'); end if;
 select * into e from public.feture_verification_events where issuer=a.issuer and environment=a.environment and event_id=p_event->>'eventId';
 if found then
  if e.attempt_id<>a.id or e.digest<>p_digest then return jsonb_build_object('ok',false,'error','verification_event_conflict'); end if;
  return jsonb_build_object('ok',true,'attempt',to_jsonb(a),'replayed',true,'digest',e.digest);
 end if;
 if event_at<t-interval '5 minutes' or event_at>t+interval '30 seconds' or event_at<a.created_at or (a.last_event_at is not null and event_at<=a.last_event_at) then return jsonb_build_object('ok',false,'error','stale_verification_event'); end if;
 if outcome='revoked' then
  if a.state<>'verified' then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
  update public.feture_verification_attempts set state='revoked',proof_issued_at=null,proof_expires_at=null,identity_verified=false,last_event_at=event_at where id=a.id returning * into a;
 else
  if a.state<>'pending' or t>=a.expires_at or event_at>=a.expires_at then return jsonb_build_object('ok',false,'error','verification_conflict'); end if;
  update public.feture_verification_attempts set state=case when outcome='approved' then 'verified' else 'rejected' end,
   last_event_at=event_at,proof_issued_at=case when outcome='approved' then least(t,event_at) end,
   proof_expires_at=case when outcome='approved' then least(t,event_at)+p.proof_lifetime_ms*interval '1 millisecond' end,
   identity_verified=outcome='approved' and (p_event->>'identity')::boolean where id=a.id returning * into a;
 end if;
 insert into public.feture_verification_events(issuer,environment,event_id,attempt_id,digest) values(a.issuer,a.environment,p_event->>'eventId',a.id,p_digest);
 return jsonb_build_object('ok',true,'attempt',to_jsonb(a),'replayed',false,'digest',p_digest);
end $$;

-- Operator cleanup. Once an attempt is gone, its replay cannot resolve or reissue proof.
create function public.feture_verification_status(p_owner text,p_issuer text,p_environment text,p_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.feture_verification_attempts%rowtype; p public.feture_verification_policies%rowtype; s text; adult boolean:=false; until_at timestamptz;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 select * into p from public.feture_verification_policies where issuer=p_issuer and environment=p_environment and version=p_version and enabled;
 if not found then s:='unavailable';
 else
  select * into a from public.feture_verification_attempts where account_hash=p_owner and current and issuer=p_issuer and environment=p_environment and policy_version=p_version;
  if not found then s:='unverified';
  elsif a.state='verified' and a.proof_expires_at>clock_timestamp() and a.proof_issued_at<=clock_timestamp() and a.proof_expires_at<=a.proof_issued_at+p.proof_lifetime_ms*interval '1 millisecond' then s:='verified';adult:=true;until_at:=a.proof_expires_at;
  elsif a.state='verified' then s:='expired';
  elsif a.state='pending' then s:=case when a.expires_at<=clock_timestamp() then 'expired' else 'pending' end;
  elsif a.state='rejected' then s:='rejected';
  else s:='unverified'; end if;
 end if;
 return jsonb_build_object('ok',true,'status',jsonb_build_object('state',s,'verifiedAdult',adult,'validUntil',until_at));
end $$;
create function public.feture_verification_purge()
returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n bigint;
begin
 delete from public.feture_verification_attempts a using public.feture_verification_policies p
 where a.issuer=p.issuer and a.environment=p.environment and a.policy_version=p.version
 and greatest(a.expires_at,coalesce(a.proof_expires_at,a.expires_at),coalesce(a.last_event_at,a.expires_at)) < clock_timestamp()-p.retention_days*interval '1 day';
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.feture_verification_reserve(text,uuid,text,text,text),public.feture_verification_bind(text,uuid,text),public.feture_verification_apply(jsonb,text),public.feture_verification_status(text,text,text,text),public.feture_verification_purge() from public,anon,authenticated;
grant execute on function public.feture_verification_reserve(text,uuid,text,text,text),public.feture_verification_bind(text,uuid,text),public.feture_verification_apply(jsonb,text),public.feture_verification_status(text,text,text,text) to service_role;
revoke all on function public.feture_verification_purge() from service_role;
