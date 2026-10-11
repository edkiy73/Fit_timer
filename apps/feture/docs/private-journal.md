# Личный дневник и история карты (W06.1, 2026-10-11)

`/#/journal`: личные записи, необязательная связь с темой, редактирование/удаление, отдельная история карты. Записи и прошлые значения карты доступны только владельцу. Нет публикации, публичной ссылки, grants, просмотра партнёром, продукта admin action или аналитики с текстом.

## Хранение и протокол

`feture_journal_entries` хранит текст до 3000 символов, заголовок до 160, topic FK, server revision и даты. Все поля сохраняются атомарно через `feture_journal_command`. Core определяет owner по действующей сессии; action не принимает owner, роль, audience, visibility или результат.

- `journal.list {cursor:null|{at,id}}`: до 30 записей, `(created_at,id)` keyset, даты создания не меняются при редактировании.
- `journal.read {id}`: только своя неудалённая запись.
- `journal.save {id,operationId,expectedRevision,title,text,topicId}`: CAS, стабильный operationId после потери ответа; другой payload с тем же ID отклоняется.
- `journal.delete {id,operationId,expectedRevision}`: стирает текст/заголовок/связь, сохраняет пустую tombstone и revision. Старый save retry возвращает текущую tombstone и не воскрешает текст.
- `history.list {cursor}`: до 30 изменений карты с owner-only snapshot, без account hash.
- `history.clear {operationId}`: удаляет только историю владельца. Повтор не удаляет новые изменения, появившиеся после первой очистки. Текущая карта сохраняется.

`feture_interest_history` заполняет invoker trigger внутри существующей транзакции карты. Конфликт и повтор не создают дополнительные строки; старые изменения до установки trigger не реконструируются. Очистка истории и изменение карты используют один owner lock. Удаление строки `feture_profiles` каскадно стирает записи и историю; данные других продуктов не затрагиваются. Связь с полным удалением Core-аккаунта реализуется отдельно в O02 и здесь не заявляется готовой.

Три таблицы закрыты для anon/authenticated/PUBLIC, RLS включён, функции только для серверной service_role. Прямой client RPC невозможен. Каждый repository method повторно проверяет зарегистрированный Core actor; чтение/сохранение требуют актуальные adult proof и согласия. Удаление и очистка доступны с действующей Core сессией после истечения adult proof, как другие действия ограничения доступа.

## Черновик и ошибки

Форма хранится в памяти компонента, привязанного к account/device/token. После sign-out/switch она размонтируется; pending response не записывает данные нового аккаунта. Никаких дневников в shared localStorage, Core documents или query cache. Это не offline queue: при сбое текст остаётся в открытой форме, после успешного save находится в БД. Переход с несохранённым текстом блокирует общий React Aria dialog; reload/закрытие предупреждает beforeunload. Конфликт требует загрузить сохранённую запись и принять решение; автоматического перезаписывания нет.

## Проверено

- `npm run check`: client/server types, smoke, unit, security, PostgreSQL и build прошли.
- Один PostgreSQL contract: private projection, два владельца, CAS race, op collision, удаление/старый повтор, страницы 30+3, ровно одно событие истории, повтор очистки, role denial, fabricated actor denial, deletion after adult expiry и каскадное удаление.
- Один компонентный сценарий: текст не теряется после ошибки, переход блокируется, «Остаться» сохраняет форму, повтор использует тот же operationId, успешный save снимает блокировку.
- Живая миграция FitT применена. Service-role save/retry/foreign-read denial/delete/old-save retry/history assertions выполнены в ROLLBACK. После проверки дневник и история пусты, Core documents = 90.
- Security advisor: только INFO `rls_enabled_no_policy` для намеренно закрытых серверных таблиц; доступ не расширен ради удаления INFO.
- Браузер Chromium не запустился в sandbox; Cloud Browser не открыл локальный стенд. Responsive/browser interactions, две production сессии и native устройства **не проверены**. Полная W06 остаётся открыта до A01/A04 и включения истории результатов тестов W03.

W06.2: вкладка «Результаты опросников» показывает только свои завершённые прохождения и ведёт к объяснению/удалению каждого. Локальный Chromium memory/PGlite fixture теперь проверил сохранение/возврат/редактирование/удаление, навигационную защиту, обе истории и пять ширин; это не две production сессии или native приёмка.
