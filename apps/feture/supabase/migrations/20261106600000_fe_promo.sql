-- Premium given in bulk or as a welcome (staff area, «Сервис → Premium»): two more sources of a period, and the switch for
-- «Premium новым аккаунтам» (`welcome_days`: how many days every new account gets when it finishes onboarding; null = off).
alter table feture.entitlement drop constraint entitlement_source_check;
alter table feture.entitlement add constraint entitlement_source_check check (source in ('purchase', 'gift', 'staff', 'promo', 'referral'));

create table feture.premium_promo (
  id boolean primary key default true check (id),
  welcome_days int check (welcome_days is null or welcome_days between 1 and 365),
  updated_by uuid references feture.account(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into feture.premium_promo (id) values (true);
alter table feture.premium_promo enable row level security;
alter table feture.premium_promo force row level security;
revoke all on feture.premium_promo from public;
create policy api_all on feture.premium_promo to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.premium_promo to feture_api;
