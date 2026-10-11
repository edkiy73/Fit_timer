-- W01.1: private editorial drafts. No public publication or change to live taxonomy.
do $$ begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if; end $$;
create table public.feture_catalog_topic_drafts(
 interest_id text primary key references public.feture_interests(id),
 entry jsonb not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 updated_at timestamptz not null default clock_timestamp());
alter table public.feture_catalog_topic_drafts enable row level security;
revoke all on public.feture_catalog_topic_drafts from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_catalog_topic_drafts to service_role;

create function public.feture_catalog_editorial_admin(p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text;ident text;payload jsonb;expected bigint;stored public.feture_catalog_topic_drafts%rowtype;tok jsonb;related text;rev bigint;
begin
 if jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 act:=p_command->>'action';
 if act='list' then
  if (select count(*) from jsonb_object_keys(p_command))<>1 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  return jsonb_build_object('ok',true,'drafts',coalesce((select jsonb_agg(jsonb_build_object('interestId',interest_id,'entry',entry,'revision',revision) order by interest_id) from public.feture_catalog_topic_drafts),'[]'::jsonb));
 end if;
 if act<>'save' or (select array_agg(k order by k) from jsonb_object_keys(p_command) k) is distinct from array['action','entry','expectedRevision','interestId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 ident:=p_command->>'interestId';payload:=p_command->'entry';
 if ident is null or ident !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$'
    or p_command->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,14})$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 expected:=(p_command->>'expectedRevision')::bigint;
 if expected>=9007199254740991 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if not exists(select 1 from public.feture_interests where id=ident)
    or jsonb_typeof(payload) is distinct from 'object'
    or (select array_agg(k order by k) from jsonb_object_keys(payload) k) is distinct from array['definition','relatedIds','synonyms']::text[]
    or jsonb_typeof(payload->'definition') is distinct from 'string'
    or char_length(payload->>'definition') not between 1 and 400
    or (payload->>'definition') !~ '[^[:space:]]'
    or (payload->>'definition') ~ '[[:cntrl:]<>]'
    or payload->>'definition'<>btrim(payload->>'definition')
    or jsonb_typeof(payload->'synonyms') is distinct from 'array'
    or jsonb_typeof(payload->'relatedIds') is distinct from 'array' then
   return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_array_length(payload->'synonyms') not between 1 and 8 or jsonb_array_length(payload->'relatedIds')>8 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if exists(select 1 from jsonb_array_elements(payload->'synonyms') x where jsonb_typeof(x) is distinct from 'string'
   or char_length(x#>>'{}') not between 1 and 80 or (x#>>'{}') !~ '[^[:space:]]'
   or (x#>>'{}') ~ '[[:cntrl:]<>]' or (x#>>'{}')<>btrim(x#>>'{}'))
   or (select count(*) from jsonb_array_elements(payload->'synonyms'))<>(select count(distinct x#>>'{}') from jsonb_array_elements(payload->'synonyms') x)
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if exists(select 1 from jsonb_array_elements(payload->'relatedIds') x where jsonb_typeof(x) is distinct from 'string'
    or (x#>>'{}')=ident or not exists(select 1 from public.feture_interests i where i.id=x#>>'{}'))
   or (select count(*) from jsonb_array_elements(payload->'relatedIds'))<>(select count(distinct x#>>'{}') from jsonb_array_elements(payload->'relatedIds') x)
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-catalog-editorial:'||ident,0));
 select * into stored from public.feture_catalog_topic_drafts where interest_id=ident for update;
 rev:=coalesce(stored.revision,0);
 if rev<>expected then return jsonb_build_object('ok',false,'error','revision_conflict','revision',rev);end if;
 insert into public.feture_catalog_topic_drafts(interest_id,entry,revision) values(ident,payload,rev+1)
 on conflict(interest_id) do update set entry=excluded.entry,revision=excluded.revision,updated_at=clock_timestamp();
 return jsonb_build_object('ok',true,'revision',rev+1);
end $$;
revoke execute on function public.feture_catalog_editorial_admin(jsonb) from public,anon,authenticated;
grant execute on function public.feture_catalog_editorial_admin(jsonb) to service_role;
notify pgrst,'reload schema';
