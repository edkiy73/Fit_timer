// @ts-check
import { NOTIFICATION_DEFAULTS } from '../contracts/me.mjs';
import { enqueue } from './outbox.mjs';

/** Push delivery (S2 §8, extract/people-discover-chats.md §4.4). The queue sends it, never a command.
 * «safe» (the default, «Безопасные») shows only that something new is there: no names, no text. «normal» («Обычные»,
 * owner 29.10.2026) names who it is from and starts the message: «Мира · Привет! Видела тебя…», «Sofi · Ставит тебе
 * симпатию» (`personalText`). Never in any mode: private-part content, once-view / timed media or their captions,
 * anyone hidden by a block or gone — then the neutral kind text is used. The person's settings
 * decide: push on or off, per category, quiet hours in the device's time zone (nothing is sent then), likes at most
 * once an hour. A new sign-in («security») has no category: only the push switch and quiet hours hold it back.
 * Gone tokens are dropped; devices unseen for 60 days get nothing.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 * @typedef {{title: string, body: string, data: Record<string, string>}} Message
 * @typedef {{send: (platform: string, token: string, message: Message) => Promise<unknown>, platforms?: string[]}} Transport
 *   platforms: the device kinds this transport can reach (all when absent)
 */

export const PUSH_TEXT = {
  ru: {
    title: 'FetUre', safe: 'Новое уведомление', messages: 'Новое сообщение', likes: 'Новая симпатия', match: 'Новое совпадение',
    decide: 'Есть, что решить', requests: 'Новый запрос на переписку', events: 'Новости события', replies: 'Новый ответ', follows: 'Новый подписчик', groups: 'Новое в сообществе', other: 'Новое уведомление',
    security: 'Вход с нового устройства',
    media: { image: 'Фото', video: 'Видео', audio: 'Голосовое' },
    // What someone did, after their name in the title: [a person, a couple].
    act: {
      like: ['Ставит тебе симпатию', 'Ставят тебе симпатию'], match: ['Это взаимно! Можно написать', 'Это взаимно! Можно написать'],
      chatRequest: ['Хочет начать переписку', 'Хотят начать переписку'], follow: ['Подписывается на тебя', 'Подписываются на тебя'],
      reply: ['Отвечает на твою публикацию', 'Отвечают на твою публикацию'], postLike: ['Нравится твоя публикация', 'Нравится твоя публикация'],
      mention: ['Упоминает тебя в публикации', 'Упоминают тебя в публикации'], notePublished: ['Новая статья', 'Новая статья'],
    },
  },
  en: {
    title: 'FetUre', safe: 'New notification', messages: 'New message', likes: 'New like', match: 'New match',
    decide: 'Something to decide', requests: 'New message request', events: 'Event update', replies: 'New reply', follows: 'New follower', groups: 'New in a community', other: 'New notification',
    security: 'New device signed in',
    media: { image: 'Photo', video: 'Video', audio: 'Voice message' },
    act: {
      like: ['Sent you a like', 'Sent you a like'], match: ['It’s a match! Say hi', 'It’s a match! Say hi'],
      chatRequest: ['Wants to start a conversation', 'Want to start a conversation'], follow: ['Started following you', 'Started following you'],
      reply: ['Replied to your post', 'Replied to your post'], postLike: ['Liked your post', 'Liked your post'],
      mention: ['Mentioned you in a post', 'Mentioned you in a post'], notePublished: ['New article', 'New article'],
    },
  },
};
/** Settings category of each push kind (V21 K05); kinds without one follow only the global switch. */
const CATEGORY = { likes: 'likes', match: 'match', decide: 'req', requests: 'req', events: 'events', replies: 'replies', follows: 'follows', groups: 'groups' };

const SEND_TIMEOUT_MS = 10_000;

/** Queues one push for a recipient of an outbox item, once (a retried handler never doubles it). Items older than a day
 * (a backlog after deploy, a long outage) make no push: it would only be noise by then. `message`: the chat message it
 * is about (ids only; the text is read at send time, and only in «normal» mode).
 * @param {Q} q @param {OutboxItem} item @param {{account: string, profile: string | null}} r @param {string} kind @param {string} [notificationId]
 * @param {{conversationId: string, seq: number}} [message] */
export async function queuePush(q, item, r, kind, notificationId, message) {
  if (item.created_at && Date.now() - new Date(item.created_at).getTime() > 864e5) return;
  const fresh = await q.query(`insert into feture.push_sent (key) values ($1) on conflict do nothing returning key`, [`q:${item.id}:${r.account}`]);
  if (fresh[0]) await enqueue(q, 'push.deliver', r.profile, { account: r.account, kind, ...(notificationId ? { notificationId } : {}),
    ...(message ? { conversationId: message.conversationId, seq: message.seq } : {}) });
}

const PREVIEW = 80;
/** The start of a message for the lock screen: one line, at most 80 characters (by code points, so no broken emoji).
 * @param {string} body */
export function clip(body) {
  const one = [...String(body ?? '').replace(/\s+/g, ' ').trim()];
  return one.length > PREVIEW ? one.slice(0, PREVIEW).join('').trimEnd() + '…' : one.join('');
}

/** «normal» mode: who it is from and what, or null for the neutral text. Read at send time, so a message or a
 * notification taken back, a block or a profile gone since makes no name. Only for a recipient profile (an item
 * addressed to the account names nobody).
 * @param {Db | Q} db @param {string | null} recipient profile the push is for
 * @param {{kind: string, notificationId?: string, conversationId?: string, seq?: number}} p @param {typeof PUSH_TEXT.ru} t
 * @returns {Promise<{title: string, body: string} | null>} */
export async function personalText(db, recipient, p, t) {
  if (!recipient) return null;
  /** @param {any} who */
  const nameOf = who => who.name || (who.handle ? '@' + who.handle : '');
  if (p.kind === 'messages' && p.conversationId && p.seq != null) {
    const [m] = await db.query(
      `select m.body, m.media_mode, a.kind media_kind, a.purpose, pr.name, pr.handle, feture.blocked($3, m.author_profile_id) hidden
       from feture.message m join feture.profile pr on pr.id = m.author_profile_id and pr.state = 'active'
       left join feture.media_asset a on a.id = m.media_asset_id
       where m.conversation_id = $1 and m.seq = $2`, [p.conversationId, p.seq, recipient]);
    if (!m || m.hidden || !nameOf(m)) return null;
    // Once-view and timed media, and anything from the private part: never their content or caption, only the kind.
    const sealed = m.media_mode !== 'normal' || m.purpose === 'private';
    const text = sealed ? '' : clip(m.body);
    const kind = m.media_kind ? t.media[/** @type {keyof typeof t.media} */ (m.media_kind)] : '';
    return { title: nameOf(m), body: text || kind || t.messages };
  }
  if (p.notificationId) {
    const [n] = await db.query(
      `select n.type, pr.name, pr.handle, pr.kind, feture.blocked($2, n.actor_profile_id) hidden
       from feture.notification n join feture.profile pr on pr.id = n.actor_profile_id and pr.state = 'active'
       where n.id = $1 and n.retracted_at is null`, [p.notificationId, recipient]);
    const act = n && t.act[/** @type {keyof typeof t.act} */ (n.type)];
    if (!act || n.hidden || !nameOf(n)) return null;
    return { title: nameOf(n), body: act[n.kind === 'couple' ? 1 : 0] };
  }
  return null;
}

/** Where a tap on the push opens the app (hash routes of the /n screens). Fixed addresses only: never an id. */
const OPENS = { messages: '/#/n/chats', match: '/#/n/chats', requests: '/#/n/chats/requests', decide: '/#/n/inbox', security: '/#/n/settings/security' };

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
  if (type === 'signinNew') return 'security';
  if (type === 'like') return 'likes';
  if (type === 'match') return 'match';
  if (type === 'chatRequest') return 'requests';
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
      const p = /** @type {{account: string, kind: string, notificationId?: string, conversationId?: string, seq?: number}} */ (/** @type {any} */ (item.payload));
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
      const t = PUSH_TEXT[String(a.locale).startsWith('en') ? 'en' : 'ru'];
      const kindText = /** @type {string | undefined} */ (/** @type {any} */ (t)[p.kind]);
      const named = settings.mode === 'normal' ? await personalText(db, item.profile_id, p, t) : null;
      const title = named?.title ?? t.title;
      // A new sign-in says what it is in every mode («FetUre · Вход с нового устройства»): no device, no place.
      const body = p.kind === 'security' ? t.security : named?.body ?? (settings.mode === 'normal' && typeof kindText === 'string' ? kindText : t.safe);
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
          await withTimeout(transport.send(d.platform, d.token, { title, body, data: {
            t: p.kind === 'messages' || p.kind === 'requests' ? 'chat' : p.kind === 'decide' ? 'decide' : 'notif',
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
