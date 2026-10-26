-- Slice C2: private part and access (docs/server/S1-DOMAIN-MODEL.md §6, S2-CATALOG «C. Приватная часть»).
-- Scopes: info (description + interests marked «По доступу»), photos, video. Private media are media_asset rows with
-- purpose 'private' attached to the profile (media_attachment target_type 'private').

-- Verified adult age (provider result, or a staff grant during prelaunch). Needed to ask for someone's private part
-- (OPEN-QUESTIONS Q26). Only the result is stored, never the document.
alter table feture.account add column age_verified_until timestamptz;

create table feture.private_part (
  profile_id uuid primary key references feture.profile(id) on delete cascade,
  text text not null default '' check (char_length(text) <= 1000),
  updated_at timestamptz not null default now()
);

create table feture.access_request (
  id uuid primary key default feture.uuid_v7(),
  requester_profile_id uuid not null references feture.profile(id) on delete cascade,
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  viewer_account_ids uuid[] not null check (cardinality(viewer_account_ids) between 1 and 2),
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['info', 'photos', 'video']::text[]),
  state text not null default 'pending' check (state in ('pending', 'granted', 'partial', 'declined', 'cancelled', 'closed')),
  closed_reason text check (closed_reason in ('private_off', 'blocked', 'couple_stopped', 'revoked', 'expired')),
  acted_by uuid not null references feture.account(id),
  decided_by uuid references feture.account(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (requester_profile_id <> owner_profile_id),
  check ((state = 'pending') = (decided_at is null))
);
create unique index access_request_one_pending on feture.access_request (requester_profile_id, owner_profile_id) where state = 'pending';
create index access_request_owner on feture.access_request (owner_profile_id, created_at desc);
create index access_request_quota on feture.access_request (acted_by, created_at);

create table feture.access_grant (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  viewer_profile_id uuid not null references feture.profile(id) on delete cascade,
  viewer_account_ids uuid[] not null check (cardinality(viewer_account_ids) between 1 and 2),
  scopes text[] not null check (cardinality(scopes) between 1 and 3 and scopes <@ array['info', 'photos', 'video']::text[]),
  until timestamptz,
  request_id uuid references feture.access_request(id) on delete set null,
  granted_by uuid not null references feture.account(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (owner_profile_id <> viewer_profile_id)
);
-- One active grant per (owner, viewer): a new grant replaces the previous one.
create unique index access_grant_active on feture.access_grant (owner_profile_id, viewer_profile_id) where revoked_at is null;
create index access_grant_viewer on feture.access_grant (viewer_profile_id) where revoked_at is null;

do $$
declare t text;
begin
  foreach t in array array['private_part', 'access_request', 'access_grant'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
