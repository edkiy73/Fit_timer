-- Optional second factor for everyone and the new-device sign-in notice (owner 29.10.2026, docs/infra/security.md).
-- The factor itself reuses account_totp / account_recovery_code (20261029140000_fe_second_factor.sql).
--
-- session_factor: this sign-in passed the second step (session_key: the keyed hash of the device and its token, the
-- same as staff_session). While an account has a factor on, a sign-in without a row here is refused everywhere except
-- the code check and sign-out (server/signin.mjs). Turning the factor on keeps only the current sign-in; turning it
-- off, a lead's reset or deleting the account removes them all.
create table feture.session_factor (
  account_id uuid not null references feture.account(id) on delete cascade,
  session_key text not null,
  passed_at timestamptz not null default now(),
  primary key (account_id, session_key)
);

-- account_signin: each sign-in once, when it first reaches the server — the device family Core named («Chrome · Mac»),
-- the country and city from the edge network (never an IP address) — so a sign-in from a device and place the account
-- has not used makes one notice at most (notified_at). Kept 90 days, as long as a session can live.
create table feture.account_signin (
  account_id uuid not null references feture.account(id) on delete cascade,
  session_key text not null,
  session_id text,
  label text not null default '',
  country text not null default '',
  place text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (account_id, session_key)
);
create index account_signin_recent on feture.account_signin (account_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['session_factor', 'account_signin'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
