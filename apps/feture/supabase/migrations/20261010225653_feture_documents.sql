-- A05: draft editorial content and immutable reviewed publications/acceptance.
do $$ begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required'; end if; end $$;
create function public.feture_document_content_valid(p_blocks jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare b jsonb; i jsonb;
begin
 if jsonb_typeof(p_blocks) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_blocks) not between 1 and 80 or octet_length(p_blocks::text)>65536 then return false; end if;
 for b in select value from jsonb_array_elements(p_blocks) loop
  if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'type') is distinct from 'string' or b->>'type' not in ('heading','paragraph','list') then return false; end if;
  if b->>'type'='list' then
   if not(b ?& array['type','items']) or exists(select 1 from jsonb_object_keys(b) k where k not in ('type','items')) or jsonb_typeof(b->'items') is distinct from 'array' then return false; end if;
   if jsonb_array_length(b->'items') not between 1 and 30 then return false; end if;
   for i in select value from jsonb_array_elements(b->'items') loop if jsonb_typeof(i) is distinct from 'string' or char_length(i#>>'{}') not between 1 and 1200 then return false; end if; end loop;
  else
   if not(b ?& array['type','text']) or exists(select 1 from jsonb_object_keys(b) k where k not in ('type','text')) or jsonb_typeof(b->'text') is distinct from 'string' or char_length(b->>'text') not between 1 and 4000 then return false; end if;
  end if;
 end loop;return true;
end $$;
create table public.feture_document_drafts (
 document_key text not null check(document_key in ('terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright')),
 locale text not null check(locale in ('ru','en')),
 title text not null check(char_length(title) between 1 and 160),
 blocks jsonb not null check(public.feture_document_content_valid(blocks)),
 requires_accept boolean not null default true check(document_key not in ('terms','privacy','community','adult-content') or requires_accept),
 revision bigint not null check(revision between 1 and 9007199254740991),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(document_key,locale));
create table public.feture_document_versions (
 id uuid primary key default gen_random_uuid(),
 document_key text not null check(document_key in ('terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright')),
 locale text not null check(locale in ('ru','en')),version integer not null check(version>0),source_revision bigint not null check(source_revision>0),
 title text not null check(char_length(title) between 1 and 160),
 blocks jsonb not null check(public.feture_document_content_valid(blocks)),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 requires_accept boolean not null check(document_key not in ('terms','privacy','community','adult-content') or requires_accept),published_at timestamptz not null,effective_at timestamptz not null,
 unique(document_key,locale,version),unique(document_key,locale,source_revision));
create index feture_document_versions_effective on public.feture_document_versions(locale,document_key,effective_at,version desc);
create table public.feture_consent_receipts (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 document_id uuid not null references public.feture_document_versions(id),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,document_id));
create index feture_consent_document on public.feture_consent_receipts(document_id);
alter table public.feture_document_drafts enable row level security;
alter table public.feture_document_versions enable row level security;
alter table public.feture_consent_receipts enable row level security;
revoke all on public.feture_document_drafts,public.feture_document_versions,public.feture_consent_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_document_drafts to service_role;
grant select,insert on public.feture_document_versions to service_role;
grant select,insert,delete on public.feture_consent_receipts to service_role;
grant select on public.feture_document_versions to anon,authenticated;
create policy feture_reviewed_document_read on public.feture_document_versions for select to anon,authenticated using(true);
create view public.feture_document_current with (security_invoker=true) as
 select distinct on(document_key,locale) id,document_key,locale,version,title,blocks,content_hash,requires_accept,published_at,effective_at
 from public.feture_document_versions where effective_at<=clock_timestamp() order by document_key,locale,version desc;
grant select on public.feture_document_current to anon,authenticated,service_role;

create function public.feture_document_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$ begin raise exception 'feture_immutable_document'; end $$;
create trigger feture_document_no_rewrite before update or delete on public.feture_document_versions for each row execute function public.feture_document_immutable();
create trigger feture_receipt_no_rewrite before update on public.feture_consent_receipts for each row execute function public.feture_document_immutable();

create function public.feture_document_save(p_key text,p_locale text,p_expected bigint,p_title text,p_blocks jsonb,p_required boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.feture_document_drafts%rowtype;
begin
 if p_key is null or p_key not in ('terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright') or p_locale is null or p_locale not in ('ru','en') or p_expected is null or p_expected<0 or p_expected>=9007199254740991 or p_title is null or char_length(p_title) not between 1 and 160 or p_required is null or (p_key in ('terms','privacy','community','adult-content') and not p_required) or not public.feture_document_content_valid(p_blocks) then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-document:'||p_key||':'||p_locale,0));
 select * into d from public.feture_document_drafts where document_key=p_key and locale=p_locale;
 if coalesce(d.revision,0)<>p_expected then return jsonb_build_object('ok',false,'error','revision_conflict'); end if;
 insert into public.feture_document_drafts(document_key,locale,title,blocks,requires_accept,revision) values(p_key,p_locale,p_title,p_blocks,p_required,p_expected+1)
 on conflict(document_key,locale) do update set title=excluded.title,blocks=excluded.blocks,requires_accept=excluded.requires_accept,revision=excluded.revision,updated_at=clock_timestamp() returning * into d;
 return jsonb_build_object('ok',true,'draft',to_jsonb(d));
end $$;
create function public.feture_document_publish(p_key text,p_locale text,p_revision bigint,p_reviewed boolean,p_effective_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d public.feture_document_drafts%rowtype; v public.feture_document_versions%rowtype; n integer; h text; t timestamptz;
begin
 if p_reviewed is distinct from true then return jsonb_build_object('ok',false,'error','review_required'); end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-document:'||p_key||':'||p_locale,0));
 select * into d from public.feture_document_drafts where document_key=p_key and locale=p_locale;
 if not found or d.revision<>p_revision then return jsonb_build_object('ok',false,'error','revision_conflict'); end if;
 select * into v from public.feture_document_versions where document_key=p_key and locale=p_locale and source_revision=p_revision;
 if found then return jsonb_build_object('ok',true,'document',to_jsonb(v)); end if;
 if p_effective_at is null or p_effective_at<clock_timestamp()-interval '1 minute' or p_effective_at>clock_timestamp()+interval '1 year' then return jsonb_build_object('ok',false,'error','review_required'); end if;
 select coalesce(max(version),0)+1 into n from public.feture_document_versions where document_key=p_key and locale=p_locale;
 h:=encode(sha256(convert_to(jsonb_build_object('key',p_key,'locale',p_locale,'title',d.title,'blocks',d.blocks,'requiresAccept',d.requires_accept)::text,'UTF8')),'hex');t:=clock_timestamp();
 insert into public.feture_document_versions(document_key,locale,version,source_revision,title,blocks,content_hash,requires_accept,published_at,effective_at)
 values(p_key,p_locale,n,p_revision,d.title,d.blocks,h,d.requires_accept,t,p_effective_at) returning * into v;
 return jsonb_build_object('ok',true,'document',to_jsonb(v));
end $$;

create function public.feture_consent_accept(p_owner text,p_locale text,p_documents uuid[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v public.feture_document_versions%rowtype; i uuid; expected uuid;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_locale is null or p_locale not in ('ru','en') or p_documents is null or cardinality(p_documents) not between 1 and 9 or cardinality(p_documents)<>(select count(distinct x) from unnest(p_documents) x) then return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 -- Stable lock order against publishers: all keys, then owner. Receipts bind exact content.
 for v in select distinct on(document_key) * from public.feture_document_versions where locale=p_locale and effective_at<=clock_timestamp() order by document_key,version desc loop
  perform pg_advisory_xact_lock(hashtextextended('feture-document:'||v.document_key||':'||p_locale,0));
 end loop;
 foreach i in array p_documents loop
  select * into v from public.feture_document_versions where id=i and locale=p_locale and effective_at<=clock_timestamp();
  if not found then return jsonb_build_object('ok',false,'error','document_changed'); end if;
  select id into expected from public.feture_document_versions where document_key=v.document_key and locale=p_locale and effective_at<=clock_timestamp() order by version desc limit 1;
  if expected<>i then return jsonb_build_object('ok',false,'error','document_changed'); end if;
 end loop;
 insert into public.feture_profiles(account_hash) values(p_owner) on conflict do nothing;perform 1 from public.feture_profiles where account_hash=p_owner for update;
 insert into public.feture_consent_receipts(account_hash,document_id,content_hash)
 select p_owner,id,content_hash from public.feture_document_versions where id=any(p_documents) on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;
create function public.feture_consent_status(p_owner text,p_locale text)
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 with current_docs as (select distinct on(document_key) * from public.feture_document_versions where locale=p_locale and effective_at<=clock_timestamp() order by document_key,version desc),
 results as (select d.*,r.document_id is not null and r.content_hash=d.content_hash as accepted from current_docs d left join public.feture_consent_receipts r on r.document_id=d.id and r.account_hash=p_owner)
 select jsonb_build_object('ok',true,'ready',(select count(*)=4 from current_docs where document_key in ('terms','privacy','community','adult-content')),
 'accepted',coalesce(bool_and(accepted or not requires_accept),false) and (select count(*)=4 from current_docs where document_key in ('terms','privacy','community','adult-content')),
 'documents',coalesce(jsonb_agg(jsonb_build_object('id',id,'key',document_key,'locale',locale,'version',version,'title',title,'hash',content_hash,'requiresAccept',requires_accept,'effectiveAt',effective_at,'accepted',accepted) order by document_key),'[]'::jsonb)) from results;
$$;
revoke all on function public.feture_document_content_valid(jsonb),public.feture_document_immutable(),public.feture_document_save(text,text,bigint,text,jsonb,boolean),public.feture_document_publish(text,text,bigint,boolean,timestamptz),public.feture_consent_accept(text,text,uuid[]),public.feture_consent_status(text,text) from public,anon,authenticated;
grant execute on function public.feture_document_content_valid(jsonb),public.feture_document_save(text,text,bigint,text,jsonb,boolean),public.feture_document_publish(text,text,bigint,boolean,timestamptz),public.feture_consent_accept(text,text,uuid[]),public.feture_consent_status(text,text) to service_role;
