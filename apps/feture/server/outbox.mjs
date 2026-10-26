// @ts-check
/** Transactional outbox (D7). A command writes its side effects here in its own transaction;
 * the queue worker delivers them (push, «Нужно решить», realtime signal, media scan, deletion).
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {{id: string, topic: string, profile_id: string | null, payload: Record<string, unknown>, attempts: number}} OutboxItem
 */

const MAX_ATTEMPTS = 10;

/** @param {Q} q @param {string} topic @param {string | null} profileId @param {Record<string, unknown>} [payload]
 * @param {{delaySeconds?: number}} [opts] */
export async function enqueue(q, topic, profileId, payload = {}, { delaySeconds = 0 } = {}) {
  await q.query(
    `insert into feture.outbox (topic, profile_id, payload, available_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [topic, profileId, JSON.stringify(payload), delaySeconds]);
}

/** Claims ready items; parallel workers never get the same item.
 * @param {Db} db @param {{limit?: number, lockSeconds?: number}} [opts] @returns {Promise<OutboxItem[]>} */
export async function claim(db, { limit = 20, lockSeconds = 60 } = {}) {
  return db.query(
    `update feture.outbox set locked_until = now() + make_interval(secs => $2), attempts = attempts + 1
     where id in (
       select id from feture.outbox
       where done_at is null and available_at <= now() and (locked_until is null or locked_until < now())
       order by id limit $1 for update skip locked)
     returning id::text, topic, profile_id, payload, attempts`,
    [limit, lockSeconds]);
}

/** @param {Db} db @param {string} id */
export async function complete(db, id) {
  await db.query('update feture.outbox set done_at = now(), locked_until = null, last_error = null where id = $1', [id]);
}

/** Retries with exponential backoff; after MAX_ATTEMPTS the item is parked (visible to staff, never retried).
 * @param {Db} db @param {OutboxItem} item @param {string} reason short code, never user data */
export async function retryLater(db, item, reason) {
  const parked = item.attempts >= MAX_ATTEMPTS;
  await db.query(
    `update feture.outbox set locked_until = null, last_error = $2,
       available_at = case when $3 then 'infinity'::timestamptz else now() + make_interval(secs => least(3600, power(2, attempts))) end
     where id = $1`,
    [item.id, String(reason).slice(0, 200), parked]);
}

/** Processes one batch with topic handlers. Unknown topics are parked, not dropped.
 * @param {Db} db @param {Record<string, (item: OutboxItem) => Promise<void>>} handlers */
export async function drain(db, handlers, opts = {}) {
  const items = await claim(db, opts);
  for (const item of items) {
    const handle = handlers[item.topic];
    try {
      if (!handle) throw new Error('no_handler');
      await handle(item);
      await complete(db, item.id);
    } catch (error) {
      await retryLater(db, item, error instanceof Error ? error.message : 'failed');
    }
  }
  return items.length;
}
