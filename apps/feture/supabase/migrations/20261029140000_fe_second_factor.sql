-- Second factor (owner 29.10.2026: «2FA как минимум для модераторов, чтобы аккаунт нельзя было увести, украв почту»)
-- and «Мои устройства». docs/infra/security.md.
--
-- account_totp: an authenticator app (RFC 6238, SHA1, 6 digits, 30 s) per account. The secret is sealed by the server
-- (AES-256-GCM, key derived from FETURE_ID_PEPPER, server/second-factor.mjs): the database alone never has it.
-- Mandatory for staff now; the same tables carry an optional factor for everyone later.
create table feture.account_totp (
  account_id uuid primary key references feture.account(id) on delete cascade,
  secret_sealed text not null,
  enabled_at timestamptz,                     -- null while enrolment waits for the first code
  last_step bigint not null default 0,        -- the newest 30 s step used: a code never works twice
  fail_count int not null default 0,          -- wrong codes since fail_since
  fail_since timestamptz,
  locked_until timestamptz,                   -- 5 wrong codes in 15 min lock checks for 15 min
  created_at timestamptz not null default now()
);

-- One-time recovery codes, only as keyed hashes; a used one stays (used_at) so it never works again.
create table feture.account_recovery_code (
  account_id uuid not null references feture.account(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  primary key (account_id, code_hash)
);

-- A staff member's check in one Core session (session_key: a keyed hash of the device and its session token).
-- started_at opens the staff window (12 h); checked_at is the newest code (dangerous actions want one in 10 min).
create table feture.staff_session (
  account_id uuid not null references feture.account(id) on delete cascade,
  session_key text not null,
  started_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  primary key (account_id, session_key)
);

-- «Мои устройства»: when a signed-in device last used the app and roughly where (city, country from the edge
-- network). session_id is Core's opaque id of the session (the same the sessions list shows). Kept while the session
-- can live (90 days); deleted with the account.
create table feture.session_seen (
  account_id uuid not null references feture.account(id) on delete cascade,
  session_id text not null,
  seen_at timestamptz not null default now(),
  place text,
  primary key (account_id, session_id)
);

do $$
declare t text;
begin
  foreach t in array array['account_totp', 'account_recovery_code', 'staff_session', 'session_seen'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
