-- Slice G2: notifications and push devices (docs/server/S1-DOMAIN-MODEL.md §13, extract/people-discover-chats.md §1.14, §4).
-- A notification goes to an account and is addressed to a profile («Тебе» / «Паре»). Events caused by other people to
-- a couple go to both partners; a partner's own action for the couple goes only to the other partner. «Нужно решить» is
-- computed from its source rows, never stored here.

create table feture.notification (
  id uuid primary key default feture.uuid_v7(),
  recipient_account_id uuid not null references feture.account(id) on delete cascade,
  addressee_profile_id uuid references feture.profile(id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-zA-Z.]{1,40}$'),
  actor_profile_id uuid references feture.profile(id) on delete set null,
  object_type text check (object_type in ('profile', 'post', 'reply', 'community', 'event', 'conversation', 'approval', 'invite', 'request')),
  object_id uuid,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  retracted_at timestamptz,            -- a withdrawn like takes its notification back
  source text not null,                -- the outbox item it came from: a retried handler never doubles it
  unique (source, recipient_account_id)
);
create index notification_inbox on feture.notification (recipient_account_id, created_at desc) where retracted_at is null;

create table feture.push_device (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  account_id uuid not null references feture.account(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null check (char_length(token) <= 4096),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_device_account on feture.push_device (account_id);

do $$
declare t text;
begin
  foreach t in array array['notification', 'push_device'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
