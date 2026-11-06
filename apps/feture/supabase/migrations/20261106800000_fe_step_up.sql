-- «Confirm it is you» by an e-mail code (security audit 06.11.2026, B5): changing the e-mail, turning on the second factor and
-- deleting the account need a code sent to the account's address, so a stolen session alone cannot do them. One row per account:
-- the pending code (hashed) and, once it was right, how long this sign-in (session) is trusted for these actions.
create table feture.step_up (
  account_id uuid primary key references feture.account(id) on delete cascade,
  session text not null,                 -- the sign-in (session hash) the code was asked from
  code_hash text,                        -- null once used
  expires_at timestamptz not null,
  tries int not null default 0,
  passed_until timestamptz
);

alter table feture.step_up enable row level security;
alter table feture.step_up force row level security;
revoke all on feture.step_up from public;
create policy api_all on feture.step_up to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.step_up to feture_api;
