-- Slice F2: people search and links between profiles (docs/server/S1-DOMAIN-MODEL.md §11, extract/people-discover-chats.md §1.9, §2.3).
-- A link is shared by its two endpoints; it shows only as far as the more private of their two choices allows.

create index profile_handle_prefix on feture.profile (lower(handle) text_pattern_ops) where state = 'active';
create index profile_name_prefix on feture.profile (lower(name) text_pattern_ops) where state = 'active';

create table feture.profile_link (
  id uuid primary key default feture.uuid_v7(),
  a_profile_id uuid not null references feture.profile(id) on delete cascade,   -- who proposed it
  b_profile_id uuid not null references feture.profile(id) on delete cascade,
  kind text not null check (kind in ('partner', 'play', 'ds', 'mentor', 'meta', 'friend')),
  a_side text check (a_side in ('dom', 'sub', 'mentor', 'mentee')),
  b_side text check (b_side in ('dom', 'sub', 'mentor', 'mentee')),
  state text not null default 'pending' check (state in ('pending', 'ok')),
  a_vis text not null default 'all' check (a_vis in ('all', 'followers', 'us')),
  b_vis text not null default 'all' check (b_vis in ('all', 'followers', 'us')),
  change jsonb check (change is null or jsonb_typeof(change) = 'object'),     -- {kind, aSide, bSide, by}: waits for the other side
  acted_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (a_profile_id <> b_profile_id),
  check ((kind in ('ds', 'mentor')) = (a_side is not null and b_side is not null))
);
create unique index profile_link_pair on feture.profile_link (least(a_profile_id, b_profile_id), greatest(a_profile_id, b_profile_id));
create index profile_link_b on feture.profile_link (b_profile_id);

alter table feture.profile_link enable row level security;
alter table feture.profile_link force row level security;
revoke all on feture.profile_link from public;
create policy api_all on feture.profile_link to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.profile_link to feture_api;
