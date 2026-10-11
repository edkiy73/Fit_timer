-- W01.2: immutable public editorial releases; private drafts remain server-only.
-- Existing built-in JSON is editorial version 1; first DB publication is version 2.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if;
end $$;

create table public.feture_catalog_publications (
 version integer primary key check(version between 2 and 1000000),
 entries jsonb not null check(jsonb_typeof(entries)='object'),
 changed_ids text[] not null check(cardinality(changed_ids) between 1 and 144),
 reviewed_at timestamptz not null default clock_timestamp()
);
alter table public.feture_catalog_publications enable row level security;
revoke all on public.feture_catalog_publications from public,anon,authenticated,service_role;
-- Published entries only; no drafts, account data, or privileged columns.
grant select on public.feture_catalog_publications to anon,authenticated,service_role;
grant insert on public.feture_catalog_publications to service_role;
create policy feture_catalog_publications_read on public.feture_catalog_publications
 for select to anon,authenticated,service_role using (true);

create function public.feture_catalog_publish(p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 act text;wanted integer;current_version integer;changes jsonb;item jsonb;ident text;rev bigint;
 draft public.feture_catalog_topic_drafts%rowtype;new_entries jsonb;
 chosen text[]:=array[]::text[];latest public.feture_catalog_publications%rowtype;
begin
 if jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
 if act='status' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'version',coalesce((select max(version) from public.feture_catalog_publications),1));
 end if;
 if act<>'publish' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k)
    is distinct from array['action','expectedVersion','reviewed','selected']::text[]
    or p_command->'reviewed' is distinct from 'true'::jsonb
    or jsonb_typeof(p_command->'expectedVersion') is distinct from 'number'
    or p_command->>'expectedVersion' !~ '^[1-9][0-9]{0,6}$'
    or jsonb_typeof(p_command->'selected') is distinct from 'array'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 wanted:=(p_command->>'expectedVersion')::integer;changes:=p_command->'selected';
 if jsonb_array_length(changes) not between 1 and 144 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 -- Validate all selected revision pairs before publishing; never copy client-authored entries.
 for item in select value from jsonb_array_elements(changes) loop
  if jsonb_typeof(item) is distinct from 'object'
   or (select array_agg(k order by k) from jsonb_object_keys(item) k) is distinct from array['interestId','revision']::text[]
   or jsonb_typeof(item->'interestId') is distinct from 'string'
   or item->>'interestId' !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$'
   or jsonb_typeof(item->'revision') is distinct from 'number'
   or item->>'revision' !~ '^[1-9][0-9]{0,14}$'
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  ident:=item->>'interestId';chosen:=array_append(chosen,ident);
 end loop;
 if (select count(distinct x) from unnest(chosen) x)<>cardinality(chosen)
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-catalog-publish',0));
 select * into latest from public.feture_catalog_publications order by version desc limit 1;
 current_version:=coalesce(latest.version,1);
 if wanted<>current_version then return jsonb_build_object('ok',false,'error','revision_conflict','version',current_version);end if;
 if current_version>=1000000 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 new_entries:=coalesce(latest.entries,'{}'::jsonb);
 for item in select value from jsonb_array_elements(changes) loop
  ident:=item->>'interestId';rev:=(item->>'revision')::bigint;
  select * into draft from public.feture_catalog_topic_drafts where interest_id=ident;
  if draft.interest_id is null or draft.revision<>rev then
   return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  -- Ensure the saved RPC-approved editorial payload has not been changed directly.
  if not exists(select 1 from public.feture_interests where id=ident)
   or jsonb_typeof(draft.entry) is distinct from 'object'
   or (select array_agg(k order by k) from jsonb_object_keys(draft.entry) k)
      is distinct from array['definition','relatedIds','synonyms']::text[]
  then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  new_entries:=jsonb_set(new_entries,array[ident],draft.entry,true);
 end loop;
 insert into public.feture_catalog_publications(version,entries,changed_ids)
 values(current_version+1,new_entries,chosen);
 return jsonb_build_object('ok',true,'version',current_version+1,'published',cardinality(chosen));
end $$;
revoke execute on function public.feture_catalog_publish(jsonb) from public,anon,authenticated;
grant execute on function public.feture_catalog_publish(jsonb) to service_role;
notify pgrst,'reload schema';
