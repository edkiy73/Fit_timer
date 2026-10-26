-- FetUre platform foundation (stage 0, docs/server/S1-DOMAIN-MODEL.md, S2-API.md, S3-MEDIA.md).
-- New schema `feture`, separate from the frozen prelaunch tables public.feture_*.
-- Portable on purpose: no project_ref guard, no Supabase-only extensions, runs on PGlite in tests.
-- Owner of every user record is a profile (person or couple); every write also records the account that acted.

create schema if not exists feture;
revoke all on schema feture from public;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'feture_api') then
    create role feture_api nologin noinherit;  -- login and password are set outside migrations
  end if;
end $$;
grant usage on schema feture to feture_api;

-- Time-ordered UUID v7 (RFC 9562) from gen_random_uuid(); no pgcrypto needed.
create function feture.uuid_v7() returns uuid
language sql volatile set search_path = pg_catalog as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
        from 1 for 6),
      52, 1), 53, 1), 'hex')::uuid
$$;

-- Accounts. The Core login key never enters domain tables: account_link stores an HMAC of it.
create table feture.account (
  id uuid primary key default feture.uuid_v7(),
  state text not null default 'active' check (state in ('active', 'suspended', 'deleting', 'deleted')),
  locale text not null default 'system' check (locale ~ '^(system|[a-z]{2}(-[A-Z]{2})?)$'),
  person_profile_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table feture.account_link (
  core_key_hmac bytea primary key check (octet_length(core_key_hmac) = 32),
  account_id uuid not null unique references feture.account(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Profiles: a person (one per account) or a couple (two member accounts).
create table feture.profile (
  id uuid primary key default feture.uuid_v7(),
  kind text not null check (kind in ('person', 'couple')),
  handle text check (handle ~ '^[A-Za-z0-9_.]{3,20}$'),
  name text not null default '' check (char_length(name) <= 60),
  state text not null default 'active' check (state in ('active', 'paused', 'archived', 'suspended', 'deleted')),
  avatar_asset_id uuid,
  -- Couples: bumped by every immediate narrowing (hide, close access, stop); pending widenings
  -- requested under an older epoch can no longer be approved.
  safety_epoch integer not null default 0,
  rev integer not null default 1 check (rev > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, kind)
);
-- Nicknames are unique across people and couples, case-insensitively (V21 AUTH-001/002).
create unique index profile_handle_key on feture.profile (lower(handle)) where handle is not null;

alter table feture.account
  add constraint account_person_profile_fk foreign key (person_profile_id) references feture.profile(id);

create table feture.profile_member (
  profile_id uuid not null,
  profile_kind text not null,
  account_id uuid not null references feture.account(id),
  state text not null default 'active' check (state in ('invited', 'active', 'left')),
  joined_at timestamptz,
  left_at timestamptz,
  -- Couples: this member wants to approve the partner's widening changes («согласие партнёра»).
  -- Each member sets it for themselves; default off (V21 Q09).
  approves_partner boolean not null default false,
  primary key (profile_id, account_id),
  foreign key (profile_id, profile_kind) references feture.profile(id, kind) on delete cascade
);
-- An account is an active member of at most one couple at a time.
create unique index profile_member_one_couple on feture.profile_member (account_id)
  where profile_kind = 'couple' and state = 'active';
-- A person profile has exactly one member.
create unique index profile_member_person_single on feture.profile_member (profile_id)
  where profile_kind = 'person';
create index profile_member_account on feture.profile_member (account_id) where state = 'active';

-- Partner consent: a widening change by one partner waits for the other (V21 guide §5.4).
create table feture.partner_approval (
  id uuid primary key default feture.uuid_v7(),
  profile_id uuid not null,
  profile_kind text not null default 'couple' check (profile_kind = 'couple'),
  kind text not null check (kind ~ '^[a-z]+(\.[a-zA-Z]+)+$'),
  target_type text not null,
  target_id uuid,
  change jsonb not null check (jsonb_typeof(change) = 'object'),
  summary jsonb not null default '[]' check (jsonb_typeof(summary) = 'array'),
  state text not null default 'pending' check (state in ('pending', 'approved', 'returned', 'cancelled', 'expired')),
  safety_epoch integer not null,
  requested_by uuid not null references feture.account(id),
  decided_by uuid references feture.account(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  foreign key (profile_id, profile_kind) references feture.profile(id, kind) on delete cascade,
  check ((state = 'pending') = (decided_at is null)),
  check (decided_by is null or decided_by <> requested_by)
);
create unique index partner_approval_one_pending on feture.partner_approval (profile_id, kind, target_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'pending';

-- Idempotency: one stored result per (account, client operation id).
create table feture.op_ledger (
  account_id uuid not null references feture.account(id) on delete cascade,
  op_id uuid not null,
  action text not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (account_id, op_id)
);
create index op_ledger_created on feture.op_ledger (created_at);

-- Transactional outbox: side effects are written with the change and processed by the queue worker.
create table feture.outbox (
  id bigint generated always as identity primary key,
  topic text not null check (topic ~ '^[a-z]+(\.[a-zA-Z]+)+$'),
  profile_id uuid,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_until timestamptz,
  done_at timestamptz,
  last_error text
);
create index outbox_ready on feture.outbox (available_at, id) where done_at is null;

-- Media (S3). Bytes live in object storage; only metadata here.
create table feture.media_asset (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  uploaded_by uuid not null references feture.account(id),
  kind text not null check (kind in ('image', 'video')),
  purpose text not null check (purpose in ('post', 'avatar', 'private', 'chat', 'gallery', 'community', 'event', 'verification')),
  state text not null default 'pending_upload'
    check (state in ('pending_upload', 'uploaded', 'scanning', 'needs_review', 'approved', 'rejected', 'blocked', 'removed')),
  explicitness text not null default 'unknown' check (explicitness in ('unknown', 'safe', 'explicit')),
  explicitness_source text check (explicitness_source in ('classifier', 'author', 'staff')),
  storage_key text not null unique,
  mime text not null,
  declared_bytes bigint not null check (declared_bytes > 0),
  bytes bigint check (bytes > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  duration_ms integer check (duration_ms > 0),
  sha256 bytea check (sha256 is null or octet_length(sha256) = 32),
  view_rule text not null default 'normal' check (view_rule in ('normal', 'once', 'timer')),
  view_seconds integer check (view_seconds between 1 and 60),
  expires_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  upload_expires_at timestamptz not null default now() + interval '15 minutes',
  scanned_at timestamptz,
  approved_at timestamptz,
  removed_at timestamptz,
  check ((view_rule = 'timer') = (view_seconds is not null)),
  -- Avatars and community/event covers are public everywhere, so they can never be approved as explicit.
  check (not (purpose in ('avatar', 'community', 'event') and explicitness = 'explicit' and state = 'approved'))
);
create index media_asset_owner on feture.media_asset (owner_profile_id, created_at desc);
create index media_asset_pending on feture.media_asset (upload_expires_at) where state = 'pending_upload';

alter table feture.profile
  add constraint profile_avatar_fk foreign key (avatar_asset_id) references feture.media_asset(id) on delete set null;

create table feture.media_attachment (
  asset_id uuid not null references feture.media_asset(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'album', 'message', 'private', 'avatar', 'community', 'event')),
  target_id uuid not null,
  position smallint not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  primary key (target_type, target_id, asset_id)
);
create index media_attachment_asset on feture.media_attachment (asset_id);

create table feture.media_view (
  asset_id uuid not null references feture.media_asset(id) on delete cascade,
  viewer_profile_id uuid not null references feture.profile(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (asset_id, viewer_profile_id)
);

create table feture.media_scan (
  id uuid primary key default feture.uuid_v7(),
  asset_id uuid not null references feture.media_asset(id) on delete cascade,
  provider text not null,
  check_kind text not null check (check_kind in ('file', 'csam', 'explicitness', 'staff')),
  result text not null check (result in ('pass', 'match', 'safe', 'explicit', 'uncertain', 'error', 'approved', 'rejected')),
  score real,
  provider_ref text,
  created_at timestamptz not null default now()
);
create index media_scan_asset on feture.media_scan (asset_id, created_at);

-- Nobody but the API role touches this schema; browsers never query it.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'feture' loop
    execute format('alter table feture.%I enable row level security', t.tablename);
    execute format('alter table feture.%I force row level security', t.tablename);
    execute format('revoke all on feture.%I from public', t.tablename);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t.tablename);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t.tablename);
  end loop;
end $$;
grant usage on sequence feture.outbox_id_seq to feture_api;
grant execute on function feture.uuid_v7() to feture_api;
