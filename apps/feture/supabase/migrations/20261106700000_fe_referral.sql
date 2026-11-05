-- Invitations and promo codes (owner 06.11.2026): a personal code per account (the link everyone can share) and promo codes the
-- staff make for a channel or a blogger. Using one gives the newcomer Premium days and, for a personal code, the inviter too —
-- but only once the newcomer has finished getting to know the app and passed the age check. One account is invited once.
create table feture.referral_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,              -- personal links; promo codes work while they are active
  reward_days int not null default 7 check (reward_days between 1 and 365),    -- to the newcomer who came by a personal link
  inviter_days int not null default 7 check (inviter_days between 0 and 365),  -- to the inviter
  cap_count int not null default 10 check (cap_count between 1 and 1000),      -- rewarded invitations per inviter ...
  cap_days int not null default 30 check (cap_days between 1 and 365),         -- ... within this many days
  updated_by uuid references feture.account(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into feture.referral_settings (id) values (true);

create table feture.referral_code (
  id uuid primary key default feture.uuid_v7(),
  kind text not null check (kind in ('personal', 'promo')),
  code text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  owner_account_id uuid references feture.account(id) on delete cascade,
  label text check (label is null or char_length(label) <= 60),   -- a promo code's channel or blogger, for the statistics
  days int not null default 0 check (days between 0 and 365),      -- a promo code's Premium days for the newcomer (0: only counted)
  max_uses int check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'personal') = (owner_account_id is not null))
);
create unique index referral_code_code on feture.referral_code (code);
create unique index referral_code_owner on feture.referral_code (owner_account_id) where kind = 'personal';

create table feture.referral_use (
  id uuid primary key default feture.uuid_v7(),
  code_id uuid not null references feture.referral_code(id) on delete cascade,
  invitee_account_id uuid not null unique references feture.account(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'rewarded')),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index referral_use_code on feture.referral_use (code_id, state);

do $$
declare t text;
begin
  foreach t in array array['referral_settings', 'referral_code', 'referral_use'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
