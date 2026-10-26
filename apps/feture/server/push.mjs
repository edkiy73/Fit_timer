// @ts-check
import { NOTIFICATION_DEFAULTS } from '../contracts/me.mjs';

/** Push delivery (S2 §8, extract/people-discover-chats.md §4.4). The queue sends it, never a command.
 * Texts are neutral: no names, no message text, no couple names, nothing about interests or the private part. «safe»
 * (the default) shows only that something new is there; «normal» says what kind of thing it is. The person's settings
 * decide: push on or off, per category, quiet hours in the device's time zone (nothing is sent then), likes at most
 * once an hour. Gone tokens are dropped; devices unseen for 60 days get nothing.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 * @typedef {{send: (platform: string, token: string, message: {title: string, body: string, data: Record<string, string>}) => Promise<unknown>}} Transport
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
      const p = /** @type {{account: string, kind: string}} */ (/** @type {any} */ (item.payload));
      const [a] = await db.query(
        `select a.locale, a.state, s.settings from feture.account a left join feture.notification_settings s on s.account_id = a.id where a.id = $1`, [p.account]);
      if (!a || a.state !== 'active') return;
      const settings = { ...NOTIFICATION_DEFAULTS, ...(a.settings ?? {}) };
      if (!settings.push) return;
      const category = CATEGORY[/** @type {keyof typeof CATEGORY} */ (p.kind)];
      if (category && settings.categories?.[category]?.push === false) return;
      if (p.kind === 'likes') {
        // Likes are grouped: at most one push an hour.
        const [{ recent }] = await db.query(
          `select exists (select 1 from feture.rate_event where account_id = $1 and kind = 'push.likes' and created_at > now() - interval '1 hour') recent`, [p.account]);
        if (recent) return;
        await db.query(`insert into feture.rate_event (account_id, kind) values ($1, 'push.likes')`, [p.account]);
      }
      const t = TEXT[String(a.locale).startsWith('en') ? 'en' : 'ru'];
      const body = settings.mode === 'normal' ? t[/** @type {keyof typeof t} */ (p.kind)] ?? t.other : t.safe;
      const devices = await db.query(
        `select token_hash, platform, token, tz from feture.push_device where account_id = $1 and platform in ('ios', 'android') and last_seen_at > now() - interval '60 days'`, [p.account]);
      for (const d of devices) {
        if (inQuietHours(settings.quiet, d.tz)) continue;
        try {
          await transport.send(d.platform, d.token, { title: t.title, body, data: { t: p.kind === 'messages' ? 'chat' : p.kind === 'decide' ? 'decide' : 'notif' } });
        } catch (error) {
          if (/** @type {any} */ (error)?.invalidToken) await db.query('delete from feture.push_device where token_hash = $1', [d.token_hash]);
        }
      }
    },
  };
}
