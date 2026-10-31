# Переезд FetUre с Vercel и Supabase — план «один раз»

Решение владельца 31.10.2026. Заменяет §2 «Рекомендация» в [servers-and-costs.md](servers-and-costs.md) в части
хостинга. Данные в старой базе тестовые: **ничего не переносим, база создаётся с нуля из миграций.**

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
(в compose включено); клиент выбирает транспорт по `realtime.transport` и на Vercel продолжает работать по-старому.
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

## 5. Порядок (неделя)

| Шаг | Кто | Что |
|---|---|---|
| ✅ | Агент | Core через свой PostgREST, адаптер Bunny и прокси загрузки, `server/host.mjs`, realtime SSE, `deploy/` и `install.sh` |
| 1 | Владелец | Ветка `feture/self-host` на GitHub (патчи агента) |
| 2 | Владелец | Домен `.com` на Porkbun; аккаунт Bunny (карта, API key); API key Resend (Full access) |
| 3 | Владелец | Hostinger KVM 2 → терминал → одна команда `install.sh` → ответить на 3 вопроса |
| 4 | Владелец | У Porkbun: nameservers `kiki.bunny.net`, `coco.bunny.net`; пароль бэкапов — в менеджер паролей |
| 5 | Агент | Проверка на живом сервере: вход по коду, лента, медиа, чат, push, бэкап и восстановление |
| 6 | Агент | `config/product.json` → `https://app.<домен>`, сборка APK (Actions), App Links на новом домене |
| 7 | Агент | Выключить FetUre на Vercel, удалить схему `feture` и бакет `feture-media` из Supabase FitT |

## 6. Что сознательно не переносим

- Данные: тестовые. Тестовые персоны (`@feture.test`) создаются заново сидом.
- Старое хранилище фото `lib/feture/post-photos.js` (Supabase Storage напрямую): на своём сервере его вызовы получают
  501 `supabase_feature_unavailable`. Медиа нового API (`/api/fe`) идут через Bunny.
- Vercel-специфичное: `scripts/vercel-ignore.mjs`, `vercel.json` остаются для истории, на сервере не используются.

## 7. Проверено агентом 31.10.2026

- Все 110 миграций (`supabase/migrations` + `deploy/core-migrations`) накатываются на чистый PostgreSQL 16 + pg_cron;
  части про Vault/pg_net/Storage пропускаются сами. 176 таблиц, `kv_exec` работает.
- Core `store.selfTest()` (SET/GET/INCR/RPUSH/LRANGE) через PostgREST 12.2.8 с ключом `service_role`; без ключа — 401.
- Подпись ссылок Bunny совпадает с официальными тест-векторами Bunny (`tests/bunny.test.mjs`).
- Прокси загрузки: подпись на ключ, тип, размер и срок; чужой ключ/размер/тип и просроченный билет — отказ.
- Сквозной прогон `server/host.mjs` + PostgREST + Postgres: `/api/health` — пробы storage, accounts, PostgREST в
  порядке; тик очереди (`/api/fe?jobs=1`) проходит по базе, с чужим секретом — 401; `/api/config`, старые эндпоинты,
  статика с заголовками кеша; выход за каталог статики закрыт.
- Бэкап → шифрование → восстановление на чистом кластере: 110 миграций, 176 таблиц, cron, вход `feture_api`; роль
  `feture_api` теперь создаётся при инициализации (её нет в дампе). Сломанная база не даёт «пустой» бэкап — отказ.
- Caddyfile проверен `caddy adapt` (2.10.2) без предупреждений.
- Репо: `check:server`, `typecheck`, `test:smoke` (с `tests/bunny.test.mjs`), `test:security`, выборка Postgres-тестов,
  `packages/core` `npm run check` — зелёные.

- Realtime SSE: хаб на реальном HTTP-сервере (доставка только своему каналу, тег «печатает», лимиты на адрес и
  общий, уборка после отключения), клиент с поддельным EventSource (переподключение → обновление), bootstrap отдаёт
  `transport`, сквозной путь через `server/host.mjs`. `test:unit` 74/74, `test:smoke`, `test:security`, Postgres-тесты
  платформы, входящих, пушей, пар, чатов — зелёные.

- `install.sh` против поддельных API Bunny и Resend: создаёт хранилища, Pull Zone (проверяет источник и токены), DNS,
  домен Resend с записями, ключ только на отправку; секреты 600; повторный запуск — ноль вызовов API; неверный ключ или
  домен — остановка с понятной ошибкой. Получившийся `app.env` принимает `bunnyFromEnv`.
- Потеря сервера: ночной бэкап (база + секреты) → новый IP → `install.sh` нашёл прежнюю установку, с неверным паролем
  ничего не записал, с верным вернул `.env`/`app.env` байт в байт, не создал ни одной зоны, заменил (не добавил) A-запись;
  `restore.sh latest` на чистом кластере — 110 миграций, 176 таблиц.

**Не проверено здесь (нет Docker в песочнице и доступа к настоящим Bunny/Resend):** сборка образов и запуск compose целиком — первый запуск на сервере (день 4).

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
