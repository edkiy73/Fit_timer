-- S4 step 4 (docs/server/S4-MODERATION.md §2–4, §6): profile restriction, reports on communities, events and chat
-- messages, appeals decided by another staff member, the city queue, event reminders.

-- Restriction: out of Discover and search, no new likes, access requests, messages or links; a person's restriction
-- covers the couples they act as.
alter table feture.profile add column restricted_at timestamptz, add column restriction_rule text;

create function feture.restricted(p uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (select 1 from feture.profile x where x.id = p and x.restricted_at is not null)
      or exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
                 where m.profile_id = p and m.state = 'active' and pp.restricted_at is not null)
$$;
grant execute on function feture.restricted(uuid) to feture_api;

create or replace function feture.discoverable(p uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (
    select 1 from feture.profile x
    join feture.profile_settings s on s.profile_id = x.id and s.discover_mode = 'visible'
    join feture.media_asset av on av.id = x.avatar_asset_id and av.state = 'approved' and av.explicitness = 'safe'
    where x.id = p and x.state = 'active')
  and not exists (
    select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
    where m.profile_id = p and m.state = 'active' and a.state <> 'active')
  and (select x.kind = 'person' or (
         select count(*) = 2 and coalesce(bool_and(coalesce(a.age_verified_until > now(), false)), false)
         from feture.profile_member m join feture.account a on a.id = m.account_id where m.profile_id = p and m.state = 'active')
       from feture.profile x where x.id = p)
  and not feture.restricted(p)
$$;

-- Chat reports carry the selected messages (Q27); the report's target is the conversation.
alter table feture.report add column message_ids uuid[] check (message_ids is null or cardinality(message_ids) between 1 and 20);
alter table feture.report drop constraint report_target_type_check;
alter table feture.report add constraint report_target_type_check
  check (target_type in ('profile', 'post', 'reply', 'discussion', 'community', 'event', 'message', 'media', 'conversation'));

-- Appeals of removals and restrictions; decided by a lead who did not make the original decision.
create table feture.appeal (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'community', 'event', 'profile')),
  target_id uuid not null,
  body text not null check (char_length(body) between 10 and 1000),
  state text not null default 'open' check (state in ('open', 'granted', 'denied')),
  decided_by uuid references feture.account(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index appeal_one_open on feture.appeal (target_type, target_id) where state = 'open';

-- A reminder the day before goes once.
alter table feture.event add column reminded_at timestamptz;

alter table feture.appeal enable row level security;
alter table feture.appeal force row level security;
revoke all on feture.appeal from public;
create policy api_all on feture.appeal to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.appeal to feture_api;
