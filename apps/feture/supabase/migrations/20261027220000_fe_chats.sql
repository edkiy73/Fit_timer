-- Slice G1: conversations and messages (docs/server/S1-DOMAIN-MODEL.md §12, extract/people-discover-chats.md §1.11–1.12).
-- A conversation comes with a match; members are the accounts of both sides (2–4). Ended conversations keep their
-- history for each side and take no new messages. Read cursor, mute and archive are per account (Q19).

create table feture.conversation (
  id uuid primary key default feture.uuid_v7(),
  match_id uuid unique references feture.profile_match(id) on delete set null,
  profile_a uuid references feture.profile(id) on delete set null,
  profile_b uuid references feture.profile(id) on delete set null,
  state text not null default 'active' check (state in ('active', 'ended')),
  ended_reason text check (ended_reason in ('unmatch', 'block', 'pair_ended', 'account_deleted')),
  last_seq bigint not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((state = 'ended') = (ended_reason is not null))
);
create index conversation_profile_a on feture.conversation (profile_a);
create index conversation_profile_b on feture.conversation (profile_b);

create table feture.conversation_member (
  conversation_id uuid not null references feture.conversation(id) on delete cascade,
  account_id uuid not null references feture.account(id) on delete cascade,
  profile_id uuid not null,                        -- the side this account speaks for
  last_read_seq bigint not null default 0,
  muted boolean not null default false,
  archived boolean not null default false,
  primary key (conversation_id, account_id)
);
create index conversation_member_account on feture.conversation_member (account_id);

create table feture.message (
  id uuid primary key default feture.uuid_v7(),
  conversation_id uuid not null references feture.conversation(id) on delete cascade,
  seq bigint not null,
  author_profile_id uuid references feture.profile(id) on delete set null,
  sender_account_id uuid references feture.account(id) on delete set null,
  body text not null default '' check (char_length(body) <= 2000),
  reply_to uuid references feture.message(id) on delete set null,
  media_asset_id uuid references feture.media_asset(id) on delete set null,
  media_mode text not null default 'normal' check (media_mode in ('normal', 'once', 't15', 't120', 't1440')),
  created_at timestamptz not null default now(),
  unique (conversation_id, seq),
  check (body <> '' or media_asset_id is not null or media_mode <> 'normal')
);

-- Ephemeral media, per recipient account: the first conscious open starts the timer (or closes «once»).
create table feture.message_media_view (
  message_id uuid not null references feture.message(id) on delete cascade,
  viewer_account_id uuid not null references feture.account(id) on delete cascade,
  opened_at timestamptz,
  done boolean not null default false,
  primary key (message_id, viewer_account_id)
);
create index message_media_view_open on feture.message_media_view (message_id) where not done;
-- One file, one message: a burnt ephemeral file can never live on in another conversation.
create unique index message_one_asset on feture.message (media_asset_id) where media_asset_id is not null;

-- Matches made before conversations existed get theirs.
insert into feture.conversation (match_id, profile_a, profile_b)
select m.id, m.profile_a, m.profile_b from feture.profile_match m
where m.ended_at is null and not exists (select 1 from feture.conversation c where c.match_id = m.id);
insert into feture.conversation_member (conversation_id, account_id, profile_id)
select c.id, pm.account_id, pm.profile_id from feture.conversation c join feture.profile_member pm on pm.profile_id in (c.profile_a, c.profile_b) and pm.state = 'active'
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['conversation', 'conversation_member', 'message', 'message_media_view'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
