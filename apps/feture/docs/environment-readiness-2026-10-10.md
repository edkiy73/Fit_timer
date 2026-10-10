# FetUre — F01: состояние окружения

Проверено 2026-10-10 на main `e4aead4c5dd2218cff80b79bce7465d33012e5dc`.
Это технический отчёт для разработчика, не пользовательская плашка.

## Подтверждённое production

| Проверка | Результат | Значение |
|---|---|---|
| GET `/` | HTTP 200, HTML | Сайт открыт по ссылке |
| GET `/api/catalog` | HTTP 200, 12 categories, 18 test descriptors | Публичный каталог работает; descriptors не готовые тесты |
| GET `/api/health` | HTTP 503, storage mode none, connected false | Core account store не подключён |
| Health mail | configured false | Отправка кода входа не настроена |
| Health Supabase server adapter | configured false | Публичный ключ каталога не даёт доступ к приватному server store |
| GET `/api/sync` | HTTP 405 method_not_allowed | Endpoint доступен и отклоняет неверный метод; это не доказательство синхронизации |
| Vercel project | `feture-mvp`, Vite, team владельца | Не путать со вторым проектом `feture` |
| Env metadata (без decrypt) | SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY, production | Этих переменных достаточно каталогу, недостаточно аккаунтам/почте |

Названия переменных прочитаны без расшифровки. Значения, токены и пользовательские данные не извлекались. Dashboard rootDirectory/git connection не включены в нормализованный ответ get_project; не считаются проверенными. Health — фактическое состояние задеплоенного процесса, а не только README.

## Подтверждённое кодом

- `api/auth.js` подключает Core createAuthHandler; `api/sync.js` — createSyncHandler и продуктовый registry.
- Core store по умолчанию использует Redis; для Supabase нужен явный `APPBASE_STORE=supabase` и server-only secret. Наличие publishable key не включает этот адаптер.
- Альтернативы store уже поддержаны Core. Выбор/настройку выполнить в F04/F05/A01 по плану, не включать memory store в production.
- Почта Core требует RESEND_API_KEY; MAIL_FROM на подтверждённом домене нужен для обычных получателей. В F01 почтовых отправок не выполнялось.
- interest-map всё ещё документ Core; PostgreSQL канонический домен — следующий переход A02/A03, не текущая готовность.
- Функциональные social/dating/тесты/age assurance остаются незавершёнными карточками.
- Корневой workflow source-consistency маршрутизирует изменённые apps; команды FetUre доступны в package.json.

## Изменение в F01

Добавлен `scripts/vercel-ignore.mjs`, по архитектурному образцу Task Mini, и `vercel.json.ignoreCommand`.
Docs/README/AGENTS, тесты, native shells и изменения других приложений не запускают сборку FetUre. Собственный runtime/config/API, общие packages и неизвестные пути запускают. Сравнение с предыдущим deployment накопительное; отсутствие истории запускает сборку, чтобы не пропустить runtime изменения.

Проверка политики: 19 focused assertions (docs/tests/other-app skip, own/shared runtime deploy, unknown and empty history fail-open). Сам факт пропуска Vercel после merge проверяется отдельно по следующему docs-only deployment; локальные assertions не объявляются dashboard результатом.

## Конкретные blockers и дальнейший порядок

1. Core account store отсутствует в production. В F04/F05 проверить изоляцию ключей/аккаунтов и Supabase контракт прежде, чем подключать привилегированный доступ к общей FitT БД.
2. Почта отсутствует. A01 требует настройки провайдера/отправителя; не выдавать форму входа за рабочую доставку OTP.
3. Private domain API/ACL ещё не реализованы. Публичный каталог не разрешает private writes.
4. Age/identity и moderation provider не выбраны/подключены. Контракты A04/P03 независимы от существующего catalogue proxy.

Следующие задачи: F02 (общие компоненты/маршруты), F03 (motion/responsive), F04 (server identity/permissions). Эти blockers не мешают F02/F03. F01 не меняла живую БД, аккаунты, секреты и настройки защиты сайта.

Одна локальная команда проверки законченного среза: `npm --prefix apps/feture run check`.

## Итог локальной проверки

`npm --prefix apps/feture run check` пройдена: TypeScript, 9 smoke assertions, 8 unit tests, Vite production build. Existing bundle-size warning (>500 kB) записан для будущего разделения маршрутов F02; в F01 UI/runtime не менялись. Браузерный и native проход не выполнялись, поскольку срез касается deployment policy и снимка окружения.
