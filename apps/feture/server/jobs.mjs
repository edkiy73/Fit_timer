// @ts-check
import { collectEnqueued, drain, enqueue } from './outbox.mjs';
import { PROCESSED_ENTITIES, liveSignals } from './live.mjs';
import { scanAsset, servedKeys } from './media/scan.mjs';
import { POSTER_UPLOAD_KEY } from './media/assets.mjs';
import { deleteCouple, expireInvites } from './commands/couples.mjs';
import { releaseWaitingEvents } from './commands/events.mjs';
import { expireApprovals } from './approvals.mjs';
import { setSuspended } from './commands/moderation.mjs';
import { journal } from './commands/staff.mjs';
import { alertStaff } from './staff-alert.mjs';
import { settlePublication } from './commands/posts.mjs';
import { settleAvatarsOf } from './commands/photos.mjs';
import { sweepEphemeral } from './commands/chats.mjs';
import { notifyHandlers } from './notify.mjs';
import { pushHandlers, sweepPushSent } from './push.mjs';
import { noticeHandlers, sweepNotices } from './commands/dsa.mjs';
import { helpHandlers, sweepPublicHelp } from './commands/support.mjs';
import { supportEmail } from './support-config.mjs';
import { sweepSelfies, verificationHandlers } from './commands/premium.mjs';

/** Queue worker (S2 §8, D7). Called every minute by pg_cron + pg_net (Vercel Hobby cron is daily only)
 * through `POST /api/fe?jobs=1` with the jobs secret. Every handler is idempotent.
 * Only topics with a handler here are claimed. Every enqueued topic has one: history and staff markers are marked
 * done silently (notify.mjs SILENT_TOPICS; tests/fe-notify-topics-postgres.mjs fails on a topic nobody takes).
 * Mail topics wait while mail is not set up.
 * @typedef {import('./db.mjs').Db} Db
 * @typedef {import('./media/scan.mjs').ScanDeps} ScanDeps
 * @typedef {{scan: ScanDeps | null, limit?: number, notifyLimit?: number, push?: import('./push.mjs').Transport | null,
 *   mail?: import('./commands/dsa.mjs').Mailer | null, signals?: import('./realtime.mjs').Signals | null, quick?: boolean}} JobDeps
 *   quick: a kicked tick (server/kick.mjs) — the queues only, the sweeps wait for the minute tick
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
    // The quarantined original stays as evidence (never purged while blocked); reporting is a staff step, so owner and
    // lead are alerted at once (no name, no media: the alert only says a case waits). `by`: the staff member who
    // escalated it by hand, never alerted about their own step.
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
        await alertStaff(q, 'csam', item.payload?.by ? { by: item.payload.by } : {});
      });
    },
    // Deletes the upload and copies of a removed or rejected asset — never of a blocked one (evidence, S4), and
    // never before a CSAM scanner looked at it: such bytes are kept, scanned when a scanner exists, and the purge
    // is re-queued a day later (re-queued, not retried, so it never runs out of attempts).
    'media.purge': async (/** @type {any} */ item) => {
      const [row] = await db.query(
        `select state, storage_key, bytes, csam_checked_at is not null checked from feture.media_asset where id = $1`, [id(item)]);
      if (!row || !['removed', 'rejected'].includes(row.state)) return;
      // A file an open report is about stays as evidence until the report is decided (account deletion included).
      const [held] = await db.query(
        `select 1 from feture.report r where r.state = 'open' and (
           r.target_type = 'media' and r.target_id = $1
           or r.target_type = 'post' and exists (select 1 from feture.media_attachment a where a.target_type = 'post' and a.target_id = r.target_id and a.asset_id = $1)
           or r.target_type = 'conversation' and exists (select 1 from feture.message m where m.media_asset_id = $1 and m.id = any(r.message_ids)))
         limit 1`, [id(item)]).catch(() => []);
      if (held) {
        await db.tx(q => enqueue(q, 'media.purge', item.profile_id ?? null, { assetId: id(item) }, { delaySeconds: 24 * 3600 }));
        return;
      }
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
      for (const key of [row.storage_key, POSTER_UPLOAD_KEY(id(item)), ...servedKeys(id(item))]) await storage().remove(key);
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

/** Under-18 markers, lookup counters and old notifications do not need to live forever. Notifications (docs/notifications.md
 * «Хранение», owner decision 8): a read one goes after 180 days; an unread one, and the result of a decision read or not,
 * after a year. In batches, so one tick never holds a long lock. @param {Db} db */
export async function sweepMarkers(db) {
  let notes = 0;
  if ((await db.query(`select exists (select 1 from information_schema.columns where table_schema = 'feture' and table_name = 'notification' and column_name = 'kind') ok`))[0].ok) {
    notes = (await db.query(
      `delete from feture.notification where id in (
         select id from feture.notification
         where created_at < now() - interval '1 year'
            or created_at < now() - interval '180 days' and read_at is not null and kind not in ('result', 'task')
         limit 5000)
       returning 1`)).length;
  }
  if (!(await db.query(`select to_regclass('feture.u18_event') is not null ok`))[0].ok) return notes;
  const a = await db.query(`delete from feture.u18_event where created_at < now() - interval '1 year' returning 1`);
  const b = await db.query(`delete from feture.rate_event where created_at < now() - interval '2 days' returning 1`);
  return notes + a.length + b.length;
}

/** New members of open communities (owner decision 7): on the first tick of a UTC day, one item per community that
 * grew the day before, with the count; notify.mjs writes one summary row to its owner and hosts, without a push. People
 * the hosts admitted from a request are not counted (they decided on them), nor hosts, nor anyone who left since.
 * Once per community and day: the item of that day is looked up in the outbox (kept a week). @param {Db} db */
export async function sweepCommunityJoins(db) {
  if (!(await db.query(`select to_regclass('feture.community_request') is not null ok`))[0].ok) return 0;
  return db.tx(async q => {
    await q.query(`select pg_advisory_xact_lock(hashtextextended('fe-community-joins', 0))`);
    const rows = await q.query(
      `with d as (select (date_trunc('day', now() at time zone 'utc') - interval '1 day') at time zone 'utc' since,
                         date_trunc('day', now() at time zone 'utc') at time zone 'utc' till,
                         to_char(date_trunc('day', now() at time zone 'utc') - interval '1 day', 'YYYY-MM-DD') ymd)
       select c.id, count(*)::int n, d.ymd from d, feture.community c
       join feture.community_member cm on cm.community_id = c.id and cm.state = 'active' and cm.role = 'member'
       where c.state = 'published' and c.privacy = 'open' and cm.joined_at >= d.since and cm.joined_at < d.till
         and not exists (select 1 from feture.community_request r where r.community_id = c.id and r.profile_id = cm.profile_id and r.state = 'approved'
                         and r.decided_at >= cm.joined_at - interval '1 minute')
         and not exists (select 1 from feture.outbox o where o.topic = 'community.joins' and o.payload->>'communityId' = c.id::text and o.payload->>'day' = d.ymd)
       group by c.id, d.ymd limit 500`);
    for (const r of rows) await enqueue(q, 'community.joins', null, { communityId: r.id, count: r.n, day: r.ymd });
    return rows.length;
  });
}

/** A reminder the day before to the people admitted to an event («События: … напоминания за день»), once.
 * @param {Db} db */
export async function sweepEventReminders(db) {
  if (!(await db.query(`select to_regclass('feture.event') is not null ok`))[0].ok) return 0;
  return db.tx(async q => {
    const due = await q.query(
      `update feture.event set reminded_at = now() where id in (
         select id from feture.event where state = 'published' and reminded_at is null and starts_at > now() and starts_at <= now() + interval '24 hours'
         order by starts_at limit 100 for update skip locked)
       returning id, organizer_profile_id`);
    for (const e of due) await enqueue(q, 'event.reminder', e.organizer_profile_id, { eventId: e.id });
    return due.length;
  });
}

/** Couples nobody restored within 30 days are deleted (S1 §5); couple invitations nobody answered in time expire and
 * their inviters are told (couples.mjs expireInvites). @param {Db} db */
export async function sweepExpiredCouples(db) {
  if (!(await db.query(`select to_regclass('feture.couple_restore') is not null ok`))[0].ok) return 0;
  await db.tx(q => expireInvites(q));
  const due = await db.query(`select id from feture.profile where kind = 'couple' and state = 'paused' and restore_until < now() limit 50`);
  for (const c of due) {
    await db.tx(async q => {
      const [still] = await q.query(`select 1 from feture.profile where id = $1 and state = 'paused' and restore_until < now() for update`, [c.id]);
      if (still) await deleteCouple(q, c.id, 'not_restored');
    });
  }
  return due.length;
}

/** Couple approvals past their date are closed as expired (docs/notifications.md: «Истечение — фоновая работа»): the
 * author gets «Срок истёк», the partner's task goes, an event waiting for the partner goes back to drafts. Events left
 * waiting with nothing pending (closed before this job existed) go back to drafts too. @param {Db} db */
export async function sweepExpiredApprovals(db) {
  if (!(await db.query(`select exists (select 1 from information_schema.columns where table_schema = 'feture' and table_name = 'partner_approval' and column_name = 'base_rev') ok`))[0].ok) return 0;
  const expired = await db.tx(q => expireApprovals(q));
  if ((await db.query(`select to_regclass('feture.event') is not null ok`))[0].ok) await db.tx(q => releaseWaitingEvents(q));
  return expired;
}

/** Timed suspensions and restrictions that ran out are lifted (audit 30.10, item 9): the person is told, and the journal
 * keeps a line without a staff member. @param {Db} db */
export async function sweepExpiredSanctions(db) {
  // Tests with a part of the schema run the worker without timed measures.
  if (!(await db.query(`select exists (select 1 from information_schema.columns where table_schema = 'feture' and table_name = 'profile' and column_name = 'suspended_until') ok`))[0].ok) return 0;
  const due = await db.query(
    `select id, 'suspension' what from feture.profile where state = 'suspended' and suspended_until < now()
     union all select id, 'restriction' from feture.profile where restricted_at is not null and restricted_until < now() limit 50`);
  for (const d of due) {
    await db.tx(async q => {
      if (d.what === 'suspension') {
        const [still] = await q.query(`select 1 from feture.profile where id = $1 and state = 'suspended' and suspended_until < now() for update`, [d.id]);
        if (!still) return;
        await setSuspended(q, d.id, false, null);
        await enqueue(q, 'profile.restored', d.id, { rule: 'expired' });
        await journal(q, null, 'sanction.expired', 'profile', d.id);
      } else {
        const rows = await q.query(
          `update feture.profile set restricted_at = null, restriction_rule = null, restricted_until = null, updated_at = now()
           where id = $1 and restricted_at is not null and restricted_until < now() returning id`, [d.id]);
        if (!rows[0]) return;
        await enqueue(q, 'profile.unrestricted', d.id, { rule: 'expired' });
        await journal(q, null, 'restrict.expired', 'profile', d.id);
      }
    });
  }
  return due.length;
}

/** Topics a tick may queue that the next tick should take at once (a scan's approval completes posts and avatars). */
const FOLLOW_UP = new Set(['media.approved', 'media.hide', 'media.scan']);

/** One worker tick. Live data (server/live.mjs): whatever the tick queued and whatever its media handlers changed sends
 * `changed` signals once the tick is done (all its transactions committed by then). `again`: it queued work the next
 * tick should take now. @param {Db} db @param {JobDeps} deps */
export async function runJobs(db, deps) {
  /** @type {{topic: string, profileId: string | null, for?: unknown}[]} */
  const queued = [];
  /** @type {{topic: string, profileId: string | null}[]} */
  const processed = [];
  const out = await collectEnqueued(queued, () => tickOnce(db, deps, processed));
  if (deps.signals) {
    const live = [
      ...await liveSignals(db, queued),
      ...await liveSignals(db, processed, { entitiesOf: t => PROCESSED_ENTITIES[t] ?? [] }),
    ];
    if (live.length) await deps.signals.send(live);
  }
  return { ...out, again: queued.some(i => FOLLOW_UP.has(i.topic)) };
}

/** @param {Db} db @param {JobDeps} deps @param {{topic: string, profileId: string | null}[]} processed */
async function tickOnce(db, deps, processed) {
  /** @param {Record<string, (item: any) => Promise<void>>} handlers */
  const tracked = handlers => Object.fromEntries(Object.entries(handlers).map(([topic, fn]) => [topic, async (/** @type {any} */ item) => {
    await fn(item);
    if (PROCESSED_ENTITIES[topic]) processed.push({ topic, profileId: item.profile_id ?? null });
  }]));
  // Media first with its own budget, so a burst of likes never delays scans and publication; then the inbox.
  const media = await drain(db, tracked({ ...mediaHandlers(db, deps), ...verificationHandlers(db, deps) }), { limit: deps.limit ?? 10, lockSeconds: 120 });
  /** @type {import('./realtime.mjs').Signal[]} */
  const signals = [];
  const inbox = await drain(db, notifyHandlers(db, s => signals.push(s)), { limit: deps.notifyLimit ?? 200, lockSeconds: 120 });
  // «Something new» for the bells and «Нужно решить» of the people just notified: one batch, best-effort (S2 §8).
  if (deps.signals && signals.length) await deps.signals.send(signals);
  // Replies to notices in a small batch of their own: a slow mail service never outlives the claim.
  await drain(db, noticeHandlers(db, deps.mail ?? null), { limit: 10, lockSeconds: 300 });
  await drain(db, helpHandlers(db, deps.mail ?? null, supportEmail()), { limit: 10, lockSeconds: 300 });
  // Pushes in a small batch of their own, so a slow provider never outlives the claim.
  const pushes = await drain(db, pushHandlers(db, deps.push ?? null), { limit: 20, lockSeconds: 300 });
  const done = media + inbox + pushes;
  if (deps.quick) return { processed: done };
  const expired = await sweepExpiredUploads(db);
  const ledger = await sweepOpLedger(db);
  const markers = await sweepMarkers(db);
  const couples = await sweepExpiredCouples(db);
  const approvals = await sweepExpiredApprovals(db);
  await sweepExpiredSanctions(db);
  const ephemeral = await sweepEphemeral(db);
  const reminders = await sweepEventReminders(db);
  await sweepCommunityJoins(db);
  const selfies = await sweepSelfies(db);
  await sweepPushSent(db);
  await sweepNotices(db);
  await sweepPublicHelp(db);
  // Finished outbox items stay a week (some «told already today» checks read them), then go.
  await db.query(`delete from feture.outbox where done_at < now() - interval '7 days'`);
  return { processed: done, expired, ledger, markers, couples, approvals, ephemeral, reminders, selfies };
}
