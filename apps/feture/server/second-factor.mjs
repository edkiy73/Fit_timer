// @ts-check
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fail } from './errors.mjs';
import { hmac } from './hash.mjs';

/** A second factor per account: an authenticator app (RFC 6238 TOTP — SHA1, 6 digits, 30 s, ±1 step) plus ten
 * one-time recovery codes. Staff must have one (commands/staff.mjs); everyone else may turn one on (commands/account.mjs,
 * the sign-in second step in signin.mjs).
 * - The secret is sealed with AES-256-GCM under a key derived (HKDF) from FETURE_ID_PEPPER: a copy of the database
 *   alone never yields it. No pepper → the server refuses (503), never stores a plain secret.
 * - Recovery codes are kept only as keyed hashes; a used one stays marked so it never works again.
 * - A code works once: the newest step used is remembered and anything at or before it is refused («used»).
 * - Five wrong codes within 15 minutes lock checks for 15 minutes («locked» with the time it opens again).
 * @typedef {import('./db.mjs').Q} Q
 * @typedef {{ok: true, recovery: boolean} | {ok: false, reason: 'wrong' | 'used' | 'locked', left: number, lockedUntil: string | null, lockedNow?: boolean}} CheckResult
 *   lockedNow: this wrong code started the lock (journalled once)
 */

export const TOTP = { digits: 6, period: 30, window: 1, issuer: 'FetUre' };
export const FACTOR_LIMIT = { wrong: 5, minutes: 15 };
const RECOVERY_COUNT = 10;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Recovery code letters: no 0/o, 1/l/i look-alikes. */
const RC = 'abcdefghjkmnpqrstuvwxyz23456789';

/** @param {Buffer} buf */
export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** @param {string} text */
export function unbase32(text) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP. @param {Buffer} key @param {number} counter */
function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 10 ** TOTP.digits).padStart(TOTP.digits, '0');
}

/** The code an authenticator shows for `secret` (base32) at `at` (ms). Also used by tests and the e2e personas.
 * @param {string} secret @param {number} [at] */
export function totpCode(secret, at = Date.now()) {
  return hotp(unbase32(secret), Math.floor(at / 1000 / TOTP.period));
}

/** @param {number} at */
const stepAt = at => Math.floor(at / 1000 / TOTP.period);

/** @param {string} pepper */
function sealKey(pepper) {
  if (typeof pepper !== 'string' || pepper.length < 32) fail(503, 'unavailable', { rule: 'second_factor_key' });
  return Buffer.from(hkdfSync('sha256', pepper, 'feture', 'second-factor:v1', 32));
}

/** @param {string} pepper @param {string} plain */
function seal(pepper, plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', sealKey(pepper), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

/** @param {string} pepper @param {string} sealed */
function unseal(pepper, sealed) {
  const raw = Buffer.from(String(sealed).replace(/^v1\./, ''), 'base64url');
  const d = createDecipheriv('aes-256-gcm', sealKey(pepper), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

/** @param {string} pepper @param {string} code */
const recoveryHash = (pepper, code) => hmac(sealKey(pepper), 'recovery:' + code.toLowerCase().replace(/[^a-z0-9]/g, '')).toString('base64url');

function recoveryCode() {
  const b = randomBytes(10);
  const s = [...b].map(x => RC[x % RC.length]).join('');
  return s.slice(0, 5) + '-' + s.slice(5);
}

/** What the account has. @param {Q} q @param {string} accountId */
export async function factorState(q, accountId) {
  const [t] = await q.query(
    `select enabled_at, locked_until > now() locked, locked_until,
            (select count(*)::int from feture.account_recovery_code r where r.account_id = t.account_id and r.used_at is null) recovery_left
     from feture.account_totp t where account_id = $1`, [accountId]);
  return {
    enrolled: !!t?.enabled_at, lockedUntil: t?.locked ? t.locked_until : null, recoveryLeft: t?.enabled_at ? t.recovery_left : 0,
  };
}

/** A new secret waiting for its first code (a previous unconfirmed one is replaced); refused once a factor is on.
 * @param {Q} q @param {string} accountId @param {string} pepper @param {string} label who the authenticator shows */
export async function startEnrol(q, accountId, pepper, label) {
  const [t] = await q.query('select enabled_at from feture.account_totp where account_id = $1 for update', [accountId]);
  if (t?.enabled_at) fail(409, 'conflict', { rule: 'factor_enrolled' });
  const secret = base32(randomBytes(20));
  await q.query(
    `insert into feture.account_totp (account_id, secret_sealed) values ($1, $2)
     on conflict (account_id) do update set secret_sealed = $2, created_at = now(), last_step = 0`, [accountId, seal(pepper, secret)]);
  const name = encodeURIComponent(`${TOTP.issuer}:${label}`);
  const uri = `otpauth://totp/${name}?secret=${secret}&issuer=${TOTP.issuer}&algorithm=SHA1&digits=${TOTP.digits}&period=${TOTP.period}`;
  return { secret, uri };
}

/** Checks a code (six digits from the app, or a recovery code once enrolled) with the lockout and the one-use rule.
 * Never throws for a wrong code: the caller returns the result, so the counted failure is committed.
 * @param {Q} q @param {string} accountId @param {string} pepper @param {string} code @param {{enrolling?: boolean, at?: number}} [opts]
 * @returns {Promise<CheckResult>} */
export async function checkCode(q, accountId, pepper, code, { enrolling = false, at = Date.now() } = {}) {
  const [t] = await q.query(
    `select secret_sealed, enabled_at, last_step, fail_count, fail_since > now() - make_interval(mins => $2) recent,
            locked_until > now() locked, locked_until
     from feture.account_totp where account_id = $1 for update`, [accountId, FACTOR_LIMIT.minutes]);
  if (!t || (enrolling ? !!t.enabled_at : !t.enabled_at)) fail(409, 'conflict', { rule: enrolling ? 'factor_enrolled' : 'factor_missing' });
  if (t.locked) return { ok: false, reason: 'locked', left: 0, lockedUntil: new Date(t.locked_until).toISOString() };
  const digits = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(digits)) {
    const key = unbase32(unseal(pepper, t.secret_sealed));
    const now = stepAt(at);
    let matched = -1;
    for (let s = now - TOTP.window; s <= now + TOTP.window; s++) {
      if (timingSafeEqual(Buffer.from(hotp(key, s)), Buffer.from(digits))) matched = s;
    }
    if (matched >= 0 && matched <= Number(t.last_step)) {
      // Seen before: someone repeats a code. Not counted as a wrong guess (it was right once); just refused.
      return { ok: false, reason: 'used', left: FACTOR_LIMIT.wrong - (t.recent ? t.fail_count : 0), lockedUntil: null };
    }
    if (matched >= 0) {
      await q.query(`update feture.account_totp set last_step = $2, fail_count = 0, fail_since = null, locked_until = null where account_id = $1`, [accountId, matched]);
      return { ok: true, recovery: false };
    }
  } else if (!enrolling && /^[a-z0-9]{5}-?[a-z0-9]{5}$/i.test(digits)) {
    const used = await q.query(
      `update feture.account_recovery_code set used_at = now() where account_id = $1 and code_hash = $2 and used_at is null returning 1`,
      [accountId, recoveryHash(pepper, digits)]);
    if (used.length) {
      await q.query(`update feture.account_totp set fail_count = 0, fail_since = null, locked_until = null where account_id = $1`, [accountId]);
      return { ok: true, recovery: true };
    }
  }
  const count = (t.recent ? t.fail_count : 0) + 1;
  const lock = count >= FACTOR_LIMIT.wrong;
  const [u] = await q.query(
    `update feture.account_totp set fail_count = $2, fail_since = case when $3 then fail_since else now() end,
       locked_until = case when $4 then now() + make_interval(mins => $5) end
     where account_id = $1 returning locked_until`, [accountId, lock ? 0 : count, !!t.recent && !lock, lock, FACTOR_LIMIT.minutes]);
  return lock ? { ok: false, reason: 'locked', left: 0, lockedUntil: new Date(u.locked_until).toISOString(), lockedNow: true }
    : { ok: false, reason: 'wrong', left: FACTOR_LIMIT.wrong - count, lockedUntil: null };
}

/** The first right code switches the factor on and issues the recovery codes (shown once, kept only as hashes).
 * @param {Q} q @param {string} accountId @param {string} pepper @param {string} code */
export async function confirmEnrol(q, accountId, pepper, code) {
  const r = await checkCode(q, accountId, pepper, code, { enrolling: true });
  if (!r.ok) return { result: r, codes: null };
  await q.query('update feture.account_totp set enabled_at = now() where account_id = $1', [accountId]);
  return { result: r, codes: await newRecoveryCodes(q, accountId, pepper) };
}

/** Replaces the recovery codes. @param {Q} q @param {string} accountId @param {string} pepper */
export async function newRecoveryCodes(q, accountId, pepper) {
  await q.query('delete from feture.account_recovery_code where account_id = $1', [accountId]);
  const codes = Array.from({ length: RECOVERY_COUNT }, recoveryCode);
  for (const c of codes) {
    await q.query('insert into feture.account_recovery_code (account_id, code_hash) values ($1, $2) on conflict do nothing', [accountId, recoveryHash(pepper, c)]);
  }
  return codes;
}

/** Removes the factor completely (turned off, a lead's reset, account deletion): enrolment starts over, and the sign-ins
 * that passed the old factor are forgotten (a factor turned on again asks every sign-in anew).
 * @param {Q} q @param {string} accountId */
export async function removeFactor(q, accountId) {
  await q.query('delete from feture.account_recovery_code where account_id = $1', [accountId]);
  await q.query('delete from feture.session_factor where account_id = $1', [accountId]);
  const gone = await q.query('delete from feture.account_totp where account_id = $1 returning 1', [accountId]);
  return gone.length > 0;
}
