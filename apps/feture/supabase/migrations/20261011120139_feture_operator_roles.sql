-- O02.1: Core-authenticated operators for prelaunch QA only.
create table public.feture_operators (
 account_hash text primary key check(account_hash ~ '^[a-f0-9]{32}$'),
 role text check(role in ('manager','qa_operator','auditor')),
 revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp()
);
create table public.feture_operator_events (
 event_id bigint generated always as identity primary key,
 actor_hash text not null check(actor_hash ~ '^[a-f0-9]{32}$'),
 account_hash text not null check(account_hash ~ '^[a-f0-9]{32}$'),
 event_type text not null check(event_type in ('bootstrap','role_set')),
 role text check(role in ('manager','qa_operator','auditor')),revision integer not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.feture_operators enable row level security;
alter table public.feture_operator_events enable row level security;
revoke all on public.feture_operators,public.feture_operator_events from public,anon,authenticated,service_role;
alter table public.feture_qa_adult_events add column actor_hash text check(actor_hash ~ '^[a-f0-9]{32}$');
revoke select on public.feture_qa_adult_events from service_role;
create function public.feture_operator_command(p_actor text,p_bootstrap boolean,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare act text;my_role text;target text;new_role text;rev integer;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 select role into my_role from public.feture_operators where account_hash=p_actor;
 act:=p_command->>'action';
 if act in ('status','bootstrap') then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='set' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['accountHash','action','expectedRevision','role']::text[]
   or jsonb_typeof(p_command->'accountHash') is distinct from 'string' or p_command->>'accountHash' !~ '^[a-f0-9]{32}$'
   or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^[0-9]{1,9}$'
   or (p_command->'role' <> 'null'::jsonb and (jsonb_typeof(p_command->'role') is distinct from 'string' or p_command->>'role' not in ('manager','qa_operator','auditor')))
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act='bootstrap' then
  if p_bootstrap is distinct from true then return jsonb_build_object('ok',false,'error','forbidden');end if;
  if exists(select 1 from public.feture_operators) then return jsonb_build_object('ok',false,'error','already_initialized');end if;
  insert into public.feture_operators(account_hash,role,revision) values(p_actor,'manager',1);
  insert into public.feture_operator_events(actor_hash,account_hash,event_type,role,revision) values(p_actor,p_actor,'bootstrap','manager',1);
  my_role:='manager';
 elsif act='set' then
  if my_role is distinct from 'manager' then return jsonb_build_object('ok',false,'error','forbidden');end if;
  target:=p_command->>'accountHash';new_role:=p_command->>'role';
  select revision into rev from public.feture_operators where account_hash=target;rev:=coalesce(rev,0);
  if rev<>(p_command->>'expectedRevision')::integer then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  if new_role is distinct from 'manager' and exists(select 1 from public.feture_operators where account_hash=target and role='manager')
   and (select count(*) from public.feture_operators where role='manager')<2
  then return jsonb_build_object('ok',false,'error','last_manager');end if;
  if not exists(select 1 from public.feture_operators where account_hash=target and role is not distinct from new_role) then
   insert into public.feture_operators(account_hash,role,revision) values(target,new_role,rev+1)
   on conflict(account_hash) do update set role=excluded.role,revision=excluded.revision,updated_at=clock_timestamp();
   insert into public.feture_operator_events(actor_hash,account_hash,event_type,role,revision) values(p_actor,target,'role_set',new_role,rev+1);
  end if;
  select role into my_role from public.feture_operators where account_hash=p_actor;
 end if;
 return jsonb_build_object('ok',true,'role',my_role,'initialized',exists(select 1 from public.feture_operators),
  'events',case when my_role in ('manager','auditor') then coalesce((select jsonb_agg(x.value order by x.id desc) from
   (select event_id id,jsonb_build_object('actor',actor_hash,'accountHash',account_hash,'action',event_type,'role',role,'revision',revision,'at',created_at) value
    from public.feture_operator_events order by event_id desc limit 25) x),'[]'::jsonb) else '[]'::jsonb end,
  'items',case when my_role='manager' then coalesce((select jsonb_agg(x.value order by x.hash) from
   (select account_hash hash,jsonb_build_object('accountHash',account_hash,'role',role,'revision',revision) value
    from public.feture_operators order by account_hash limit 100) x),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke execute on function public.feture_operator_command(text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.feture_operator_command(text,boolean,jsonb) to service_role;

-- Remove the unattributed entrypoint; no key-only QA path remains.
drop function public.feture_qa_adult_admin(jsonb);
create or replace function public.feture_qa_adult_admin(p_actor text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare act text;owner text;duration integer;now_at timestamptz:=clock_timestamp();
 expires timestamptz;prev_revoked timestamptz;exists_row boolean;my_role text;
begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then return jsonb_build_object('ok',false,'error','not_prelaunch');end if;
 if jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if p_actor is null or p_actor !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 select role into my_role from public.feture_operators where account_hash=p_actor;
 act:=p_command->>'action';
 if my_role is null or (act in ('grant','revoke') and my_role not in ('manager','qa_operator'))
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if act='audit' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(x.value order by x.id desc) from
   (select event_id id,jsonb_build_object('account_hash',account_hash,'event_type',event_type,'expires_at',expires_at,
    'created_at',created_at,'actor_label',actor_label,'actor_hash',actor_hash) value
    from public.feture_qa_adult_events order by event_id desc limit 25) x),'[]'::jsonb));
 end if;
 if act='list' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'activeCount',(select count(*) from public.feture_qa_adult_access
   where revoked_at is null and expires_at>now_at),
   'items',coalesce((select jsonb_agg(r.value order by r.created desc) from
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
 elsif act in ('revoke','lookup') then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
   is distinct from array['accountHash','action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 owner:=p_command->>'accountHash';
 if owner is null or owner !~ '^[0-9a-f]{32}$' then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act='lookup' then
  return jsonb_build_object('ok',true,'entry',(
   select jsonb_build_object('accountHash',account_hash,'expiresAt',expires_at,'revoked',revoked_at is not null)
   from public.feture_qa_adult_access where account_hash=owner
  ));
 end if;
 -- A lock keeps grant/revoke ordered. No unbounded bulk access or self-service API.
 perform pg_advisory_xact_lock(hashtextextended('feture-qa-grants',0));
 if act='revoke' then
  select true,revoked_at into exists_row,prev_revoked from public.feture_qa_adult_access where account_hash=owner;
  if exists_row and prev_revoked is null then
   update public.feture_qa_adult_access set revoked_at=now_at where account_hash=owner and revoked_at is null;
   insert into public.feture_qa_adult_events(account_hash,event_type,actor_hash) values(owner,'revoke',p_actor);
  end if;
  return jsonb_build_object('ok',true,'revoked',true);
 end if;
 -- An existing Core account is checked by the guarded server adapter before
 -- this operation. No arbitrary email, self-declaration or client age flag works.
 insert into public.feture_profiles(account_hash) values(owner) on conflict(account_hash) do nothing;
 duration:=(p_command->>'days')::int;expires:=now_at+duration*interval '1 day';
 insert into public.feture_qa_adult_access(account_hash,expires_at,created_at,revoked_at)
 values(owner,expires,now_at,null)
 on conflict(account_hash) do update set expires_at=excluded.expires_at,created_at=excluded.created_at,revoked_at=null;
 insert into public.feture_qa_adult_events(account_hash,event_type,expires_at,actor_hash) values(owner,'grant',expires,p_actor);
 return jsonb_build_object('ok',true,'expiresAt',expires);
end $$;
revoke execute on function public.feture_qa_adult_admin(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_qa_adult_admin(text,jsonb) to service_role;
notify pgrst,'reload schema';
