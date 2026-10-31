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

1. **Только провайдеры с письменным «да» на легальный 18+.** Ответ поддержки сохраняем в `docs/infra/` (скрин/текст).
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

Требования: ЕС (не Германия — Hetzner отвечает противоречиво), письменное «да» на легальный 18+ (сообщество и
знакомства, приватные фото, модерация до публикации), 4 vCPU / 8 ГБ / 160 ГБ NVMe, снапшоты, оплата картой не из РФ.
Кандидаты проверить письмом: NovoServe (NL, правила прямо разрешают 18+ на выделенных), Leaseweb (NL), другие по
ответам. Ответ сохранить сюда.

Шаблон письма (EN):

> We run an adults-only (18+) social community and dating service: user profiles, private photo sharing, pre-moderation
> of all media, CSAM hash-matching, age verification, EU DSA compliance. All content is legal in the EU and in the
> data-centre country. Is this permitted on your <VPS/dedicated> servers in <location>? Please confirm in writing.

## 5. Порядок (неделя)

| День | Кто | Что |
|---|---|---|
| 0 | Владелец | Домен; письма VPS-хостеру, Bunny, Resend про 18+; аккаунт Bunny: Storage Zone `feture-media` (Frankfurt), Pull Zone `media.<домен>` с Token Authentication и блокировкой GB/US, Storage Zone `feture-backup` |
| 1–2 | Агент | ✅ Core через свой PostgREST (`APPBASE_REST_URL`), ✅ адаптер Bunny и прокси загрузки, ✅ `server/host.mjs` (вместо Vercel и pg_cron+pg_net), ✅ `deploy/` (compose, Caddy, миграции, бэкап) |
| 3 | Агент | ✅ Realtime: SSE на Node + клиент вместо Supabase Broadcast |
| 4 | Владелец + агент | VPS: Docker, `deploy/README.md`; DNS; `.env` (секреты вставляет владелец) |
| 5 | Агент | Прогон на сервере: вход по коду, лента, загрузка фото и видео, модерация, чат, push; бэкап и восстановление |
| 6 | Агент | `config/product.json` → `https://app.<домен>`, APK; App Links (`/.well-known/assetlinks.json`) на новом домене |
| 7 | Владелец | Выключить FetUre на Vercel (`feture-mvp`), удалить схему `feture` и бакет `feture-media` в Supabase FitT |

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

**Не проверено здесь (нет Docker в песочнице):** сборка образов и запуск compose целиком — первый запуск на сервере (день 4).

## Источники

- https://docs.bunny.net/storage/http — Edge Storage API (PUT/GET/DELETE/список)
- https://docs.bunny.net/cdn/security/token-authentication/advanced — токены HS256
- https://github.com/BunnyWay/BunnyCDN.TokenAuthentication — официальные тест-векторы
- https://docs.postgrest.org — PostgREST
- https://novoserve.com/knowledge-base/what-is-your-policy-on-adult-content
- https://supabase.com/docs/company/aup
