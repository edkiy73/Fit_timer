-- W07.2 — revocable, adult-only, owner-reviewed snapshots of selected interest labels.
-- Share IDs are 122-bit UUIDv4 capabilities from WebCrypto, kept in hash-router fragments.
-- No public table access or anonymous read. Never store full private interest records.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_share_links (
 id uuid primary key,
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='array' and jsonb_array_length(snapshot) between 1 and 6),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '7 days')
);
create index feture_share_owner on public.feture_share_links(account_hash,created_at desc);
alter table public.feture_share_links enable row level security;
revoke all on public.feture_share_links from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_share_links to service_role;

create function public.feture_share_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text;link_uuid uuid;owner_id text;desired jsonb;row_data jsonb:='[]'::jsonb;item jsonb;
 selected_count integer;revision_value bigint;current_row public.feture_interest_states%rowtype;
 existing public.feture_share_links%rowtype;days_value integer;payload text;expiry timestamptz;
 checked_at timestamptz:=clock_timestamp();card_rows jsonb;bad boolean;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
 if act='share.list' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[] then
   return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(v.item order by v.created_at desc) from (
   select created_at,jsonb_build_object('id',id,'createdAt',created_at,'expiresAt',expires_at,
    'revoked',revoked_at is not null,'count',jsonb_array_length(snapshot)) item
   from public.feture_share_links where account_hash=p_actor order by created_at desc limit 25
  ) v),'[]'::jsonb));
 end if;
 if act='share.read' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action','linkId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='share.revoke' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action','linkId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='share.create' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
     is distinct from array['action','days','linkId','reviewed','selected']::text[]
     or p_command->'reviewed' is distinct from 'true'::jsonb
     or jsonb_typeof(p_command->'days') is distinct from 'number'
     or p_command->>'days' not in ('1','3','7')
     or jsonb_typeof(p_command->'selected') is distinct from 'array'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'linkId') is distinct from 'string'
   or p_command->>'linkId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 link_uuid:=(p_command->>'linkId')::uuid;
 if act='share.read' then
  select * into existing from public.feture_share_links where id=link_uuid;
  if existing.id is null or existing.revoked_at is not null or existing.expires_at<=checked_at
     or not public.feture_peer_eligible(p_actor)
     or not public.feture_peer_eligible(existing.account_hash)
     or (p_actor<>existing.account_hash and public.feture_pair_blocked(p_actor,existing.account_hash))
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  -- Fail closed on edits, deletion, hard/conditional boundary or changed ownership.
  select exists (
   select 1 from jsonb_array_elements(existing.snapshot) elem
   left join public.feture_interest_states s on s.account_hash=existing.account_hash and s.interest_id=elem->>'id'
   where s.interest_id is null or s.deleted or s.boundary<>'none'
      or s.revision<>(elem->>'revision')::bigint or s.stance<>(elem->>'stance')
  ) into bad;
  if bad then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select coalesce(jsonb_agg(jsonb_build_object('title',elem->>'title','stance',elem->>'stance') order by ord),'[]'::jsonb)
    into card_rows from jsonb_array_elements(existing.snapshot) with ordinality as t(elem,ord);
  return jsonb_build_object('ok',true,'card',jsonb_build_object('items',card_rows,'expiresAt',existing.expires_at));
 end if;
 -- Only an eligible adult owner may create a new snapshot. Check inside SQL too:
 -- the API check must not be the only protection if an adapter is called incorrectly.
 if act='share.create' and not public.feture_peer_eligible(p_actor) then
  return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 -- Revoke and create share the same owner lock and verify the owner rather than a client label.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 select * into existing from public.feture_share_links where id=link_uuid;
 if act='share.revoke' then
  if existing.id is null or existing.account_hash<>p_actor
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  update public.feture_share_links set revoked_at=coalesce(revoked_at,checked_at) where id=link_uuid and account_hash=p_actor;
  return jsonb_build_object('ok',true,'revoked',true);
 end if;
 desired:=p_command->'selected';selected_count:=jsonb_array_length(desired);days_value:=(p_command->>'days')::int;
 if selected_count not between 1 and 6 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 payload:=encode(sha256(convert_to(jsonb_build_object('days',days_value,'selected',desired)::text,'UTF8')),'hex');
 if existing.id is not null then
  if existing.account_hash<>p_actor or existing.payload_hash<>payload then
   return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return jsonb_build_object('ok',true,'replayed',true,'link',jsonb_build_object('id',existing.id,
   'expiresAt',existing.expires_at,'revoked',existing.revoked_at is not null));
 end if;
 if (select count(*) from public.feture_share_links
     where account_hash=p_actor and revoked_at is null and expires_at>checked_at)>=10
 then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 if (select count(distinct v->>'interestId') from jsonb_array_elements(desired) v)<>selected_count
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 for item in select value from jsonb_array_elements(desired) loop
  if jsonb_typeof(item) is distinct from 'object'
   or (select array_agg(k order by k) from jsonb_object_keys(item) k)
      is distinct from array['expectedRevision','interestId']::text[]
   or jsonb_typeof(item->'interestId') is distinct from 'string'
   or item->>'interestId' !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$'
   or jsonb_typeof(item->'expectedRevision') is distinct from 'number'
   or item->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  revision_value:=(item->>'expectedRevision')::bigint;
  select * into current_row from public.feture_interest_states where account_hash=p_actor
   and interest_id=item->>'interestId';
  if current_row.interest_id is null or current_row.revision<>revision_value
     or current_row.deleted or current_row.boundary<>'none' or current_row.stance='unknown'
  then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  select title into owner_id from public.feture_interests where id=current_row.interest_id;
  if owner_id is null then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  row_data:=row_data||jsonb_build_array(jsonb_build_object('id',current_row.interest_id,
   'title',owner_id,'stance',current_row.stance,'revision',current_row.revision));
 end loop;
 insert into public.feture_share_links(id,account_hash,snapshot,payload_hash,expires_at)
 values(link_uuid,p_actor,row_data,payload,checked_at+days_value*interval '1 day')
 returning expires_at into expiry;
 return jsonb_build_object('ok',true,'replayed',false,'link',
  jsonb_build_object('id',link_uuid,'expiresAt',expiry,'revoked',false));
end $$;
revoke execute on function public.feture_share_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_share_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
