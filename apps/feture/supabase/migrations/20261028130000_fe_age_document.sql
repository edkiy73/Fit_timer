-- V21 A07 «Проверка возраста» by an identity document, next to the selfie with a gesture (server/commands/premium.mjs).
-- A check now has a method. For a document staff read the birth date and decide «18+ or not»; nothing from the document
-- (number, name, birth date) is stored — only the outcome, as for a selfie (account.age_verified_until). The image is
-- a media_asset with purpose 'verification', seen only by staff in the age-check queue, and deleted (storage + row) by
-- the `verification.dropDocument` job right after the decision or when nobody decides within 7 days.
-- `gesture` stays filled for every check (the server picks it at start) but is only used for a selfie.
-- Re-runnable: every object is created only when missing.

alter table feture.age_check add column if not exists method text not null default 'selfie';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'age_check_method' and conrelid = 'feture.age_check'::regclass) then
    alter table feture.age_check add constraint age_check_method check (method in ('selfie', 'document'));
  end if;
end $$;
-- The expiry sweep looks for undecided documents and for uploads made during a document check.
create index if not exists age_check_document_wait on feture.age_check (submitted_at) where method = 'document' and state = 'submitted';
create index if not exists age_check_asset on feture.age_check (asset_id) where asset_id is not null;
create index if not exists age_check_account on feture.age_check (account_id, created_at desc);
