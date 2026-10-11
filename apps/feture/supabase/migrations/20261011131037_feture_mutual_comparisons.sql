-- W07.3: recipient consents to selected fields, then the link owner separately approves.
-- A capability link never authorizes comparison by itself. No raw answers or boundaries.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_share_comparisons (
 id uuid primary key,
 link_id uuid not null references public.feture_share_links(id) on delete cascade,
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 guest_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 guest_snapshot jsonb not null check(jsonb_typeof(guest_snapshot)='array' and jsonb_array_length(guest_snapshot) between 1 and 6),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 guest_consented_at timestamptz not null default clock_timestamp(),
 owner_consented_at timestamptz,
 revoked_at timestamptz,
 revision bigint not null default 1 check(revision between 1 and 9007199254740990),
 check(owner_hash<>guest_hash)
);
create index feture_comparison_owner on public.feture_share_comparisons(owner_hash,guest_consented_at desc);
create index feture_comparison_guest on public.feture_share_comparisons(guest_hash,guest_consented_at desc);
create index feture_comparison_link on public.feture_share_comparisons(link_id);
alter table public.feture_share_comparisons enable row level security;
revoke all on public.feture_share_comparisons from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_share_comparisons to service_role;

create function public.feture_comparison_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text;comparison_id uuid;link_uuid uuid;selected jsonb;item jsonb;
 existing public.feture_share_comparisons%rowtype;parent public.feture_share_links%rowtype;
 current_row public.feture_interest_states%rowtype;snapshot_rows jsonb:='[]'::jsonb;
 checked_at timestamptz:=clock_timestamp();digest text;title_value text;expected bigint;
 meta jsonb;my_rows jsonb;result_rows jsonb;parent_read jsonb;bad boolean;role_value text;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
 if act='share.compare.list' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  -- Own operational metadata only; revocation stays possible after loss of age/consent.
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(v.item order by v.created_at desc) from (
   select c.guest_consented_at created_at,jsonb_build_object('id',c.id,'linkId',c.link_id,
    'role',case when c.owner_hash=p_actor then 'owner' else 'guest' end,'revision',c.revision,
    'state',case when c.revoked_at is not null then 'revoked' when l.revoked_at is not null or l.expires_at<=checked_at then 'unavailable'
      when c.owner_consented_at is null then 'pending' else 'active' end,'expiresAt',l.expires_at) item
   from public.feture_share_comparisons c join public.feture_share_links l on l.id=c.link_id
   where p_actor in (c.owner_hash,c.guest_hash) order by c.guest_consented_at desc,c.id limit 25
  ) v),'[]'::jsonb));
 end if;
 if act='share.compare.create' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
    is distinct from array['action','comparisonId','linkId','reviewed','selected']::text[]
    or p_command->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'selected') is distinct from 'array'
    or jsonb_typeof(p_command->'linkId') is distinct from 'string'
    or p_command->>'linkId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  link_uuid:=(p_command->>'linkId')::uuid;
 elsif act='share.compare.approve' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
    is distinct from array['action','comparisonId','expectedRevision','reviewed']::text[]
    or p_command->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
    or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  expected:=(p_command->>'expectedRevision')::bigint;
 elsif act in ('share.compare.read','share.compare.revoke') then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action','comparisonId']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'comparisonId') is distinct from 'string'
    or p_command->>'comparisonId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 comparison_id:=(p_command->>'comparisonId')::uuid;
 -- Same per-actor -> parent -> comparison lock order as share create/revoke.
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 if act<>'share.compare.create' then
  select * into existing from public.feture_share_comparisons where id=comparison_id;
  if existing.id is null or p_actor not in (existing.owner_hash,existing.guest_hash)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  link_uuid:=existing.link_id;
 end if;
 select * into parent from public.feture_share_links where id=link_uuid for update;
 if parent.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into existing from public.feture_share_comparisons where id=comparison_id for update;
 if act<>'share.compare.create' and (existing.id is null or p_actor not in (existing.owner_hash,existing.guest_hash))
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='share.compare.revoke' then
  if p_actor not in (existing.owner_hash,existing.guest_hash) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if existing.revoked_at is null then
   update public.feture_share_comparisons set revoked_at=checked_at,revision=revision+1 where id=comparison_id;
  end if;
  return jsonb_build_object('ok',true,'revoked',true);
 end if;
 parent_read:=public.feture_share_command(p_actor,jsonb_build_object('action','share.read','linkId',link_uuid));
 if parent_read->'ok' is distinct from 'true'::jsonb then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='share.compare.create' then
  if parent.account_hash=p_actor then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  selected:=p_command->'selected';
  if jsonb_array_length(selected) not between 1 and 6
   or (select count(distinct v->>'interestId') from jsonb_array_elements(selected) v)<>jsonb_array_length(selected)
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('linkId',link_uuid,'selected',selected)::text,'UTF8')),'hex');
  if existing.id is not null then
   if existing.guest_hash<>p_actor or existing.link_id<>link_uuid or existing.payload_hash<>digest
   then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
   -- Replays disclose metadata only and never renew or resurrect consent.
  else
   if (select count(*) from public.feture_share_comparisons c join public.feture_share_links l on l.id=c.link_id
      where c.revoked_at is null and l.revoked_at is null and l.expires_at>checked_at and (c.guest_hash=p_actor or c.link_id=link_uuid))>=25
   then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   for item in select value from jsonb_array_elements(selected) loop
    if jsonb_typeof(item) is distinct from 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['expectedRevision','interestId']::text[]
     or jsonb_typeof(item->'interestId') is distinct from 'string' or item->>'interestId' !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$'
     or jsonb_typeof(item->'expectedRevision') is distinct from 'number' or item->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
    then return jsonb_build_object('ok',false,'error','invalid_request');end if;
    select * into current_row from public.feture_interest_states where account_hash=p_actor and interest_id=item->>'interestId';
    if current_row.interest_id is null or current_row.revision<>(item->>'expectedRevision')::bigint
      or current_row.deleted or current_row.boundary<>'none' or current_row.stance='unknown'
    then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
    select title into title_value from public.feture_interests where id=current_row.interest_id;
    if title_value is null then return jsonb_build_object('ok',false,'error','invalid_request');end if;
    snapshot_rows:=snapshot_rows||jsonb_build_array(jsonb_build_object('id',current_row.interest_id,'title',title_value,'stance',current_row.stance,'revision',current_row.revision));
   end loop;
   insert into public.feture_share_comparisons(id,link_id,owner_hash,guest_hash,guest_snapshot,payload_hash)
   values(comparison_id,link_uuid,parent.account_hash,p_actor,snapshot_rows,digest) returning * into existing;
  end if;
 else
  if existing.revoked_at is not null or not public.feture_peer_eligible(existing.guest_hash)
    or not public.feture_peer_eligible(existing.owner_hash) or public.feture_pair_blocked(existing.owner_hash,existing.guest_hash)
    or exists(select 1 from public.feture_moderation_restrictions r where r.account_hash in (existing.owner_hash,existing.guest_hash)
      and r.lifted_at is null and r.expires_at>checked_at)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  -- Each side's exact rows must still match its consented snapshot; edits require a new invitation.
  select exists(select 1 from jsonb_array_elements(existing.guest_snapshot) e
    left join public.feture_interest_states s on s.account_hash=existing.guest_hash and s.interest_id=e->>'id'
    where s.interest_id is null or s.deleted or s.boundary<>'none' or s.revision<>(e->>'revision')::bigint or s.stance<>e->>'stance') into bad;
  if bad then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if act='share.compare.approve' then
   if p_actor<>existing.owner_hash then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
   if existing.owner_consented_at is null then
    if existing.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
    update public.feture_share_comparisons set owner_consented_at=checked_at,revision=revision+1 where id=comparison_id returning * into existing;
   elsif existing.revision<>expected+1 then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  end if;
 end if;
 role_value:=case when p_actor=existing.owner_hash then 'owner' else 'guest' end;
 meta:=jsonb_build_object('id',existing.id,'linkId',existing.link_id,'role',role_value,'revision',existing.revision,
   'state',case when existing.revoked_at is not null then 'revoked' when existing.owner_consented_at is null then 'pending' else 'active' end,'expiresAt',parent.expires_at);
 if act='share.compare.create' then return jsonb_build_object('ok',true,'comparison',meta);end if;
 -- Only one's own selected fields are visible pending the other participant's consent.
 select jsonb_agg(jsonb_build_object('title',e->>'title','stance',e->>'stance') order by ord) into my_rows
 from jsonb_array_elements(case when role_value='owner' then parent.snapshot else existing.guest_snapshot end) with ordinality as t(e,ord);
 result_rows:=null;
 if existing.owner_consented_at is not null then
  select coalesce(jsonb_agg(jsonb_build_object('title',a->>'title',
    'mine',case when role_value='owner' then a->>'stance' else b->>'stance' end,
    'theirs',case when role_value='owner' then b->>'stance' else a->>'stance' end) order by ord),'[]'::jsonb) into result_rows
  from jsonb_array_elements(parent.snapshot) with ordinality as t(a,ord)
  join jsonb_array_elements(existing.guest_snapshot) b on a->>'id'=b->>'id';
 end if;
 return jsonb_build_object('ok',true,'comparison',meta,'myItems',my_rows,'items',result_rows);
end $$;
revoke execute on function public.feture_comparison_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_comparison_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
