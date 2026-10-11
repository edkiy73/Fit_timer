-- A04.qa follow-up: any existing Core account may be reviewed and granted
-- prelaunch QA access. There is no arbitrary cohort-size cap. Never grants
-- production age verification. Add an append-only operator-action ledger.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_qa_adult_events (
 event_id bigint generated always as identity primary key,
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 event_type text not null check(event_type in ('grant','revoke')),
 expires_at timestamptz,
 actor_label text not null default 'core-admin' check(actor_label='core-admin'),
 created_at timestamptz not null default clock_timestamp()
);
create index feture_qa_adult_events_owner on public.feture_qa_adult_events(account_hash,created_at desc);
alter table public.feture_qa_adult_events enable row level security;
revoke all on public.feture_qa_adult_events from public,anon,authenticated,service_role;
grant select on public.feture_qa_adult_events to service_role;

create or replace function public.feture_qa_adult_admin(p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare act text;owner text;duration integer;now_at timestamptz:=clock_timestamp();
 expires timestamptz;prev_revoked timestamptz;exists_row boolean;
begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then return jsonb_build_object('ok',false,'error','not_prelaunch');end if;
 if jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
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
   insert into public.feture_qa_adult_events(account_hash,event_type) values(owner,'revoke');
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
 insert into public.feture_qa_adult_events(account_hash,event_type,expires_at) values(owner,'grant',expires);
 return jsonb_build_object('ok',true,'expiresAt',expires);
end $$;
revoke execute on function public.feture_qa_adult_admin(jsonb) from public,anon,authenticated;
grant execute on function public.feture_qa_adult_admin(jsonb) to service_role;
notify pgrst,'reload schema';
