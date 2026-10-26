// @ts-check
import { fail, isUniqueViolation } from './errors.mjs';
import { hmac } from './hash.mjs';

/** @typedef {import('./db.mjs').Db} Db */
/** @typedef {{id: string, state: string, locale: string, person_profile_id: string | null}} AccountRow */

const SELECT = `select a.id, a.state, a.locale, a.person_profile_id
  from feture.account_link l join feture.account a on a.id = l.account_id
  where l.core_key_hmac = $1`;

/** The Core login key (today sha256(email)) is reduced to a keyed hash before it touches the domain
 * database, so domain rows cannot be joined back to an email or to another AppBase app (D2).
 * @param {string} pepper server secret FETURE_ID_PEPPER @param {string} coreKey */
export function coreKeyHmac(pepper, coreKey) {
  if (typeof pepper !== 'string' || pepper.length < 32) fail(503, 'unavailable');
  if (typeof coreKey !== 'string' || !coreKey) fail(401, 'auth_required');
  return hmac(pepper, 'feture-account:v1:' + coreKey);
}

/** Finds the FetUre account for an authenticated Core login; creates it on first sight.
 * Creating an empty account row is the minimal non-sensitive provisioning AGENTS.md allows.
 * @param {Db} db @param {string} pepper @param {string} coreKey @returns {Promise<AccountRow>} */
export async function resolveAccount(db, pepper, coreKey) {
  const key = coreKeyHmac(pepper, coreKey);
  const found = await db.query(SELECT, [key]);
  if (found[0]) return checkState(found[0]);
  try {
    await db.tx(async q => {
      const [account] = await q.query('insert into feture.account default values returning id');
      await q.query('insert into feture.account_link (core_key_hmac, account_id) values ($1, $2)', [key, account.id]);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error; // a parallel first request won; read its row
  }
  const [row] = await db.query(SELECT, [key]);
  if (!row) fail(503, 'unavailable');
  return checkState(row);
}

/** @param {AccountRow} row */
function checkState(row) {
  if (row.state !== 'active') fail(403, 'account_unavailable');
  return row;
}
