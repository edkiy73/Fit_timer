-- Slice D1: communities and discussions (docs/server/S1-DOMAIN-MODEL.md §9, extract/communities-events.md).
-- Discussions are posts with community_id (slice B tables). Events come in D2.

create table feture.community (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  created_by uuid not null references feture.account(id),
  name text not null check (char_length(name) between 3 and 50),
  description text not null check (char_length(description) between 20 and 500),
  topics text[] not null check (cardinality(topics) between 1 and 3),
  privacy text not null check (privacy in ('open', 'closed', 'hidden')),
  join_question text check (join_question is null or char_length(join_question) <= 120),
  rules text[] not null check (cardinality(rules) between 1 and 20),
  place_id uuid references feture.place(id) on delete set null,   -- null = online
  cover_asset_id uuid references feture.media_asset(id) on delete set null,
  plate text not null default 'lilac' check (plate in ('lilac', 'rose', 'sea', 'amber', 'moss', 'coal')),
  state text not null default 'in_review' check (state in ('in_review', 'published', 'rejected', 'hidden', 'deleted')),
  reject_reason text,
  pending_change jsonb check (pending_change is null or jsonb_typeof(pending_change) = 'object'),  -- major edits wait for staff (Q15)
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index community_name on feture.community (lower(name)) where state <> 'deleted';

create table feture.community_member (
  community_id uuid not null references feture.community(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'host', 'member')),
  state text not null default 'active' check (state in ('active', 'left', 'removed')),
  listed boolean not null default false,          -- shown in the member list (Q13: hidden by default)
  read_only boolean not null default false,       -- «может только читать»
  muted boolean not null default false,           -- the member's own notification mute
  rules_rev integer not null default 1,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (community_id, profile_id)
);
create index community_member_profile on feture.community_member (profile_id) where state = 'active';

create table feture.community_request (
  id uuid primary key default feture.uuid_v7(),
  community_id uuid not null references feture.community(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  answer text not null default '' check (char_length(answer) <= 300),
  state text not null default 'pending' check (state in ('pending', 'approved', 'declined', 'withdrawn', 'removed')),
  acted_by uuid not null references feture.account(id),
  decided_by uuid references feture.account(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  rev integer not null default 1
);
create unique index community_request_one_pending on feture.community_request (community_id, profile_id) where state = 'pending';

create table feture.community_invite (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  community_id uuid not null references feture.community(id) on delete cascade,
  created_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table feture.post
  add constraint post_community_fk foreign key (community_id) references feture.community(id) on delete cascade,
  add column pinned boolean not null default false,
  add column popular_excluded boolean not null default false;

-- Community visible to a viewer: published (or the viewer is in the owning profile), owner active, no block either way.
-- Hidden communities: members only (invite holders reach them through community.get with the token).
create function feture.community_visible(c feture.community, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = c.owner_profile_id and m.account_id = viewer_account and m.state = 'active') then c.state <> 'deleted'
    else c.state = 'published'
      and exists (select 1 from feture.profile o where o.id = c.owner_profile_id and o.state = 'active')
      and not feture.blocked(viewer, c.owner_profile_id)
      and (c.privacy <> 'hidden' or exists (select 1 from feture.community_member cm where cm.community_id = c.id and cm.profile_id = viewer and cm.state = 'active'))
  end
$$;

-- A member who may read the community's discussions: an active member, or (couple) the couple is a member.
create function feture.community_reader(community uuid, viewer uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (select 1 from feture.community_member cm where cm.community_id = community and cm.profile_id = viewer and cm.state = 'active')
$$;

-- Posts gain one rule: a discussion of a closed or hidden community is for its members (and its owner).
create or replace function feture.post_visible(p feture.post, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = viewer_account and m.state = 'active')
      then p.state <> 'draft' or p.created_by = viewer_account
    else p.state = 'published' and p.disputed_at is null
      and exists (select 1 from feture.profile o where o.id = p.owner_profile_id and o.state = 'active')
      and not feture.blocked(viewer, p.owner_profile_id)
      and (not exists (select 1 from feture.photo_tag t where t.post_id = p.id and t.state <> 'ok')
           or exists (select 1 from feture.photo_tag t where t.post_id = p.id and t.profile_id = viewer and t.state <> 'no'))
      and (p.community_id is null or exists (
            select 1 from feture.community c where c.id = p.community_id and c.state = 'published'
              and (c.privacy = 'open' or feture.community_reader(c.id, viewer)
                   or exists (select 1 from feture.profile_member m where m.profile_id = c.owner_profile_id and m.account_id = viewer_account and m.state = 'active'))))
      and case p.audience
        when 'all' then true
        when 'followers' then exists (select 1 from feture.follow f where f.follower_profile_id = viewer and f.target_profile_id = p.owner_profile_id)
        when 'granted' then exists (
          select 1 from feture.access_grant g join feture.profile_settings s on s.profile_id = g.owner_profile_id
          where g.owner_profile_id = p.owner_profile_id and g.viewer_profile_id = viewer and viewer_account = any(g.viewer_account_ids)
            and g.revoked_at is null and (g.until is null or g.until > now()) and s.private_on)
        else false end
  end
$$;

do $$
declare t text;
begin
  foreach t in array array['community', 'community_member', 'community_request', 'community_invite'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
grant execute on function feture.community_visible(feture.community, uuid, uuid) to feture_api;
grant execute on function feture.community_reader(uuid, uuid) to feture_api;
