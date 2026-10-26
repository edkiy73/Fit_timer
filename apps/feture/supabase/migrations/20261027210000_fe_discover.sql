-- Slice F: Discover, likes and matches (docs/server/S1-DOMAIN-MODEL.md §11, extract/people-discover-chats.md §1.3–1.6).
-- Likes and decisions are private to the profile that made them; a like is never shown to its target as a «no».

alter table feture.account add column premium_until timestamptz;   -- slice H fills it (purchase or gift)

-- The Discover filter of a profile (a couple has its own). «Рядом» needs a location and comes later.
create table feture.discover_filter (
  profile_id uuid primary key references feture.profile(id) on delete cascade,
  show text not null default 'all' check (show in ('all', 'people', 'pairs')),
  age_min smallint not null default 18 check (age_min between 18 and 99),
  age_max smallint not null default 99 check (age_max between 18 and 99),
  city_id uuid references feture.place(id) on delete set null,          -- null: any city
  genders text[] not null default '{}' check (cardinality(genders) <= 10),
  orients text[] not null default '{}' check (cardinality(orients) <= 10),
  formats text[] not null default '{}' check (cardinality(formats) <= 10),
  seeks text[] not null default '{}' check (cardinality(seeks) <= 10),
  roles text[] not null default '{}' check (cardinality(roles) <= 10),
  topics text[] not null default '{}' check (cardinality(topics) <= 10),
  updated_at timestamptz not null default now(),
  check (age_min <= age_max)
);

-- One decision per (profile, target): seen and liked or passed. Undo deletes it; it is never shown to the target.
create table feture.discover_decision (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  target_profile_id uuid not null references feture.profile(id) on delete cascade,
  decision text not null check (decision in ('like', 'pass')),
  source text not null check (source in ('discover', 'profile', 'likes')),
  acted_by uuid not null references feture.account(id),
  decided_at timestamptz not null default now(),
  primary key (profile_id, target_profile_id),
  check (profile_id <> target_profile_id)
);
create index discover_decision_recent on feture.discover_decision (profile_id, decided_at desc);

create table feture.profile_like (
  id uuid primary key default feture.uuid_v7(),
  from_profile_id uuid not null references feture.profile(id) on delete cascade,
  to_profile_id uuid not null references feture.profile(id) on delete cascade,
  source text not null check (source in ('discover', 'profile', 'likes')),
  initiator_account_id uuid not null references feture.account(id),
  state text not null default 'active' check (state in ('active', 'withdrawn', 'dismissed', 'matched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_profile_id <> to_profile_id)
);
create unique index profile_like_one_active on feture.profile_like (from_profile_id, to_profile_id) where state = 'active';
create index profile_like_incoming on feture.profile_like (to_profile_id) where state = 'active';

-- One active match per pair of profiles (stored with the smaller id first).
create table feture.profile_match (
  id uuid primary key default feture.uuid_v7(),
  profile_a uuid not null references feture.profile(id) on delete cascade,
  profile_b uuid not null references feture.profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by_profile uuid references feture.profile(id) on delete set null,
  check (profile_a < profile_b)
);
create unique index profile_match_one_active on feture.profile_match (profile_a, profile_b) where ended_at is null;
create index profile_match_b on feture.profile_match (profile_b) where ended_at is null;

-- Related profiles never meet in Discover: they share an account (own profiles) or a couple holds both sides' people.
create function feture.related(a uuid, b uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  with aa as (select account_id from feture.profile_member where profile_id = a and state = 'active'),
       bb as (select account_id from feture.profile_member where profile_id = b and state = 'active')
  select exists (select 1 from aa join bb using (account_id))
      or exists (select 1 from feture.profile_member x join feture.profile_member y on y.profile_id = x.profile_id and y.state = 'active'
                 join feture.profile c on c.id = x.profile_id and c.kind = 'couple' and c.state in ('active', 'paused')
                 where x.state = 'active' and x.account_id in (select account_id from aa) and y.account_id in (select account_id from bb))
$$;

-- Ages of the people of a profile (one for a person, two for a couple).
create function feture.profile_ages(p uuid) returns smallint[]
language sql stable set search_path = pg_catalog, feture as $$
  select coalesce(array_agg(extract(year from age(current_date, a.birth_date))::smallint), '{}')
  from feture.profile_member m join feture.account a on a.id = m.account_id
  where m.profile_id = p and m.state = 'active' and a.birth_date is not null
$$;

-- In the Discover pool: visible, active people only (no restricted account), an approved safe avatar.
create function feture.discoverable(p uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (
    select 1 from feture.profile x
    join feture.profile_settings s on s.profile_id = x.id and s.discover_mode = 'visible'
    join feture.media_asset av on av.id = x.avatar_asset_id and av.state = 'approved' and av.explicitness = 'safe'
    where x.id = p and x.state = 'active')
  and not exists (
    select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
    where m.profile_id = p and m.state = 'active' and a.state <> 'active')
$$;

do $$
declare t text;
begin
  foreach t in array array['discover_filter', 'discover_decision', 'profile_like', 'profile_match'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
grant execute on function feture.related(uuid, uuid) to feture_api;
grant execute on function feture.profile_ages(uuid) to feture_api;
grant execute on function feture.discoverable(uuid) to feture_api;
