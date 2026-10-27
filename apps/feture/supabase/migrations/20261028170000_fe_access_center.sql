-- FetUre wave 4 «Приватное и доступы» (P07 access center): indexes for the keyset-paged lists and the decline undo.
-- No new columns: a decline is undone within LIMITS.declineUndoSeconds (server/access.mjs) by turning it back into a
-- pending request; until the window ends the requester's views read the decline as waiting.

-- «Мои запросы»: my requests, newest first.
create index access_request_requester on feture.access_request (requester_profile_id, created_at desc, id desc);
-- «Открыто мной» / «Мне открыли»: open grants, newest first (replaces the unordered viewer index).
drop index if exists feture.access_grant_viewer;
create index access_grant_viewer on feture.access_grant (viewer_profile_id, granted_at desc, id desc) where revoked_at is null;
create index access_grant_owner on feture.access_grant (owner_profile_id, granted_at desc, id desc) where revoked_at is null;
-- What a request opened (the requester's «открыт / истёк / отозван»).
create index access_grant_request on feture.access_grant (request_id) where request_id is not null;
-- The delayed decline notice of a request, found by an undo or a cancel inside the window.
create index outbox_access_declined on feture.outbox ((payload->>'requestId')) where topic = 'access.declined' and done_at is null;
