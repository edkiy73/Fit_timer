-- M01a: privacy-preserving public post detail opens, never feed impressions.
-- One increment per eligible reader, post, UTC calendar day. Lifetime counter is
-- number of distinct reader-days, NOT the number of different people.
-- Requires C01.3 post_visible audience / blocking rules and prelaunch guard.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton
    and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regprocedure('public.feture_post_visible(public.feture_posts,text)') is null
 then raise exception 'feture_post_visibility_guard_required';end if;
end $$;

-- Salt is never passed to client, written to logs, or joined with analytics.
create table public.feture_post_view_secret(
 singleton boolean primary key default true check(singleton),
 salt text not null check(length(salt)>=60)
);
insert into public.feture_post_view_secret(singleton,salt)
values(true,gen_random_uuid()::text||gen_random_uuid()::text);
alter table public.feture_post_view_secret enable row level security;
revoke all on public.feture_post_view_secret from public,anon,authenticated,service_role;
grant select on public.feture_post_view_secret to service_role;

create table public.feture_post_view_receipts(
 post_id uuid not null references public.feture_posts(id) on delete cascade,
 utc_day date not null,
 viewer_digest text not null check(viewer_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(post_id,utc_day,viewer_digest)
);
create index feture_post_view_receipts_cleanup on public.feture_post_view_receipts(utc_day);
alter table public.feture_post_view_receipts enable row level security;
revoke all on public.feture_post_view_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on public.feture_post_view_receipts to service_role;

create table public.feture_post_view_totals(
 post_id uuid primary key references public.feture_posts(id) on delete cascade,
 reader_day_opens bigint not null default 0 check(reader_day_opens>=0),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.feture_post_view_totals enable row level security;
revoke all on public.feture_post_view_totals from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_post_view_totals to service_role;

create function public.feture_post_view_open(p_actor text,p_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 post_row public.feture_posts%rowtype;
 salt_value text;
 day_value date:=(clock_timestamp() at time zone 'UTC')::date;
 digest_value text;
 inserted boolean:=false;
 current_count bigint:=0;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_id is null
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- No private/granted/group event content, even if a current recipient can read it.
 select * into post_row from public.feture_posts where id=p_id for share;
 if not found or post_row.audience<>'public' or
    not public.feture_post_visible(post_row,p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if post_row.author_hash<>p_actor then
  select salt into salt_value from public.feture_post_view_secret where singleton=true;
  if salt_value is null
  then return jsonb_build_object('ok',false,'error','domain_unavailable');end if;
  digest_value:=encode(sha256(convert_to(
    salt_value||':'||p_id::text||':'||day_value::text||':'||p_actor,'UTF8')),'hex');
  with receipt as(
   insert into public.feture_post_view_receipts(post_id,utc_day,viewer_digest)
    values(p_id,day_value,digest_value) on conflict do nothing returning 1
  ) select exists(select 1 from receipt) into inserted;
  if inserted then
   insert into public.feture_post_view_totals(post_id,reader_day_opens)
    values(p_id,1)
   on conflict(post_id) do update set
    reader_day_opens=public.feture_post_view_totals.reader_day_opens+1,
    updated_at=clock_timestamp();
  end if;
 end if;
 select reader_day_opens into current_count from public.feture_post_view_totals
  where post_id=p_id;
 current_count:=coalesce(current_count,0);
 -- No counts from small audiences: 1,2,3,4 and zero all appear as suppressed.
 return jsonb_build_object('ok',true,'hidden',current_count<5,
  'uniqueDailyOpens',case when current_count>=5 then current_count else null end);
end $$;

-- Service-only bounded 30-day receipt cleanup. Schedule daily before activating
-- this feature. The lifetime aggregate survives cleanup (never includes names).
create function public.feture_post_view_prune(p_limit integer default 1000)
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>1000 then return 0;end if;
 with expired as(
  select post_id,utc_day,viewer_digest from public.feture_post_view_receipts
  where utc_day<(clock_timestamp() at time zone 'UTC')::date-30
  order by utc_day,post_id,viewer_digest limit p_limit
 ), removed as(
  delete from public.feture_post_view_receipts r using expired e
  where r.post_id=e.post_id and r.utc_day=e.utc_day and
   r.viewer_digest=e.viewer_digest returning 1
 ) select count(*) into n from removed;
 return n;
end $$;
revoke all on function public.feture_post_view_open(text,uuid),
 public.feture_post_view_prune(integer) from public,anon,authenticated;
grant execute on function public.feture_post_view_open(text,uuid),
 public.feture_post_view_prune(integer) to service_role;
notify pgrst,'reload schema';
