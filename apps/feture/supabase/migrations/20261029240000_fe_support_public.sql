-- «Нужна помощь со входом»: a message to support from someone who cannot sign in (no account yet / no access).
-- Stored here, mailed to the support address by the queue (outbox topic `support.public`, server/commands/support.mjs),
-- and deleted after 90 days. No account is linked and nothing is read back by the app.
create table feture.support_public (
  id uuid primary key default feture.uuid_v7(),
  body text not null check (char_length(body) between 5 and 2000),
  contact text check (contact is null or char_length(contact) <= 120),
  locale text not null default 'ru' check (locale in ('ru', 'en')),
  created_at timestamptz not null default now(),
  mailed_at timestamptz
);
create index support_public_created on feture.support_public (created_at);

alter table feture.support_public enable row level security;
alter table feture.support_public force row level security;
revoke all on feture.support_public from public;
create policy api_all on feture.support_public to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.support_public to feture_api;
