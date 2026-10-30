// @ts-check
/** Tells the staff who handle an area that something is waiting for them (audit 30.10: a moderator got no word of a new
 * report). One outbox item to every account holding one of the roles; the notifier writes the inbox row (a batch of
 * alike alerts within 15 minutes is one row with a count) and the push.
 * @typedef {import('./db.mjs').Q} Q */
import { enqueue } from './outbox.mjs';

/** Roles that answer each kind of alert (the same as the screens' own role lists). */
export const ALERT_ROLES = {
  report: ['owner', 'lead', 'moderator'],
  dispute: ['owner', 'lead', 'moderator'],
  notice: ['owner', 'lead', 'moderator'],
  support: ['owner', 'lead', 'moderator', 'support'],
};

/** @param {Q} q @param {keyof typeof ALERT_ROLES} what @param {Record<string, unknown>} [data] `by`: the account that caused it (never told) */
export async function alertStaff(q, what, data = {}) {
  const rows = await q.query(
    `select distinct r.account_id id from feture.staff_role r join feture.account a on a.id = r.account_id
     where r.revoked_at is null and r.role = any($1) and a.state = 'active'`, [ALERT_ROLES[what]]);
  if (rows.length) await enqueue(q, 'staff.alert', null, { for: rows.map(r => r.id), what, ...data });
}
