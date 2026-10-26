// @ts-check
import { fail } from './errors.mjs';

/** Per-account sliding window for actions that reveal existence or can be used to pester people
 * (nick.check, place.submit, couple.invite). Serialised per account and kind; call inside a transaction.
 * @param {import('./db.mjs').Q} q @param {string} accountId @param {string} kind @param {number} max @param {string} window postgres interval */
export async function limit(q, accountId, kind, max, window) {
  await q.query(`select pg_advisory_xact_lock(hashtext('feture-rate:' || $1 || ':' || $2))`, [accountId, kind]);
  const [{ n }] = await q.query(
    `select count(*)::int n from feture.rate_event where account_id = $1 and kind = $2 and created_at > now() - $3::interval`, [accountId, kind, window]);
  if (n >= max) fail(429, 'rate_limited');
  await q.query('insert into feture.rate_event (account_id, kind) values ($1, $2)', [accountId, kind]);
}
