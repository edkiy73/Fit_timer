# Наполнение FetUre: F05.1

Сейчас доступна только локальная предварительная проверка. У инструмента нет подключения к сети, ключей БД, режима применения, SQL записи или удаления.

Из корня репозитория:

```bash
node apps/feture/tools/seed-dry-run.mjs --project-ref anrhayozrhrmiwexmbhw --stage prelaunch
```

Необязательные `--manifest` и `--inventory` задают файлы внутри `apps/feture`. Любые другие аргументы, включая `--apply` и `--table`, отклоняются. Параметры проекта и этапа обязательны. `prelaunch` — заявленная стадия продукта, а не доказательство состояния живого окружения; F05.2 обязан проверить его отдельно.

## Файлы и границы

- `development-manifest.json`: ID набора, версия генерации, ожидаемые проект/стадия, происхождение; фиксированный путь каталога и SHA-256; три вымышленных профиля с уникальными `seedKey`. Никаких email, Core account hashes, токенов, грантов, постов или медиа.
- `inventory-2026-10-10.json`: снимок metadata/RLS/client grants девяти таблиц и агрегированных counts четырёх таблиц. Личные строки не считывались. Это снимок, не разрешение исполнить импорт и не проверка актуальной БД при запуске CLI.
- `inventory.sql`: повторяемые SELECT для нового снимка. Запускать только на ожидаемом проекте через принятый Supabase workflow; не заменять их DDL/DML на этой фазе.
- `dry-run-2026-10-10.json`: сохранённый пример отчёта. Хеши manifest/catalog/inventory позволяют сопоставить отчёт точным входам. Повторный запуск с теми же файлами даёт тот же отчёт.

Allowlist целей: `feture_categories`, `feture_interests`, `feture_profiles`. Метаданные 18 тестов подсчитаны, но не входят в импорт до настоящих опросников. Профили пока только в manifest, не созданы в БД или Core auth. Образы/фото не добавлены: происхождение и media policy проверяются отдельно.

Проверяются строгая форма полей, границы длины/counts, уникальность ID/seed keys, соответствие interest ID направлению, хеш каталога и ожидаемые проект/стадия. Путь источника каталога фиксирован; другие входы ограничены реальным расположением внутри FetUre (включая symlink resolution).

Отчёт содержит **кандидаты**, не обещание вставок: 12 направлений, 144 интереса, 3 профиля; наблюдалось 12/144/0. `insertCount/updateCount/deleteCount:null` означает, что операции ещё нельзя безопасно вычислить. `canApply:false`, `writes:0` обязательны для этой фазы. Найдены blockers: отсутствует схема provenance и существующие строки не классифицированы по набору. Проверяются также отсутствие таблицы/RLS, неизвестные counts и client grants приватной целевой таблицы.

## Следующая F05.2 — высокое усилие

Перед реальным применением нужны свежая metadata и проверка окружения, scoped provenance (`dataset_id`, `seed_key`, `generation_version` или проверенный эквивалент), ограничения/индексы, правила владения существующим каталогом, актуальная идентификация профиля и одна атомарная транзакция. Не считать прежние строки нашим dataset лишь по совпадению ID. Не применять migration 001 повторно. Повтор/обновление/очистка должны затрагивать только записи конкретного FetUre набора и не удалять Core accounts, чужие продукты или buckets. Проверить RLS/негативные сценарии и повторяемость до включения режима применения.

F05.1 проверена общей командой `npm --prefix apps/feture run check` и короткими локальными негативными сценариями: чужой проект/stage, дубли, accountHash в профиле, подменённые source path/digest, таблица Core и происхождение реального пользователя. Данные БД и окружения не изменялись.

## F05.2 применена: текущий путь оператора

Предыдущие разделы описывают исторический снимок F05.1. Теперь authoritative preview читает живую БД через новую функцию; offline inventory и его `provenance_schema_missing` не описывают текущий sidecar. [Проверки и результат](verification-2026-10-10.md).

`tools/seed-sql.mjs` только печатает SQL, **не подключается к БД и не выполняет его**. Выполнять результат через Supabase operator workflow в проверенном проекте `anrhayozrhrmiwexmbhw`; не через browser/REST/service_role. Миграцию применить один раз через apply_migration; исходные 001/002 не повторять. Имя SQL-файла создано `supabase migration new feture_scoped_seed` (CLI 2.120.0); время live history может отличаться от локального времени создания файла.

```bash
# Свежий preview профилей; SQL выполнить оператором в правильном проекте.
node apps/feture/tools/seed-sql.mjs --project-ref anrhayozrhrmiwexmbhw --stage prelaunch --scope profiles
# После проверки counts/blockers — тот же payload и reviewToken из ответа preview.
node apps/feture/tools/seed-sql.mjs --project-ref anrhayozrhrmiwexmbhw --stage prelaunch --scope profiles --mode apply --review-token TOKEN_FROM_FRESH_PREVIEW
# Явная очистка только synthetic dataset: сначала preview, затем apply с его token.
node apps/feture/tools/seed-sql.mjs --project-ref anrhayozrhrmiwexmbhw --stage prelaunch --scope profiles --operation cleanup
```

TOKEN — 64 hex символа; не пароль и не разрешение доступа. Если БД/payload/operation/adoption изменились, снова выполнить preview и проверить результат. SQL содержит BEGIN/COMMIT, lock timeout 3s / statement timeout 15s. При ошибке вся операция dataset откатывается; повтор не создаёт дубликаты. `writes` считает изменённые/зарегистрированные записи набора, а не SQL statements/физические строки sidecar. Preview всегда пишет 0.

- `--scope catalog`: `feture-reference-catalog-v1`, kind reference-catalog. Для первой регистрации bootstrap каталога нужен `--adopt-exact-catalog true` и в preview, и в apply; допускается только полное совпадение каждого поля. Эта регистрация уже выполнена. Никаких новых тестов/descriptor writes.
- `--scope profiles`: dataset ID из strict manifest, kind synthetic-development. ID детерминирован: `seed:<datasetId>:<seedKey>`, недостижим для Core actor hash. Только name/about, dating отключён; аккаунты не создаются.
- Provenance хранится только в `feture_seed.records` с RLS и без grants/USAGE/EXECUTE для anon/authenticated/service_role. No SECURITY DEFINER. Consumer DTO не получает эти метки.
- Изменение контента требует увеличения числовой `generationVersion` (1–999999). Уменьшение версии/повтор версии с другим контентом/чужая ownership/ручной drift отклоняются. Sync не удаляет записи, которых нет в новом manifest; удаление только через явный cleanup целого указанного набора.
- Cleanup отказывает при любых зависимостях (posts, grants, states, responses, preferences, tests), вместо cascade удаления. Для catalogue dataset referenced test descriptors блокируют очистку; не обходить их ради reset. Для удаления участников перед реальным запуском выбрать **profiles**, каталог сохранить.
- Environment marker — административная запись `feture_seed.environment`, не независимое доказательство physical project. Каждый execution должен указывать проверенный MCP project_id. Перед объявленным запуском: очистить synthetic profiles, убедиться в отсутствии synthetic участников других наборов, затем оператором сменить stage на `live`. Любой seed operation после этого откажет. Не открывать schema для Data API.

Одна проверка: `npm --prefix apps/feture run check`; SQL integration test отдельно `npm --prefix apps/feture run test:seed`. PGlite — pinned dev-only PostgreSQL runtime, не второй product store. Native/APK/IPA не собираются этой командой.
