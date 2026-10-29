// @ts-check
import { hmac } from './hash.mjs';
import { enqueue } from './outbox.mjs';

/** Sign-ins (owner 29.10.2026, docs/infra/security.md): the second step of an account with an optional second factor,
 * and the notice about a sign-in from a new device.
 *
 * Second step. While an account has a factor on (`account_totp.enabled_at`), a sign-in (Core session: device + token,
 * as a keyed hash) is usable only after a right code in it — a `session_factor` row, or a staff check of that sign-in
 * (`staff_session`, the same code). Until then every request is refused 403 `second_factor` rule `signin`, except the
 * code check itself (SIGNIN_OPEN); sign-out is Core's and needs nothing here. The check runs in the handler before any
 * command, and in front of every other endpoint that accepts a Core session (server/core-guard.mjs).
 *
 * New device. Each sign-in is written once when it first reaches the server (`account_signin`, primary key = the
 * sign-in), so one sign-in makes at most one notice, whichever instance sees it first. It is «new» when the account
 * signed in before (not the first sign-in after registration), Core opened it within the last day (an old session seen
 * for the first time after a deploy is not a sign-in), and no sign-in of the last 90 days was on the same device (Core's
 * session id) or on the same device family («Chrome · Mac») from the same country. Then: an inbox item and a push
 * (topic `signin.new`, server/notify.mjs) and a plain email (`signinMail`). At most NOTICE_MAX notices an hour.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {import('./accounts.mjs').AccountRow} AccountRow
 * @typedef {{device: string, place: string | null, at: string}} SigninNotice place: «city|CC» (either part may be empty)
 */

/** Commands a sign-in that has not passed the second step may still call: the code check. */
export const SIGNIN_OPEN = new Set(['account.factorSignIn', 'staff.totpVerify']);
const NOTICE_MAX = 5;
const KNOWN_DAYS = 90;
const FRESH_SIGNIN_MS = 864e5;

/** This sign-in as the database keeps it: a keyed hash of Core's session key, never matchable to a token.
 * @param {string} pepper @param {string | undefined} sessionKey */
export const sessionHash = (pepper, sessionKey) => sessionKey ? hmac(pepper, 'fe-session:v1:' + sessionKey).toString('base64url') : null;

/** Must this sign-in pass the second step first? Only accounts with a factor on pay for the second read.
 * A sign-in without a session key (never from Core) counts as not passed: fail closed.
 * @param {Db | Q} q @param {AccountRow} account */
export async function signinBlocked(q, account) {
  if (!account.factor_on) return false;
  if (!account.session) return true;
  const [r] = await q.query(
    `select exists (select 1 from feture.session_factor where account_id = $1 and session_key = $2)
         or exists (select 1 from feture.staff_session where account_id = $1 and session_key = $2) ok`, [account.id, account.session]);
  return !r?.ok;
}

/** A right code in this sign-in: it is usable from now on. @param {Q} q @param {AccountRow} account */
export async function passSignin(q, account) {
  if (!account.session) return;
  await q.query(`insert into feture.session_factor (account_id, session_key) values ($1, $2) on conflict do nothing`, [account.id, account.session]);
}

/** The factor was switched on in this sign-in: every other sign-in of the account asks for a code at its next request.
 * @param {Q} q @param {AccountRow} account */
export async function keepOnlyThisSignin(q, account) {
  await q.query(`delete from feture.session_factor where account_id = $1 and session_key <> $2`, [account.id, account.session ?? '']);
  await passSignin(q, account);
}

/** @type {Set<string>} sign-ins this warm instance already wrote */
const written = new Set();

/** Writes this sign-in once and, when it is from a new device, queues the inbox item and the push. Returns what the
 * email should say, or null. Never fails the request (before the migration, or on any error).
 * @param {Db} db @param {AccountRow} account
 * @param {{sessionId?: string, deviceLabel?: string, signedInAt?: string}} core @param {string | null} place «city|CC» */
export async function noteSignin(db, account, core, place) {
  if (!account.session) return null;
  const key = account.id + ':' + account.session;
  if (written.has(key)) return null;
  written.add(key);
  if (written.size > 20000) written.clear();
  const label = String(core.deviceLabel ?? '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 40);
  const country = String(place ?? '').split('|')[1] ?? '';
  try {
    // One statement for a sign-in already written (the usual case on a new warm instance); the rest only for a new one.
    const fresh = await db.query(
      `insert into feture.account_signin (account_id, session_key, session_id, label, country, place) values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing returning 1`, [account.id, account.session, core.sessionId ?? null, label, country, place]);
    if (!fresh.length) return null;
    const opened = Date.parse(core.signedInAt ?? '');
    if (!Number.isFinite(opened) || Date.now() - opened > FRESH_SIGNIN_MS) return null;
    return await db.tx(async q => {
      const [r] = await q.query(
        `select exists (select 1 from feture.account_signin where account_id = $1 and session_key <> $2)
             or exists (select 1 from feture.session_seen where account_id = $1 and session_id is distinct from $3) before,
                exists (select 1 from feture.account_signin where account_id = $1 and session_key <> $2 and created_at > now() - make_interval(days => $6)
                          and (session_id = $3 or (label = $4 and $4 <> '' and (country = $5 or country = '' or $5 = ''))))
             or exists (select 1 from feture.session_seen where account_id = $1 and session_id = $3) known,
                (select count(*)::int from feture.account_signin where account_id = $1 and notified_at > now() - interval '1 hour') recent`,
        [account.id, account.session, core.sessionId ?? null, label, country, KNOWN_DAYS]);
      await q.query(`delete from feture.account_signin where account_id = $1 and created_at < now() - make_interval(days => $2)`, [account.id, KNOWN_DAYS]);
      if (!r.before || r.known || r.recent >= NOTICE_MAX) return null;
      await q.query(`update feture.account_signin set notified_at = now() where account_id = $1 and session_key = $2`, [account.id, account.session]);
      /** @type {SigninNotice} */
      const notice = { device: label, place, at: new Date().toISOString() };
      await enqueue(q, 'signin.new', null, { for: account.id, device: label, place: place ?? '' });
      return notice;
    });
  } catch { return null; }
}

const MAIL = {
  ru: {
    subject: 'Вход в FetUre с нового устройства',
    line: 'Вход в FetUre с нового устройства: {what}.',
    unknown: 'неизвестное устройство',
    notYou: 'Это не ты? Открой «Мои устройства» и нажми «Выйти»:',
    you: 'Если это ты, ничего делать не нужно.',
  },
  en: {
    subject: 'New device signed in to FetUre',
    line: 'Someone signed in to FetUre on a new device: {what}.',
    unknown: 'unknown device',
    notYou: 'Not you? Open «My devices» and tap «Sign out»:',
    you: 'If it was you, there is nothing to do.',
  },
};

/** The plain email about a new sign-in: the device, the city and country, the time; no images, links only to the app.
 * @param {string} locale @param {SigninNotice} n @param {{appUrl: string, tz?: string | null}} opts */
export function signinMail(locale, n, { appUrl, tz = null }) {
  const lang = String(locale).startsWith('en') ? 'en' : 'ru';
  const t = MAIL[lang];
  const [city = '', cc = ''] = String(n.place ?? '').split('|');
  let country = cc;
  try { if (cc) country = new Intl.DisplayNames([lang], { type: 'region' }).of(cc) ?? cc; } catch { /* the code then */ }
  let zone = 'UTC';
  try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); zone = tz; } } catch { /* UTC */ }
  const when = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(n.at)) + (zone === 'UTC' ? ' UTC' : '');
  const what = [n.device || t.unknown, [city, country].filter(Boolean).join(', '), when].filter(Boolean).join(', ');
  const link = appUrl.replace(/\/$/, '') + '/#/n/settings/security';
  return { subject: t.subject, text: `${t.line.replace('{what}', what)}\n\n${t.notYou}\n${link}\n\n${t.you}\n` };
}

const MAIL_TIMEOUT_MS = 4000;

/** Sends the new-device email now (the address is never stored): best effort, a short timeout, never throws.
 * Reserved test domains (`.test`, e2e personas) get nothing.
 * @param {Db} db @param {((m: {to: string, subject: string, text: string}) => Promise<unknown>) | null | undefined} mail
 * @param {string} email @param {AccountRow} account @param {SigninNotice} notice @param {string} appUrl */
export async function sendSigninMail(db, mail, email, account, notice, appUrl) {
  if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /\.test$/i.test(email)) return false;
  try {
    const [d] = await db.query(`select tz from feture.push_device where account_id = $1 and tz is not null order by last_seen_at desc limit 1`, [account.id]);
    const m = signinMail(account.locale, notice, { appUrl, tz: d?.tz ?? null });
    await Promise.race([mail({ to: email, ...m }), new Promise((_, reject) => setTimeout(() => reject(new Error('mail_timeout')), MAIL_TIMEOUT_MS))]);
    return true;
  } catch { return false; }
}
