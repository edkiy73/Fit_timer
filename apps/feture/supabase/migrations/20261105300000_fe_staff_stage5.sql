-- Moderation plan stage 5 (owner 05.11.2026). Re-runnable.

-- «Под наблюдением»: staff mark a person to look at again, with a short note (staff only, never shown to them).
alter table feture.profile add column if not exists watched_at timestamptz;
alter table feture.profile add column if not exists watched_by uuid references feture.account(id);
alter table feture.profile add column if not exists watch_note text check (watch_note is null or char_length(watch_note) <= 300);

-- «Взять в работу»: who has an item open right now, so two moderators do not decide the same one. A claim lapses.
create table if not exists feture.staff_claim (
  item text primary key check (char_length(item) <= 200),
  account_id uuid not null references feture.account(id) on delete cascade,
  until timestamptz not null
);
alter table feture.staff_claim enable row level security;
alter table feture.staff_claim force row level security;
revoke all on feture.staff_claim from public;
drop policy if exists api_all on feture.staff_claim;
create policy api_all on feture.staff_claim to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.staff_claim to feture_api;

-- A report on an organizer's announcement (stage 5): staff may take it down; it then leaves the event page.
alter table feture.event_announcement add column if not exists removed_at timestamptz;
alter table feture.report drop constraint if exists report_target_type_check;
alter table feture.report add constraint report_target_type_check
  check (target_type in ('profile', 'post', 'reply', 'discussion', 'community', 'event', 'message', 'media', 'conversation', 'announcement'));

-- The word filter (stage 5): words staff list; a text with one goes to the report queue as an automatic report, it is
-- not held back. An automatic report has no reporter.
create table if not exists feture.word_filter (
  word text primary key check (word = lower(word) and char_length(word) between 2 and 60 and word ~ '^[[:alnum:] -]+$'),
  added_by uuid references feture.account(id) on delete set null,
  added_at timestamptz not null default now()
);
alter table feture.word_filter enable row level security;
alter table feture.word_filter force row level security;
revoke all on feture.word_filter from public;
drop policy if exists api_all on feture.word_filter;
create policy api_all on feture.word_filter to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.word_filter to feture_api;
alter table feture.report alter column reporter_profile_id drop not null;
alter table feture.report alter column reporter_account drop not null;
alter table feture.report add column if not exists auto text check (auto is null or auto = 'words');
alter table feture.report drop constraint if exists report_auto_or_reporter;
alter table feture.report add constraint report_auto_or_reporter check (auto is not null or (reporter_profile_id is not null and reporter_account is not null));
