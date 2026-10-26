-- Slice E: couples (docs/server/S1-DOMAIN-MODEL.md §5, extract/identity-couples-me.md §1.6–1.8).
-- A couple is a profile of kind 'couple' with two member accounts; it starts empty (CPL-003).

create table feture.couple_invite (
  id uuid primary key default feture.uuid_v7(),
  from_account uuid not null references feture.account(id) on delete cascade,
  to_account uuid not null references feture.account(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  couple_profile_id uuid references feture.profile(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  check (from_account <> to_account),
  check ((state = 'pending') = (answered_at is null))
);
-- One pending invitation sent by an account at a time (V21 CPL-002).
create unique index couple_invite_one_out on feture.couple_invite (from_account) where state = 'pending';
create index couple_invite_to on feture.couple_invite (to_account) where state = 'pending';

-- Stopping a couple: either partner, at once; restoring needs both within 30 days, otherwise the couple is deleted.
alter table feture.profile
  add column paused_at timestamptz,
  add column restore_until timestamptz,
  add constraint profile_pause_fields check ((state = 'paused') = (restore_until is not null));

create table feture.couple_restore (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  account_id uuid not null references feture.account(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, account_id)
);

do $$
declare t text;
begin
  foreach t in array array['couple_invite', 'couple_restore'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
