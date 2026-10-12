-- C01.5a: private photo lifecycle. No bucket URLs or client Storage grants.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_post_photos(
 author_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,post_id uuid not null references public.feture_posts(id) on delete cascade,
 expected_revision bigint not null check(expected_revision>0),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 object_path text not null unique,bytes integer not null check(bytes between 1 and 524288),
 width integer not null check(width between 1 and 1024),height integer not null check(height between 1 and 1024),
 state text not null default 'prepared' check(state in ('prepared','attached','retired')),
 consent_version text not null default 'private-photo-v1' check(consent_version='private-photo-v1'),
 created_at timestamptz not null default clock_timestamp(),primary key(author_hash,operation_id)
);
create unique index feture_post_photos_one_attached on public.feture_post_photos(post_id) where state='attached';
create index feture_post_photos_owner_created on public.feture_post_photos(author_hash,created_at);
create index feture_post_photos_prepared_expiry on public.feture_post_photos(created_at) where state='prepared';
create table public.feture_photo_gc(object_path text primary key,created_at timestamptz not null default clock_timestamp());
alter table public.feture_post_photos enable row level security;
alter table public.feture_photo_gc enable row level security;
revoke all on public.feture_post_photos,public.feture_photo_gc from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_post_photos to service_role;
grant select,insert,delete on public.feture_photo_gc to service_role;
-- Profile/post cascade must leave an erasure receipt even after ownership disappears.
create function public.feture_photo_retire() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' or (new.state='retired' and old.state<>'retired') then
  insert into public.feture_photo_gc(object_path) values(old.object_path) on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger feture_photo_retire after delete or update on public.feture_post_photos for each row execute function public.feture_photo_retire();
create function public.feture_post_photo_lifecycle() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.state='deleted' then update public.feture_post_photos set state='retired' where post_id=new.id and state<>'retired';end if;
 -- Until a staff image-review UI is shipped, text-only approval cannot publish photos.
 if new.state='published' and old.state<>'published' and exists(select 1 from public.feture_post_photos where post_id=new.id and state='attached') then raise exception 'photo_review_required';end if;
 return new;
end $$;
create trigger feture_post_photo_lifecycle before update on public.feture_posts for each row execute function public.feture_post_photo_lifecycle();
create function public.feture_post_photo_command(p_actor text,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';keys text[];pid uuid;op uuid;p public.feture_posts%rowtype;r public.feture_post_photos%rowtype;expected bigint;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='read' then
  if keys is distinct from array['action','id','revision']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='prepare' then
  if keys is distinct from array['action','bytes','consent','contentHash','expectedRevision','height','id','operationId','width']::text[]
   or p_command->'consent' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'contentHash') is distinct from 'string'
   or p_command->>'contentHash' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_command->'bytes') is distinct from 'number' or p_command->>'bytes' !~ '^[1-9][0-9]{0,5}$'
   or jsonb_typeof(p_command->'width') is distinct from 'number' or p_command->>'width' !~ '^[1-9][0-9]{0,3}$'
   or jsonb_typeof(p_command->'height') is distinct from 'number' or p_command->>'height' !~ '^[1-9][0-9]{0,3}$'
   or (p_command->>'bytes')::integer>524288 or (p_command->>'width')::integer>1024 or (p_command->>'height')::integer>1024 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act in ('attach','remove') then
  if keys is distinct from array['action','expectedRevision','id','operationId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;
 if act='read' then
  if jsonb_typeof(p_command->'revision') is distinct from 'number' or p_command->>'revision' !~ '^[1-9][0-9]{0,14}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  select * into p from public.feture_posts where id=pid and state<>'deleted';
  if p.id is null or p.revision<>(p_command->>'revision')::bigint or not public.feture_peer_eligible(p_actor)
   or (p.author_hash<>p_actor and not public.feture_post_visible(p,p_actor)) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  select * into r from public.feture_post_photos where post_id=pid and state='attached';
  return jsonb_build_object('ok',true,'photo',case when r.operation_id is null then null else jsonb_build_object('path',r.object_path,'hash',r.content_hash,'bytes',r.bytes,'width',r.width,'height',r.height) end);
 end if;
 if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$'
  or jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 op:=(p_command->>'operationId')::uuid;expected:=(p_command->>'expectedRevision')::bigint;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 select * into p from public.feture_posts where id=pid for update;
 if p.id is null or p.author_hash<>p_actor then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into r from public.feture_post_photos where author_hash=p_actor and operation_id=op;
 if r.operation_id is not null and (r.post_id<>pid or r.expected_revision<>expected) then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
 if act='prepare' then
  if not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if r.operation_id is not null and (r.content_hash<>p_command->>'contentHash' or r.bytes<>(p_command->>'bytes')::integer or r.width<>(p_command->>'width')::integer or r.height<>(p_command->>'height')::integer) then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if r.operation_id is not null and r.state<>'prepared' then return jsonb_build_object('ok',true,'upload',false,'entry',public.feture_post_dto(p,true));end if;
  if p.state='deleted' then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  if r.operation_id is null then
   if exists(select 1 from public.feture_post_operations where account_hash=p_actor and operation_id=op) then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
   if (select count(*)>=20 from public.feture_post_photos where author_hash=p_actor and created_at>clock_timestamp()-interval '1 day') then return jsonb_build_object('ok',false,'error','rate_limited');end if;
   insert into public.feture_post_photos(author_hash,operation_id,post_id,expected_revision,content_hash,object_path,bytes,width,height)
    values(p_actor,op,pid,expected,p_command->>'contentHash',pid::text||'/'||op::text||'.jpg',(p_command->>'bytes')::integer,(p_command->>'width')::integer,(p_command->>'height')::integer) returning * into r;
  end if;
  return jsonb_build_object('ok',true,'upload',true,'path',r.object_path);
 elsif act='attach' then
  if not public.feture_peer_eligible(p_actor) or r.operation_id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if r.state<>'prepared' then return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',true);end if;
  if p.state='deleted' then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_post_photos set state='retired' where post_id=pid and state='attached';
  update public.feture_post_photos set state='attached' where author_hash=p_actor and operation_id=op;
 else
  -- Reuse the regular post operation receipt; retries cannot remove a later replacement.
  if r.operation_id is not null then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if exists(select 1 from public.feture_post_operations where account_hash=p_actor and operation_id=op and post_id=pid and action='photo.remove' and payload_hash=encode(sha256(convert_to(p_command::text,'UTF8')),'hex')) then return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',true);end if;
  if exists(select 1 from public.feture_post_operations where account_hash=p_actor and operation_id=op) then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if p.state='deleted' then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  if p.revision<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  update public.feture_post_photos set state='retired' where post_id=pid and state in ('attached','prepared');
 end if;
 update public.feture_posts set state='draft',audience='private',published_at=null,submitted_at=null,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
 if act='remove' then insert into public.feture_post_operations(account_hash,operation_id,post_id,action,payload_hash,applied_revision) values(p_actor,op,pid,'photo.remove',encode(sha256(convert_to(p_command::text,'UTF8')),'hex'),p.revision);end if;
 return jsonb_build_object('ok',true,'entry',public.feture_post_dto(p,true),'replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'error','invalid_request');
end $$;
revoke all on function public.feture_photo_retire(),public.feture_post_photo_lifecycle(),public.feture_post_photo_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_photo_retire(),public.feture_post_photo_lifecycle(),public.feture_post_photo_command(text,jsonb) to service_role;

-- Expired incomplete uploads become erasure work; no client can run the sweep.
create function public.feture_photo_sweep() returns void language sql security invoker set search_path=pg_catalog,public as $$
 update public.feture_post_photos set state='retired' where state='prepared' and created_at<clock_timestamp()-interval '1 day';
$$;
revoke all on function public.feture_photo_sweep() from public,anon,authenticated;
grant execute on function public.feture_photo_sweep() to service_role;
-- PGlite contracts do not include Storage. Production uses this one scoped bucket.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('feture-post-photos','feture-post-photos',false,524288,array['image/jpeg']) on conflict(id) do nothing;
  if not exists(select 1 from storage.buckets where id='feture-post-photos' and not public and file_size_limit=524288 and allowed_mime_types=array['image/jpeg']) then raise exception 'feture_photo_bucket_conflict';end if;
  create policy feture_photos_no_direct_client on storage.objects as restrictive for all to anon,authenticated
   using(bucket_id<>'feture-post-photos') with check(bucket_id<>'feture-post-photos');
 end if;
end $$;
