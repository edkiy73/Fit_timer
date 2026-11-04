// @ts-check
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { notificationSettingsOf } from '../contracts/me.mjs';
import { CATALOG, EMAIL_WORDS, entryFor, noteLine, routeOk, ruPlural, SETTING_CATS, settingOf, textOf } from '../contracts/notifications.mjs';
import { hmac } from './hash.mjs';
import { staleReason, TOLD_WHILE_SUSPENDED } from './push.mjs';

/** Email notifications (docs/notifications.md «Email», owner 03.11.2026; stage 6B). Built on the same catalog as push:
 * each entry's `email` is none | now | now-if-unread | digest, its `subject`, its settings category and destination.
 *
 * - **Address.** The one a person signs in with: Core proves it with the email code, so only verified addresses are
 *   kept, one per account (each partner of a couple gets their own). It is written by the command handler
 *   (`noteAddress`), sealed with a key derived from FETURE_ID_PEPPER plus a keyed hash (bounces, complaints), so a
 *   database copy alone is not a list of emails (S1 D2). Test addresses (TEST_LOGIN_DOMAIN, any `.test`)
 *   are never kept, so nothing is queued for them (`testAddress`).
 * - **Queue.** `email_delivery` holds one row per (item, address): `now` items at once, `now-if-unread` 15 minutes later,
 *   the morning `digest`. `sendDueEmails` (every worker tick) takes due rows with a lease, checks them again at send time
 *   and sends; a transient error (network, timeout, 429, 5xx) retries with a backoff, a refusal fails for good.
 * - **Modes.** now: security and account (sent unless all email is off). now-if-unread: tasks, support replies, event
 *   changes, decisions on applications — only if still unread and actual (`staleReason`, the same check as push; a task
 *   counts as seen once the app was opened after it). digest: the rest, in the morning of the person's zone, only when
 *   there is something new and unread and the app was not opened since the last digest; daily or weekly; never empty,
 *   never twice a day. never: chat texts (only a count in the digest), a partner's trust-mode actions, silent types.
 * - **Caps.** At most one «now» email per object and DAILY_CAP a day per account; the rest waits for the digest.
 * - **Content.** One KINHAZE template (HTML + text, light and dark). «Безопасные»: no names, only counts and neutral
 *   subjects; «Обычные»: the name and the action of types that may name someone. Never message contents, the private
 *   part, addresses or photos. The button opens the destination resolver's route (signed out: sign-in, then back).
 * - **Unsubscribe.** Every email carries `List-Unsubscribe` + `List-Unsubscribe-Post` and a signed link that flips the
 *   category's email switch the app shows (the digest → off; a security email → all email off), no sign-in needed.
 * - **Bounces and complaints.** The Resend webhook (Svix-signed, RESEND_WEBHOOK_SECRET; off without it) puts the
 *   address on `email_suppression`: no mail goes there again, and the settings say «Адрес не принимает письма».
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {{from: string, to: string, subject: string, html: string, text: string, headers: Record<string, string>, idempotencyKey: string}} OutMail
 * @typedef {{send: (m: OutMail) => Promise<{id: string | null}>}} MailTransport
 * @typedef {{transport: MailTransport, from: string, pepper: string, appUrl: string, apiUrl: string}} Mailer
 */

/** «now» emails per account in 24 hours; past it they wait for the digest. */
export const DAILY_CAP = 10;
/** A now-if-unread email waits this long for the person to read it in the app or from a push. */
export const UNREAD_DELAY_S = 15 * 60;
/** Sends tried per email (transient errors only). */
export const EMAIL_ATTEMPTS = 6;
/** The morning digest goes between these local hours. */
const DIGEST_FROM = 9, DIGEST_TO = 12;
const SEEN_EVERY = 5 * 60000;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

// ---- the address ----

/** @param {unknown} s */
const norm = s => String(s ?? '').trim().toLowerCase();
/** @param {string} pepper */
const sealKey = pepper => createHmac('sha256', pepper).update('fe-notify-email:key:v1').digest();
/** The keyed hash an address is matched by (bounces, complaints, «is it the same address»). @param {string} pepper @param {string} address */
export const addressHash = (pepper, address) => hmac(pepper, 'fe-email:v1:' + norm(address));
/** @param {string} pepper @param {string} address */
export function sealAddress(pepper, address) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', sealKey(pepper), iv);
  const body = Buffer.concat([c.update(norm(address), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), body].map(x => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
}
/** @param {string} pepper @param {string} sealed @returns {string | null} */
export function openAddress(pepper, sealed) {
  try {
    const [v, iv, tag, body] = String(sealed).split('.');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', sealKey(pepper), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

/** A zone name the app sent (`X-Fe-Tz`), if it is a real one. @param {unknown} tz */
export function zoneOk(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** A test account's address: the test sign-in domain (TEST_LOGIN_DOMAIN, the same env Core's mail skips) or any
 * reserved `.test` domain. No mailbox there: mail would only bounce and hurt the sender, so none is ever queued.
 * @param {string} address @param {Record<string, string | undefined>} [env] */
export function testAddress(address, env = process.env) {
  const domain = norm(address).split('@')[1] ?? '';
  const test = norm(env.TEST_LOGIN_DOMAIN).replace(/^@/, '');
  return /\.test$/.test(domain) || (!!test && domain === test);
}

/** @type {Map<string, {key: string, at: number}>} what this warm instance wrote last per account */
const noted = new Map();
/** Keeps the signed-in (verified) address, the device's zone and «the app was opened now» for an account. At most one
 * write every few minutes per account and instance; never fails the request. A test address is never kept (and one
 * kept before is dropped with its queued mail), so nothing is ever queued for it.
 * @param {Db} db @param {string} pepper @param {string} accountId @param {string} email @param {unknown} tz */
export async function noteAddress(db, pepper, accountId, email, tz) {
  const address = norm(email);
  if (!EMAIL.test(address) || address.length > 254 || !pepper) return;
  if (testAddress(address)) {
    if (noted.get(accountId)?.key === 'test') return;
    noted.set(accountId, { key: 'test', at: Date.now() });
    try {
      await db.query(`delete from feture.email_delivery where account_id = $1 and state = 'queued'`, [accountId]);
      await db.query(`delete from feture.email_address where account_id = $1`, [accountId]);
    } catch { /* before the migration, or a hiccup: next time */ }
    return;
  }
  const zone = zoneOk(tz) ? /** @type {string} */ (tz) : null;
  const hash = addressHash(pepper, address);
  const key = hash.toString('hex') + '|' + (zone ?? '');
  const last = noted.get(accountId);
  if (last && last.key === key && Date.now() - last.at < SEEN_EVERY) return;
  noted.set(accountId, { key, at: Date.now() });
  if (noted.size > 20000) noted.clear();
  try {
    await db.query(
      `insert into feture.email_address (account_id, address_sealed, address_hash, tz) values ($1, $2, $3, coalesce($4, 'UTC'))
       on conflict (account_id) do update set seen_at = now(), tz = coalesce($4, email_address.tz),
         address_sealed = case when email_address.address_hash = excluded.address_hash then email_address.address_sealed else excluded.address_sealed end,
         address_hash = excluded.address_hash, updated_at = now()`,
      [accountId, sealAddress(pepper, address), hash, zone]);
  } catch { /* before the migration, or a hiccup: next time */ }
}

/** What the settings say about the address: none known yet, ok, or blocked (it bounced or complained).
 * @param {Q | Db} q @param {string} accountId @returns {Promise<'none' | 'ok' | 'blocked'>} */
export async function emailState(q, accountId) {
  const [r] = await q.query(
    `select exists (select 1 from feture.email_suppression x where x.address_hash = e.address_hash) blocked
     from feture.email_address e where e.account_id = $1`, [accountId]).catch(() => []);
  return !r ? 'none' : r.blocked ? 'blocked' : 'ok';
}

// ---- the queue ----

/** Queues an email for one item, once, if its mode sends one by itself (a digest item is picked up by the digest).
 * Called inside the notify handler's transaction. `ref`: `n:<notification id>` or `d:<kind>:<id>`; `object`: what the
 * «one now email per object» cap counts; `url`: the destination resolver's push url.
 * @param {Q} q @param {{account: string, ref: string, object?: string | null, mode: string, url?: string | null}} o */
export async function queueEmail(q, { account, ref, object = null, mode, url = null }) {
  if (mode !== 'now' && mode !== 'now-if-unread') return;
  const [a] = await q.query(`select address_hash from feture.email_address where account_id = $1`, [account]);
  if (!a) return;
  const route = typeof url === 'string' && url.startsWith('/#') && routeOk(url.slice(2)) ? url : null;
  await q.query(
    `insert into feture.email_delivery (account_id, ref, object, mode, url, address_hash, next_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7)) on conflict do nothing`,
    [account, ref, object && object.length <= 120 ? object : null, mode, route, a.address_hash, mode === 'now' ? 0 : UNREAD_DELAY_S]);
}

/** Day, hour and weekday (1 = Monday) in a zone. @param {string} tz @param {Date} now */
function localParts(tz, now) {
  const f = (/** @type {string} */ zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  let parts;
  try { parts = f(tz); } catch { parts = f('UTC'); }
  const get = (/** @type {string} */ t) => parts.find(p => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1 };
}

/** Queues the morning digests that are due: the person's morning (DIGEST_FROM–DIGEST_TO local), daily or on Mondays
 * for weekly, nothing sent today, and the app not opened since the last digest. One row per local day, so never twice.
 * Whether there is anything new is decided when it is sent (an empty one is skipped). @param {Db} db @param {{now?: Date, limit?: number}} [o] */
export async function queueDigests(db, { now = new Date(), limit = 300 } = {}) {
  if (!(await db.query(`select to_regclass('feture.email_address') is not null ok`))[0].ok) return 0;
  const rows = await db.query(
    `select e.account_id, e.tz, e.address_hash, e.seen_at, e.digest_at, s.settings
     from feture.email_address e join feture.account a on a.id = e.account_id and a.state = 'active'
     left join feture.notification_settings s on s.account_id = e.account_id
     where (e.digest_at is null or e.digest_at < $1::timestamptz - interval '20 hours')
       and not exists (select 1 from feture.email_suppression x where x.address_hash = e.address_hash)
     order by e.digest_at nulls first limit $2`, [now.toISOString(), limit]);
  let queued = 0;
  for (const r of rows) {
    const s = notificationSettingsOf(r.settings);
    if (!s.email || s.digest === 'off') continue;
    const local = localParts(r.tz, now);
    if (local.hour < DIGEST_FROM || local.hour >= DIGEST_TO) continue;
    const weekly = s.digest === 'weekly';
    if (weekly && (local.weekday !== 1 || (r.digest_at && now.getTime() - new Date(r.digest_at).getTime() < 6 * 864e5))) continue;
    const since = r.digest_at ? new Date(r.digest_at) : new Date(now.getTime() - (weekly ? 7 : 1) * 864e5);
    if (r.seen_at && new Date(r.seen_at) > since) continue; // opened the app since: it has seen what is new
    const added = await db.query(
      `insert into feture.email_delivery (account_id, ref, mode, url, address_hash) values ($1, $2, 'digest', '/#/n/inbox', $3)
       on conflict do nothing returning id`, [r.account_id, `digest:${local.day}`, r.address_hash]);
    queued += added.length;
  }
  return queued;
}

/** Email bookkeeping older than 30 days goes. @param {Db} db */
export async function sweepEmail(db) {
  if (!(await db.query(`select to_regclass('feture.email_delivery') is not null ok`))[0].ok) return 0;
  return (await db.query(`delete from feture.email_delivery where created_at < now() - interval '30 days' and state <> 'queued' returning 1`)).length;
}

// ---- sending ----

/** Why a send failed, as a code, and whether trying again may help: no answer, a timeout, 408, 429 and 5xx retry.
 * @param {any} error */
function mailFailure(error) {
  const status = Number(error?.status) || 0;
  if (!status) return { code: error?.name === 'TimeoutError' ? 'timeout' : 'network', retry: true };
  return { code: `http_${Math.min(999, Math.max(100, status))}`, retry: status === 408 || status === 429 || status >= 500 };
}

/** Sends the due emails: each row is taken with a lease (two workers never send one twice), checked again and sent.
 * @param {Db} db @param {Mailer | null} mail null: no sender configured, rows wait @param {{limit?: number}} [o] */
export async function sendDueEmails(db, mail, { limit = 20 } = {}) {
  if (!mail) return 0;
  if (!(await db.query(`select to_regclass('feture.email_delivery') is not null ok`))[0].ok) return 0;
  const rows = await db.query(
    `update feture.email_delivery set attempts = attempts + 1, next_at = now() + interval '2 minutes', updated_at = now()
     where id in (select id from feture.email_delivery where state = 'queued' and next_at <= now() order by next_at, id limit $1 for update skip locked)
     returning id, account_id, ref, object, mode, url, address_hash, attempts, created_at`, [limit]);
  for (const r of rows) {
    try { await sendOne(db, mail, r); } catch {
      await db.query(`update feture.email_delivery set next_at = now() + interval '10 minutes', last_error = 'error', updated_at = now() where id = $1 and state = 'queued'`, [r.id]);
    }
  }
  return rows.length;
}

/** @param {any} r an account row @returns {'ru' | 'en'} */
const langOf = r => (String(r?.locale ?? '').startsWith('en') ? 'en' : 'ru');

/** @param {Db} db @param {any} r an email_delivery row */
async function toldWhileSuspended(db, r) {
  const [kind, id] = String(r.ref).split(':');
  if (kind !== 'n') return false;
  const [n] = await db.query('select type from feture.notification where id = $1 and recipient_account_id = $2', [id, r.account_id]);
  return !!n && TOLD_WHILE_SUSPENDED.includes(n.type);
}

/** One due row. @param {Db} db @param {Mailer} mail @param {any} r */
async function sendOne(db, mail, r) {
  const skip = (/** @type {string} */ code) => db.query(`update feture.email_delivery set state = 'skipped', last_error = $2, updated_at = now() where id = $1`, [r.id, code]);
  const [a] = await db.query(
    `select a.state, a.locale, s.settings, e.address_sealed, e.address_hash, e.seen_at, e.digest_at,
       exists (select 1 from feture.email_suppression x where x.address_hash = e.address_hash) suppressed
     from feture.account a left join feture.notification_settings s on s.account_id = a.id left join feture.email_address e on e.account_id = a.id
     where a.id = $1`, [r.account_id]);
  // A suspended person still hears about the suspension itself and the appeal (audit item 2), nothing else.
  if (!a || (a.state !== 'active' && !(a.state === 'suspended' && await toldWhileSuspended(db, r)))) return skip('account');
  if (!a.address_sealed || !Buffer.from(a.address_hash).equals(Buffer.from(r.address_hash))) return skip('address');
  if (a.suppressed) return skip('suppressed');
  const settings = notificationSettingsOf(a.settings);
  if (!settings.email) return skip('off');
  const to = openAddress(mail.pepper, a.address_sealed);
  if (!to) return skip('address');
  if (testAddress(to)) return skip('test_address');
  const lang = langOf(a);
  const content = r.mode === 'digest' ? await digestContent(db, r.account_id, a, settings, lang) : await itemContent(db, r, a, settings, lang);
  if (typeof content === 'string') return skip(content);
  if (r.mode !== 'digest') {
    // At most one «now» email per object; a daily cap per account. The item stays unread: the digest has it.
    if (r.object && (await db.query(`select 1 from feture.email_delivery where account_id = $1 and object = $2 and state = 'sent' and id <> $3 limit 1`, [r.account_id, r.object, r.id]))[0]) return skip('object_cap');
    const [{ n }] = await db.query(`select count(*)::int n from feture.email_delivery where account_id = $1 and state = 'sent' and mode <> 'digest' and sent_at > now() - interval '24 hours'`, [r.account_id]);
    if (n >= DAILY_CAP) return skip('daily_cap');
  }
  const unsub = `${mail.apiUrl}/api/fe?unsubscribe=1&t=${unsubToken(mail.pepper, r.account_id, content.what)}`;
  const link = mail.appUrl + (typeof r.url === 'string' && r.url.startsWith('/#') && routeOk(r.url.slice(2)) ? r.url : '/#/n/inbox');
  const page = renderEmail({ lang, subject: content.subject, title: content.title, summary: content.summary ?? null, lines: content.lines ?? [],
    more: content.more ?? 0, button: { label: content.button, url: link }, unsubscribeUrl: unsub, settingsUrl: `${mail.appUrl}/#/n/settings/notifications` });
  try {
    const res = await mail.transport.send({ from: mail.from, to, subject: content.subject, html: page.html, text: page.text, idempotencyKey: `fe-email-${r.id}`,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    const id = typeof res?.id === 'string' && /^[0-9a-zA-Z_-]{1,100}$/.test(res.id) ? res.id : null;
    await db.query(`update feture.email_delivery set state = 'sent', provider_id = $2, sent_at = now(), last_error = null, updated_at = now() where id = $1`, [r.id, id]);
    if (r.mode === 'digest') await db.query(`update feture.email_address set digest_at = now() where account_id = $1`, [r.account_id]);
  } catch (error) {
    const f = mailFailure(error);
    const again = f.retry && r.attempts < EMAIL_ATTEMPTS;
    await db.query(
      `update feture.email_delivery set state = $2, last_error = $3, next_at = now() + make_interval(mins => $4), updated_at = now() where id = $1`,
      [r.id, again ? 'queued' : 'failed', f.code, Math.min(60, 2 ** r.attempts)]);
  }
}

/** @typedef {{subject: string, title: string, summary?: string | null, lines?: string[], more?: number, button: string, what: string}} Content */

/** The name an email may show: «Обычные» only, a type that names who did it, someone still active and not blocked.
 * @param {Db} db @param {any} n the notification row */
async function nameFor(db, n) {
  if (!n.actor_profile_id) return null;
  const [p] = await db.query(
    `select pr.name, pr.handle, pr.kind, $2::uuid is not null and feture.blocked($2, pr.id) hidden from feture.profile pr where pr.id = $1 and pr.state = 'active'`,
    [n.actor_profile_id, n.addressee_profile_id ?? null]);
  if (!p || p.hidden) return null;
  return { name: p.name || (p.handle ? '@' + p.handle : null), couple: p.kind === 'couple' };
}

/** A row's line in «Обычные»: the name (when the type names someone) and the action, the couple's name of then; the
 * neutral line of the type when a placeholder stays unfilled. @param {Db} db @param {any} n @param {string} lang */
async function lineOf(db, n, lang) {
  const e = entryFor(n.type, n.data);
  if (!e) return null;
  const who = e.push.named ? await nameFor(db, n) : null;
  const s = noteLine(e, lang, { name: who?.name ?? null, couple: who?.couple ?? false, vars: n.couple_name ? { couple: n.couple_name } : {} });
  return /\{\w+\}/.test(s) ? textOf(e.push.normal, lang) : s;
}

/** A «now» / «now-if-unread» email: still actual, its category's email on; the words. @param {Db} db @param {any} r
 * @param {any} a @param {ReturnType<typeof notificationSettingsOf>} settings @param {'ru' | 'en'} lang @returns {Promise<Content | string>} */
async function itemContent(db, r, a, settings, lang) {
  const w = EMAIL_WORDS[lang];
  const [kindOf, id, id2] = String(r.ref).split(':');
  if (kindOf === 'd') {
    const e = CATALOG[`decide.${id}`];
    if (!e) return 'gone';
    if (!settings.categories.decide.email) return 'off';
    if ((await staleReason(db, r.account_id, { decide: { kind: id, id: id2 } })).stale) return 'resolved';
    // Still open after 15 minutes: it goes. Having the app open is not «read» — the app talks to the server in the
    // background (counters, live signals), so «opened since» would cancel every task email (owner test 03.11.2026).
    return { subject: textOf(e.subject, lang), title: textOf(settings.mode === 'normal' ? e.push.normal : e.subject, lang), button: w.open, what: 'decide' };
  }
  if (kindOf !== 'n') return 'gone';
  const [n] = await db.query(
    `select id, type, data, actor_profile_id, addressee_profile_id, couple_name, read_at from feture.notification where id = $1 and recipient_account_id = $2`,
    [id, r.account_id]);
  const e = n && entryFor(n.type, n.data);
  if (!e || e.email === 'none') return 'gone';
  const cat = settingOf(e);
  // «now» (security and account) goes unless all email is off; the rest also follows its category.
  if (r.mode !== 'now' && cat && !settings.categories[/** @type {keyof typeof settings.categories} */ (cat)]?.email) return 'off';
  const stale = (await staleReason(db, r.account_id, { notificationId: n.id }, { unreadOnly: r.mode !== 'now' })).stale;
  if (stale) return stale;
  const title = settings.mode === 'normal' ? (await lineOf(db, n, lang)) ?? textOf(e.subject, lang) : textOf(e.subject, lang);
  return { subject: textOf(e.subject, lang), title, button: w.open, what: cat ?? 'all' };
}

/** The digest: what waits (decisions, unread notifications, unread chats — each only if its category's email is on),
 * and in «Обычные» up to five lines with names. A string when it is not to be sent: `opened` (the app was opened since
 * the last digest), `empty` (nothing new and unread). @param {Db} db @param {string} account @param {any} a
 * @param {ReturnType<typeof notificationSettingsOf>} settings @param {'ru' | 'en'} lang @returns {Promise<Content | string>} */
async function digestContent(db, account, a, settings, lang) {
  if (settings.digest === 'off') return 'off';
  const w = EMAIL_WORDS[lang];
  const since = a.digest_at ? new Date(a.digest_at) : new Date(Date.now() - (settings.digest === 'weekly' ? 7 : 1) * 864e5);
  if (a.seen_at && new Date(a.seen_at) > since) return 'opened';
  const on = (/** @type {string} */ c) => !!settings.categories[/** @type {keyof typeof settings.categories} */ (c)]?.email;
  // The same numbers as the bell and the tabs (inbox.counts), then each part only if its category's email is on.
  // Imported when needed: the inbox commands load the approval registry (a cycle at load time otherwise).
  const { decisions, inbox } = await import('./commands/inbox.mjs');
  const counts = /** @type {any} */ (await inbox['inbox.counts'].run(/** @type {any} */ (db), /** @type {any} */ ({ account: { id: account } })));
  const notes = (await db.query(
    `select n.id, n.type, n.data, n.actor_profile_id, n.addressee_profile_id, n.couple_name, n.created_at
     from feture.notification n left join feture.profile ap on ap.id = n.actor_profile_id
     where n.recipient_account_id = $1 and n.read_at is null and n.retracted_at is null
       and (ap.id is null or ap.state = 'active' and (n.addressee_profile_id is null or not feture.blocked(n.addressee_profile_id, ap.id)))
       and (n.addressee_profile_id is null or exists (select 1 from feture.profile_member pm where pm.profile_id = n.addressee_profile_id and pm.account_id = n.recipient_account_id and pm.state = 'active'))
     order by n.created_at desc limit 300`, [account])).filter(n => {
    const e = entryFor(n.type, n.data);
    const cat = e && settingOf(e);
    return e && e.email !== 'none' && (!cat || on(cat));
  });
  const tasks = on('decide') ? await decisions(/** @type {any} */ (db), account) : [];
  const chats = on('messages') ? Number(counts.chats) || 0 : 0;
  const [{ fresh: chatsFresh }] = chats ? await db.query(
    `select exists (select 1 from feture.conversation_member cm join feture.message m on m.conversation_id = cm.conversation_id
       where cm.account_id = $1 and not cm.muted and m.seq > cm.last_read_seq and m.sender_account_id is distinct from $1 and m.created_at > $2) fresh`,
    [account, since.toISOString()]) : [{ fresh: false }];
  const fresh = notes.some(n => new Date(n.created_at) > since) || tasks.some(t => new Date(t.at) > since) || chatsFresh;
  if (!fresh || notes.length + tasks.length + chats === 0) return 'empty';
  const part = (/** @type {number} */ n, /** @type {readonly [string, string, string]} */ f) => `${n} ${lang === 'en' ? (n === 1 ? f[0] : f[1]) : ruPlural(n, f)}`;
  const parts = [tasks.length ? part(tasks.length, w.tasks) : '', notes.length ? part(notes.length, w.notes) : '', chats ? part(chats, w.chats) : ''].filter(Boolean);
  const summary = `${w.youHave} ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ` ${w.and} ` + parts.at(-1) : parts[0]}`;
  /** @type {string[]} */
  const lines = [];
  if (settings.mode === 'normal') for (const n of notes.slice(0, 5)) { const l = await lineOf(db, n, lang); if (l) lines.push(l); }
  return { subject: w.digestSubject, title: summary, summary: null, lines, more: settings.mode === 'normal' ? Math.max(0, notes.length - lines.length) : 0,
    button: w.digestOpen, what: 'digest' };
}

// ---- the template ----

/** @param {unknown} s */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The one KINHAZE email: the brand, a title, an optional line and list, one button, why it came and how to stop it.
 * Readable in light and dark clients (colour-scheme meta + dark media query; no images). Every text is escaped.
 * @param {{lang: 'ru' | 'en', subject: string, title: string, summary?: string | null, lines?: string[], more?: number,
 *   button: {label: string, url: string}, unsubscribeUrl: string, settingsUrl: string}} o */
export function renderEmail(o) {
  const w = EMAIL_WORDS[o.lang];
  const lines = o.lines ?? [];
  const more = o.more ? w.more.replace('{n}', String(o.more)) : '';
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`;
  const head = `Geologica,${font}`;
  const html = `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(o.subject)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0}
a.k-btn{color:#ffffff !important}
@media (prefers-color-scheme:dark){
.k-bg{background:#141114 !important}.k-card{background:#1f1a1e !important;border-color:#352d33 !important}
.k-t{color:#f5f0f3 !important}.k-m{color:#b9aeb5 !important}.k-l{color:#ff5c7f !important}.k-brand{color:#ff5c7f !important}
.k-row{border-color:#352d33 !important}
}
[data-ogsc] .k-bg{background:#141114 !important}[data-ogsc] .k-card{background:#1f1a1e !important}
[data-ogsc] .k-t{color:#f5f0f3 !important}[data-ogsc] .k-m{color:#b9aeb5 !important}
</style></head>
<body class="k-bg" style="margin:0;padding:0;background:#f5f2f4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-bg" style="background:#f5f2f4">
<tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td class="k-brand" style="padding:0 4px 16px;font:700 17px/1 ${head};letter-spacing:.14em;color:#DF234A">${esc(w.brand)}</td></tr>
<tr><td class="k-card" style="background:#ffffff;border:1px solid #ece5ea;border-radius:16px;padding:28px 24px">
<h1 class="k-t" style="margin:0;font:600 20px/1.35 ${head};color:#1b161a">${esc(o.title)}</h1>
${o.summary ? `<p class="k-m" style="margin:12px 0 0;font:15px/1.5 ${font};color:#6f646c">${esc(o.summary)}</p>` : ''}
${lines.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px">${lines.map(l =>
    `<tr><td class="k-t k-row" style="padding:10px 0;border-top:1px solid #ece5ea;font:15px/1.45 ${font};color:#1b161a">${esc(l)}</td></tr>`).join('')}</table>` : ''}
${more ? `<p class="k-m" style="margin:8px 0 0;font:14px/1.5 ${font};color:#6f646c">${esc(more)}</p>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td style="border-radius:12px;background:#DF234A">
<a class="k-btn" href="${esc(o.button.url)}" style="display:inline-block;padding:13px 22px;font:600 15px/1 ${font};color:#ffffff;text-decoration:none;border-radius:12px">${esc(o.button.label)}</a>
</td></tr></table>
</td></tr>
<tr><td class="k-m" style="padding:18px 4px 0;font:13px/1.55 ${font};color:#857a82">${esc(w.why)}<br>
<a class="k-l" href="${esc(o.unsubscribeUrl)}" style="color:#B81A3C">${esc(w.unsubscribe)}</a> · <a class="k-l" href="${esc(o.settingsUrl)}" style="color:#B81A3C">${esc(w.settings)}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [w.brand, '', o.title, ...(o.summary ? ['', o.summary] : []), ...(lines.length ? ['', ...lines.map(l => '• ' + l)] : []), ...(more ? [more] : []),
    '', `${o.button.label}: ${o.button.url}`, '', '—', w.why, `${w.unsubscribe}: ${o.unsubscribeUrl}`, `${w.settings}: ${o.settingsUrl}`, ''].join('\n');
  return { html, text };
}

// ---- one-click unsubscribe ----

const WHAT = new Set(['all', 'digest', ...SETTING_CATS]);
/** A signed link token for «stop this kind of email» of one account; works without signing in, never expires.
 * @param {string} pepper @param {string} accountId @param {string} what a settings category, `digest` or `all` */
export function unsubToken(pepper, accountId, what) {
  const payload = Buffer.from(`${accountId}:${what}`).toString('base64url');
  return `${payload}.${hmac(pepper, 'fe-unsub:v1:' + payload).subarray(0, 18).toString('base64url')}`;
}
/** @param {string} pepper @param {unknown} token @returns {{account: string, what: string} | null} */
export function readUnsubToken(pepper, token) {
  if (typeof token !== 'string' || token.length > 300) return null;
  const [payload, mac, ...rest] = token.split('.');
  if (rest.length || !payload || !mac) return null;
  const want = hmac(pepper, 'fe-unsub:v1:' + payload).subarray(0, 18);
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [account, what] = Buffer.from(payload, 'base64url').toString('utf8').split(':');
  return /^[0-9a-f-]{36}$/.test(account ?? '') && WHAT.has(what) ? { account, what } : null;
}

/** Flips the setting a token names — the same one the app's notification settings show. null for a bad token.
 * @param {Db} db @param {string} pepper @param {unknown} token @returns {Promise<{what: string, lang: 'ru' | 'en'} | null>} */
export async function unsubscribe(db, pepper, token) {
  const t = readUnsubToken(pepper, token);
  if (!t) return null;
  return db.tx(async q => {
    const [a] = await q.query(`select a.locale, s.settings from feture.account a left join feture.notification_settings s on s.account_id = a.id where a.id = $1`, [t.account]);
    if (!a) return null;
    const s = notificationSettingsOf(a.settings);
    if (t.what === 'all') s.email = false;
    else if (t.what === 'digest') s.digest = 'off';
    else s.categories[/** @type {keyof typeof s.categories} */ (t.what)].email = false;
    await q.query(
      `insert into feture.notification_settings (account_id, settings) values ($1, $2)
       on conflict (account_id) do update set settings = excluded.settings, updated_at = now()`, [t.account, JSON.stringify(s)]);
    return { what: t.what, lang: langOf(a) };
  });
}

/** The small page of the unsubscribe link: ask (one button), done, or a link that does not work.
 * @param {'ask' | 'done' | 'bad'} state @param {'ru' | 'en'} lang @param {string | null} what @param {string} [action] the form's address */
export function unsubscribePage(state, lang, what, action = '') {
  const w = EMAIL_WORDS[lang];
  const name = what ? w.what[what] ?? '' : '';
  const body = state === 'bad' ? `<p>${esc(w.unsubBad)}</p>`
    : state === 'done' ? `<p>${esc(w.unsubDone.replace('{what}', name))}</p>`
    : `<h1>${esc(w.unsubTitle)}</h1><p>${esc(w.unsubText.replace('{what}', name))}</p>
<form method="post" action="${esc(action)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">${esc(w.unsubButton)}</button></form>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(w.brand)}</title>
<style>body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f2f4;color:#1b161a}
main{max-width:420px;margin:12vh auto;padding:0 16px}b{display:block;letter-spacing:.14em;color:#DF234A;margin-bottom:20px}
h1{font-size:20px;margin:0 0 8px}button{margin-top:16px;border:0;border-radius:12px;padding:13px 22px;background:#DF234A;color:#fff;font:600 15px/1 inherit;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#141114;color:#f5f0f3}b{color:#ff5c7f}}</style></head>
<body><main><b>${esc(w.brand)}</b>${body}</main></body></html>`;
}

// ---- the Resend webhook (bounces and complaints) ----

/** Svix signature check (what Resend signs webhooks with): `svix-id`, `svix-timestamp` within 5 minutes, and one of the
 * `v1,<base64>` signatures = HMAC-SHA256(secret, id.timestamp.body). @param {string} secret `whsec_…`
 * @param {Record<string, string | string[] | undefined>} headers @param {string} raw @param {number} [nowSec] */
export function svixOk(secret, headers, raw, nowSec = Date.now() / 1000) {
  const h = (/** @type {string} */ n) => { const v = headers?.[n]; return typeof v === 'string' ? v : ''; };
  const id = h('svix-id'), ts = h('svix-timestamp'), sig = h('svix-signature');
  if (!secret || !id || !/^\d{1,12}$/.test(ts) || !sig || Math.abs(nowSec - Number(ts)) > 300) return false;
  let key;
  try { key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); } catch { return false; }
  if (!key.length) return false;
  const want = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();
  return sig.split(' ').some(part => {
    const [v, s] = part.split(',');
    if (v !== 'v1' || !s) return false;
    const got = Buffer.from(s, 'base64');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** One webhook event from Resend: a bounce (a permanent one) or a complaint puts the address on the suppression list.
 * Anything else is acknowledged and ignored. @param {Db} db @param {string} pepper @param {string} secret
 * @param {Record<string, string | string[] | undefined>} headers @param {string | null} raw the exact body text
 * @returns {Promise<{status: number, body: Record<string, unknown>}>} */
export async function takeResendEvent(db, pepper, secret, headers, raw) {
  if (!secret) return { status: 404, body: { ok: false } };
  if (typeof raw !== 'string' || !svixOk(secret, headers, raw)) return { status: 401, body: { ok: false, error: 'bad_signature' } };
  let e;
  try { e = JSON.parse(raw); } catch { return { status: 400, body: { ok: false, error: 'invalid_input' } }; }
  const reason = e?.type === 'email.bounced' ? 'bounce' : e?.type === 'email.complained' ? 'complaint' : null;
  if (!reason || (reason === 'bounce' && /transient|temporary|soft/i.test(String(e?.data?.bounce?.type ?? '')))) return { status: 200, body: { ok: true, ignored: true } };
  /** @type {Set<string>} */
  const hashes = new Set();
  for (const to of [e?.data?.to].flat()) {
    if (typeof to !== 'string') continue;
    const address = /<([^>]+)>/.exec(to)?.[1] ?? to;
    if (EMAIL.test(norm(address))) hashes.add(addressHash(pepper, address).toString('hex'));
  }
  const pid = e?.data?.email_id;
  if (typeof pid === 'string' && /^[0-9a-zA-Z_-]{1,100}$/.test(pid)) {
    for (const r of await db.query(`select distinct encode(address_hash, 'hex') h from feture.email_delivery where provider_id = $1`, [pid])) hashes.add(r.h);
  }
  for (const h of hashes) {
    await db.query(
      `insert into feture.email_suppression (address_hash, reason) values (decode($1, 'hex'), $2)
       on conflict (address_hash) do update set reason = case when excluded.reason = 'complaint' then 'complaint' else email_suppression.reason end`, [h, reason]);
  }
  return { status: 200, body: { ok: true, suppressed: hashes.size } };
}

// ---- the sender ----

/** Resend's API with our notification sender, an idempotency key (a retried send is not a second email) and the
 * unsubscribe headers. @param {{apiKey: string, fetch?: typeof globalThis.fetch}} o @returns {MailTransport} */
export function resendTransport({ apiKey, fetch = globalThis.fetch }) {
  return {
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.idempotencyKey },
        body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = /** @type {any} */ (await res.json().catch(() => ({})));
      if (res.ok) return { id: typeof data?.id === 'string' ? data.id : null };
      throw Object.assign(new Error('email_failed'), { status: res.status });
    },
  };
}

/** The notification sender from the environment: RESEND_API_KEY and MAIL_FROM_NOTIFY (`KINHAZE <notify@mail.kinhaze.com>`;
 * MAIL_FROM when it is unset). Off (null) without a key, a sender, the pepper, or with Resend's test domain (it delivers
 * only to its owner). @param {Record<string, string | undefined>} env @returns {Mailer | null} */
export function emailFromEnv(env) {
  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  const from = String(env.MAIL_FROM_NOTIFY || env.MAIL_FROM || '').trim();
  const pepper = String(env.FETURE_ID_PEPPER ?? '');
  if (!apiKey || !from || pepper.length < 32 || /@resend\.dev>?\s*$/i.test(from)) return null;
  const appUrl = String(env.FETURE_APP_URL || 'https://app.kinhaze.com').replace(/\/$/, '');
  const apiUrl = String(env.FETURE_API_ORIGIN || appUrl).replace(/\/$/, '');
  return { transport: resendTransport({ apiKey }), from, pepper, appUrl, apiUrl };
}
