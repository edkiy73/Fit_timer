-- F05.2: admin-only sidecar provenance; no public provenance columns or Core identities.
-- Target project verified by the operator/MCP. This marker is a second guard, not discovery.
create schema feture_seed;
revoke all on schema feture_seed from public, anon, authenticated, service_role;
create table feture_seed.environment (
 singleton boolean primary key default true check(singleton),
 project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
 stage text not null check(stage in ('prelaunch','live')));
insert into feture_seed.environment values(true,'anrhayozrhrmiwexmbhw','prelaunch');
create table feture_seed.records (
 table_name text not null check(table_name in ('feture_categories','feture_interests','feture_profiles')),
 row_key text not null, dataset_id text not null check(dataset_id ~ '^feture-[a-z0-9-]{3,64}$'),
 seed_key text not null check(seed_key ~ '^[a-z0-9-]{2,40}$'),
 generation_version integer not null check(generation_version between 1 and 999999),
 kind text not null check(kind in ('reference-catalog','synthetic-development')),
 source text not null check(char_length(source) between 1 and 200),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 primary key(table_name,row_key), unique(dataset_id,table_name,seed_key),
 check((table_name='feture_profiles')=(kind='synthetic-development')));
alter table feture_seed.environment enable row level security;
alter table feture_seed.records enable row level security;
revoke all on all tables in schema feture_seed from public, anon, authenticated, service_role;
-- Seed IDs cannot be derived by Core's 32-hex account identity function.
-- No shared account is created and no client can log in as a seed profile.
alter table public.feture_profiles add constraint feture_profile_identity_namespace check (
 account_hash ~ '^[a-f0-9]{32}$' or account_hash ~ '^seed:feture-[a-z0-9-]{3,64}:[a-z0-9-]{2,40}$');

create function feture_seed.digest(value jsonb) returns text
language sql immutable strict security invoker set search_path='' as $$
 select encode(sha256(convert_to(value::text,'UTF8')),'hex');
$$;

-- p_apply=false is a fresh DB preview. Review token binds payload, operation, adoption,
-- environment and current rows/ledger. All writes execute inside the caller transaction.
create function feture_seed.manage(p_payload jsonb, p_project text, p_stage text,
 p_operation text default 'sync', p_apply boolean default false,
 p_review_token text default null, p_adopt boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 dataset text; kind text; source text; version integer; entries jsonb; entry jsonb;
 tbl text; key text; seed text; val jsonb; current_row jsonb; owned feture_seed.records%rowtype;
 action text; plan jsonb='[]'; blockers jsonb='[]'; snapshot jsonb; token text; result jsonb;
 inserted integer=0; updated integer=0; adopted integer=0; deleted integer=0; unchanged integer=0;
begin
 if current_user<>'postgres' then raise exception 'seed_admin_required'; end if;
 if p_apply is null or p_adopt is null or p_operation is null or p_operation not in ('sync','cleanup') then raise exception 'invalid_seed_operation'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_payload) k) is distinct from array['datasetId','kind','records','source','version']::text[] or
    p_payload->>'datasetId' !~ '^feture-[a-z0-9-]{3,64}$' or
    p_payload->>'kind' not in ('reference-catalog','synthetic-development') or
    p_payload->>'version' !~ '^[1-9][0-9]{0,5}$' or
    jsonb_typeof(p_payload->'records') is distinct from 'array' or
    jsonb_typeof(p_payload->'source') is distinct from 'string' or char_length(p_payload->>'source') not between 1 and 200 or
    exists(select 1 from jsonb_each(p_payload) e where e.key<>'records' and jsonb_typeof(e.value)<>'string') then
   raise exception 'invalid_seed_payload';
 end if;
 dataset=p_payload->>'datasetId'; kind=p_payload->>'kind'; source=p_payload->>'source'; version=(p_payload->>'version')::integer;
 entries=p_payload->'records';
 if jsonb_array_length(entries)>10000 or (p_operation='cleanup' and entries<>'[]'::jsonb) or
    (p_adopt and (kind<>'reference-catalog' or p_operation<>'sync')) then raise exception 'invalid_seed_scope'; end if;
 -- Serialize mutation with preview, and prevent dependency insertions during cleanup.
 lock table feture_seed.environment, feture_seed.records,
   public.feture_categories, public.feture_interests, public.feture_profiles in share row exclusive mode;
 lock table public.feture_interest_states, public.feture_test_responses, public.feture_posts,
   public.feture_profile_access, public.feture_dating_preferences, public.feture_tests in share mode;
 if not exists(select 1 from feture_seed.environment where singleton and project_ref=p_project and stage=p_stage and stage='prelaunch') then raise exception 'seed_environment_mismatch'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where
   n.nspname='public' and c.relname in ('feture_categories','feture_interests','feture_profiles') and not c.relrowsecurity) or
   has_table_privilege('anon','public.feture_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated','public.feture_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'seed_security_drift'; end if;
 if exists(select 1 from feture_seed.records where dataset_id=dataset and (records.kind<>kind or records.source<>source or generation_version>version)) then raise exception 'seed_dataset_conflict'; end if;
 if p_operation='cleanup' then
   select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'key',row_key,'seedKey',seed_key,'value',null) order by table_name,row_key),'[]') into entries
   from feture_seed.records where dataset_id=dataset;
 end if;
 if exists(select 1 from jsonb_array_elements(entries) x group by x->>'table',x->>'key' having count(*)>1) or
    exists(select 1 from jsonb_array_elements(entries) x group by x->>'table',x->>'seedKey' having count(*)>1) then raise exception 'duplicate_seed_key'; end if;
 for entry in select x from jsonb_array_elements(entries) x loop
   if jsonb_typeof(entry)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(entry) k) is distinct from array['key','seedKey','table','value']::text[] or
      exists(select 1 from jsonb_each(entry) e where e.key<>'value' and jsonb_typeof(e.value)<>'string') then raise exception 'invalid_seed_record'; end if;
   tbl=entry->>'table'; key=entry->>'key'; seed=entry->>'seedKey'; val=entry->'value';
   if tbl not in ('feture_categories','feture_interests','feture_profiles') or seed !~ '^[a-z0-9-]{2,40}$' or
      (tbl='feture_profiles')<>(kind='synthetic-development') then raise exception 'seed_table_forbidden'; end if;
   if p_operation='sync' then
     if jsonb_typeof(val)<>'object' then raise exception 'invalid_seed_value'; end if;
     if tbl='feture_profiles' then
       if (select array_agg(k order by k) from jsonb_object_keys(val) k) is distinct from array['about','account_hash','dating_enabled','display_name']::text[] or
          key<>'seed:'||dataset||':'||seed or jsonb_typeof(val->'account_hash')<>'string' or val->>'account_hash'<>key or val->'dating_enabled'<>'false'::jsonb or
          jsonb_typeof(val->'display_name')<>'string' or char_length(val->>'display_name') not between 1 and 80 or
          jsonb_typeof(val->'about')<>'string' or char_length(val->>'about') not between 1 and 1000 then raise exception 'invalid_seed_profile'; end if;
     elsif tbl='feture_categories' then
       if (select array_agg(k order by k) from jsonb_object_keys(val) k) is distinct from array['accent_color','icon','id','position','short_title','title']::text[] or
          key !~ '^category-[1-9][0-9]{0,2}$' or val->>'id'<>key or seed<>key or
          val->>'accent_color' !~ '^#[a-fA-F0-9]{6}$' or
          char_length(val->>'title') not between 1 and 160 or char_length(val->>'short_title') not between 1 and 80 or char_length(val->>'icon') not between 1 and 40 then raise exception 'invalid_seed_category'; end if;
     else
       if (select array_agg(k order by k) from jsonb_object_keys(val) k) is distinct from array['category_id','id','position','title']::text[] or
          key !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$' or val->>'id'<>key or seed<>key or
          val->>'category_id' !~ '^category-[1-9][0-9]{0,2}$' or
          split_part(key,'-',2)<>split_part(val->>'category_id','-',2) or char_length(val->>'title') not between 1 and 160 then raise exception 'invalid_seed_interest'; end if;
     end if;
     if tbl<>'feture_profiles' and (jsonb_typeof(val->'position')<>'number' or val->>'position' !~ '^[0-9]{1,4}$' or
       exists(select 1 from jsonb_each(val) e where e.key<>'position' and jsonb_typeof(e.value)<>'string')) then raise exception 'invalid_seed_catalog_value'; end if;
   end if;
   execute format('select to_jsonb(t)-''created_at''-''updated_at'' from public.%I t where %I=$1',tbl,case when tbl='feture_profiles' then 'account_hash' else 'id' end) into current_row using key;
   select * into owned from feture_seed.records r where r.table_name=tbl and r.row_key=key;
   if owned.row_key is not null then
     if owned.dataset_id<>dataset or owned.seed_key<>seed then blockers=blockers||'"seed_ownership_conflict"'::jsonb;
     elsif current_row is null or feture_seed.digest(current_row)<>owned.content_hash then blockers=blockers||'"seed_content_drift"'::jsonb;
     end if;
     action=case when p_operation='cleanup' then 'delete' when current_row=val and owned.generation_version=version then 'noop' else 'update' end;
   elsif current_row is null then action='insert';
   elsif p_adopt and current_row=val then action='adopt';
   else blockers=blockers||'"unowned_row_conflict"'::jsonb; action='blocked'; end if;
   if action='delete' then
     if tbl='feture_profiles' and (
       exists(select 1 from public.feture_interest_states where account_hash=key) or exists(select 1 from public.feture_test_responses where account_hash=key) or
       exists(select 1 from public.feture_posts where author_hash=key) or exists(select 1 from public.feture_profile_access where owner_hash=key or viewer_hash=key) or
       exists(select 1 from public.feture_dating_preferences where account_hash=key)) or
       tbl='feture_interests' and exists(select 1 from public.feture_interest_states where interest_id=key) or
       tbl='feture_categories' and (exists(select 1 from public.feture_tests where category_id=key) or exists(select 1 from public.feture_interests i where category_id=key and not exists(select 1 from feture_seed.records r where r.table_name='feture_interests' and r.row_key=i.id and r.dataset_id=dataset))) then
       blockers=blockers||'"seed_has_dependents"'::jsonb;
     end if;
   end if;
   plan=plan||jsonb_build_array(entry||jsonb_build_object('action',action));
 end loop;
 -- A revision with unchanged version must not silently alter content.
 if exists(select 1 from jsonb_array_elements(plan) e join feture_seed.records r on r.table_name=e->>'table' and r.row_key=e->>'key'
   where p_operation='sync' and r.generation_version=version and r.content_hash<>feture_seed.digest(e->'value')) then blockers=blockers||'"seed_version_reused"'::jsonb; end if;
 select jsonb_build_object('environment',(select to_jsonb(e) from feture_seed.environment e),
   'ledger',(select coalesce(jsonb_agg(to_jsonb(r) order by table_name,row_key),'[]') from feture_seed.records r),
   'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.feture_categories c),
   'interests',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.feture_interests i),
   'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by account_hash),'[]') from public.feture_profiles p)) into snapshot;
 token=feture_seed.digest(jsonb_build_object('payload',p_payload,'operation',p_operation,'adopt',p_adopt,'state',snapshot));
 if p_apply and (jsonb_array_length(blockers)>0 or p_review_token is distinct from token) then raise exception 'seed_review_rejected'; end if;
 if p_apply then
   -- Categories before interests on sync; interests before categories on cleanup.
   for entry in select e from jsonb_array_elements(plan) e order by
     case when e->>'table'='feture_profiles' then 0 when (e->>'table'='feture_categories')=(p_operation='sync') then 1 else 2 end, e->>'key' loop
     tbl=entry->>'table'; key=entry->>'key'; val=entry->'value'; action=entry->>'action';
     if action='delete' then
       execute format('delete from public.%I where %I=$1',tbl,case when tbl='feture_profiles' then 'account_hash' else 'id' end) using key;
       delete from feture_seed.records r where r.table_name=tbl and r.row_key=key and r.dataset_id=dataset;
     elsif action in ('insert','update') then
       if tbl='feture_profiles' then
         insert into public.feture_profiles(account_hash,display_name,about,dating_enabled) values(key,val->>'display_name',val->>'about',false)
         on conflict(account_hash) do update set display_name=excluded.display_name,about=excluded.about,dating_enabled=false,updated_at=now();
       elsif tbl='feture_categories' then
         insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values(key,val->>'title',val->>'short_title',val->>'icon',val->>'accent_color',(val->>'position')::integer)
         on conflict(id) do update set title=excluded.title,short_title=excluded.short_title,icon=excluded.icon,accent_color=excluded.accent_color,position=excluded.position;
       else
         insert into public.feture_interests(id,category_id,title,position) values(key,val->>'category_id',val->>'title',(val->>'position')::integer)
         on conflict(id) do update set category_id=excluded.category_id,title=excluded.title,position=excluded.position;
       end if;
     end if;
     if action in ('insert','update','adopt') then
       insert into feture_seed.records(table_name,row_key,dataset_id,seed_key,generation_version,kind,source,content_hash)
       values(tbl,key,dataset,entry->>'seedKey',version,kind,source,feture_seed.digest(val))
       on conflict(table_name,row_key) do update set generation_version=excluded.generation_version,content_hash=excluded.content_hash;
     end if;
   end loop;
 end if;
 select count(*) filter(where e->>'action'='insert'),count(*) filter(where e->>'action'='update'),count(*) filter(where e->>'action'='adopt'),count(*) filter(where e->>'action'='delete'),count(*) filter(where e->>'action'='noop')
 into inserted,updated,adopted,deleted,unchanged from jsonb_array_elements(plan) e;
 select coalesce(jsonb_agg(x order by x),'[]') into blockers from (select distinct x from jsonb_array_elements(blockers) x) b;
 result=jsonb_build_object('datasetId',dataset,'kind',kind,'operation',p_operation,'applied',p_apply,'canApply',jsonb_array_length(blockers)=0,
   'reviewToken',token,'blockers',blockers,'counts',jsonb_build_object('insert',inserted,'update',updated,'adopt',adopted,'delete',deleted,'unchanged',unchanged),
   'writes',case when p_apply then inserted+updated+adopted+deleted else 0 end);
 return result;
end;
$$;
revoke all on all functions in schema feture_seed from public, anon, authenticated, service_role;
comment on schema feture_seed is 'FetUre prelaunch operator-only provenance. Close environment.stage before real users. Never expose via PostgREST.';
