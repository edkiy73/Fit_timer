# O03.1 — серверные агрегаты действий FetUre
Статус: **первый кодовый срез**, не вся аналитика и не готовые продуктовые KPI. Не подключены acquisition funnels, cohorts D1/D7, клиенты C02/R/D или budgets.

## Что записывается
Ровно один серверный ключ вида `feture:metrics:v1:YYYY-MM-DD:cohort:event` и суммарный счётчик. Events: `test_started`, `test_completed`, `map_updated`, `share_created`, `share_opened`, `discussion_submitted`.
Источник: **только результат разрешённой серверной команды** `/api/domain`. Имена, тексты, ответы, значения интересов, коды ссылок, accountHash, токены сессии, сырые входящие body/URL никогда не входят в ключ или значение счётчика. Клиент не передаёт событие напрямую.
Когорты: `qa` (временный QA-допуск) и `other_verified` (другой доверенный серверный adult actor). **Это не утверждение, что пользователь production или реальный внешний клиент.** Искусственные seed-профили не могут вызывать Core authenticated handler. Повторы операций с подтверждённым `replayed=true` не учитываются. `share_opened` отражает успешные вызовы чтения, НЕ уникальных получателей или конверсию.

## Кто видит сводку
Действующий Core-admin секрет через `feture.metrics.summary` (`days=7|30`). Только общие totals без суточного разреза и device/account identifiers; значения 1–4 замаскированы как «меньше 5», нули показаны отдельно. Админ видит два серверно определённых сегмента, не профили.
TTL всех ключей — **35 дней**, хранение агрегатов в существующем AppBase Redis. Ошибка записи метрик не прерывает сохранение пользовательских действий; ошибка чтения честно возвращает `503`. Информации о пользователях для очистки по одному аккаунту в этих ключах нет. На текущем шаге не добавляется fingerprinting или сторонний tracker, existing product install telemetry и диагностика ошибок в Core не изменяются.

## Что ещё требуется для O03
- Проверить правила хранения в privacy notices и независимый privacy review, включая поведение общей AppBase диагностики; нет гарантий production compliance по одному тесту.
- Реально исследовать QPS/budget/egress и настроить бюджет/alert в операторских процессах (в этом PR лимит трафика не меняется).
- Подключить корректную attribution, activation, D1/D7, share-to-completion только после наличия соответствующих реальных пользовательских доменов, прав и данных. Никогда не выдавать сумму вызовов за число людей.
- Проверить реальными аккаунтами, browser/native и сверить показанные totals с сервером. Не отключать Core 18+ ради аналитики.

## O03.2 — бюджет нагрузки и ограничение расходов (2026-10-11)
Кодовый срез; **не поставщик счетов/лимит расходов**.

- В admin summary появились числа учтённых серверных действий за период и последние 7 дней. Если всего действий 1–4, показывается только «меньше 5». Не сохраняются IDs пользователей, токены, ответы, тексты или URL. Это число действий, НЕ число пользователей и НЕ фактический счёт за хостинг.
- Защита от вычитания (#866, отдельный срез): если хотя бы одна агрегированная ячейка группы/события за период равна 1–4, общий итог за период или неделю **не показывается вовсе**, даже когда суммарно действий больше пяти. Иначе «99 известных + 3 скрытых = 102 всего» раскрыло бы точные 3. При настроенном пороге сервер сообщает warning/within только когда вывод одинаков для любого скрытого значения 1–4; при пересечении порога диапазоном статус `suppressed`. Админка честно пишет «скрыто для приватности», а не неверное «меньше 5». Ключи, TTL и собираемые события не изменены.
- Переменная сервера `FETURE_O03_WARN_WEEKLY_EVENTS` — необязательный положительный целый порог **от 100** до 999999999 за последние 7 дней. Значение сравнивается с **суммой разрешённых, успешно учитываемых** действий в серверном слое. Порог — только предупреждение на экране администратора; ни один пользовательский запрос не блокируется. Если переменная отсутствует, статус «не настроен»; если невалидная — явное предупреждение, без подмены якобы установленным бюджетом. Не добавлять этот ключ/порог в клиентский конфиг.
- Список событий и групп фиксирован (6 × 2), 35 дней TTL; максимум **432 ключа** с учётом возможного пересечения 36 календарных дат, независимо от количества аккаунтов/интересов/публикаций. Отчёт читает 84 (7 дней) или 360 (30 дней) заранее известных ключей через MGET, без SCAN или чтения личных данных.
- Счётчики временные и неканонические. В AppBase Core ключи `feture:metrics:v1:` добавлены в список ephemeral: при двойном провайдере они не пишутся в зеркало, что предотвращает вторую платную запись. После failover исторические цифры могут быть неполными — не выдавать их за финансовые/юридические отчёты.
- Актуальный тариф и бюджет **не могут быть вычислены по количеству событий**: платный egress/read/write хранилища, Vercel invocation/storage, Supabase SQL, moderation vendor и других приложений не входят в эти данные. Оператор сверяет Vercel, Upstash и Supabase dashboard вручную. Автоматические реальные счета/лимиты и независимый billing alert остаются O03.x.
- Внутренние тесты проверяют границы числа ключей, порога, suppression 1–4, отказ malformed/overflow counters, исключение только disposable metrics из Core mirror. Реальные billing-счета, работающий Vercel dashboard и privacy/device acceptance отдельно не проверены.

## O03.3 — аудит существующей диагностики (2026-10-11)

**Найденный риск:** общий Core обработчик `client_error` сохраняет свободные `message`/вырезанный `stack` до 90 дней в `diag:error:*`. Регулярные выражения удаляли email/URL/кавычки, но не гарантировали удаление приватного текста FetUre из произвольных JS-ошибок. Такую политику нельзя считать безопасной для названий тем, личных ответов, токенов приглашений или содержимого публикаций.

**Исправление только для FetUre:** `safeFetureDiagnostic()` выполняется **до отправки из браузера** и повторяется в `apps/feture/api/auth.js` на Core сервере для `client_error`. В общий storage отправляются исключительно `kind=error|rejection`, имя из фиксированного набора общих JS-семейств ошибок, фиксированный `message=feture_client_error`, `stack=''`, ограниченный сборочный ID без URL/токенов и платформенная/языковая категории. Исходные поля `message`, `stack`, произвольный `name`, приватные ID и любые дополнительные свойства никогда не попадают в диагностическую запись — даже если запрос отправлен напрямую в API. Это осознанно снижает детализацию для разработчика ради безопасности.

**Старая анонимная install analytics:** FetUre прекращает вызывать `trackInstallOnce`, серверный event allowlist для FetUre теперь пуст. Таким образом новые установки не создают device-hash/session событий Core analytics; продуктовые O03.1/O03.2 счётчики основаны только на разрешённых серверных действиях. ВАЖНО: события старых версий в общей аналитике **могут сохраняться до их прежнего TTL** (в Core device record — до 180 дней), а прежние диагностические сообщения — до 90 дней или ручной очистки. Этот PR не запускает массовую очистку общего хранилища, чтобы не затронуть FitTimer/UnMute; для прежних записей необходим scoped-audit/cleanup по факту наличия.

**Scope:** для остальных приложений Core диагностические поля сохраняются без изменений благодаря необязательному product sanitizer. Это не независимый privacy/legal аудит Core/FetUre: остаются общие серверные access logs, сторонние SDK/браузер, административный доступ к `diag:errors`, отсутствие раздельного tenant namespace в Core diagnostics, реальные Vercel и native device проверки. В PR — regression test прямого spoofed запроса и отсутствие чувствительных значений в Core diag.

## O03.4 — изоляция устаревшей общей аналитики и диагностики админки

**Выявлено:** раньше FetUre Admin наследовал стандартные разделы «Обзор» и «Ошибки» из AppBase. Даже при пустом списке событий FetUre старый `analytics_stats` читает **общие** `analytics:device:*`, platform/locale и retention. А `client_errors` читает `diag:errors` других продуктов, `client_error_clear` может удалить их запись. Эти данные не являются метриками FetUre и не должны показываться как таковые. Наличие общего admin key само по себе не обеспечивает tenant-scoping.

**Решение:** на `apps/feture/api/admin.js` три старых действия (`analytics_stats`, `client_errors`, `client_error_clear`) отклоняются с 404 до обращения к Core storage. На FetUre Admin эти два стандартных раздела скрыты через необязательный параметр общего компонента; сохранённая вкладка из других приложений безопасно переключается на «Состояние». Другие приложения не меняют список вкладок или API. FetUre агрегаты `feture.metrics.summary` остаются доступны только по существующему admin key, с исходными правилами подавления малых чисел.

**Проверка:** целевой security test отправляет все три запроса (включая `client_error_clear`) в FetUre API на фоне сохранённой «чужой» записи в Core и проверяет, что она не читается и не удаляется; затем проверяет успешную собственную aggregate-сводку. Typecheck/build + CI должны подтвердить UI. Независимый browser/privacy аудит нужен отдельно.

**Осталось:** старые `diag:errors`/`analytics:device:*` существуют в общем store без надёжного tenant ID. **Не делать массовую очистку по эвристике, URL, тексту или хешу**: можно удалить FitTimer/UnMute. Требуются провайдерский аудит и tenant-scoped retention design для будущих событий и реальный incident response, если обнаружатся старые персональные записи.

## O03.5 — read-only сверка Vercel billing (2026-10-12)

Источник: подключённый Vercel `/v1/billing/charges` для команды, содержащей **несколько** продуктов (`feture-mvp`, `fittimer99`, `unmute`, `task-mini` и др.). Read-only, тарифы/лимиты/окружение не менялись.

- Использованы **смежные** UTC окна [2026-09-19, 09-26), [09-26, 10-03), [10-03, 10-10), [10-10, 10-11). Биллинг фактически вернул данные с 2026-09-22T07:00Z по 2026-10-10T07:00Z; предыдущее окно 09-12—09-19 вернуло `404 costs_not_found` — это НЕ подтверждённый нулевой расход.
- Сумма `BilledCost` по всем успешно полученным окнам: **$66.559194** USD (округлённо $66,56) **по всей команде**; `Build CPU Minutes` — **$66.402159** (≈99,76% от этого поля). `EffectiveCost` — отдельная оценка до применения части скидок/коммитментов; не смешивать с `BilledCost`.
- Нельзя по этим данным заключить, сколько потратил именно FetUre, сколько реально списано с карты или какой остаток от месячного лимита. API даёт только агрегаты по сервисам; образец строк неполный, отдельную разбивку по продуктам не подтвердили.
- **Следующий срез:** в кабинете Vercel сверить period/invoice/credits и проектные Build CPU Minutes, а у Redis/Upstash и Supabase — их отдельные затраты и бюджеты. Затем установить самостоятельные **провайдерские** лимиты/alerts, не используя приблизительный счётчик действий O03.1/O03.2 как финансовый источник. Проверить не запускают ли PR изменения docs/не затронутых приложений ненужные сборки; не ломать релизный путь ради экономии.

## O03.6 — read-only Vercel deployment-volume audit (2026-10-12)

In the connected Vercel team, the active `feture-mvp` project was inspected without changing deployment, budget or Git settings. At the 2026-10-12 11:06 UTC main snapshot (`4beed636`), the **100 most recent deployment records** were all dated 2026-10-12 UTC: **56 READY, 43 CANCELED, 1 ERROR**; **24** had `githubCommitRef=main`, **76** came from feature branches. This is a *sample/lower bound*, not a full-day total: the deployment-list connector returned the same page when supplied a `to` pagination timestamp, so earlier pages could not be verified. Later new commits may change this rolling sample.

A READY deployment confirms a deployment state, not whether the complete build ran and consumed billable CPU; a CANCELED preview can also have begun building. An inspected READY `main` deployment had distinct `buildingAt` and `ready` timestamps, but those wall-clock values are **not** provider-billed Build CPU. The project already has an app-scoped `scripts/vercel-ignore.mjs` which skips docs/tests/unrelated-app edits when history is available and fails open for unknown history. The observed frequency is driven in part by repeated code pushes to the same preview branches and main. No justification was found for replacing the ignore mechanism or disabling previews globally while other agents rely on them.

**Safe immediate improvement:** implement/test locally where available, push a coherent branch slice once for CI/review (or deliberately only at integration boundaries), and batch multi-file connector writes in one Git tree/commit. This changes how agents work, not running services. **Still unverified:** project-level Build CPU and invoice/credits, ignored-vs-built statuses for each deployment, Vercel/Redis/Supabase actual spending, billing alerts and final privacy review. Treat the team-wide O03.5 sample as team-wide only.
