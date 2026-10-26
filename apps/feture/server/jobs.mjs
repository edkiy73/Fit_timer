// @ts-check
import { drain, enqueue } from './outbox.mjs';
import { scanAsset, servedKeys } from './media/scan.mjs';
import { deleteCouple } from './commands/couples.mjs';
import { settlePublication } from './commands/posts.mjs';
import { settleAvatarsOf } from './commands/photos.mjs';
import { sweepEphemeral } from './commands/chats.mjs';
import { notifyHandlers } from './notify.mjs';
import { verificationHandlers } from './commands/premium.mjs';

/** Queue worker (S2 §8, D7). Called every minute by pg_cron + pg_net (Vercel Hobby cron is daily only)
 * through `POST /api/fe?jobs=1` with the jobs secret. Every handler is idempotent.
 * Only topics with a handler here are claimed; others (notifications, moderation, safety) wait in the
 * outbox until their handlers ship, instead of being parked unread.
 * @typedef {import('./db.mjs').Db} Db
 * @typedef {import('./media/scan.mjs').ScanDeps} ScanDeps
 * @typedef {{scan: ScanDeps | null, limit?: number, notifyLimit?: number}} JobDeps
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
    // Removed, rejected or blocked: served copies go at once; the quarantined upload waits for media.purge
    // (and is never purged when blocked: it is evidence).
    'media.hide': async (/** @type {any} */ item) => {
      const [row] = await db.query(`select state from feture.media_asset where id = $1`, [id(item)]);
      if (!row || !['removed', 'rejected', 'blocked'].includes(row.state)) return;
      for (const key of servedKeys(id(item))) await storage().remove(key);
      await settlePosts(db, id(item));
      await db.tx(q => settleAvatarsOf(q, id(item)));
    },
    // A checked file may complete posts waiting for their media (or send them back if it was rejected).
    'media.approved': async (/** @type {any} */ item) => {
      await settlePosts(db, id(item));
      await db.tx(q => settleAvatarsOf(q, id(item))); // a profile photo that passed may become the avatar
    },
    // CSAM match or suspicion (S4 §5): the uploader's account and person profile, and the owning profile, are
    // suspended at once and their sessions end at the next request (resolveAccount refuses suspended accounts).
    // The quarantined original stays as evidence (never purged while blocked); reporting is a staff step.
    'safety.csamMatch': async (/** @type {any} */ item) => {
      await db.tx(async q => {
        const [m] = await q.query(`select owner_profile_id, uploaded_by, state from feture.media_asset where id = $1`, [id(item)]);
        if (!m || m.state !== 'blocked') return;
        await q.query(`update feture.account set state = 'suspended', suspension_rule = 'csam', updated_at = now() where id = $1 and state = 'active'`, [m.uploaded_by]);
        await q.query(
          `update feture.profile set state = 'suspended', restore_until = null, paused_at = null, updated_at = now()
           where state in ('active', 'paused') and (id = $1 or id = (select person_profile_id from feture.account where id = $2))`,
          [m.owner_profile_id, m.uploaded_by]);
        await enqueue(q, 'moderation.csamCase', m.owner_profile_id, { assetId: id(item), account: m.uploaded_by });
      });
    },
    // Deletes the upload and copies of a removed or rejected asset — never of a blocked one (evidence, S4), and
    // never before a CSAM scanner looked at it: such bytes are kept, scanned when a scanner exists, and the purge
    // is re-queued a day later (re-queued, not retried, so it never runs out of attempts).
    'media.purge': async (/** @type {any} */ item) => {
      const [row] = await db.query(
        `select state, storage_key, bytes, csam_checked_at is not null checked from feture.media_asset where id = $1`, [id(item)]);
      if (!row || !['removed', 'rejected'].includes(row.state)) return;
      const stored = await storage().head(row.storage_key);
      if (stored && !row.checked) {
        await db.tx(async q => {
          // Uploaded but never committed: record it so the scan picks it up (removed + unchecked).
          if (row.bytes == null) {
            await q.query(`update feture.media_asset set bytes = $2 where id = $1 and bytes is null`, [id(item), stored.bytes]);
          }
          await enqueue(q, 'media.scan', item.profile_id ?? null, { assetId: id(item) });
          await enqueue(q, 'media.purge', item.profile_id ?? null, { assetId: id(item) }, { delaySeconds: 24 * 3600 });
        });
        return;
      }
      for (const key of [row.storage_key, ...servedKeys(id(item))]) await storage().remove(key);
    },
  };
}

/** Posts on review that use this file are published or returned to their author. @param {Db} db @param {string} assetId */
async function settlePosts(db, assetId) {
  if (!(await db.query(`select to_regclass('feture.post') is not null ok`))[0].ok) return;
  const posts = await db.query(
    `select p.id from feture.media_attachment a join feture.post p on p.id = a.target_id
     where a.target_type = 'post' and a.asset_id = $1 and p.state = 'review'`, [assetId]);
  for (const p of posts) await db.tx(q => settlePublication(q, p.id));
}

/** Upload intents that were never committed are closed; their quarantine key is handled by media.purge three
 * hours later (Supabase signed upload URLs live about two hours), which also scans anything that did arrive.
 * @param {Db} db */
export async function sweepExpiredUploads(db) {
  return db.tx(async q => {
    const rows = await q.query(
      `update feture.media_asset set state = 'removed', removed_at = now()
       where id in (select id from feture.media_asset where state = 'pending_upload' and upload_expires_at < now() limit 100)
       returning id, owner_profile_id`);
    for (const r of rows) await enqueue(q, 'media.purge', r.owner_profile_id, { assetId: r.id }, { delaySeconds: 3 * 3600 });
    return rows.length;
  });
}

/** Stored command results hold short-lived bearer data (e.g. upload URLs): kept 7 days for retries only. @param {Db} db */
export async function sweepOpLedger(db) {
  const rows = await db.query(`delete from feture.op_ledger where created_at < now() - interval '7 days' returning op_id`);
  return rows.length;
}

/** Under-18 markers and lookup counters do not need to live forever. @param {Db} db */
export async function sweepMarkers(db) {
  if (!(await db.query(`select to_regclass('feture.u18_event') is not null ok`))[0].ok) return 0;
  const a = await db.query(`delete from feture.u18_event where created_at < now() - interval '1 year' returning 1`);
  const b = await db.query(`delete from feture.rate_event where created_at < now() - interval '2 days' returning 1`);
  return a.length + b.length;
}

/** Couples nobody restored within 30 days are deleted (S1 §5). @param {Db} db */
export async function sweepExpiredCouples(db) {
  if (!(await db.query(`select to_regclass('feture.couple_restore') is not null ok`))[0].ok) return 0;
  const due = await db.query(`select id from feture.profile where kind = 'couple' and state = 'paused' and restore_until < now() limit 50`);
  for (const c of due) {
    await db.tx(async q => {
      const [still] = await q.query(`select 1 from feture.profile where id = $1 and state = 'paused' and restore_until < now() for update`, [c.id]);
      if (still) await deleteCouple(q, c.id, 'not_restored');
    });
  }
  return due.length;
}

/** One worker tick. @param {Db} db @param {JobDeps} deps */
export async function runJobs(db, deps) {
  // Media first with its own budget, so a burst of likes never delays scans and publication; then the inbox.
  const media = await drain(db, { ...mediaHandlers(db, deps), ...verificationHandlers(db) }, { limit: deps.limit ?? 10, lockSeconds: 120 });
  const inbox = await drain(db, notifyHandlers(db), { limit: deps.notifyLimit ?? 200, lockSeconds: 120 });
  const processed = media + inbox;
  const expired = await sweepExpiredUploads(db);
  const ledger = await sweepOpLedger(db);
  const markers = await sweepMarkers(db);
  const couples = await sweepExpiredCouples(db);
  const ephemeral = await sweepEphemeral(db);
  return { processed, expired, ledger, markers, couples, ephemeral };
}
