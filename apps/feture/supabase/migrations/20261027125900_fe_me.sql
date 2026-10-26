-- Slice C «Я»: catalogs, account registration fields, profile details and settings, consents, interests
-- (docs/server/S1-DOMAIN-MODEL.md §3–4, S2-CATALOG «C»). Catalog rows come from 20261027130000_fe_catalog.sql.

-- Catalogs (system-owned, admin-editable later). Codes are stable ids used in profiles and filters.
create table feture.topic_category (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,31}$'),
  ru text not null, en text not null,
  plate text,
  position integer not null default 0,
  hidden boolean not null default false
);
create table feture.topic (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,31}$'),
  category_id text not null references feture.topic_category(id),
  ru text not null, en text not null,
  desc_ru text, desc_en text,
  position integer not null default 0,
  hidden boolean not null default false   -- admin-hidden (store-policy risk): not offered, not shown
);
create table feture.profile_option (
  kind text not null check (kind in ('gender', 'orient', 'role', 'status', 'format', 'seek')),
  code text not null check (code ~ '^[a-z][a-z0-9_-]{0,31}$'),
  ru text not null, en text not null,
  position integer not null default 0,
  hidden boolean not null default false,
  primary key (kind, code)
);
create table feture.place (
  id uuid primary key default feture.uuid_v7(),
  code text unique,                          -- seeded cities; user-submitted ones have none
  country text not null check (country ~ '^[A-Z]{2}$'),
  name_ru text, name_en text,
  state text not null default 'pending' check (state in ('approved', 'pending', 'rejected')),
  submitted_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now(),
  check (coalesce(name_ru, name_en) is not null)
);
create index place_pending on feture.place (created_at) where state = 'pending';

-- Nicknames nobody may take (case-insensitive).
create table feture.reserved_handle (handle text primary key check (handle = lower(handle)));
insert into feture.reserved_handle (handle) values
  ('admin'), ('administrator'), ('support'), ('help'), ('moderator'), ('moderation'), ('staff'), ('team'),
  ('feture'), ('official'), ('system'), ('root'), ('api'), ('null'), ('undefined'), ('me'), ('couple'),
  ('security'), ('privacy'), ('legal'), ('abuse'), ('noreply'), ('no_reply'), ('info');

-- Account: registration data. The birth date is kept only to compute age; it is never returned to anyone
-- but the owner's data export (S1 §3, OPEN-QUESTIONS Q20).
alter table feture.account
  add column birth_date date check (birth_date > date '1900-01-01'),
  add column news_opt_in boolean not null default false,
  add column chat_blur boolean not null default true,
  add column show_explicit boolean not null default false,  -- switched on only from the website (Apple 1.2)
  add column onboarded_at timestamptz;

-- Under-18 attempts: nothing else about the person is stored (AUTH-023).
create table feture.u18_event (
  key_hmac bytea not null check (octet_length(key_hmac) = 32),
  created_at timestamptz not null default now()
);
create index u18_event_key on feture.u18_event (key_hmac, created_at);

-- Accepted legal documents. Documents themselves stay in the admin-published public.feture_document_versions.
create table feture.consent (
  account_id uuid not null references feture.account(id) on delete cascade,
  document_version_id uuid not null,
  document_key text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz not null default now(),
  primary key (account_id, document_version_id)
);

create table feture.notification_settings (
  account_id uuid primary key references feture.account(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

-- Nickname change policy (Q24): at most once per 30 days.
alter table feture.profile add column handle_changed_at timestamptz;

-- Public profile details. Person-only fields are null for couples.
create table feture.profile_details (
  profile_id uuid primary key references feture.profile(id) on delete cascade,
  bio text not null default '' check (char_length(bio) <= 500),
  city_id uuid references feture.place(id) on delete set null,
  show_age boolean,                                     -- person only
  details_vis text check (details_vis in ('only', 'granted', 'all')),  -- person only; new accounts: only
  genders text[] not null default '{}' check (cardinality(genders) <= 5),
  orients text[] not null default '{}' check (cardinality(orients) <= 5),
  roles text[] not null default '{}' check (cardinality(roles) <= 5),
  formats text[] not null default '{}' check (cardinality(formats) <= 5),
  seeks text[] not null default '{}' check (cardinality(seeks) <= 9),
  status text,
  updated_at timestamptz not null default now()
);

-- Per-profile visibility settings (S1 §4). Defaults follow V21 and the 27.10.2026 owner decision.
create table feture.profile_settings (
  profile_id uuid primary key references feture.profile(id) on delete cascade,
  discover_mode text not null default 'visible' check (discover_mode in ('visible', 'hidden', 'off')),
  accept_profile_likes boolean not null default true,
  requests_from text not null default 'all' check (requests_from in ('all', 'matches', 'none')),
  links_from text not null default 'all' check (links_from in ('all', 'follow', 'none')),
  mentions_from text not null default 'all' check (mentions_from in ('all', 'follow', 'none')),
  activity_vis text not null default 'all' check (activity_vis in ('all', 'followers', 'off')),
  show_likes boolean not null default true,
  private_on boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Interests: 1–10 or a mark (discuss / hard limit), direction, visibility. Couples have their own.
create table feture.interest (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  topic_id text not null references feture.topic(id),
  value smallint check (value between 1 and 10),
  mark text check (mark in ('discuss', 'hard')),
  dir text[] not null default '{}' check (dir <@ array['give', 'get', 'watch']::text[]),
  vis text not null default 'only' check (vis in ('public', 'granted', 'only')),
  updated_at timestamptz not null default now(),
  primary key (profile_id, topic_id),
  check ((value is null) <> (mark is null)),
  check (mark is null or cardinality(dir) = 0)
);
create index interest_public on feture.interest (topic_id) where vis = 'public';

create table feture.interest_history (
  id uuid primary key default feture.uuid_v7(),
  profile_id uuid not null references feture.profile(id) on delete cascade,
  topic_id text not null references feture.topic(id),
  kind text not null check (kind in ('value', 'vis')),
  from_state jsonb,
  to_state jsonb,
  source text not null default 'manual' check (source in ('manual', 'test_archived')),
  acted_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now()
);
create index interest_history_profile on feture.interest_history (profile_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['topic_category', 'topic', 'profile_option', 'place', 'reserved_handle', 'u18_event', 'consent',
    'notification_settings', 'profile_details', 'profile_settings', 'interest', 'interest_history'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
  -- Current legal documents are published by the admin into the legacy schema; the API only reads them.
  if to_regclass('public.feture_document_current') is not null then
    execute 'grant select on public.feture_document_current to feture_api';
    if to_regclass('public.feture_document_versions') is not null then
      execute 'grant select on public.feture_document_versions to feture_api';
    end if;
  end if;
end $$;
