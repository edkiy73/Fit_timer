-- Premium notices sent once per period: «скоро закончится» (week, day) and «закончился» (ended), keyed by the Premium end
-- they were about, so a renewal (a new end) gets its own notices and nothing is sent twice (server/commands/premium.mjs sweepPremium).
create table feture.premium_notice (
  account_id uuid not null references feture.account(id) on delete cascade,
  kind text not null check (kind in ('week', 'day', 'ended')),
  until_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (account_id, kind, until_at)
);
alter table feture.premium_notice enable row level security;
alter table feture.premium_notice force row level security;
revoke all on feture.premium_notice from public;
create policy api_all on feture.premium_notice to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.premium_notice to feture_api;
