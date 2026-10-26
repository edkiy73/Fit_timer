-- S4 steps 5–6 (docs/server/S4-MODERATION.md §6, §7): notices of illegal content from anyone, with or without an
-- account (DSA art. 16), and figures for the transparency report (art. 15) that carry no personal data.
-- The sender's address is kept only to answer (and goes a year after the decision).

create table feture.dsa_notice (
  id uuid primary key default feture.uuid_v7(),
  target_url text not null check (char_length(target_url) between 8 and 500),
  reason text not null check (reason in ('csam', 'minors', 'threats', 'private_material', 'illegal', 'ip', 'other')),
  explanation text not null check (char_length(explanation) between 20 and 2000),
  sender_name text check (sender_name is null or char_length(sender_name) <= 120),
  sender_email text check (sender_email is null or (char_length(sender_email) <= 254 and sender_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  locale text not null default 'en' check (locale in ('ru', 'en')),
  state text not null default 'open' check (state in ('open', 'decided')),
  outcome text check (outcome in ('removed', 'kept', 'not_actionable')),
  rule text check (rule is null or rule ~ '^[a-z_]{2,32}$'),
  decided_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  replied_at timestamptz,
  -- Everyone but people reporting child abuse gives an address to be answered at (art. 16(2)(c)); a year after the
  -- decision the address goes.
  check (reason = 'csam' or sender_email is not null or state = 'decided')
);
create index dsa_notice_open on feture.dsa_notice (created_at) where state = 'open';

alter table feture.dsa_notice enable row level security;
alter table feture.dsa_notice force row level security;
revoke all on feture.dsa_notice from public;
create policy api_all on feture.dsa_notice to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.dsa_notice to feture_api;
