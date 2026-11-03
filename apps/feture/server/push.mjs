// @ts-check
import { notificationSettingsOf } from '../contracts/me.mjs';
import { actOf, CATALOG, entryFor, PUSH_WORDS, pushTag, routeOk, SAFE_PUSH, settingOf, TAG, textOf } from '../contracts/notifications.mjs';
import { enqueue } from './outbox.mjs';

/** Push delivery (S2 §8, extract/people-discover-chats.md §4.4). The queue sends it, never a command.
 * «safe» (the default, «Безопасные») shows only that something new is there: no names, no text. «normal» («Обычные»,
 * owner 29.10.2026) names who it is from and starts the message: «Мира · Привет! Видела тебя…», «Sofi · Ставит тебе
 * симпатию» (`personalText`). Never in any mode: private-part content, once-view / timed media or their captions,
 * anyone hidden by a block or gone — then the neutral kind text is used. The person's settings
 * decide: push on or off, per category (contracts/notifications.mjs PUSH_SETTING), quiet hours in the device's time
 * zone. Stage 6 (docs/notifications.md «Push», owner 03.11.2026):
 * - **Actuality at send time** (`staleReason`): nothing goes for a notification read or taken back, a task decided, an
 *   object the person may no longer see, a community they muted, a chat message already read, a chat muted now, or
 *   someone blocked since. A skipped push is simply not sent: it never names anyone.
 * - **A tag per object** (`pushTag`): a new push replaces only its own chat, task or kind. The next push also closes
 *   what this account was shown that is no longer actual (`push_shown`); the app closes them too (src/fe/shown-push.ts).
 * - **Quiet hours** (owner decision 4): an important push (`push.important`: tasks, an event cancelled or moved,
 *   security) waits for the morning in the device's zone and is checked again then; anything else is dropped.
 * - **Noisy types** (`push.noisy`: likes, follows, likes of posts): one push an hour per type; what came meanwhile is
 *   one summary push («Новые симпатии: 3») when the hour is over.
 * - `push.off` types (a partner's trust-mode actions) never make a push.
 * Gone tokens are dropped; devices unseen for 60 days get nothing.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 * @typedef {{title: string, body: string, data: Record<string, string>, tag?: string}} Message
 *   tag: replaces an earlier notification with the same tag (web push `tag`, the Android notification tag)
 * @typedef {{account: string, kind: string, notificationId?: string, conversationId?: string, seq?: number, key?: string, url?: string,
 *   decide?: {kind: string, id: string}, summary?: string, devices?: string[], deferrals?: number}} PushPayload
 *   decide: the «Нужно решить» item; summary: when the hour a noisy type's summary counts from began (ISO); devices:
 *   only these (hex token hashes: a push deferred past quiet hours); deferrals: how many times quiet hours moved it
 * @typedef {{send: (platform: string, token: string, message: Message) => Promise<unknown>, platforms?: string[]}} Transport
 *   platforms: the device kinds this transport can reach (all when absent)
 */

/** Lock-screen words, all from the catalog (contracts/notifications.mjs): the title, the neutral line, the media kinds
 * of a message, the sign-in line. @param {'ru' | 'en'} lang */
function pushText(lang) {
  return {
    lang, title: PUSH_WORDS[lang].title, safe: textOf(SAFE_PUSH, lang), messages: textOf(CATALOG.message.push.normal, lang),
    security: textOf(CATALOG.signinNew.push.safe, lang), media: PUSH_WORDS[lang].media,
  };
}
export const PUSH_TEXT = { ru: pushText('ru'), en: pushText('en') };

const SEND_TIMEOUT_MS = 10_000;
/** Sends tried per device before it is given up (transient errors only; a final error stops at once). */
export const PUSH_ATTEMPTS = 5;
/** How long a worker holds a device while sending: longer than the send timeout, so a second worker that re-claims the
 * item meanwhile waits instead of sending again; short enough that a dead worker's device is retried soon. */
const LEASE_SECONDS = 60;

/** Queues one push for a recipient of an outbox item, once (a retried handler never doubles it). Items older than a day
 * (a backlog after deploy, a long outage) make no push: it would only be noise by then. `message`: the chat message it
 * is about (ids only; the text is read at send time, and only in «normal» mode). `note`: its catalog key and the push
 * `url` the destination resolver chose (contracts/notifications.mjs), so a tap opens the exact place, and `decide` the
 * «Нужно решить» item it is about (checked again at send time).
 * @param {Q} q @param {OutboxItem} item @param {{account: string, profile: string | null}} r @param {string} kind @param {string} [notificationId]
 * @param {{conversationId: string, seq: number}} [message] @param {{key?: string | null, url?: string, decide?: {kind: string, id: string} | null}} [note] */
export async function queuePush(q, item, r, kind, notificationId, message, note) {
  if (item.created_at && Date.now() - new Date(item.created_at).getTime() > 864e5) return;
  const fresh = await q.query(`insert into feture.push_sent (key) values ($1) on conflict do nothing returning key`, [`q:${item.id}:${r.account}`]);
  if (fresh[0]) await enqueue(q, 'push.deliver', r.profile, { account: r.account, kind, ...(notificationId ? { notificationId } : {}),
    ...(message ? { conversationId: message.conversationId, seq: message.seq } : {}),
    ...(note?.key ? { key: note.key } : {}), ...(note?.url ? { url: note.url } : {}), ...(note?.decide ? { decide: note.decide } : {}) });
}

/** Types whose object being gone or closed is the news itself: their object is not checked before a push or email. */
const OBJECT_NEWS = new Set(['communityClosed', 'eventCancelled', 'eventHidden']);

/** Is what a push (or an email, server/email.mjs) is about still worth telling, at the moment it would go? null when it
 * is, else a short reason: `gone` (the row, the message or the person is gone), `retracted`, `read`, `resolved` (a task
 * decided, withdrawn or expired), `hidden` (the person may no longer see the object), `muted` (the chat or the community
 * muted now), `blocked`. Also returns what the push tag needs (the row's collapse key and object).
 * @param {Db | Q} db @param {string} account
 * @param {{notificationId?: string, conversationId?: string, seq?: number, decide?: {kind: string, id: string}}} p
 * @param {{unreadOnly?: boolean}} [opts] unreadOnly: false for a «now» email (sent even when read in the app)
 * @returns {Promise<{stale: string | null, collapseKey?: string | null, object?: {type: string, id: string} | null}>} */
export async function staleReason(db, account, p, { unreadOnly = true } = {}) {
  if (p.decide) {
    // Still in «Нужно решить» (the same predicates as the list: open, not blocked, the asker still here).
    // Imported when needed: the inbox commands load the approval registry, which loads this file's callers.
    const { decisions } = await import('./commands/inbox.mjs');
    return { stale: (await decisions(/** @type {Q} */ (db), account, p.decide))[0] ? null : 'resolved' };
  }
  if (p.conversationId && p.seq != null) {
    const [m] = await db.query(
      `select cm.last_read_seq, cm.muted, a.state author_state, feture.blocked(cm.profile_id, m.author_profile_id) blocked
       from feture.conversation_member cm join feture.message m on m.conversation_id = cm.conversation_id and m.seq = $3
       left join feture.profile a on a.id = m.author_profile_id
       where cm.conversation_id = $1 and cm.account_id = $2`, [p.conversationId, account, p.seq]);
    if (!m || m.author_state !== 'active') return { stale: 'gone' };
    if (Number(m.last_read_seq) >= Number(p.seq)) return { stale: 'read' };
    if (m.muted) return { stale: 'muted' };
    return { stale: m.blocked ? 'blocked' : null };
  }
  if (!p.notificationId) return { stale: null };
  const [n] = await db.query(
    `select n.type, n.data, n.read_at, n.retracted_at, n.object_type, n.object_id, n.collapse_key, n.actor_profile_id, ap.state actor_state,
       n.addressee_profile_id is not null and n.actor_profile_id is not null and feture.blocked(n.addressee_profile_id, n.actor_profile_id) blocked,
       case n.object_type
         when 'post' then (select feture.post_visible(x, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id) from feture.post x where x.id = n.object_id)
         when 'event' then (select x.state = 'cancelled' or feture.event_visible(x, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id) from feture.event x where x.id = n.object_id)
         when 'community' then (select feture.community_visible(x, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id) from feture.community x where x.id = n.object_id)
         when 'conversation' then exists (select 1 from feture.conversation_member cm where cm.conversation_id = n.object_id and cm.account_id = n.recipient_account_id)
       end visible,
       n.object_type = 'community' and exists (select 1 from feture.community_member cm where cm.community_id = n.object_id and cm.muted
         and cm.profile_id = coalesce(n.addressee_profile_id, acc.person_profile_id)) community_muted
     from feture.notification n join feture.account acc on acc.id = n.recipient_account_id
     left join feture.profile ap on ap.id = n.actor_profile_id
     where n.id = $1 and n.recipient_account_id = $2`, [p.notificationId, account]);
  if (!n) return { stale: 'gone' };
  const info = { collapseKey: n.collapse_key ?? null, object: n.object_type && n.object_id ? { type: n.object_type, id: n.object_id } : null };
  if (n.retracted_at) return { stale: 'retracted', ...info };
  if (unreadOnly && n.read_at) return { stale: 'read', ...info };
  if (n.actor_profile_id && n.actor_state !== 'active') return { stale: 'gone', ...info };
  if (n.blocked) return { stale: 'blocked', ...info };
  if (n.community_muted) return { stale: 'muted', ...info };
  // A decision about the person's own thing, or the object's end being the news: the object itself is not checked.
  const e = entryFor(n.type, n.data);
  const ownNews = OBJECT_NEWS.has(n.type) || e?.card === 'safety' || e?.kind === 'result';
  if (n.object_type && !ownNews && ['post', 'event', 'community', 'conversation'].includes(n.object_type) && n.visible !== true) {
    return { stale: n.visible === false ? 'hidden' : 'gone', ...info };
  }
  return { stale: null, ...info };
}

/** Minutes until quiet hours end in a zone (an important push waits that long). @param {{from: string, to: string}} quiet
 * @param {string} tz @param {Date} [now] */
export function minutesToQuietEnd(quiet, tz, now = new Date()) {
  const to = Number(quiet.to.slice(0, 2)) * 60 + Number(quiet.to.slice(3, 5));
  return ((to - minutesIn(tz, now) + 1440) % 1440) || 1440;
}

/** Tags this account was shown that are no longer actual (a decided task, a read chat, a read notification): the next
 * push closes them on the device. Their rows go. @param {Db} db @param {string} account @param {string | null} keep the new push's own tag */
async function closedTags(db, account, keep) {
  const rows = await db.query(`select tag, ref from feture.push_shown where account_id = $1 and tag is distinct from $2 order by shown_at desc limit 8`, [account, keep]);
  /** @type {string[]} */
  const close = [];
  for (const r of rows) if ((await staleReason(db, account, r.ref ?? {})).stale) close.push(r.tag);
  if (close.length) await db.query(`delete from feture.push_shown where account_id = $1 and tag = any($2)`, [account, close]);
  return close;
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
 * @param {{kind: string, notificationId?: string, conversationId?: string, seq?: number}} p @param {ReturnType<typeof pushText>} t
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
      `select n.type, n.data, pr.name, pr.handle, pr.kind, feture.blocked($2, n.actor_profile_id) hidden
       from feture.notification n join feture.profile pr on pr.id = n.actor_profile_id and pr.state = 'active'
       where n.id = $1 and n.retracted_at is null`, [p.notificationId, recipient]);
    // Only types that name who did it (a grant of the private part never does).
    const e = n && entryFor(n.type, n.data);
    if (!e?.push.named || n.hidden || !nameOf(n)) return null;
    return { title: nameOf(n), body: actOf(e.text, t.lang, n.kind === 'couple') };
  }
  return null;
}

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

/** A token the store says is gone for good. Anything else (a wrong project or bundle id) keeps the token. Core's
 * senders (packages/core/server/push.js) throw `{invalidToken, status, detail}`: FCM v1 answers 404 + UNREGISTERED
 * (a project mismatch is 404 without it: the token stays), APNs 410 / BadDeviceToken / Unregistered.
 * @param {any} error */
function goneToken(error) {
  if (!error?.invalidToken) return false;
  if (error.gone === true) return true; // web push: 404 / 410 from the push service, or a subscription we cannot use
  return error.status === 410 || /Unregistered|BadDeviceToken|UNREGISTERED|registration-token-not-registered/.test(String(error.detail ?? ''));
}

/** Why a send failed, as a short code (never the token or the provider's text), and whether trying again may help:
 * a timeout, a network error (no status), 408, 429 and 5xx are transient; a gone token, a missing sender and any other
 * refusal are final. @param {any} error @returns {{code: string, retry: boolean, gone?: boolean}} */
function pushFailure(error) {
  if (goneToken(error)) return { code: 'gone', retry: false, gone: true };
  const message = String(error?.message ?? '');
  if (message === 'push_timeout' || error?.name === 'TimeoutError' || error?.name === 'AbortError') return { code: 'timeout', retry: true };
  if (/not_configured|^push_no_/.test(message)) return { code: 'no_sender', retry: false };
  const status = Number(error?.status) || 0;
  if (!status) return { code: 'network', retry: true };
  return { code: `http_${Math.min(999, Math.max(100, status))}`, retry: status === 408 || status === 429 || status >= 500 };
}

/** @param {Promise<unknown>} p @param {number} ms */
async function withTimeout(p, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    return await Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('push_timeout')), ms); })]);
  } finally { clearTimeout(timer); }
}

/** Push bookkeeping older than a week goes: the «queued once» keys and the per-device delivery rows; what devices were
 * shown goes after two days (nothing older is still on a screen worth closing). @param {Db} db */
export async function sweepPushSent(db) {
  let n = 0;
  if ((await db.query(`select to_regclass('feture.push_sent') is not null ok`))[0].ok) {
    n += (await db.query(`delete from feture.push_sent where created_at < now() - interval '7 days' returning 1`)).length;
  }
  if ((await db.query(`select to_regclass('feture.push_delivery') is not null ok`))[0].ok) {
    n += (await db.query(`delete from feture.push_delivery where updated_at < now() - interval '7 days' returning 1`)).length;
  }
  if ((await db.query(`select to_regclass('feture.push_shown') is not null ok`))[0].ok) {
    n += (await db.query(`delete from feture.push_shown where shown_at < now() - interval '2 days' returning 1`)).length;
  }
  return n;
}

/** The push category of a notification type (the catalog's). @param {string} type @param {Record<string, unknown>} [data] */
export const pushKind = (type, data) => entryFor(type, data)?.push.cat ?? 'other';

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

/** Delivery per device (feture.push_delivery). A device is taken with one atomic upsert that sets a lease (`queued`,
 * next_at in the future), so two workers never send to it at once, and it becomes `sent` only after the provider
 * accepted it. A transient failure leaves it `queued` and due, and the handler throws: the outbox retries the item with
 * its own backoff (2^attempts s), and the re-run skips devices already `sent` or `failed`. At most PUSH_ATTEMPTS sends
 * per device. A worker dying between the provider's answer and the `sent` mark can make one repeat after the lease.
 * @param {Db} db @param {Transport | null} transport null: no provider configured, nothing is sent
 * @param {{timeoutMs?: number}} [opts] timeoutMs: per send (tests shorten it) */
export function pushHandlers(db, transport, { timeoutMs = SEND_TIMEOUT_MS } = {}) {
  return {
    'push.deliver': async (/** @type {OutboxItem} */ item) => {
      if (!transport) return;
      // A retry dragging on past a day would only be noise by then, like a backlog (queuePush).
      if (item.created_at && Date.now() - new Date(item.created_at).getTime() > 864e5) return;
      const p = /** @type {PushPayload} */ (/** @type {any} */ (item.payload));
      const [a] = await db.query(
        `select a.locale, a.state, s.settings from feture.account a left join feture.notification_settings s on s.account_id = a.id where a.id = $1`, [p.account]);
      if (!a || a.state !== 'active') return;
      // Still true at send time: a member of the profile it is for.
      if (item.profile_id && !(await db.query(`select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active'`, [item.profile_id, p.account]))[0]) return;
      const settings = notificationSettingsOf(a.settings);
      if (!settings.push) return;
      // The catalog entry it is about (an item queued before the catalog carries only its category).
      const entry = p.key ? CATALOG[p.key] ?? null : p.kind === 'messages' ? CATALOG.message : null;
      if (entry?.push.off) return;
      const category = entry ? settingOf(entry) : /** @type {Record<string, string | undefined>} */ ({ likes: 'likes', match: 'match', requests: 'req', events: 'events', replies: 'replies', follows: 'follows', groups: 'groups', decide: 'decide', messages: 'messages' })[p.kind] ?? null;
      if (category && settings.categories[/** @type {keyof typeof settings.categories} */ (category)]?.push === false) return;
      // Still worth telling now: not read, decided, hidden, muted or blocked since it was queued.
      const now = p.summary ? { stale: null } : await staleReason(db, p.account, p);
      if (now.stale) return;
      // A re-run of this item (a device failed before) already passed the hourly gate of a noisy type and counted itself.
      const [{ started, sentBefore }] = await db.query(
        `select count(*) > 0 started, count(*) filter (where state = 'sent') > 0 "sentBefore" from feture.push_delivery where item_id = $1`, [item.id]);
      const noisy = entry?.push.noisy && p.key ? p.key.split('.')[0] : null;
      const gate = noisy ? `push.${noisy.toLowerCase()}` : null;
      /** @type {number | null} how many came (still unread) after the one the devices show: the summary's count */
      let summaryCount = null;
      /** @type {string | null} the newest of them: what the devices show once the summary went */
      let summaryOf = null;
      if (gate && noisy && p.summary) {
        const [s] = await db.query(
          `select count(*)::int n, (array_agg(n.id order by n.created_at desc))[1] newest from feture.notification n
           where n.recipient_account_id = $1 and n.type = $2 and n.read_at is null and n.retracted_at is null
             and n.created_at > coalesce((select x.created_at from feture.push_shown s join feture.notification x on x.id = (s.ref ->> 'notificationId')::uuid
                                          where s.account_id = $1 and s.tag = $3), $4::timestamptz - interval '1 hour')`,
          [p.account, noisy, `s:${noisy}`, p.summary]);
        if (!s?.n) return;
        summaryCount = s.n;
        summaryOf = s.newest;
      } else if (gate && noisy && !started) {
        // At most one push an hour per noisy type; what comes meanwhile is one summary when the hour is over.
        const [last] = await db.query(
          `select max(created_at) at from feture.rate_event where account_id = $1 and kind = $2 and created_at > now() - interval '1 hour'`, [p.account, gate]);
        if (last?.at) {
          const at = new Date(last.at);
          const fresh = await db.query(`insert into feture.push_sent (key) values ($1) on conflict do nothing returning key`, [`s:${p.account}:${noisy}:${at.getTime()}`]);
          if (fresh[0]) {
            // At the end of the hour: one push counting what came after the one the devices show (push_shown).
            await db.tx(q => enqueue(q, 'push.deliver', item.profile_id, { account: p.account, kind: p.kind, key: noisy, summary: at.toISOString(), url: '/#/n/inbox' },
              { delaySeconds: Math.max(1, Math.ceil((at.getTime() + 3600e3 - Date.now()) / 1000)) }));
          }
          return;
        }
      }
      const t = PUSH_TEXT[String(a.locale).startsWith('en') ? 'en' : 'ru'];
      const named = settings.mode === 'normal' && summaryCount == null ? await personalText(db, item.profile_id, p, t) : null;
      const title = named?.title ?? t.title;
      // A new sign-in says what it is in every mode («KINHAZE · Вход с нового устройства»): no device, no place.
      const body = p.kind === 'security' ? t.security
        : summaryCount != null && entry?.push.summary ? (settings.mode === 'normal' ? textOf(entry.push.summary, t.lang).replace('{n}', String(summaryCount)) : t.safe)
        : named?.body ?? (entry ? textOf(settings.mode === 'normal' ? entry.push.normal : entry.push.safe, t.lang) : t.safe);
      // The exact place the resolver chose when it was queued; the inbox for anything that does not pass.
      const url = typeof p.url === 'string' && p.url.startsWith('/#') && routeOk(p.url.slice(2)) ? p.url : '/#/n/inbox';
      const tag = pushTag({ key: p.key ?? null, notificationId: p.notificationId ?? null, conversationId: p.conversationId ?? null, decide: p.decide ?? null,
        collapseKey: now.collapseKey ?? null, object: now.object ?? null });
      const close = await closedTags(db, p.account, tag);
      /** @type {Message} */
      const message = { title, body, ...(tag ? { tag } : {}), data: {
        t: p.kind === 'messages' || p.kind === 'requests' ? 'chat' : p.kind === 'decide' ? 'decide' : 'notif', url,
        ...(tag ? { tag } : {}), ...(close.length ? { close: close.join(' ') } : {}),
      } };
      const devices = await db.query(
        `select token_hash, encode(token_hash, 'hex') hex, platform, token, tz from feture.push_device
         where account_id = $1 and platform = any($2::text[]) and last_seen_at > now() - interval '60 days'`,
        [p.account, transport.platforms ?? ['ios', 'android', 'web']]);
      /** @type {Map<number, string[]>} minutes to wait → devices whose quiet hours hold an important push */
      const wait = new Map();
      let sent = 0, pending = 0;
      for (const d of devices) {
        if (p.devices && !p.devices.includes(d.hex)) continue;
        if (inQuietHours(settings.quiet, d.tz)) {
          // Owner decision 4: important pushes wait for the morning (checked again then), the rest is dropped.
          if (entry?.push.important && (p.deferrals ?? 0) < 2) {
            const [held] = await db.query(
              `insert into feture.push_delivery (item_id, token_hash, state) values ($1, $2, 'deferred') on conflict do nothing returning 1`, [item.id, d.token_hash]);
            if (held) { const m = minutesToQuietEnd(settings.quiet, d.tz); wait.set(m, [...(wait.get(m) ?? []), d.hex]); }
          }
          continue;
        }
        // Take the device in one statement: new, or queued and due with attempts left. The lease (next_at) keeps any
        // other worker off it while this send runs. Sent, failed or deferred: skip; held by another worker: wait for it.
        const [taken] = await db.query(
          `insert into feture.push_delivery (item_id, token_hash, attempts, next_at)
           values ($1, $2, 1, now() + make_interval(secs => $3))
           on conflict (item_id, token_hash) do update set attempts = push_delivery.attempts + 1,
             next_at = now() + make_interval(secs => $3), updated_at = now()
           where push_delivery.state = 'queued' and push_delivery.next_at <= now() and push_delivery.attempts < $4
           returning attempts`, [item.id, d.token_hash, LEASE_SECONDS, PUSH_ATTEMPTS]);
        if (!taken) {
          const [held] = await db.query(
            `select 1 from feture.push_delivery where item_id = $1 and token_hash = $2 and state = 'queued' and attempts < $3`, [item.id, d.token_hash, PUSH_ATTEMPTS]);
          if (held) pending++;
          continue;
        }
        try {
          await withTimeout(transport.send(d.platform, d.token, message), timeoutMs);
        } catch (error) {
          // One broken device never stops the others.
          const f = pushFailure(error);
          const again = f.retry && taken.attempts < PUSH_ATTEMPTS;
          await db.query(
            `update feture.push_delivery set state = $3, last_error = $4, next_at = now(), updated_at = now() where item_id = $1 and token_hash = $2`,
            [item.id, d.token_hash, again ? 'queued' : 'failed', f.code]);
          if (f.gone) await db.query('delete from feture.push_device where token_hash = $1', [d.token_hash]);
          if (again) pending++;
          continue;
        }
        await db.query(`update feture.push_delivery set state = 'sent', last_error = null, updated_at = now() where item_id = $1 and token_hash = $2`, [item.id, d.token_hash]);
        sent++;
      }
      // Deferred devices: one later item per wake-up time, checked again for actuality when it runs.
      for (const [minutes, hexes] of wait) {
        const { devices: _d, deferrals = 0, ...rest } = p;
        await db.tx(q => enqueue(q, 'push.deliver', item.profile_id, { ...rest, devices: hexes, deferrals: deferrals + 1 }, { delaySeconds: minutes * 60 }));
      }
      if (sent && !sentBefore) {
        if (gate) await db.query(`insert into feture.rate_event (account_id, kind) values ($1, $2)`, [p.account, gate]);
        // What the devices show now, so a later push can close it once it is no longer actual.
        if (tag && TAG.test(tag)) {
          const ref = p.decide ? { decide: p.decide } : p.conversationId ? { conversationId: p.conversationId, seq: p.seq }
            : p.notificationId ? { notificationId: p.notificationId } : summaryOf ? { notificationId: summaryOf } : null;
          if (ref) await db.query(
            `insert into feture.push_shown (account_id, tag, ref) values ($1, $2, $3) on conflict (account_id, tag) do update set ref = excluded.ref, shown_at = now()`,
            [p.account, tag, JSON.stringify(ref)]);
        }
      }
      // Some device may still get it: the outbox retries the item with its backoff, and only queued devices are tried.
      if (pending) throw new Error('push_retry');
    },
  };
}
