// @ts-check
import { randomInt } from 'node:crypto';
import { fail } from './errors.mjs';
import { hmac } from './hash.mjs';

/** «Confirm it is you» (security audit 06.11.2026, B5): the actions that hand an account over — a new e-mail address, turning
 * on a second factor, deleting the account — need a six-digit code mailed to the signed-in address, so a stolen session token
 * alone cannot do them. A right code trusts this sign-in for them for `PASS_MIN` minutes. Without a real mail sender (no
 * sending domain yet, reserved `.test` addresses of the test accounts) the step is skipped: nothing could be delivered.
 * @typedef {import('./db.mjs').Q} Q
 * @typedef {{mail: ((m: {subject: string, text: string}) => Promise<boolean>) | null}} Confirm */

const TTL_MIN = 10, PASS_MIN = 15, TRIES = 5;

const MAIL = {
  ru: { subject: 'Код подтверждения KINHAZE', body: 'Код, чтобы подтвердить действие в KINHAZE: {code}\n\nОн действует 10 минут. Если это не ты, никому не говори код: кто-то может быть в твоём аккаунте. Зайди в «Настройки → Безопасность» и выйди на других устройствах.\n' },
  en: { subject: 'Your KINHAZE confirmation code', body: 'Code to confirm an action in KINHAZE: {code}\n\nIt is valid for 10 minutes. If this wasn’t you, don’t share the code: someone may be in your account. Open Settings → Security and sign out of other devices.\n' },
};

/** The mail asked for: sends the code to the signed-in address. @param {Q} q @param {{id: string, session?: string | null, locale?: string}} account
 * @param {string} pepper @param {Confirm | undefined} confirm @returns {Promise<{sent: boolean}>} */
export async function startStepUp(q, account, pepper, confirm) {
  if (!confirm?.mail) return { sent: false }; // nothing to send: the step is not asked for either (requireStepUp)
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  await q.query(
    `insert into feture.step_up (account_id, session, code_hash, expires_at, tries, passed_until)
     values ($1, $2, $3, now() + make_interval(mins => $4), 0, null)
     on conflict (account_id) do update set session = excluded.session, code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, passed_until = null`,
    [account.id, account.session ?? '', hmac(pepper, `step-up:${account.id}:${code}`).toString('hex'), TTL_MIN]);
  const t = MAIL[String(account.locale ?? 'ru').startsWith('en') ? 'en' : 'ru'];
  const ok = await confirm.mail({ subject: t.subject, text: t.body.replace('{code}', code) });
  if (!ok) fail(503, 'unavailable', { rule: 'mail_failed' });
  return { sent: true };
}

/** A code typed in: trusts this sign-in on a right one. A wrong one is an answer, not an error — an error would roll back the
 * count of tries (the second factor's checks answer the same way). @param {Q} q @param {{id: string, session?: string | null}} account @param {string} pepper @param {string} code
 * @returns {Promise<{confirmed: boolean, reason?: string, left?: number}>} */
export async function checkStepUp(q, account, pepper, code) {
  const [r] = await q.query(`select session, code_hash, expires_at, tries from feture.step_up where account_id = $1 for update`, [account.id]);
  if (!r || r.session !== (account.session ?? '') || !r.code_hash) return { confirmed: false, reason: 'code_missing' };
  if (new Date(r.expires_at).getTime() < Date.now()) return { confirmed: false, reason: 'code_expired' };
  if (r.tries >= TRIES) return { confirmed: false, reason: 'too_many_tries' };
  if (hmac(pepper, `step-up:${account.id}:${String(code).replace(/\D/g, '')}`).toString('hex') !== r.code_hash) {
    await q.query(`update feture.step_up set tries = tries + 1 where account_id = $1`, [account.id]);
    return { confirmed: false, reason: 'bad_code', left: Math.max(0, TRIES - r.tries - 1) };
  }
  await q.query(`update feture.step_up set code_hash = null, passed_until = now() + make_interval(mins => $2) where account_id = $1`, [account.id, PASS_MIN]);
  return { confirmed: true };
}

/** Has this sign-in confirmed itself lately? @param {Q} q @param {{id: string, session?: string | null}} account */
export async function stepUpPassed(q, account) {
  const [r] = await q.query(`select 1 ok from feture.step_up where account_id = $1 and session = $2 and passed_until > now()`, [account.id, account.session ?? '']);
  return !!r;
}

/** Refuses 403 `second_factor` rule `confirm` until this sign-in confirmed itself (the app opens the code sheet and repeats).
 * Skipped when no mail can be sent. @param {Q} q @param {{id: string, session?: string | null}} account @param {Confirm | undefined} confirm */
export async function requireStepUp(q, account, confirm) {
  if (!confirm?.mail) return;
  if (!(await stepUpPassed(q, account))) fail(403, 'second_factor', { rule: 'confirm' });
}

const NOTICE = {
  ru: { on: ['Двухэтапный вход включён', 'В KINHAZE включён вход с кодом из приложения-аутентификатора. Если это сделал не ты, сразу напиши в поддержку из приложения.'],
        off: ['Двухэтапный вход выключен', 'В KINHAZE выключен вход с кодом из приложения-аутентификатора. Если это сделал не ты, сразу напиши в поддержку из приложения.'] },
  en: { on: ['Two-step sign-in turned on', 'Sign-in with a code from an authenticator app was turned on in KINHAZE. If this wasn’t you, contact support in the app right away.'],
        off: ['Two-step sign-in turned off', 'Sign-in with a code from an authenticator app was turned off in KINHAZE. If this wasn’t you, contact support in the app right away.'] },
};

/** A notice to the signed-in address that the second factor changed: best effort, never throws.
 * @param {Confirm | undefined} confirm @param {string | undefined} locale @param {'on' | 'off'} kind */
export async function noticeFactor(confirm, locale, kind) {
  if (!confirm?.mail) return;
  const [subject, text] = NOTICE[String(locale ?? 'ru').startsWith('en') ? 'en' : 'ru'][kind];
  try { await confirm.mail({ subject, text: text + '\n' }); } catch { /* a notice is a courtesy */ }
}
