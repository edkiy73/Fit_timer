-- One numeric setting of the whole platform, set from the staff area. The first one: the smallest city the city picker
-- offers (owner 06.11.2026: 100 000 people; the seeded cities and the ones already chosen stay).
create table if not exists feture.platform_setting (
  key text primary key,
  num bigint not null,
  changed_by uuid references feture.account(id) on delete set null,
  changed_at timestamptz not null default now()
);
insert into feture.platform_setting (key, num) values ('places_min_pop', 100000) on conflict (key) do nothing;

-- The API role only (the same lock as the other platform tables).
alter table feture.platform_setting enable row level security;
alter table feture.platform_setting force row level security;
revoke all on feture.platform_setting from public;
drop policy if exists api_all on feture.platform_setting;
create policy api_all on feture.platform_setting to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.platform_setting to feture_api;
