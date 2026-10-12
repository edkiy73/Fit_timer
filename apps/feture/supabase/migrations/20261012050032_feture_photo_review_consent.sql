-- C01.5b2a: staged owner consent only. No staff image access or publication enablement.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;
end $$;
create table public.feture_photo_review_consents(
 post_id uuid primary key references public.feture_posts(id) on delete cascade,
 author_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 post_revision bigint check(post_revision>0),photo_operation uuid,
 content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 consent_version text not null check(consent_version='photo-staff-review-v1'),
 revision bigint not null check(revision>0),revoked boolean not null default false,
 updated_at timestamptz not null default clock_timestamp(),
 check(revoked or (post_revision is not null and photo_operation is not null and content_hash is not null))
);
create table public.feture_photo_review_operations(
 author_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,post_id uuid not null references public.feture_posts(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),primary key(author_hash,operation_id)
);
alter table public.feture_photo_review_consents enable row level security;
alter table public.feture_photo_review_operations enable row level security;
revoke all on public.feture_photo_review_consents,public.feture_photo_review_operations from public,anon,authenticated,service_role;
grant select,insert,update on public.feture_photo_review_consents to service_role;
grant select,insert on public.feture_photo_review_operations to service_role;

create function public.feture_photo_review_status(p_actor text,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.feture_posts%rowtype;r public.feture_post_photos%rowtype;c public.feture_photo_review_consents%rowtype;active boolean;
begin
 select * into p from public.feture_posts where id=p_id and author_hash=p_actor;
 if p.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into r from public.feture_post_photos where post_id=p_id and state='attached';
 select * into c from public.feture_photo_review_consents where post_id=p_id and author_hash=p_actor;
 active:=coalesce(not c.revoked and c.consent_version='photo-staff-review-v1' and p.state='pending'
  and c.post_revision=p.revision and c.photo_operation=r.operation_id and c.content_hash=r.content_hash
  and public.feture_peer_eligible(p_actor),false);
 return jsonb_build_object('ok',true,'reviewConsent',jsonb_build_object('postId',p.id,'postRevision',p.revision,
  'revision',coalesce(c.revision,0),'hasPhoto',r.operation_id is not null,'active',active));
end $$;

create function public.feture_photo_review_command(p_actor text,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare act text:=p_command->>'action';keys text[];pid uuid;op uuid;digest text;expected bigint;
 p public.feture_posts%rowtype;r public.feture_post_photos%rowtype;c public.feture_photo_review_consents%rowtype;
 prior public.feture_photo_review_operations%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if act='status' then
  if keys is distinct from array['action','id']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='consent' then
  if keys is distinct from array['action','consent','consentVersion','expectedConsentRevision','expectedRevision','id','operationId']::text[]
   or p_command->'consent' is distinct from 'true'::jsonb or p_command->'consentVersion' is distinct from '"photo-staff-review-v1"'::jsonb
   or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
   or p_command->>'expectedRevision' !~ '^[1-9][0-9]{0,14}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 elsif act='revoke' then
  if keys is distinct from array['action','expectedConsentRevision','id','operationId']::text[] then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 else return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if jsonb_typeof(p_command->'id') is distinct from 'string' or p_command->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'id')::uuid;
 if act='status' then return public.feture_photo_review_status(p_actor,pid);end if;
 if jsonb_typeof(p_command->'operationId') is distinct from 'string' or p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or jsonb_typeof(p_command->'expectedConsentRevision') is distinct from 'number'
  or p_command->>'expectedConsentRevision' !~ '^(0|[1-9][0-9]{0,14})$' then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 op:=(p_command->>'operationId')::uuid;expected:=(p_command->>'expectedConsentRevision')::bigint;
 perform 1 from public.feture_profiles where account_hash=p_actor for update;
 select * into p from public.feture_posts where id=pid for update;
 if p.id is null or p.author_hash<>p_actor then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into c from public.feture_photo_review_consents where post_id=pid for update;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into prior from public.feture_photo_review_operations where author_hash=p_actor and operation_id=op;
 if prior.operation_id is not null then
  if prior.post_id<>pid or prior.payload_hash<>digest then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  return public.feture_photo_review_status(p_actor,pid)||jsonb_build_object('replayed',true);
 end if;
 if coalesce(c.revision,0)<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if act='consent' then
  -- Only this exact pending post/photo, derived on the server, is consented.
  if not public.feture_peer_eligible(p_actor) or p.state<>'pending' then return jsonb_build_object('ok',false,'error','review_required');end if;
  if p.revision<>(p_command->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
  select * into r from public.feture_post_photos where post_id=pid and state='attached';
  if r.operation_id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  insert into public.feture_photo_review_consents(post_id,author_hash,post_revision,photo_operation,content_hash,consent_version,revision,revoked)
   values(pid,p_actor,p.revision,r.operation_id,r.content_hash,'photo-staff-review-v1',expected+1,false)
   on conflict(post_id) do update set post_revision=excluded.post_revision,photo_operation=excluded.photo_operation,
    content_hash=excluded.content_hash,consent_version=excluded.consent_version,revision=excluded.revision,revoked=false,updated_at=clock_timestamp();
 else
  -- Withdrawal remains available after post edits/deletion or adult/legal expiry.
  if c.post_id is not null then
   update public.feture_photo_review_consents set revoked=true,revision=revision+1,updated_at=clock_timestamp() where post_id=pid;
  else
   -- Even withdrawal before a first grant advances CAS and blocks a delayed grant.
   insert into public.feture_photo_review_consents(post_id,author_hash,consent_version,revision,revoked) values(pid,p_actor,'photo-staff-review-v1',1,true);
  end if;
 end if;
 insert into public.feture_photo_review_operations(author_hash,operation_id,post_id,payload_hash) values(p_actor,op,pid,digest);
 return public.feture_photo_review_status(p_actor,pid)||jsonb_build_object('replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'error','invalid_request');
end $$;
revoke all on function public.feture_photo_review_status(text,uuid),public.feture_photo_review_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_photo_review_status(text,uuid),public.feture_photo_review_command(text,jsonb) to service_role;
