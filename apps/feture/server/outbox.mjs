// @ts-check
/** Transactional outbox (D7). A command writes its side effects here in its own transaction;
 * the queue worker delivers them (push, «Нужно решить», realtime signal, media scan, deletion).
 * Handlers must be idempotent: a claim can expire while a slow handler still runs, and the item is
 * then delivered again. Fencing (`lock_token`) only stops the stale worker from marking it done.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {{id: string, topic: string, profile_id: string | null, payload: Record<string, unknown>,
 *   attempts: number, lock_token: string}} OutboxItem
 */

export const MAX_ATTEMPTS = 10;
const CODE = /^[a-z][a-z0-9_.]{0,59}$/;

/** @param {Q} q @param {string} topic @param {string | null} profileId @param {Record<string, unknown>} [payload]
 * @param {{delaySeconds?: number}} [opts] */
export async function enqueue(q, topic, profileId, payload = {}, { delaySeconds = 0 } = {}) {
  await q.query(
    `insert into feture.outbox (topic, profile_id, payload, available_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [topic, profileId, JSON.stringify(payload), delaySeconds]);
}

/** Claims ready items; parallel workers never get the same item. Items that used up their attempts
 * without reporting back (the worker died mid-item) are parked here instead of being retried forever.
 * @param {Db} db @param {{limit?: number, lockSeconds?: number}} [opts] @returns {Promise<OutboxItem[]>} */
export async function claim(db, { limit = 20, lockSeconds = 60 } = {}) {
  await db.query(
    `update feture.outbox set available_at = 'infinity', locked_until = null, lock_token = null,
       last_error = coalesce(last_error, 'worker_lost')
     where done_at is null and attempts >= $1 and available_at <> 'infinity' and (locked_until is null or locked_until < now())`,
    [MAX_ATTEMPTS]);
  return db.query(
    `update feture.outbox set locked_until = now() + make_interval(secs => $2), attempts = attempts + 1,
       lock_token = gen_random_uuid()
     where id in (
       select id from feture.outbox
       where done_at is null and available_at <= now() and attempts < $3
         and (locked_until is null or locked_until < now())
       order by id limit $1 for update skip locked)
     returning id::text, topic, profile_id, payload, attempts, lock_token::text`,
    [limit, lockSeconds, MAX_ATTEMPTS]);
}

/** @param {Db} db @param {OutboxItem} item @returns {Promise<boolean>} false: the claim was lost to another worker */
export async function complete(db, item) {
  const rows = await db.query(
    `update feture.outbox set done_at = now(), locked_until = null, lock_token = null, last_error = null
     where id = $1 and lock_token = $2 returning id`,
    [item.id, item.lock_token]);
  return rows.length > 0;
}

/** Retries with exponential backoff; after MAX_ATTEMPTS, or when `park` is set, the item is parked
 * (visible to staff, never retried). @param {Db} db @param {OutboxItem} item @param {string} reason short code
 * @param {{park?: boolean}} [opts] */
export async function retryLater(db, item, reason, { park = false } = {}) {
  const parked = park || item.attempts >= MAX_ATTEMPTS;
  await db.query(
    `update feture.outbox set locked_until = null, lock_token = null, last_error = $2,
       available_at = case when $3 then 'infinity'::timestamptz else now() + make_interval(secs => least(3600, power(2, attempts))) end
     where id = $1 and lock_token = $4`,
    [item.id, CODE.test(reason) ? reason : 'error', parked, item.lock_token]);
}

/** Processes one batch with topic handlers. Unknown topics are parked at once, not retried.
 * Error messages are stored only when they look like a code, never free text.
 * @param {Db} db @param {Record<string, (item: OutboxItem) => Promise<void>>} handlers
 * @param {{limit?: number, lockSeconds?: number}} [opts] */
export async function drain(db, handlers, opts = {}) {
  const items = await claim(db, opts);
  for (const item of items) {
    const handle = Object.hasOwn(handlers, item.topic) ? handlers[item.topic] : null;
    if (!handle) { await retryLater(db, item, 'no_handler', { park: true }); continue; }
    try {
      await handle(item);
      await complete(db, item);
    } catch (error) {
      await retryLater(db, item, error instanceof Error ? error.message : 'error');
    }
  }
  return items.length;
}
