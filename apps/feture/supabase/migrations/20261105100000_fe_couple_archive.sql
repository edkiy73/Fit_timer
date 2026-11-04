-- «Не восстанавливать» keeps the couple 30 days as an archive for the two of them (owner 04.11.2026): both are free at
-- once (a new couple, an invitation between them, a block), the couple's photos, posts and chats stay readable to them
-- until it is deleted (jobs.sweepExpiredCouples at restore_until). Deleting earlier needs both. Re-runnable.
alter table feture.profile add column if not exists ended_at timestamptz;
alter table feture.profile_member add column if not exists archived boolean not null default false;

-- An account is an active member of at most one couple that is not an archive.
drop index if exists feture.profile_member_one_couple;
create unique index profile_member_one_couple on feture.profile_member (account_id)
  where profile_kind = 'couple' and state = 'active' and not archived;

-- «Удалить сейчас»: each ex-partner agrees; with both the archive goes at once.
create table if not exists feture.couple_purge (
  profile_id uuid not null references feture.profile(id) on delete cascade,
  account_id uuid not null references feture.account(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, account_id)
);
alter table feture.couple_purge enable row level security;
alter table feture.couple_purge force row level security;
revoke all on feture.couple_purge from public;
drop policy if exists api_all on feture.couple_purge;
create policy api_all on feture.couple_purge to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.couple_purge to feture_api;
