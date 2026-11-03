# Переезд FetUre с Vercel и Supabase — план «один раз»

Решение владельца 31.10.2026, выполнено 2.11.2026 (§5). Здесь — что где стоит и почему; как поднять — `deploy/README.md`.
Данные в старой базе были тестовыми: ничего не переносили, база создана с нуля из миграций.

## 1. Почему переезжаем

| Причина | Суть |
|---|---|
| Контент 18+ | Правила Supabase и Vercel позволяют закрыть аккаунт за «obscene/offensive» на их усмотрение и без предупреждения. Для kink-сообщества это постоянный риск |
| Общий аккаунт | FetUre жил в проекте FitT вместе с FitTimer и UnMute. Блокировка за 18+ уронила бы всё сразу |
| Стоимость медиа | Supabase Storage: трафик $0,09/ГБ. Одна ошибка в плеере дала 51 ГБ за цикл (30.10.2026) |
| Юрисдикция | ЕС: GDPR проще, из Москвы ~40–50 мс. Россия и США исключены ([legal-docs.md](legal-docs.md)) |

## 2. Принцип «второй раз не переезжать»

Никакой хостер не гарантирует, что не выгонит сервис 18+. Поэтому:

1. **Только провайдеры, у которых легальный 18+ разрешён в опубликованных правилах** (решение владельца 31.10.2026: писем
   не пишем). Ссылки на правила — в «Источниках».
2. **Стек без проприетарных сервисов:** Postgres, PostgREST, Node, Caddy в Docker Compose. Любой VPS поднимает его за час.
3. **Бэкапы у другого провайдера**, чем сервер: если хостер выгонит или потеряет диск — новый VPS + восстановление.
4. **В приложении только свои домены** (`app.<домен>` — сайт и API вместе, `media.<домен>`). Никаких `*.vercel.app` и `*.supabase.co` в APK:
   смена сервера = смена DNS, без пересборки.
5. **Аккаунты сразу на почту своего домена и карту не из РФ.** Если юрист скажет «иностранная компания» — это передача
   аккаунтов, а не переезд.

## 3. Что куда

| Часть | Куда | Почему |
|---|---|---|
| Сайт и API (Node), очередь, обработка медиа (sharp) | VPS в ЕС, Docker Compose, `server/host.mjs`, один домен `app.<домен>` | Обычный Node без лимитов serverless; хостер — с письменным «да» на 18+ |
| База | Postgres 16 + pg_cron на том же VPS | Схема уже на чистом Postgres (проверено: все 110 миграций) |
| Старые REST-вызовы и вход Core (`kv_exec`) | PostgREST 12 внутри compose | Тот же сервер, что внутри Supabase: `lib/feture` и Core работают без переписывания |
| Медиа | Bunny Storage (Франкфурт) + закрытая Pull Zone с Token Authentication | Bunny прямо разрешает легальный 18+, $0,01/ГБ трафика |
| Геоблок UK/US | Bunny Pull Zone медиа → Blocked countries | Блокируем там, где отдаётся контент: медиа |
| Домен | `.com` на Porkbun ([email-domain.md](email-domain.md)) | Не Cloudflare (в РФ замедляют), не `.ru` |
| Почта | Resend со своим доменом; запас — Amazon SES | Спросить Resend про 18+ письменно |
| Бэкапы | Ночной `pg_dump` в отдельную Storage Zone Bunny (свой пароль, без Pull Zone) | Другой провайдер, чем VPS |
| Push | FCM / web push — без изменений | Тексты пушей нейтральные |
| Мониторинг | UptimeRobot на `/healthz` и `/api/health`; Sentry — позже | |

**Почему не self-hosted Supabase:** 8 ГБ RAM, десяток контейнеров, и от него потом захотелось бы уйти — это и был бы
второй переезд. Нам из Supabase нужны только Postgres и PostgREST, они и стоят.

**Realtime** — свой SSE вместо Supabase Broadcast (`server/realtime-sse.mjs`, `GET /api/fe-events`): та же модель —
канал = непрозрачный токен из `session.bootstrap`, в сообщении только вид события. Включается `FETURE_REALTIME=sse`
(в compose включено). Клиент Supabase Broadcast удалён 04.11.2026: realtime только SSE.
Ограничение: хаб в памяти одного процесса. Второй процесс приложения потребует общей шины (Postgres LISTEN/NOTIFY) —
до десятков тысяч одновременных соединений не нужно.

**Один домен для сайта и API:** веб вызывает API на том же адресе (`src/api-url.ts`), APK — по `config/product.json`
(`defaultApiUrl`, `defaultPublicUrl`). Загрузка медиа тоже идёт на этот адрес (`/api/fe-upload`).

**IP клиента:** API идёт к Caddy напрямую (не через CDN), Caddy сам ставит `X-Forwarded-For` — на нём держатся лимиты
Core. Страна устройства (`x-vercel-ip-country` для «вход с нового устройства») на своём сервере пустая — подпись
устройства без страны; это не мешает.

## 4. Выбор VPS

**Hostinger VPS, тариф KVM 2** (2 vCPU, 8 ГБ, 100 ГБ NVMe), дата-центр **Литва или Франция**, образ Ubuntu 24.04.
Почему: правила Hostinger прямо допускают легальный взрослый контент и для таких сайтов советуют VPS; оплата обычной
картой; есть терминал в браузере (hPanel) — SSH-ключи владельцу не нужны. 8 ГБ хватает и на сборку образа.
Запасные — NovoServe (NL), Leaseweb (NL). Hetzner — нет (ответы о 18+ противоречивы).

Сервер ставит один скрипт `deploy/install.sh` (§5): Docker, firewall, код, все секреты, Bunny (хранилище медиа, CDN с
подписанными ссылками и блокировкой GB/US, хранилище бэкапов, DNS домена), Resend (домен отправки, записи DNS, ключ
только на отправку). Ссылки на медиа идут с адреса Bunny `*.b-cdn.net`: свой поддомен для медиа не нужен — адреса
медиа сервер выдаёт заново на каждый запрос, приложение их не хранит.

## 5. Порядок

Выполнено 2.11.2026: сервер на Hostinger KVM 1 (Франкфурт), домен `kinhaze.com` (регистратор Porkbun, DNS в Bunny),
`app.kinhaze.com`, установка `deploy/install.sh`, автообновление из `main` (`deploy/enable-autoupdate.sh`),
push-ключи (`deploy/push-setup.sh`), черновики правовых документов (`deploy/seed-documents.sql`), тестовый мир
(`e2e/seed-world.mjs`, без видео-фазы), APK из Actions, приложение и App Links на `app.kinhaze.com`.
FetUre на Vercel (`feture-mvp`) приостановлен, схемы `feture`/`feture_seed`, таблицы `public.feture_*`, cron и секреты
Vault удалены из Supabase FitT (общий проект с FitTimer и UnMute остался нетронутым).

Осталось: удалить бакеты `feture-media` и `feture-post-photos` в Supabase (Storage → Empty bucket → Delete; SQL тут не
подходит — файлы остались бы в хранилище); правовые документы заменить текстами юриста; перед запуском — KVM 2 и
проверка восстановления из бэкапа на новом сервере. Первые роли персонала выдаются один раз SQL-ом в `feture.staff_role`.

## 6. Что сознательно не переносим

- Данные: тестовые. Тестовые персоны (`@feture.test`) создаются заново сидом.
- Старое хранилище фото `lib/feture/post-photos.js` (Supabase Storage напрямую): на своём сервере его вызовы получают
  501 `supabase_feature_unavailable`. Медиа нового API (`/api/fe`) идут через Bunny.
- Vercel-специфичное: `scripts/vercel-ignore.mjs`, `vercel.json` остаются для истории, на сервере не используются.

## Источники

- https://docs.bunny.net/storage/http — Edge Storage API (PUT/GET/DELETE/список)
- https://docs.bunny.net/cdn/security/token-authentication/advanced — токены HS256
- https://github.com/BunnyWay/BunnyCDN.TokenAuthentication — официальные тест-векторы
- https://docs.postgrest.org — PostgREST
- https://www.hostinger.com/support/which-types-of-content-and-websites-are-allowed-at-hostinger/ — взрослый контент
  разрешён, если законен
- https://www.hostinger.com/support/?p=1516 — для таких сайтов советуют cloud/VPS
- https://docs.bunny.net/api-reference/core/pull-zone/add-pull-zone — Pull Zone: OriginType 2, токены, BlockedCountries
- https://docs.bunny.net/api-reference/core/dns-zone/add-dns-record — DNS: типы записей
- https://novoserve.com/knowledge-base/what-is-your-policy-on-adult-content
- https://supabase.com/docs/company/aup
