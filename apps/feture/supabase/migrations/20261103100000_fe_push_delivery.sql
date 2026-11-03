-- Push delivery per device (stage 0 of the notification overhaul). One row per (push.deliver outbox item, device):
-- `queued` while a send is due or running (next_at is the lease of the worker sending it, or when the retry is due),
-- `sent` only after the provider accepted it, `failed` for good (gone token, refused, or out of attempts). A transient
-- error leaves the row `queued` and the outbox item retries; devices already `sent` are skipped, so a re-claim never
-- sends twice. last_error is a short code only: never a token or the text. Swept after a week like push_sent.
create table feture.push_delivery (
  item_id bigint not null,
  token_hash bytea not null check (octet_length(token_hash) = 32),
  state text not null default 'queued' check (state in ('queued', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_at timestamptz not null default now(),
  last_error text check (last_error is null or last_error ~ '^[a-z][a-z0-9_]{0,31}$'),
  updated_at timestamptz not null default now(),
  primary key (item_id, token_hash)
);
create index push_delivery_age on feture.push_delivery (updated_at);
alter table feture.push_delivery enable row level security;
alter table feture.push_delivery force row level security;
revoke all on feture.push_delivery from public;
create policy api_all on feture.push_delivery to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.push_delivery to feture_api;

-- push_sent now only keeps «queued once per recipient» (`q:` keys); the per-device `d:` keys move to push_delivery.
delete from feture.push_sent where key like 'd:%';
