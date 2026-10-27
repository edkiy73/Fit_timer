/* FetUre web push service worker (V21 N02). It only shows notifications and opens the app on a tap: no fetch handler,
 * no cache — pages, assets and deployments are never touched by it. The payload is neutral by design (the server sends
 * a fixed title, a fixed line and an in-app address; never names or message text). */
'use strict';

const SAFE_URL = /^\/#\/n\/[a-z/]*$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'FetUre';
  const body = typeof data.body === 'string' ? data.body.slice(0, 160) : '';
  const url = typeof data.url === 'string' && SAFE_URL.test(data.url) ? data.url : '/#/n/inbox';
  // One visible notification at a time: a newer one replaces the older (the inbox has the rest).
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon.svg', tag: 'feture', renotify: true, data: { url } }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const target = new URL(typeof raw === 'string' && SAFE_URL.test(raw) ? raw : '/#/n/inbox', self.location.origin).href;
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
