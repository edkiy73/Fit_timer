# F05.2 — результат проверки 2026-10-10

База FitT, ref `anrhayozrhrmiwexmbhw`, PostgreSQL 17.6, ACTIVE_HEALTHY. До работы: 12 categories / 144 interests / 18 test descriptors / 0 profiles. История 001/002 была проверена; они не применялись повторно. Миграция `feture_scoped_seed` применена через Supabase apply_migration, live version `20261010091229`.

| Проверка | Подтверждённый результат |
|---|---|
| Fresh catalog preview | 156 exact adoption, 0 insert/update/delete, blockers пусты |
| Catalog apply | 156 sidecar records; содержимое справочника сохранено |
| Profiles preview/apply | 3 insert; без email/Core accounts/media; dating false |
| Повтор profiles apply | 3 unchanged, writes 0 |
| Live cleanup внутри ROLLBACK | удаляет только 3 профиля и их sidecar; повтор cleanup 0; после rollback снова 3/159 |
| RLS | включена на всех 9 public FetUre tables и двух sidecar tables |
| anon/authenticated | нет profile SELECT (включая column grants), sidecar SELECT/USAGE и function EXECUTE |
| service_role | прежний trusted profile access сохранён; sidecar USAGE/SELECT/EXECUTE отсутствуют |
| Общие ресурсы до/после | Core KV 0, Core documents 90, buckets 0, Supabase auth users 0 |
| Seed ledger итог | 156 reference-catalog records + 3 synthetic-development records = 159 |

`npm --prefix apps/feture run check`: client/server/tools typecheck, 9 smoke assertions, 8 unit tests, 12 security tests, один focused PostgreSQL test и production build passed. PostgreSQL test использует реальные 001/002 + новую migration в isolated PGlite, без cloud credentials. Проверяет неверные project/stage, чужую таблицу/идентичность, duplicate keys, exact adoption refusal, review-token смену состояния, повторы, version reuse/downgrade, content drift, отказ удаления зависимостей, поздний FK rollback, сохранение unseeded реального профиля/другого dataset/Core sentinel, закрытие stage и запрет ролям. Конкурентные подключения отдельно не нагрузочно тестировались; runtime DB locks проверены исполнением на PostgreSQL 17.

Supabase security advisors до/после: нет WARN/ERROR; INFO `rls_enabled_no_policy` для deny-by-default private tables и sidecar ожидаем. Политики для клиентского доступа намеренно не добавлены. [Описание advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Functions — SECURITY INVOKER с пустым search_path; grants отозваны явно ([официальные рекомендации](https://supabase.com/docs/guides/database/functions), [Data API grants](https://supabase.com/docs/guides/api/securing-your-api)). Changelog проверен, включая minor PG breaking-change для pgcrypto/custom operators; новая схема не использует эти extensions/operators.

Метки остаются в закрытой схеме БД, consumer UI/API не менялись. Эта работа не включает live mail/auth настройку, trusted age verification, community/dating readers или APK/IPA; 3 профиля сейчас доступны только trusted DB adapter/operator, не объявлены работающим публичным сообществом. Offline inventory/report F05.1 сохранены как исходная evidence, не live snapshot после migration.
