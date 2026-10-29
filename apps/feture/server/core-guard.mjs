// @ts-check
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { POSTGRES_TYPES, fromPostgres } from './db.mjs';
import { SELECT, coreKeyHmac } from './accounts.mjs';
import { placeOf } from './devices.mjs';
import { noteSignin, sendSigninMail, sessionHash, signinBlocked } from './signin.mjs';

/** The sign-in second step in front of every endpoint other than /api/fe that accepts a Core session: Core's account
 * actions (sessions, sign out elsewhere, email change, deletion, nickname — api/auth.js), settings sync (api/sync.js),
 * the earlier domain API (api/domain.js) and the operator cabinet (api/admin.js). A sign-in that has not passed it is
 * refused 403 `second_factor` rule `signin` there too; Core's own sign-in, sign-out and status stay open. The same
 * new-device notice runs here (a sign-in that never opens the app still makes one).
 * @typedef {import('./db.mjs').Db} Db
 * @typedef {{accountHash: string, accountGeneration?: string, sessionKey?: string, sessionId?: string, deviceLabel?: string, signedInAt?: string}} Core
 */

const require = createRequire(import.meta.url);
/** Core and the identity check are CommonJS outside this typed tree: required by a computed path so the server
 * typecheck does not pull Core's untyped files in. */
const CORE = '../../../packages/core/server/';
const LIB = '../lib/feture/';
/** @type {Db | null} */
let pool = null;
function database() {
  const env = process.env;
  if (!env.FETURE_DATABASE_URL || !env.FETURE_ID_PEPPER) return null;
  pool ??= fromPostgres(postgres(env.FETURE_DATABASE_URL, { prepare: false, max: 2, idle_timeout: 60, connect_timeout: 8, types: POSTGRES_TYPES }), 2);
  return pool;
}

export const appUrl = () => process.env.FETURE_APP_URL || 'https://feture-mvp.vercel.app';

/** Core's mail when a real sending domain is set up (Resend's test domain reaches only its owner), else null. */
export function coreMailer() {
  const CoreMail = require(CORE + 'mail');
  const info = CoreMail.mailInfo();
  return info.ready && !info.testDomain ? (/** @type {{to: string, subject: string, text: string}} */ m) => CoreMail.sendMail(m) : null;
}

/** Must this Core sign-in pass the second step before it may do anything? No FetUre database or no FetUre account
 * yet = no factor. A database error throws (the caller answers 503: fail closed).
 * @param {Core} core @param {{headers?: Record<string, string | string[] | undefined>, email?: string, db?: Db | null, pepper?: string,
 *   mail?: ((m: {to: string, subject: string, text: string}) => Promise<unknown>) | null}} [opts] */
export async function coreSessionBlocked(core, { headers = {}, email = '', db, pepper, mail } = {}) {
  const d = db === undefined ? database() : db;
  if (!d) return false;
  const key = pepper ?? process.env.FETURE_ID_PEPPER ?? '';
  if (!core.accountGeneration) return false; // no FetUre account can exist for it (accounts.mjs)
  const [row] = await d.query(SELECT, [coreKeyHmac(key, core)]);
  if (!row) return false;
  const account = { ...row, session: sessionHash(key, core.sessionKey) };
  const notice = await noteSignin(d, account, core, placeOf(headers));
  if (notice) await sendSigninMail(d, mail === undefined ? coreMailer() : mail, email, account, notice, appUrl());
  return signinBlocked(d, account);
}

/** Core's account actions that act with a session token: the second step guards them. Sign-in, sign-out, status and
 * anonymous analytics are not here. */
export const GUARDED_AUTH = new Set(['set_handle', 'set_locale', 'forget', 'sessions', 'session_revoke', 'sessions_revoke_others',
  'email_change_send', 'email_change_verify', 'push_device']);

/** A Core request body naming a session (email, deviceId, syncToken | token): null to let it through, or the refusal.
 * An invalid session is let through: Core refuses it with its own answer.
 * @param {{headers?: Record<string, string | string[] | undefined>}} req @param {any} body
 * @param {{store?: any, db?: Db | null, pepper?: string, mail?: any}} [opts] store: Core's account store (tests) */
export async function guardCoreBody(req, body, opts = {}) {
  const { authenticate } = require(LIB + 'identity');
  const store = opts.store ?? require(CORE + 'store').store;
  const str = (/** @type {unknown} */ v) => typeof v === 'string' ? v : '';
  const email = str(body?.email).trim().toLowerCase();
  /** @type {Core} */
  let core;
  try {
    core = await authenticate({ headers: { 'x-fit-email': email, 'x-fit-device': str(body?.deviceId).trim(), 'x-fit-token': str(body?.syncToken) || str(body?.token) } }, store);
  } catch { return null; }
  try {
    return (await coreSessionBlocked(core, { headers: req.headers ?? {}, email, db: opts.db, pepper: opts.pepper, mail: opts.mail }))
      ? { status: 403, error: 'second_factor', rule: 'signin' } : null;
  } catch { return { status: 503, error: 'unavailable' }; }
}

/** The same for a request carrying Core identity headers (the domain API, the operator cabinet): throws a 403 / 503
 * the endpoint's own error mapping understands. @param {{headers: Record<string, string | string[] | undefined>}} req @param {Core} core */
export async function guardCoreRequest(req, core) {
  const h = req.headers?.['x-fit-email'];
  let blocked;
  try { blocked = await coreSessionBlocked(core, { headers: req.headers, email: typeof h === 'string' ? h.toLowerCase() : '' }); }
  catch { throw Object.assign(new Error('unavailable'), { status: 503, code: 'unavailable' }); }
  if (blocked) throw Object.assign(new Error('second_factor'), { status: 403, code: 'second_factor', rule: 'signin' });
}
