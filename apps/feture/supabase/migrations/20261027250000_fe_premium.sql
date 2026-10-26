-- Slice H1: Premium entitlements and the age check by selfie (docs/server/S1-DOMAIN-MODEL.md §15, S3-MEDIA §8).
-- Store purchases and gifts arrive once a payment provider is chosen; until then staff may grant Premium (dogfooding).
-- The selfie is shown only to staff, never published, and kept until the decision + 30 days.

create table feture.entitlement (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  source text not null check (source in ('purchase', 'gift', 'staff')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  store text check (store in ('apple', 'google', 'web')),
  store_ref text,                                   -- the store's transaction id: one entitlement per purchase
  granted_by uuid references feture.account(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (ends_at > starts_at),
  check ((source = 'purchase') = (store_ref is not null))
);
create unique index entitlement_store_ref on feture.entitlement (store, store_ref) where store_ref is not null;
create index entitlement_account on feture.entitlement (account_id);

-- One age check by selfie: the server picks the gesture, the person sends a selfie making it, staff compare it with
-- the approved profile photo.
create table feture.age_check (
  id uuid primary key default feture.uuid_v7(),
  account_id uuid not null references feture.account(id) on delete cascade,
  gesture text not null check (gesture ~ '^[a-z_]{2,32}$'),
  asset_id uuid references feture.media_asset(id) on delete set null,
  state text not null default 'started' check (state in ('started', 'submitted', 'approved', 'rejected', 'expired')),
  reason text check (reason is null or reason ~ '^[a-z_]{2,32}$'),
  decided_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz
);
create unique index age_check_one_open on feture.age_check (account_id) where state in ('started', 'submitted');
create index age_check_queue on feture.age_check (submitted_at) where state = 'submitted';

do $$
declare t text;
begin
  foreach t in array array['entitlement', 'age_check'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
