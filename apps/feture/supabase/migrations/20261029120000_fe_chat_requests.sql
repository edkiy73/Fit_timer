-- Message requests (owner 29.10.2026): «Написать» someone without a mutual like opens a conversation marked as a request.
-- The sender writes one first message (text and/or one photo) and waits; the recipient sees it in «Запросы» with where
-- they know each other from, and answers (the conversation becomes a normal chat) or hides it (the sender is not told
-- and may ask again only after 30 days) or reports and blocks. A mutual like still opens a chat at once and turns a
-- waiting request into a normal chat.

-- «Кто может мне писать»: everyone / followers and people of my communities and events (default) / nobody (then only
-- a mutual like opens a chat, as before).
alter table feture.profile_settings
  add column messages_from text not null default 'known' check (messages_from in ('all', 'known', 'none'));

alter table feture.conversation
  add column origin text not null default 'match' check (origin in ('match', 'request')),
  add column request_state text check (request_state in ('pending', 'accepted', 'hidden', 'reported')),
  add column request_from uuid references feture.profile(id) on delete set null,
  add column request_at timestamptz,
  -- Where the two know each other from, as it was when the request was sent: [{kind: 'follows'} | {kind: 'community',
  -- id, name} | {kind: 'event', id, title, startsAt}].
  add column request_context jsonb,
  add column answered_at timestamptz,
  add constraint conversation_request_shape check ((origin = 'request') = (request_state is not null));

-- Daily limit and «many of your requests were hidden»: requests of a profile by time.
create index conversation_request_from on feture.conversation (request_from, request_at) where origin = 'request';
