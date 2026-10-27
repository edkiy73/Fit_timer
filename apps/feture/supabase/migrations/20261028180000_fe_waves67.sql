-- FetUre backlog waves 6 and 7 (28.10.2026): couples (a returned change carries a note, an invitation link for a
-- partner without an account), followers removed by the person they follow, read times of messages, the dating switch
-- with «Сообщить о запуске», and a coarse shared location for «Рядом» in Discover.

-- «Вернуть на доработку» with an optional note the author sees wherever the return is shown (V21 returnSend).
alter table feture.partner_approval add column return_note text check (return_note is null or char_length(return_note) <= 300);
create index if not exists partner_approval_returned on feture.partner_approval (profile_id, decided_at desc) where state = 'returned';

-- An invitation link for a partner who has no account yet (V21 pairShareLink): one live link per account, a hash
-- only, single use, expires after 7 days, revocable. Using it after sign-up forms the couple (couple.linkAccept).
create table feture.couple_link (
  id uuid primary key default feture.uuid_v7(),
  from_account uuid not null references feture.account(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references feture.account(id) on delete set null,
  revoked_at timestamptz,
  check (used_at is null or revoked_at is null)
);
create unique index couple_link_one_live on feture.couple_link (from_account) where used_at is null and revoked_at is null;

-- «Удалить из подписчиков» (V21 flwRemove21): the removed follow, kept for a short undo window only.
create table feture.follow_removed (
  target_profile_id uuid not null references feture.profile(id) on delete cascade,
  follower_profile_id uuid not null references feture.profile(id) on delete cascade,
  followed_at timestamptz not null,
  acted_by uuid not null references feture.account(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (target_profile_id, follower_profile_id)
);

-- Read times (V21 chatReadInfo): every forward move of a member's read mark, so the sender can see when each reader
-- reached a message. Only the sender of a message is ever shown these times.
create table feture.conversation_read (
  conversation_id uuid not null references feture.conversation(id) on delete cascade,
  account_id uuid not null references feture.account(id) on delete cascade,
  up_to_seq bigint not null,
  read_at timestamptz not null default now(),
  primary key (conversation_id, account_id, up_to_seq)
);

-- Platform switches set by staff (only «dating» for now) and «Сообщить о запуске» wishes (V21 notifyDating).
create table feture.platform_switch (
  key text primary key check (key in ('dating')),
  is_on boolean not null,
  changed_by uuid references feture.account(id) on delete set null,
  changed_at timestamptz not null default now()
);
insert into feture.platform_switch (key, is_on) values ('dating', true) on conflict do nothing;
create table feture.launch_wish (
  account_id uuid not null references feture.account(id) on delete cascade,
  feature text not null check (feature in ('dating')),
  created_at timestamptz not null default now(),
  primary key (account_id, feature)
);

-- «Рядом» (V21 dfWhere / dfPlaceMode / dfGeo): a location only when the person shares it, stored already rounded to a
-- 0.05° grid (about 5 km). Nobody else ever gets the coordinates, only a distance in 5 km steps.
create table feture.profile_location (
  profile_id uuid primary key references feture.profile(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90 and round(lat::numeric * 20) = lat::numeric * 20),
  lon double precision not null check (lon between -180 and 180 and round(lon::numeric * 20) = lon::numeric * 20),
  shared_by uuid not null references feture.account(id) on delete cascade,
  shared_at timestamptz not null default now()
);
alter table feture.discover_filter
  add column place_mode text not null default 'city' check (place_mode in ('city', 'nearby')),
  add column radius_km smallint not null default 25 check (radius_km between 5 and 200);

-- Great-circle distance in km (haversine); plain SQL, no PostGIS.
create function feture.km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) returns double precision
language sql immutable parallel safe set search_path = pg_catalog as $$
  select 2 * 6371 * asin(least(1, sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))))
$$;

-- «Популярное» of community discussions: recent published discussions by community.
create index if not exists post_community_recent on feture.post (community_id, published_at desc) where state = 'published' and community_id is not null;

do $$
declare t text;
begin
  foreach t in array array['couple_link', 'follow_removed', 'conversation_read', 'platform_switch', 'launch_wish', 'profile_location'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
grant execute on function feture.km(double precision, double precision, double precision, double precision) to feture_api;
