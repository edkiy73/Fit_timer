-- A06: owner-only private profile. No DOB, coordinates or discovery opt-in here.
do $$ begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required'; end if; end $$;
create function public.feture_profile_data_valid(p_data jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare k text;v jsonb;max_length integer;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or not(p_data ?& array['nickname','about','pronouns','identity','orientation','relationships','city']) or (select count(*)<>7 from jsonb_object_keys(p_data)) then return false; end if;
 for k,v in select * from jsonb_each(p_data) loop
  max_length:=case k when 'nickname' then 80 when 'about' then 2000 when 'city' then 120 else 160 end;
  if jsonb_typeof(v) is distinct from 'string' or char_length(v#>>'{}')>max_length or (case when k='about' then replace(v#>>'{}',chr(10),'') else v#>>'{}' end) ~ '[[:cntrl:]]' then return false;end if;
 end loop;return true;
end $$;
create table public.feture_profile_details (
 account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,
 profile_id uuid not null unique default gen_random_uuid(),
 data jsonb not null check(public.feture_profile_data_valid(data)),
 revision bigint not null check(revision between 1 and 9007199254740991),updated_at timestamptz not null default clock_timestamp());
create table public.feture_profile_operations (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,operation_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),applied_revision bigint not null check(applied_revision>0),applied_at timestamptz not null,
 primary key(account_hash,operation_id));
alter table public.feture_profile_details enable row level security;
alter table public.feture_profile_operations enable row level security;
revoke all on public.feture_profile_details,public.feture_profile_operations from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_profile_details to service_role;
grant select,insert,delete on public.feture_profile_operations to service_role;
create function public.feture_profile_save(p_owner text,p_operation uuid,p_expected bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.feture_profile_details%rowtype;r public.feture_profile_operations%rowtype;h text;t timestamptz;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_operation is null or p_operation::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or p_expected is null or p_expected<0 or p_expected>=9007199254740991 or not public.feture_profile_data_valid(p_data) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 insert into public.feture_profiles(account_hash) values(p_owner) on conflict do nothing;
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 select * into d from public.feture_profile_details where account_hash=p_owner;
 h:=encode(sha256(convert_to(jsonb_build_object('expected',p_expected,'data',p_data)::text,'UTF8')),'hex');
 select * into r from public.feture_profile_operations where account_hash=p_owner and operation_id=p_operation;
 if found then
  if r.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'replayed',true,'profile',to_jsonb(d),'appliedRevision',r.applied_revision);
 end if;
 if coalesce(d.revision,0)<>p_expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 t:=clock_timestamp();
 insert into public.feture_profile_details(account_hash,data,revision,updated_at) values(p_owner,p_data,p_expected+1,t)
 on conflict(account_hash) do update set data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at returning * into d;
 insert into public.feture_profile_operations values(p_owner,p_operation,h,d.revision,t);
 return jsonb_build_object('ok',true,'replayed',false,'profile',to_jsonb(d),'appliedRevision',d.revision);
end $$;
revoke all on function public.feture_profile_data_valid(jsonb),public.feture_profile_save(text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.feture_profile_data_valid(jsonb),public.feture_profile_save(text,uuid,bigint,jsonb) to service_role;
