-- Slice B: feed and content, plus the social graph the feed needs (docs/server/S1-DOMAIN-MODEL.md §7–8,
-- extract/feed-content.md). Blocks live here because every visibility check needs them (both directions).

-- Blocks belong to the profile that made them; visibility is hidden both ways (S1 §0.6).
create table feture.block (
  blocker_profile_id uuid not null references feture.profile(id) on delete cascade,
  blocked_profile_id uuid not null references feture.profile(id) on delete cascade,
  acted_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);
create index block_blocked on feture.block (blocked_profile_id);

create table feture.follow (
  follower_profile_id uuid not null references feture.profile(id) on delete cascade,
  target_profile_id uuid not null references feture.profile(id) on delete cascade,
  acted_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  primary key (follower_profile_id, target_profile_id),
  check (follower_profile_id <> target_profile_id)
);
create index follow_target on feture.follow (target_profile_id);

create table feture.note_subscription (
  subscriber_profile_id uuid not null references feture.profile(id) on delete cascade,
  author_profile_id uuid not null references feture.profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_profile_id, author_profile_id)
);

create table feture.album (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  vis text not null default 'all' check (vis in ('all', 'followers')),
  sort text not null default 'new' check (sort in ('new', 'old')),
  cover_post_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index album_name on feture.album (owner_profile_id, lower(name));

create table feture.post (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  created_by uuid not null references feture.account(id),
  community_id uuid,                      -- discussions (slice D); null for the feed
  type text not null default 'post' check (type in ('post', 'note')),
  title text check (title is null or char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 10000),
  audience text not null default 'all' check (audience in ('all', 'followers', 'granted', 'only')),
  in_feed boolean not null default true,
  topics text[] not null default '{}' check (cardinality(topics) <= 3),
  album_id uuid references feture.album(id) on delete set null,
  interests jsonb not null default '[]' check (jsonb_typeof(interests) = 'array' and jsonb_array_length(interests) <= 4),
  state text not null default 'draft' check (state in ('draft', 'review', 'published', 'removed', 'archived')),
  removed_reason text,
  disputed_at timestamptz,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  edited_at timestamptz,
  check (type = 'post' and char_length(body) <= 1000 or type = 'note' and title is not null)
);
create index post_owner on feture.post (owner_profile_id, created_at desc);
create index post_feed on feture.post (published_at desc, id desc) where state = 'published' and in_feed and audience = 'all';
create index post_topics on feture.post using gin (topics) where state = 'published';

create table feture.post_revision (
  id uuid primary key default feture.uuid_v7(),
  post_id uuid not null references feture.post(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  submitted_by uuid not null references feture.account(id),
  state text not null default 'review' check (state in ('review', 'approved', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index post_revision_open on feture.post_revision (post_id) where state = 'review';

create table feture.post_saved_edit (
  post_id uuid primary key references feture.post(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  saved_by uuid not null references feture.account(id),
  saved_at timestamptz not null default now()
);

create table feture.poll (
  post_id uuid primary key references feture.post(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  options text[] not null check (cardinality(options) between 2 and 10)
);
create table feture.poll_vote (
  post_id uuid not null references feture.poll(post_id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  option smallint not null check (option between 0 and 9),
  acted_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table feture.reply (
  id uuid primary key default feture.uuid_v7(),
  post_id uuid not null references feture.post(id) on delete cascade,
  parent_id uuid references feture.reply(id) on delete set null,
  author_profile_id uuid not null references feture.profile(id) on delete cascade,
  sent_by uuid not null references feture.account(id),
  body text not null check (char_length(body) <= 1000),
  state text not null default 'published' check (state in ('published', 'deleted', 'removed')),
  check (state <> 'published' or char_length(body) >= 1),  -- a deleted reply keeps no text
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index reply_post on feture.reply (post_id, created_at);

create table feture.reaction (
  target_type text not null check (target_type in ('post', 'reply')),
  target_id uuid not null,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  acted_by uuid not null references feture.account(id),
  created_at timestamptz not null default now(),
  primary key (target_type, target_id, profile_id)
);

create table feture.mention (
  source_type text not null check (source_type in ('post', 'reply')),
  source_id uuid not null,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  notified boolean not null default false,
  removed boolean not null default false,
  primary key (source_type, source_id, profile_id)
);

create table feture.photo_tag (
  post_id uuid not null references feture.post(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'ok', 'no')),
  asked_at timestamptz,
  decided_at timestamptz,
  primary key (post_id, profile_id)
);

create table feture.saved_item (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  kind text not null check (kind in ('post', 'event', 'topic', 'discussion')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, target_id)
);

create table feture.feed_hide (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  kind text not null check (kind in ('post', 'author', 'activity', 'event')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, target_id)
);

create table feture.report (
  id uuid primary key default feture.uuid_v7(),
  reporter_profile_id uuid not null references feture.profile(id) on delete cascade,
  reporter_account uuid not null references feture.account(id),
  target_type text not null check (target_type in ('profile', 'post', 'reply', 'discussion', 'community', 'event', 'message', 'media')),
  target_id uuid not null,
  target_rev integer,
  reason text not null check (reason in ('threat', 'private', 'minor', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  state text not null default 'open' check (state in ('open', 'resolved')),
  resolution text check (resolution in ('removed', 'kept')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index report_one_open on feture.report (reporter_profile_id, target_type, target_id) where state = 'open';
create index report_queue on feture.report (state, reason, created_at) where state = 'open';

-- A profile and the person profiles of its members (a couple «contains» its partners).
create function feture.profile_people(p uuid) returns setof uuid
language sql stable set search_path = pg_catalog, feture as $$
  select p
  union
  select a.person_profile_id from feture.profile_member m join feture.account a on a.id = m.account_id
  where m.profile_id = p and m.state = 'active' and a.person_profile_id is not null
$$;

-- Hidden from each other: a block by one side on the other or on anyone the other contains.
-- The blocker's other profiles are not covered (a block belongs to the profile that made it; extending it is explicit).
create function feture.blocked(viewer uuid, target uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (
    select 1 from feture.block b
    where (b.blocker_profile_id = viewer and b.blocked_profile_id in (select feture.profile_people(target)))
       or (b.blocker_profile_id = target and b.blocked_profile_id in (select feture.profile_people(viewer))))
$$;

-- One visibility rule for every post list and read (S1 §8, extract/feed-content.md §1.1–1.2).
-- Members of the owning profile see their own posts in any state. Others: published, not disputed, author active,
-- no block either way, photo marks all confirmed (or the viewer is one of the marked people), audience allows.
create function feture.post_visible(p feture.post, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = viewer_account and m.state = 'active')
      then p.state <> 'draft' or p.created_by = viewer_account   -- a couple's draft is its writer's alone
    else p.state = 'published' and p.disputed_at is null
      and exists (select 1 from feture.profile o where o.id = p.owner_profile_id and o.state = 'active')
      and not feture.blocked(viewer, p.owner_profile_id)
      and (not exists (select 1 from feture.photo_tag t where t.post_id = p.id and t.state <> 'ok')
           or exists (select 1 from feture.photo_tag t where t.post_id = p.id and t.profile_id = viewer and t.state <> 'no'))
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
  foreach t in array array['block', 'follow', 'note_subscription', 'album', 'post', 'post_revision', 'post_saved_edit', 'poll', 'poll_vote',
    'reply', 'reaction', 'mention', 'photo_tag', 'saved_item', 'feed_hide', 'report'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
grant execute on function feture.profile_people(uuid) to feture_api;
grant execute on function feture.blocked(uuid, uuid) to feture_api;
grant execute on function feture.post_visible(feture.post, uuid, uuid) to feture_api;
