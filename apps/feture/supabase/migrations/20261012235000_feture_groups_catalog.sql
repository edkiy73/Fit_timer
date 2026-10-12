-- C03.1: group catalogue metadata only. Does not grant closed-group membership/content access.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_groups (
 id uuid primary key default gen_random_uuid(),
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 slug text not null unique check(length(slug) between 3 and 64 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check(length(btrim(title)) between 2 and 100 and title !~ '[\x00-\x1f\x7f]'),
 summary text not null default '' check(length(summary)<=500 and summary !~ '[\x00-\x08\x0b-\x1f\x7f]'),
 rules text not null default '' check(length(rules)<=2000 and rules !~ '[\x00-\x08\x0b-\x1f\x7f]'),
 visibility text not null check(visibility in ('public','closed')),
 state text not null default 'draft' check(state in ('draft','pending','published','hidden','deleted')),
 created_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check(state<>'published' or published_at is not null)
);
create index feture_groups_catalog_page on public.feture_groups(published_at desc,id desc)
 where state='published';
alter table public.feture_groups enable row level security;
revoke all on public.feture_groups from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_groups to service_role;

create function public.feture_group_catalog_dto(p public.feture_groups)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title,'summary',p.summary,
  'rules',p.rules,'visibility',p.visibility,'publishedAt',p.published_at);
$$;
create function public.feture_group_catalog_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text:=p_command->>'action';fields text[];cur jsonb;after_at timestamptz;after_id uuid;
 gid uuid;group_record public.feture_groups%rowtype;entries jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_command) k;
 if act='groups.catalog' then
  if fields is distinct from array['action','cursor']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  cur:=p_command->'cursor';
  if cur is distinct from 'null'::jsonb then
   if jsonb_typeof(cur) is distinct from 'object' or
     (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
     jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' or
     cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
   begin after_at:=(cur->>'at')::timestamptz;after_id:=(cur->>'id')::uuid;
   exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
   if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  end if;
 elsif act='groups.preview' then
  if fields is distinct from array['action','id']::text[] or
    jsonb_typeof(p_command->'id') is distinct from 'string' or
    p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  gid:=(p_command->>'id')::uuid;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if act='groups.preview' then
  select * into group_record from public.feture_groups where id=gid;
  if not found or group_record.state<>'published' or
    not public.feture_peer_eligible(group_record.owner_hash) or
    public.feture_pair_blocked(p_actor,group_record.owner_hash)
  then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_group_catalog_dto(group_record));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_group_catalog_dto(v),
     'at',v.published_at) order by v.published_at desc,v.id desc),'[]'::jsonb)
 into entries from (
  select g.* from public.feture_groups g
  where g.state='published' and public.feture_peer_eligible(g.owner_hash)
    and not public.feture_pair_blocked(p_actor,g.owner_hash)
    and (after_at is null or (g.published_at,g.id)<(after_at,after_id))
  order by g.published_at desc,g.id desc limit 21
 ) v;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x->'entry' order by n)
    from jsonb_array_elements(entries) with ordinality j(x,n) where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(entries)>20
    then jsonb_build_object('at',entries->19->>'at','id',entries->19->'entry'->>'id') else null end);
end $$;
revoke all on function public.feture_group_catalog_dto(public.feture_groups),
 public.feture_group_catalog_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_group_catalog_dto(public.feture_groups),
 public.feture_group_catalog_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
