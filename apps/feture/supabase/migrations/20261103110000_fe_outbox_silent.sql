-- Outbox items no handler ever took used to wait forever (outbox.claim only takes handled topics, the sweep deletes
-- only done ones). The topics that stay silent (server/notify.mjs SILENT_TOPICS) are marked done now, so the normal
-- 7-day sweep removes them. A decline still inside its undo window is left for the worker: an undo must find it
-- undelivered. Returned posts older than a day are not announced any more: too stale to be news.
update feture.outbox
set done_at = now(), locked_until = null, lock_token = null, last_error = null
where done_at is null
  and (
    (topic in ('access.revoked', 'match.ended', 'community.joined') or topic like 'moderation.%')
    or (topic = 'access.declined' and available_at <= now())
    or (topic = 'post.returned' and created_at < now() - interval '1 day')
  );
