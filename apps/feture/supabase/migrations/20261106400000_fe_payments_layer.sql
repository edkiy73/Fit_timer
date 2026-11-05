-- Payments plumbing: the entitlements a purchase made (a refund takes exactly those back; a gift to a couple makes two),
-- and the price the buyer was shown, kept on the purchase (contracts/premium.mjs PRICES is the one place prices live).
alter table feture.entitlement add column purchase_id uuid references feture.purchase(id) on delete set null;
create index entitlement_purchase on feture.entitlement (purchase_id) where purchase_id is not null;
alter table feture.purchase
  add column amount_cents int check (amount_cents is null or amount_cents > 0),
  add column currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- A short number for providers that want one (Robokassa's InvId is an integer); the purchase id stays the real key.
  add column inv_id int generated always as identity;
create unique index purchase_inv_id on feture.purchase (inv_id);

-- Prices set in the staff area (Сервис → Premium): a row overrides the default in contracts/premium.mjs PRICES. A purchase
-- keeps the price its buyer was shown (purchase.amount_cents), so a change only touches purchases made after it.
create table feture.premium_price (
  key text primary key check (key in ('month', 'year', 'm1', 'm3', 'm12')),
  amount_cents int not null check (amount_cents between 100 and 1000000),
  updated_by uuid references feture.account(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table feture.premium_price enable row level security;
alter table feture.premium_price force row level security;
revoke all on feture.premium_price from public;
create policy api_all on feture.premium_price to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.premium_price to feture_api;
