// @ts-check
import { drain } from './outbox.mjs';
import { scanAsset, servedKeys } from './media/scan.mjs';

/** Queue worker (S2 §8, D7). Called every minute by pg_cron + pg_net (Vercel Hobby cron is daily only)
 * through `POST /api/fe?jobs=1` with the jobs secret. Every handler is idempotent.
 * @typedef {import('./db.mjs').Db} Db
 * @typedef {import('./media/scan.mjs').ScanDeps} ScanDeps
 * @typedef {{scan: ScanDeps | null, limit?: number}} JobDeps
 */

/** @param {Db} db @param {JobDeps} deps */
export function mediaHandlers(db, deps) {
  const storage = () => {
    if (!deps.scan) throw new Error('media_unavailable');
    return deps.scan.storage;
  };
  /** @param {{payload: Record<string, unknown>}} item */
  const id = item => String(item.payload.assetId);
  return {
    'media.scan': async (/** @type {any} */ item) => {
      if (!deps.scan) throw new Error('media_unavailable');
      await scanAsset(db, deps.scan, id(item));
    },
    // Removed or rejected: served copies go at once; the quarantined upload waits for media.purge.
    'media.hide': async (/** @type {any} */ item) => {
      const [row] = await db.query(`select state from feture.media_asset where id = $1`, [id(item)]);
      if (!row || !['removed', 'rejected'].includes(row.state)) return;
      for (const key of servedKeys(id(item))) await storage().remove(key);
    },
    'media.purgeVariants': async (/** @type {any} */ item) => {
      const [row] = await db.query(`select state from feture.media_asset where id = $1`, [id(item)]);
      if (!row || row.state !== 'rejected') return;
      for (const key of servedKeys(id(item))) await storage().remove(key);
    },
    // Deletes the upload of a removed asset — never of a blocked one (evidence, S4), and never before
    // the CSAM check ran: an unchecked upload is retried until the scan has happened.
    'media.purge': async (/** @type {any} */ item) => {
      const [row] = await db.query(
        `select state, storage_key, scanned_at is not null scanned, bytes is not null uploaded from feture.media_asset where id = $1`,
        [id(item)]);
      if (!row || row.state !== 'removed') return;
      if (row.uploaded && !row.scanned) throw new Error('not_scanned');
      for (const key of [row.storage_key, ...servedKeys(id(item))]) await storage().remove(key);
    },
  };
}

/** Upload intents that were never committed: the quarantined key is deleted, the row closed.
 * Nothing was ever shown or checked for these; the bytes never left quarantine. @param {Db} db @param {JobDeps} deps */
export async function sweepExpiredUploads(db, deps) {
  const rows = await db.query(
    `update feture.media_asset set state = 'removed', removed_at = now()
     where id in (select id from feture.media_asset where state = 'pending_upload' and upload_expires_at < now() limit 100)
     returning storage_key`);
  if (deps.scan) for (const r of rows) await deps.scan.storage.remove(r.storage_key);
  return rows.length;
}

/** Stored command results hold short-lived bearer data (e.g. upload URLs): kept 7 days for retries only. @param {Db} db */
export async function sweepOpLedger(db) {
  const rows = await db.query(`delete from feture.op_ledger where created_at < now() - interval '7 days' returning op_id`);
  return rows.length;
}

/** One worker tick. @param {Db} db @param {JobDeps} deps */
export async function runJobs(db, deps) {
  const processed = await drain(db, mediaHandlers(db, deps), { limit: deps.limit ?? 10, lockSeconds: 120 });
  const expired = await sweepExpiredUploads(db, deps);
  const ledger = await sweepOpLedger(db);
  return { processed, expired, ledger };
}
