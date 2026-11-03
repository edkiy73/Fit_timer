-- The shape of a notification (docs/notifications.md «Модель», «Адресация»), filled by server/notify.mjs from the
-- catalog (contracts/notifications.mjs) and the payload:
--   kind            notice (news, can be read) / task (waits for a decision) / result (how a task ended);
--   sub_object_*    the nested object, e.g. the reply under a post the row opens;
--   couple_id       the couple it is addressed to, kept by ID — an old row never switches to whatever couple is active now;
--   actor_name, couple_name  the names as they were at the time: a couple on pause or gone keeps its name in history;
--   collapse_key    the catalog's collapse rule (one per type, object or actor) for grouping noisy types.
-- All nullable: rows written before keep working, the screen falls back to the type's own text.
alter table feture.notification
  add column if not exists kind text check (kind in ('notice', 'task', 'result')),
  add column if not exists sub_object_type text check (sub_object_type in ('reply')),
  add column if not exists sub_object_id uuid,
  add column if not exists couple_id uuid references feture.profile(id) on delete set null,
  add column if not exists actor_name text check (char_length(actor_name) <= 200),
  add column if not exists couple_name text check (char_length(couple_name) <= 200),
  add column if not exists collapse_key text check (char_length(collapse_key) <= 200);
create index if not exists notification_couple on feture.notification (couple_id) where couple_id is not null;

-- Rows written before: what can be derived. The couple from the profile they are addressed to, the names from the
-- current profiles, the kind from the type (the catalog's results; everything else stored here is a notice).
update feture.notification n set couple_id = p.id, couple_name = coalesce(nullif(p.name, ''), '@' || p.handle)
from feture.profile p
where n.couple_id is null and p.id = n.addressee_profile_id and p.kind = 'couple';

update feture.notification n set actor_name = coalesce(nullif(p.name, ''), '@' || p.handle)
from feture.profile p
where n.actor_name is null and p.id = n.actor_profile_id;

update feture.notification set kind = case when type in ('grant', 'linkAccepted', 'linkDeclined', 'linkChanged', 'tagAnswered',
  'postRestored', 'disputeResolved', 'revisionApproved', 'revisionRejected', 'postReturned', 'mediaDecided', 'contentRemoved',
  'reportResolved', 'profileRestored', 'profileUnrestricted', 'appealDecided', 'communityApproved', 'communityDeclined',
  'communityPublished', 'communityRejected', 'eventPublished', 'eventRejected', 'eventApplicationApproved',
  'eventApplicationDeclined', 'pair.declined', 'pair.decided', 'ageCheck', 'photoCheck', 'placeDecided') then 'result' else 'notice' end
where kind is null;
