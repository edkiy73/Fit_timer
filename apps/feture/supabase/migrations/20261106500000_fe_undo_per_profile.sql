-- The free undo of a pass is one a day per profile (owner 06.11.2026): the person can take back one as themselves and one
-- as the couple. `profile_id` says which profile spent it (older rows have none and no longer count).
alter table feture.rate_event add column profile_id uuid;
create index rate_event_profile on feture.rate_event (profile_id, kind, created_at) where profile_id is not null;
