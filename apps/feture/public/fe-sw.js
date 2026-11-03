/* KINHAZE (FetUre) web push service worker (V21 N02). It only shows notifications and opens the app on a tap: no fetch handler,
 * no cache — pages, assets and deployments are never touched by it. The payload is neutral by design (the server sends
 * a title, a line and an in-app address that passes the route rule below; never anything else). */
'use strict';

// The route rule of contracts/notifications.mjs (routeOk), copied line for line: a known /n screen, UUIDs only, known
// query keys once each. tests/fe-notification-catalog.mjs checks both agree.
const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTE_PATH = new RegExp(`^/n/(?:inbox|inbox/${U}|chats|chats/requests|chats/${U}|me|me/pair|me/links|me/access|me/posts|me/interests`
  + `|settings|settings/(?:security|age|photo-check|blocked|notifications)|help|premium|staff|people|feed`
  + `|feed/post/${U}(?:/edit)?|events/${U}(?:/applications)?|communities/${U}(?:/requests)?|people/${U}(?:/gallery)?)$`);
const ROUTE_QUERY = {
  reply: new RegExp(`^${U}$`), approval: new RegExp(`^${U}$`), ticket: new RegExp(`^${U}$`), as: new RegExp(`^${U}$`), restore: new RegExp(`^${U}$`),
  part: /^private$/, tab: /^(?:byme|withme|out|todo|all)$/, layer: /^(?:vis|priv|mine)$/,
  request: new RegExp(`^${U}$`), item: new RegExp(`^${U}$`), link: new RegExp(`^${U}$`),
};
function routeOk(route) {
  if (typeof route !== 'string' || route.length > 300) return false;
  const [path, query, ...rest] = route.split('?');
  if (rest.length || !ROUTE_PATH.test(path)) return false;
  if (query === undefined) return true;
  if (!query) return false;
  const seen = new Set();
  for (const pair of query.split('&')) {
    const [k, v, ...more] = pair.split('=');
    if (more.length || v === undefined || seen.has(k) || !Object.prototype.hasOwnProperty.call(ROUTE_QUERY, k) || !ROUTE_QUERY[k].test(v)) return false;
    seen.add(k);
  }
  return true;
}
/** An in-app address from a payload, or the inbox. */
function safeUrl(raw) { return typeof raw === 'string' && raw.startsWith('/#') && routeOk(raw.slice(2)) ? raw : '/#/n/inbox'; }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// A notification's tag (contracts/notifications.mjs TAG): one per chat, task or object, so a new push replaces only its
// own earlier one and never an unrelated notification.
const TAG = /^[a-z]{1,2}:[0-9a-zA-Z:._-]{1,120}$/;
const tagOk = t => typeof t === 'string' && TAG.test(t);

/** Closes shown notifications by tag (or all of them): what is decided or read needs no notification any more. */
async function closeTags(tags) {
  const shown = await self.registration.getNotifications();
  for (const n of shown) if (tags === 'all' || tags.includes(n.tag)) n.close();
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'KINHAZE';
  const body = typeof data.body === 'string' ? data.body.slice(0, 160) : '';
  const url = safeUrl(data.url);
  const tag = tagOk(data.tag) ? data.tag : 'feture';
  const close = Array.isArray(data.close) ? data.close.filter(tagOk).slice(0, 8) : [];
  // Every push shows a notification (never a silent one); it first closes what the server says is no longer actual.
  event.waitUntil((async () => {
    if (close.length) await closeTags(close.filter(c => c !== tag)).catch(() => {});
    await self.registration.showNotification(title, { body, icon: '/icon.svg', tag, renotify: true, data: { url } });
  })());
});

// The app says what it has just shown or decided («close»: tags, or all when nothing is waiting any more).
self.addEventListener('message', event => {
  const m = event.data;
  if (!m || m.type !== 'close') return;
  const tags = m.all === true ? 'all' : Array.isArray(m.tags) ? m.tags.filter(tagOk).slice(0, 50) : [];
  if (tags === 'all' || tags.length) event.waitUntil(closeTags(tags).catch(() => {}));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const target = new URL(safeUrl(raw), self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = open.find(c => new URL(c.url).origin === self.location.origin);
    if (mine) {
      await mine.focus();
      if ('navigate' in mine) { try { await mine.navigate(target); return; } catch { /* not controlled yet: open a new one */ } }
      else return;
    }
    await self.clients.openWindow(target);
  })());
});
