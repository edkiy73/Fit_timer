-- Slice G3: push delivery (docs/server/S2-API.md §8, extract/people-discover-chats.md §4.4).
-- The device's time zone decides quiet hours.
alter table feture.push_device add column tz text not null default 'UTC' check (char_length(tz) <= 64);

-- A retried handler or an expired claim never sends the same push twice: one row per (outbox item, recipient) when
-- queued and per (push item, device) when sent. Swept after a week.
create table feture.push_sent (
  key text primary key check (char_length(key) <= 200),
  created_at timestamptz not null default now()
);
create index push_sent_age on feture.push_sent (created_at);
alter table feture.push_sent enable row level security;
alter table feture.push_sent force row level security;
revoke all on feture.push_sent from public;
create policy api_all on feture.push_sent to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.push_sent to feture_api;
