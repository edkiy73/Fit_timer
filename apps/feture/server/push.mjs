// @ts-check
import { NOTIFICATION_DEFAULTS } from '../contracts/me.mjs';
import { enqueue } from './outbox.mjs';

/** Push delivery (S2 §8, extract/people-discover-chats.md §4.4). The queue sends it, never a command.
 * Texts are neutral: no names, no message text, no couple names, nothing about interests or the private part. «safe»
 * (the default) shows only that something new is there; «normal» says what kind of thing it is. The person's settings
 * decide: push on or off, per category, quiet hours in the device's time zone (nothing is sent then), likes at most
 * once an hour. Gone tokens are dropped; devices unseen for 60 days get nothing.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 * @typedef {{title: string, body: string, data: Record<string, string>}} Message
 * @typedef {{send: (platform: string, token: string, message: Message) => Promise<unknown>, platforms?: string[]}} Transport
 *   platforms: the device kinds this transport can reach (all when absent)
 */

const TEXT = {
  ru: {
    title: 'FetUre', safe: 'Новое уведомление', messages: 'Новое сообщение', likes: 'Новая симпатия', match: 'Новое совпадение',
    decide: 'Есть, что решить', events: 'Новости события', replies: 'Новый ответ', follows: 'Новый подписчик', groups: 'Новое в сообществе', other: 'Новое уведомление',
  },
  en: {
    title: 'FetUre', safe: 'New notification', messages: 'New message', likes: 'New like', match: 'New match',
    decide: 'Something to decide', events: 'Event update', replies: 'New reply', follows: 'New follower', groups: 'New in a community', other: 'New notification',
  },
};
/** Settings category of each push kind (V21 K05); kinds without one follow only the global switch. */
const CATEGORY = { likes: 'likes', match: 'match', decide: 'req', events: 'events', replies: 'replies', follows: 'follows', groups: 'groups' };

const SEND_TIMEOUT_MS = 10_000;

/** Queues one push for a recipient of an outbox item, once (a retried handler never doubles it). Items older than a day
 * (a backlog after deploy, a long outage) make no push: it would only be noise by then.
 * @param {Q} q @param {OutboxItem} item @param {{account: string, profile: string | null}} r @param {string} kind @param {string} [notificationId] */
export async function queuePush(q, item, r, kind, notificationId) {
  if (item.created_at && Date.now() - new Date(item.created_at).getTime() > 864e5) return;
  const fresh = await q.query(`insert into feture.push_sent (key) values ($1) on conflict do nothing returning key`, [`q:${item.id}:${r.account}`]);
  if (fresh[0]) await enqueue(q, 'push.deliver', r.profile, { account: r.account, kind, ...(notificationId ? { notificationId } : {}) });
}

/** Where a tap on the push opens the app (hash routes of the /n screens). Fixed addresses only: never an id. */
const OPENS = { messages: '/#/n/chats', match: '/#/n/chats', decide: '/#/n/inbox' };

/** One transport for every device kind: the web sender (webpush.mjs, our own VAPID keys) and the native one (Core's
 * FCM/APNs) side by side. null when neither is configured. A new native sender is one more entry here.
 * @param {{native?: ((platform: string, token: string, message: Message) => Promise<unknown>) | null,
 *   web?: {send: (token: string, message: Message) => Promise<unknown>} | null}} senders @returns {Transport | null} */
export function pushTransport({ native = null, web = null }) {
  if (!native && !web) return null;
  return {
    platforms: [...(native ? ['ios', 'android'] : []), ...(web ? ['web'] : [])],
    send: (platform, token, message) => {
      if (platform === 'web') return web ? web.send(token, message) : Promise.reject(new Error('push_no_web'));
      return native ? native(platform, token, message) : Promise.reject(new Error('push_no_native'));
    },
  };
}

/** A token the store says is gone for good. Anything else (a wrong project or bundle id) keeps the token.
 * @param {any} error */
function goneToken(error) {
  if (!error?.invalidToken) return false;
  if (error.gone === true) return true; // web push: 404 / 410 from the push service, or a subscription we cannot use
  return error.status === 410 || /Unregistered|BadDeviceToken|UNREGISTERED/.test(String(error.detail ?? ''));
}

/** @param {Promise<unknown>} p */
function withTimeout(p) {
  return Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('push_timeout')), SEND_TIMEOUT_MS))]);
}

/** Push bookkeeping older than a week goes. @param {Db} db */
export async function sweepPushSent(db) {
  if (!(await db.query(`select to_regclass('feture.push_sent') is not null ok`))[0].ok) return 0;
  return (await db.query(`delete from feture.push_sent where created_at < now() - interval '7 days' returning 1`)).length;
}

/** The push kind of a notification type. @param {string} type */
export function pushKind(type) {
  if (type === 'like') return 'likes';
  if (type === 'match') return 'match';
  if (type === 'follow') return 'follows';
  if (['reply', 'mention', 'postLike', 'notePublished'].includes(type)) return 'replies';
  if (type.startsWith('event')) return 'events';
  if (type.startsWith('community') || type.startsWith('discussion')) return 'groups';
  return 'other';
}

/** Minutes since midnight in a time zone (UTC when the zone is unknown). @param {string} tz @param {Date} now */
function minutesIn(tz, now) {
  let parts;
  try { parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  const get = (/** @type {string} */ t) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Is `now` inside quiet hours (which may cross midnight)? @param {{on: boolean, from: string, to: string}} quiet @param {string} tz @param {Date} now */
export function inQuietHours(quiet, tz, now = new Date()) {
  if (!quiet?.on) return false;
  const m = (/** @type {string} */ s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = minutesIn(tz, now), from = m(quiet.from), to = m(quiet.to);
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

/** @param {Db} db @param {Transport | null} transport null: no provider configured, nothing is sent */
export function pushHandlers(db, transport) {
  return {
    'push.deliver': async (/** @type {OutboxItem} */ item) => {
      if (!transport) return;
      const p = /** @type {{account: string, kind: string, notificationId?: string}} */ (/** @type {any} */ (item.payload));
      const [a] = await db.query(
        `select a.locale, a.state, s.settings from feture.account a left join feture.notification_settings s on s.account_id = a.id where a.id = $1`, [p.account]);
      if (!a || a.state !== 'active') return;
      // Still true at send time: a member of the profile it is for, and the notification not taken back meanwhile.
      if (item.profile_id && !(await db.query(`select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active'`, [item.profile_id, p.account]))[0]) return;
      if (p.notificationId && !(await db.query(`select 1 from feture.notification where id = $1 and retracted_at is null`, [p.notificationId]))[0]) return;
      const settings = { ...NOTIFICATION_DEFAULTS, ...(a.settings ?? {}) };
      if (!settings.push) return;
      const category = CATEGORY[/** @type {keyof typeof CATEGORY} */ (p.kind)];
      if (category && settings.categories?.[category]?.push === false) return;
      if (p.kind === 'likes') {
        // Likes are grouped: at most one push an hour (counted only when one really went out).
        const [{ recent }] = await db.query(
          `select exists (select 1 from feture.rate_event where account_id = $1 and kind = 'push.likes' and created_at > now() - interval '1 hour') recent`, [p.account]);
        if (recent) return;
      }
      const t = TEXT[String(a.locale).startsWith('en') ? 'en' : 'ru'];
      const body = settings.mode === 'normal' ? t[/** @type {keyof typeof t} */ (p.kind)] ?? t.other : t.safe;
      const devices = await db.query(
        `select token_hash, platform, token, tz from feture.push_device where account_id = $1 and platform = any($2::text[]) and last_seen_at > now() - interval '60 days'`,
        [p.account, transport.platforms ?? ['ios', 'android', 'web']]);
      let sent = 0;
      for (const d of devices) {
        if (inQuietHours(settings.quiet, d.tz)) continue;
        // One send per (push, device), even if this item is claimed again while a slow send is still running.
        const first = await db.query(`insert into feture.push_sent (key) values ($1) on conflict do nothing returning key`, [`d:${item.id}:${Buffer.from(d.token_hash).toString('hex')}`]);
        if (!first[0]) continue;
        try {
          await withTimeout(transport.send(d.platform, d.token, { title: t.title, body, data: {
            t: p.kind === 'messages' ? 'chat' : p.kind === 'decide' ? 'decide' : 'notif',
            url: OPENS[/** @type {keyof typeof OPENS} */ (p.kind)] ?? '/#/n/inbox',
          } }));
          sent++;
        } catch (error) {
          if (goneToken(error)) await db.query('delete from feture.push_device where token_hash = $1', [d.token_hash]);
        }
      }
      if (sent && p.kind === 'likes') await db.query(`insert into feture.rate_event (account_id, kind) values ($1, 'push.likes')`, [p.account]);
    },
  };
}
