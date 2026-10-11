-- A04.qa — admin-issued PRELAUNCH-ONLY test access; not provider verification.
-- Never store an ID, image, DOB or a user's claim of age. All grants default absent.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_qa_adult_access (
 account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '3 days')
);
alter table public.feture_qa_adult_access enable row level security;
revoke all on public.feture_qa_adult_access from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_qa_adult_access to service_role;

create function public.feture_qa_adult_until(p_owner text)
returns timestamptz language sql volatile security definer set search_path=pg_catalog,public as $$
 select max(a.expires_at) from public.feture_qa_adult_access a
 where a.account_hash=p_owner and a.revoked_at is null and a.expires_at>clock_timestamp()
 and exists(select 1 from feture_seed.environment e
  where e.singleton and e.project_ref='anrhayozrhrmiwexmbhw' and e.stage='prelaunch');
$$;
revoke execute on function public.feture_qa_adult_until(text) from public,anon,authenticated;
grant execute on function public.feture_qa_adult_until(text) to service_role;

-- Internal DB eligibility uses the same short-lived QA entitlement as the Core
-- actor gate, and still independently requires current RU legal consent.
create or replace function public.feture_peer_eligible(p_owner text)
returns boolean language sql volatile security invoker set search_path=pg_catalog,public as $$
 select (
  exists(select 1 from public.feture_verification_attempts a
   join public.feture_verification_policies p on (p.issuer,p.environment,p.version)=(a.issuer,a.environment,a.policy_version)
   where a.account_hash=p_owner and a.current and a.state='verified' and a.environment='production' and p.enabled and p.threshold=18
   and a.proof_expires_at>clock_timestamp() and a.proof_issued_at<=clock_timestamp()
   and a.proof_expires_at<=a.proof_issued_at+p.proof_lifetime_ms*interval '1 millisecond')
  or public.feture_qa_adult_until(p_owner) is not null
 ) and coalesce((public.feture_consent_status(p_owner,'ru')->>'accepted')::boolean,false);
$$;

-- Restricted Core-admin RPC: operator must use authenticated Core admin API,
-- never a client key. Scoped to prelaunch, max 12 live entitlements and 3 days.
create function public.feture_qa_adult_admin(p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare act text;owner text;duration integer;now_at timestamptz:=clock_timestamp();expires timestamptz;
begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then return jsonb_build_object('ok',false,'error','not_prelaunch');end if;
 if jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
 if act='list' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(r.value order by r.created desc) from
    (select created_at created,jsonb_build_object('accountHash',account_hash,'expiresAt',expires_at,'revoked',revoked_at is not null) value
     from public.feture_qa_adult_access order by created_at desc limit 25) r),'[]'::jsonb));
 end if;
 if act='grant' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
    is distinct from array['accountHash','action','days','reviewed']::text[]
    or p_command->'reviewed' is distinct from 'true'::jsonb
    or jsonb_typeof(p_command->'days') is distinct from 'number'
    or p_command->>'days' not in ('1','2','3')
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='revoke' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
   is distinct from array['accountHash','action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 owner:=p_command->>'accountHash';
 if owner is null or owner !~ '^[0-9a-f]{32}$' then
 return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-qa-grants',0));
 if act='revoke' then
  update public.feture_qa_adult_access set revoked_at=coalesce(revoked_at,now_at)
   where account_hash=owner;
  return jsonb_build_object('ok',true,'revoked',true);
 end if;
 -- The Core-admin adapter already checked the canonical account/device record.
 -- Provision the FetUre owner row only for this specifically authorized account.
 insert into public.feture_profiles(account_hash) values(owner) on conflict(account_hash) do nothing;
 if (select count(*) from public.feture_qa_adult_access where revoked_at is null and expires_at>now_at
      and account_hash<>owner)>=12
 then return jsonb_build_object('ok',false,'error','capacity');end if;
 duration:=(p_command->>'days')::int;expires:=now_at+duration*interval '1 day';
 insert into public.feture_qa_adult_access(account_hash,expires_at,created_at,revoked_at)
 values(owner,expires,now_at,null)
 on conflict(account_hash) do update set expires_at=excluded.expires_at,created_at=excluded.created_at,revoked_at=null;
 return jsonb_build_object('ok',true,'expiresAt',expires);
end $$;
revoke execute on function public.feture_qa_adult_admin(jsonb) from public,anon,authenticated;
grant execute on function public.feture_qa_adult_admin(jsonb) to service_role;
notify pgrst,'reload schema';
