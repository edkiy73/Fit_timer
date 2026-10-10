# A02.1 — серверная модель и атомарная запись

Срез 2026-10-11 (Asia/Makassar), база `a30f376c` (#775).
Это серверный фундамент A02/A03, не законченный переход UI/синхронизации.

`feture_interest_states` теперь хранит отдельно stance, experience, boundary,
private boundary_note, nullable intensity 1–5, visibility и use_for_discovery.
Ревизия и время назначаются сервером. Источник manual; test_version зарезервирован
для будущих опубликованных тестов. Клиент не передаёт owner/source/time/revision
в state. Hard boundary исключает intensity; опыт не меняет желание или границу.
Заметка допустима только для conditional. Отсутствующие visibility/discovery
полного state получают private/false.

POST `/api/domain`: interests.set/delete, interestId, operationId (UUID),
expectedRevision (0 для новой темы), полный state для set. Actor — проверенная
Core identity. Quota/no-store/redacted audit сохранены. Adult gate действует и
в handler, и в repository. **A04 attestation отсутствует: реальные запросы карты
отклоняются с verification_required; публичный bypass не создан.**

`public.feture_interest_mutate` — SECURITY INVOKER с фиксированным search_path,
EXECUTE только service_role. Клиентские роли не имеют EXECUTE/SELECT на states
и operations; RLS включён, без клиентских policies. RPC создаёт минимальный
продуктовый профиль при первой разрешённой записи (не Core account), берёт owner
row lock и атомарно проверяет expectedRevision, изменяет state и создаёт receipt.
Транспорт использует готовый Core Supabase adapter, без новой серверной сборки.
CommonJS/JSDoc + contracts.d.ts проверяются существующим server typecheck.

Receipt хранит fingerprint, interest ID, appliedRevision/appliedAt и operation ID,
без второй копии значений/заметки. Другой запрос с тем же ID — operation_conflict;
устаревшая ревизия — revision_conflict с текущим owner DTO (оба 409). Unknown
interest — 404; сбой транспорта — 503, без ложного успеха.

Retry возвращает **тот же receipt** и **актуальную entry**. Это уточняет
«прежний результат» §3.4: stable receipt отделён от текущей проекции, чтобы после
изменения/удаления не возвращать старые значения. A03 сравнивает entry.revision;
appliedRevision нельзя использовать для замены более нового кеша старым.
Delete создаёт очищенный tombstone с новой ревизией; старый retry не воскрешает
запись. Новый set с текущей tombstone revision означает явное восстановление.
Tombstones/receipts нельзя чистить по TTL до отдельного контракта O01/A03.
История W06 и полное удаление/экспорт продукта не реализованы этим срезом.

CLI создал `20261010164924_feture_interest_transactions.sql`; live history:
`20261010165456 feture_interest_transactions` (MCP назначает свой timestamp).
Preflight подтвердил FitT `anrhayozrhrmiwexmbhw`, prelaunch и 0 states.
Миграция берёт ACCESS EXCLUSIVE lock и отказывает при live marker или любых
states; данные автоматически не удаляет. Старая колонка status/шкала 0–100 убраны;
второй PostgreSQL reader/schema не оставлен. Изменены только FetUre объекты.

Проверки: полный FetUre check (types, 10 smoke, 9 unit, 13 security, seed,
новый focused PostgreSQL suite, build). Suite покрывает nonempty/live guard,
независимые поля, defaults, конкурирующие expected revisions, retry/conflict,
owner-scoped UUID, tombstone, invalid state/SQL constraints и роли.
Live service_role set/retry/conflict/delete/old replay проверены в BEGIN…ROLLBACK.
После проверки states/operations 0/0, profiles 3; Core documents 90, KV/auth users/
buckets 0 — до/после одинаковы. RLS/grants/EXECUTE/SECURITY INVOKER/search_path
сверены. Advisor: только ожидаемые INFO — закрытые tables без policy и ещё
не использованный FK index при 0 строках. Не открывать policies ради скрытия INFO.
[RLS advisor rationale](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Актуальные Supabase changelog и docs ролей/функций прочитаны. Docker/local
db pull не использовался: migration создана CLI, проверена PGlite и применена MCP.
Живой email-вход, положительный authenticated API с A04, два устройства,
browser/native и multi-connection load не проверены.

A02.2 редактор и A02.3/A03 клиентское переключение теперь реализованы:
см. [очередь и доказательства](interest-queue.md). Прежняя interest-map document sync
удалена; новый клиент использует этот RPC через `/api/domain`, с неизменным age gate.
A01 setup/mail и trusted A04 остаются gates; A02/A03 целиком ещё не завершены.
