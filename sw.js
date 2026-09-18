/* Fit Timer — service worker v2: страница network-first (обновления подтягиваются сразу), статика cache-first */
/* Версию поднимаем при КАЖДОЙ правке кэшируемого — index.html в их числе.

   Забыть это легко и незаметно: страница отдаётся network-first, поэтому онлайн
   человек видит свежую и всё выглядит рабочим. Но install кэширует ту версию
   index.html, которая была на момент установки, и пока сам sw.js не изменился,
   он не переустанавливается — то есть офлайн-копия остаётся той, что была
   девять правок назад. Ещё это единственный способ выбросить старый кэш целиком:
   при активации удаляются все кэши с другим именем. */
const CACHE = 'fittimer-v19';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Rubik:wght@400;500;700&display=swap';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(url => fetch(url, {cache: 'reload'}).then(res => c.put(url, res))))
        // шрифты пробуем закэшировать сразу, но не валим установку, если сети нет
        .then(() => c.add(FONT_CSS).catch(() => {}))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  /* ЗАПРОСЫ К СЕРВЕРУ МИМО КЭША. Без этой строки обработчик ниже клал в кэш любой
     удачный GET со своего домена — включая /api/. Первый ответ «открытий нет,
     отчётов нет» оседал там навсегда, и дальше приложение спрашивало сервер, а
     получало ту же запись: у тренера вечно пусто, страница тренера пустая, а
     программа при этом открывалась (её адрес спрашивали впервые). Снаружи это
     выглядело как сломанная база, хотя база работала.

     Ответы сервера меняются каждую минуту и кэшированию не подлежат вовсе. */
  if (new URL(e.request.url).pathname.startsWith('/api/')) return;

  // HTML-страница: сначала сеть (свежая версия), кэш — только офлайн-фолбэк
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    /* cache:'reload' — мимо HTTP-кэша браузера. Без него «сначала сеть» означало
       «сначала спросить, а браузер ответит из своего кэша»: новая сборка лежала на
       сервере, а человек открывал приложение и видел старое. Снаружи это выглядит
       как «изменения не выкатились», и проверить нечего. */
    e.respondWith(
      fetch(e.request, {cache: 'reload'}).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // остальное (иконки, шрифты): кэш, потом сеть
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const url = e.request.url;
        if (res.ok && (url.startsWith(self.location.origin) || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});

// тап по уведомлению открывает приложение
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('./index.html');
    })
  );
});
