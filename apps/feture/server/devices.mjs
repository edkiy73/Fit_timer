// @ts-check
/** «Мои устройства» (owner 29.10.2026): Core lists the signed-in devices (label, sign-in time); FetUre adds when each
 * one last used the app and roughly where (the edge network's city and country — never an IP address). A session
 * writes at most once per SEEN_EVERY per warm instance, so this costs one small upsert every few minutes.
 * @typedef {import('./db.mjs').Db} Db */

const SEEN_EVERY = 5 * 60000;
/** @type {Map<string, number>} */
const lastWrite = new Map();

/** Rough place from the edge network's headers: «city|CC» (either part may be empty), or null.
 * @param {Record<string, string | string[] | undefined>} headers */
export function placeOf(headers) {
  const one = (/** @type {string} */ n) => { const v = headers?.[n]; return typeof v === 'string' ? v : ''; };
  let city = '';
  try { city = decodeURIComponent(one('x-vercel-ip-city')); } catch { /* malformed: no city */ }
  city = city.replace(/[\x00-\x1f\x7f|]/g, '').trim().slice(0, 60);
  const country = /^[A-Z]{2}$/.test(one('x-vercel-ip-country')) ? one('x-vercel-ip-country') : '';
  return city || country ? `${city}|${country}` : null;
}

/** Notes that this session used the app now. Never fails the request (before the migration, or on any error).
 * @param {Db} db @param {string} accountId @param {string | undefined} sessionId @param {string | null} place */
export async function noteSeen(db, accountId, sessionId, place) {
  if (!sessionId || !/^[0-9a-f]{16}$/.test(sessionId)) return;
  const key = accountId + ':' + sessionId;
  const now = Date.now();
  if (now - (lastWrite.get(key) ?? 0) < SEEN_EVERY) return;
  lastWrite.set(key, now);
  if (lastWrite.size > 20000) lastWrite.clear();
  try {
    await db.query(
      `insert into feture.session_seen (account_id, session_id, seen_at, place) values ($1, $2, now(), $3)
       on conflict (account_id, session_id) do update set seen_at = now(), place = coalesce($3, feture.session_seen.place)`,
      [accountId, sessionId, place]);
  } catch { /* the list just shows the sign-in time */ }
}
