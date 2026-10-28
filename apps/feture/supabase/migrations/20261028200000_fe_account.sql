-- Wave 8 «Аккаунт, оплата, поддержка»: support tickets with staff replies, the maintenance switch, and the
-- provider-agnostic purchase layer (purchases, store subscriptions, Premium gifts). No payment provider is connected
-- yet: purchase rows only appear once one is configured (server/commands/premium.mjs, `cfg.billing.providers`).

-- A person writes to support from «Помощь»; staff answer in the staff screen; the person reads replies in the
-- ticket list and gets an inbox item. No email is involved.
create table feture.support_ticket (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  topic text not null check (topic in ('account', 'safety', 'premium', 'bug', 'other')),
  state text not null default 'open' check (state in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_ticket_account on feture.support_ticket (account_id, updated_at desc);
create index support_ticket_queue on feture.support_ticket (updated_at) where state = 'open';

create table feture.support_message (
  id uuid primary key default feture.uuid_v7(),
  ticket_id uuid not null references feture.support_ticket(id) on delete cascade,
  from_staff boolean not null default false,
  staff_account_id uuid references feture.account(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (from_staff or staff_account_id is null)
);
create index support_message_ticket on feture.support_message (ticket_id, created_at);

-- One row: while active, every command except `platform.maintenance` answers 503 «maintenance» to non-staff.
create table feture.maintenance (
  id boolean primary key default true check (id),
  active boolean not null default false,
  message text check (message is null or char_length(message) <= 300),
  updated_by uuid references feture.account(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into feture.maintenance (id) values (true);

-- A purchase started through a payment provider: a subscription for oneself or a gift of a fixed term to someone.
-- It becomes `paid` only when the provider confirms it (checkout result or webhook), and then grants an entitlement.
create table feture.purchase (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  kind text not null check (kind in ('subscription', 'gift')),
  plan text not null check (plan ~ '^[a-z0-9]{2,12}$'),
  days int not null check (days between 1 and 400),
  recipient_account_id uuid references feture.account(id) on delete set null,
  anonymous boolean not null default false,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,32}$'),
  store text check (store in ('apple', 'google', 'web')),
  store_ref text check (store_ref is null or char_length(store_ref) <= 200),
  state text not null default 'pending' check (state in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  entitlement_id uuid references feture.entitlement(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check ((kind = 'gift') = (recipient_account_id is not null) or state <> 'pending')
);
create unique index purchase_store_ref on feture.purchase (provider, store_ref) where store_ref is not null;
create index purchase_account on feture.purchase (account_id, created_at desc);

-- A store subscription as the provider reports it: auto-renewal can be switched off and back on.
create table feture.subscription (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,32}$'),
  store_ref text not null check (char_length(store_ref) <= 200),
  plan text not null check (plan ~ '^[a-z0-9]{2,12}$'),
  auto_renew boolean not null default true,
  renews_at timestamptz,
  state text not null default 'active' check (state in ('active', 'expired', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscription_ref on feture.subscription (provider, store_ref);
create index subscription_account on feture.subscription (account_id) where state = 'active';

do $$
declare t text;
begin
  foreach t in array array['support_ticket', 'support_message', 'maintenance', 'purchase', 'subscription'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
