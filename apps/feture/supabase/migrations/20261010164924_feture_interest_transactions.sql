-- A02/A03 server foundation. Deliberately refuses nonempty or live data.
lock table public.feture_interest_states in access exclusive mode;
do $$ begin
  if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then
    raise exception 'feture_prelaunch_required';
  end if;
  if exists(select 1 from public.feture_interest_states) then raise exception 'feture_interest_reset_requires_review'; end if;
end $$;

alter table public.feture_interest_states drop column status;
alter table public.feture_interest_states drop constraint feture_interest_states_intensity_check;
alter table public.feture_interest_states
  add column stance text not null default 'unknown' check(stance in ('unknown','curious','fantasy','want_to_try','not_interested')),
  add column experience text not null default 'unspecified' check(experience in ('unspecified','none','tried','ongoing')),
  add column boundary text not null default 'none' check(boundary in ('none','conditional','hard')),
  add column boundary_note text check(char_length(boundary_note)<=1000),
  add column use_for_discovery boolean not null default false,
  add column revision bigint not null check(revision between 1 and 9007199254740991),
  add column source text not null default 'manual' check(source in ('manual','test')),
  add column test_version uuid,
  add column deleted boolean not null default false,
  add constraint feture_interest_intensity check(intensity is null or (intensity between 1 and 5 and stance in ('curious','fantasy','want_to_try') and boundary<>'hard')),
  add constraint feture_interest_conditions check(boundary_note is null or boundary='conditional'),
  add constraint feture_interest_source check((source='manual' and test_version is null) or (source='test' and test_version is not null)),
  add constraint feture_interest_tombstone check(not deleted or (stance='unknown' and experience='unspecified' and boundary='none' and boundary_note is null and intensity is null and visibility='private' and not use_for_discovery and source='manual' and test_version is null));

-- Receipts contain a fingerprint and revision, never a second copy of answers/notes.
create table public.feture_interest_operations (
  account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
  operation_id uuid not null,
  interest_id text not null references public.feture_interests(id),
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  applied_revision bigint not null check(applied_revision between 1 and 9007199254740991),
  applied_at timestamptz not null,
  primary key(account_hash,operation_id));
create index feture_interest_operations_interest on public.feture_interest_operations(interest_id,account_hash);
alter table public.feture_interest_operations enable row level security;
revoke all on public.feture_interest_operations from public,anon,authenticated;
grant select,insert on public.feture_interest_operations to service_role;
revoke all on public.feture_interest_states from public,anon,authenticated;

create function public.feture_interest_mutate(p_owner text,p_operation uuid,p_interest text,p_expected bigint,p_kind text,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_state jsonb; v_hash text; v_entry jsonb; v_receipt public.feture_interest_operations%rowtype;
  v_revision bigint; v_now timestamptz;
begin
  -- Core server identity is authoritative; this RPC is not callable with a client key.
  if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_operation is null
    or p_interest is null or p_interest !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$'
    or p_expected is null or p_expected<0 or p_expected>=9007199254740991
    or p_kind is null or p_kind not in ('set','delete') then
    return jsonb_build_object('ok',false,'error','invalid_request');
  end if;
  if not exists(select 1 from public.feture_interests where id=p_interest) then
    return jsonb_build_object('ok',false,'error','interest_not_found');
  end if;
  if p_kind='delete' then
    if p_state is not null and p_state<>'null'::jsonb then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
    v_state:=jsonb_build_object('stance','unknown','experience','unspecified','boundary','none','boundaryNote',null,'intensity',null,'visibility','private','useForDiscovery',false);
  else
    if jsonb_typeof(p_state) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
    if exists(select 1 from jsonb_object_keys(p_state) k where k not in ('stance','experience','boundary','boundaryNote','intensity','visibility','useForDiscovery'))
      or not(p_state ?& array['stance','experience','boundary','intensity'])
      or jsonb_typeof(p_state->'stance') is distinct from 'string' or p_state->>'stance' not in ('unknown','curious','fantasy','want_to_try','not_interested')
      or jsonb_typeof(p_state->'experience') is distinct from 'string' or p_state->>'experience' not in ('unspecified','none','tried','ongoing')
      or jsonb_typeof(p_state->'boundary') is distinct from 'string' or p_state->>'boundary' not in ('none','conditional','hard')
      or (p_state ? 'visibility' and (jsonb_typeof(p_state->'visibility') is distinct from 'string' or p_state->>'visibility' not in ('private','public','granted')))
      or (p_state ? 'useForDiscovery' and jsonb_typeof(p_state->'useForDiscovery') is distinct from 'boolean')
      or (p_state ? 'boundaryNote' and jsonb_typeof(p_state->'boundaryNote') not in ('null','string'))
      or char_length(p_state->>'boundaryNote')>1000
      or (p_state->>'boundaryNote' is not null and p_state->>'boundary'<>'conditional')
      or (p_state->'intensity'<>'null'::jsonb and (jsonb_typeof(p_state->'intensity') is distinct from 'number' or p_state->>'intensity' !~ '^[1-5]$' or p_state->>'stance' not in ('curious','fantasy','want_to_try') or p_state->>'boundary'='hard')) then
      return jsonb_build_object('ok',false,'error','invalid_request');
    end if;
    v_state:=jsonb_build_object('stance',p_state->>'stance','experience',p_state->>'experience','boundary',p_state->>'boundary','boundaryNote',p_state->>'boundaryNote','intensity',p_state->'intensity','visibility',coalesce(p_state->>'visibility','private'),'useForDiscovery',coalesce((p_state->>'useForDiscovery')::boolean,false));
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('interest',p_interest,'expected',p_expected,'kind',p_kind,'state',v_state)::text,'UTF8')),'hex');

  -- One owner lock serializes first creation, competing devices and operation IDs.
  insert into public.feture_profiles(account_hash) values(p_owner) on conflict do nothing;
  perform 1 from public.feture_profiles where account_hash=p_owner for update;
  select * into v_receipt from public.feture_interest_operations where account_hash=p_owner and operation_id=p_operation;
  select to_jsonb(s) into v_entry from public.feture_interest_states s where account_hash=p_owner and interest_id=p_interest;
  if v_receipt.operation_id is not null then
    if v_receipt.request_hash<>v_hash then return jsonb_build_object('ok',false,'error','operation_conflict'); end if;
    return jsonb_build_object('ok',true,'replayed',true,'appliedRevision',v_receipt.applied_revision,'appliedAt',v_receipt.applied_at,'entry',v_entry);
  end if;
  v_revision:=coalesce((v_entry->>'revision')::bigint,0);
  if v_revision<>p_expected then return jsonb_build_object('ok',false,'error','revision_conflict','entry',v_entry); end if;
  v_now:=clock_timestamp();
  insert into public.feture_interest_states(account_hash,interest_id,stance,experience,boundary,boundary_note,intensity,visibility,use_for_discovery,revision,source,test_version,deleted,updated_at)
  values(p_owner,p_interest,v_state->>'stance',v_state->>'experience',v_state->>'boundary',v_state->>'boundaryNote',(v_state->>'intensity')::smallint,v_state->>'visibility',(v_state->>'useForDiscovery')::boolean,v_revision+1,'manual',null,p_kind='delete',v_now)
  on conflict(account_hash,interest_id) do update set stance=excluded.stance,experience=excluded.experience,boundary=excluded.boundary,boundary_note=excluded.boundary_note,intensity=excluded.intensity,visibility=excluded.visibility,use_for_discovery=excluded.use_for_discovery,revision=excluded.revision,source=excluded.source,test_version=excluded.test_version,deleted=excluded.deleted,updated_at=excluded.updated_at;
  insert into public.feture_interest_operations values(p_owner,p_operation,p_interest,v_hash,v_revision+1,v_now);
  select to_jsonb(s) into v_entry from public.feture_interest_states s where account_hash=p_owner and interest_id=p_interest;
  return jsonb_build_object('ok',true,'replayed',false,'appliedRevision',v_revision+1,'appliedAt',v_now,'entry',v_entry);
end $$;
revoke execute on function public.feture_interest_mutate(text,uuid,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_interest_mutate(text,uuid,text,bigint,text,jsonb) to service_role;
notify pgrst,'reload schema';
