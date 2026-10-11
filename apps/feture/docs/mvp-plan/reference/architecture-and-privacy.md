> Историческая версия детальных требований от 11.10.2026. Для фактического состояния и очереди задач сначала смотреть [STATUS.md](../STATUS.md). Здесь не вести журнал исполнения. Полный исходник сохранён в архиве.

## 3. Решения по данным и серверу

### 3.1 Один источник истины

- Сессия/аккаунт/общие сервисы — AppBase Core. `account_hash` определяется сервером из проверенной Core identity. Не принимать email/hash/роль администратора из payload. Не вводить Supabase Auth, `auth.users` FK или `auth.uid()` политики без отдельного изменения архитектуры.
- **PostgreSQL `feture_*` — единственный канонический источник доменных данных**: профиль, интересы, тесты, дневник, доступы, пары, UGC, сообщения. Core document sync остаётся для общих settings, не для второй независимой копии карты.
- Клиентская IndexedDB — owner-scoped кеш и очередь приватных правок. Переиспользовать Core storage/жизненный цикл, сделать маленький продуктовый repository/transport. Не переделывать универсальный Core sync ради одного продукта. Альтернатива «весь профиль — Core документ» проще для личного блокнота, но плохо подходит для ACL, поиска, групп и транзакций social-домена.
- При замене текущего `interest-map` убрать его серверную регистрацию и старый путь чтения в том же законченном переходе; не оставлять фоновые двойные записи. Временные старые данные можно сбросить. Новый гостевой черновик импортируется только по явному действию в выбранный аккаунт и один раз по operationId.
- Новые API композиции: существующие `api/auth.js`, `sync.js`, `admin.js`, `catalog.js` сохраняют свои обязанности. Для продукта создать компактные resource handlers, например `api/domain.js` + `lib/feture/*`; финальное количество функций сверить с deployment. Не создавать файл serverless-функции на каждую кнопку.
- Каждый handler сначала подключает `lib/product.js`; все доменные действия проходят единые auth, schema validation, permission checks, quotas. SQL параметризованный; не брать имена таблиц/сортировку из свободного ввода.
- RLS включён; private tables не доступны anon/authenticated напрямую. Серверный service-role обходит RLS, поэтому application ACL обязателен. Все queries ограничены субъектом/объектом и явным allowlist таблиц; prefix сам по себе не изоляция от привилегированного ключа.

### 3.2 Модель интереса — исправить до контента

Текущий единичный status не позволяет «есть опыт, но сейчас не хочу». Новая запись:

- `interestId`, `stance: unknown|curious|fantasy|want_to_try|not_interested`;
- `experience: unspecified|none|tried|ongoing` независимо от stance;
- `boundary: none|conditional|hard`, необязательная личная заметка условий;
- `intensity: null|1..5` только для положительной stance и без hard boundary; никакого процента согласия;
- `visibility: private|granted|public`, по умолчанию private; отдельное согласие `useForDiscovery` для использования в подборе;
- `revision` сервера, `updatedAt` сервера, `source: manual|test` и reference версии теста.

В одном атомарном изменении валидировать сочетания. Hard boundary запрещает использовать тему как положительный сигнал; опыт не отменяет границу. Для общей visibility поля условий всегда private, если нет отдельного явного раскрытия. Unknown ≠ 0 ≠ отказ. Тест не меняет boundary/visibility сам.

**Две разные визуальные величины:** банка отдельного интереса = субъективная сила 1–5, подпись и отдельные значки опыта/границы; прогресс категории = сколько тем изучено. Не рисовать 80% желания из 80% заполнения анкеты. Пустая тема не похожа на нулевую силу. Категорийный средний «уровень сексуальности» не вычислять.

### 3.3 Минимальная карта сущностей (добавлять по карточкам)

| Домен | Сущности и обязательные ограничения |
|---|---|
| Identity | profiles(public uuid, private account_hash unique), verification(status/providerRef/policyVersion/expiry), consent_receipts(version/hash/locale/time) |
| Карта | interest_states unique(owner,interest), interest_history, private journal_entries; server revision; удалённые элементы не воскресают |
| Тесты | test_definitions, immutable published versions, attempts(draft/completed), answers/result; retake создаёт новую попытку |
| Доступ | access_requests; grants(owner,viewer,scopeIds,expiry,revokedAt); block unique(actor,target); без self-grant |
| Медиа | media_assets(owner,storageKey,mime,size,moderationState,visibility,version), albums, consent approvals; не хранить публичную ссылку вместо прав |
| Сообщество | posts, comments, reactions unique(actor,target,type), follows unique(actor,target), bookmarks; groups + membership unique(group,actor) |
| Пары | relationships + 2 memberships + invitations; joint_profile + approvals(subjectVersion,actor); общие поля не ссылка на все личные ответы |
| Dating | preferences — единственный владелец enabled (убрать дубль profiles.dating_enabled); decisions unique(actor,subject); matches unique(normalized subject pair) |
| Chat | conversations, members, messages(conversation,clientMessageId unique per sender), read_cursor; персональный автор всегда виден |
| Доверие | reports, moderation_cases/actions/appeals, admin audit; legal_documents/versions; idempotent jobs/outbox |
| Наполнение | dataset_id + provenance + generationVersion; безопасное удаление allowlist FetUre, без удаления глобального Core account |

Для каждой таблицы: PK/FK, ownership, size limits, created/updated/server revision по необходимости; индексы соответствуют конкретным запросам. Cursor lists `(created_at,id)`, не неограниченные SELECT. Не строить микросервисы/поисковый кластер для MVP.

### 3.4 Транзакции, сеть и конфликты

Mutation: `operationId`, `expectedRevision`, валидированный payload → canonical entity/revision. Повтор operationId с тем же телом возвращает прежний результат, с другим телом отклоняется. Atomic DB transaction для match+conversation, grant+approval, publish+moderation, пары и смены прав.

Сервер отвечает 401/403/404 без утечки существования скрытых объектов; 409 конфликт, 422 поля, 429 лимит/retryAfter, 503 временная недоступность. UI сохраняет черновик и предлагает повтор. При stale revision получить canonical, автоматически объединять только разные поля/темы; конфликт одной темы показать владельцу. Права никогда не расширяются из-за last-write-wins. Удаление — tombstone/revision до очистки очередей; повтор старой операции не воскрешает объект.

Очередь привязана к account identity, после sign-out останавливается; pending response предыдущего аккаунта не пишет в новый кеш. Гость отдельно. Cache keys включают viewer; смена account очищает React Query, object URLs, media, кеш профилей и owner data. Отзыв прав — сервер истина; открытый экран обновляется при следующем запросе/focus. Приватные ответы `Cache-Control: private, no-store`; CDN, SEO/OG, session replay не получают чувствительное содержимое.

## 4. Единые права и состояния

| Субъект | Что доступно |
|---|---|
| Гость | Landing, правила, безопасные определения/редакционные материалы; только локальный безопасный старт |
| Авторизован, возраст не подтверждён | Свой account и процесс проверки; не UGC 18+, dating, чужие закрытые данные или сообщения |
| Проверенный взрослый | Только разрешённая аудитории проекция профиля/контента |
| Владелец | Свои данные, выбранное раскрытие; не личное другого участника пары |
| Получатель grant | Только scope и срок; match/follow/отношение не заменяют grant |
| Заблокированный в любую сторону | Нет выдачи, новых grants/сообщений/реакций/видимости через поиск и сравнение; старые жалобы доступны автору и модератору по делу |
| Модератор | Только материал дела и минимальный контекст, действия с reason/audit; не свободный просмотр дневников/чатов |
| Администратор контента | Каталог/тесты/документы, без автоматического права читать личное |

`public` в домене = разрешённые взрослые участники, **не весь интернет**. Публичные маркетинговые share snapshots — отдельный whitelist DTO с осознанным выбором владельца. Подписка, симпатия, право писать и право видеть интимное — независимые состояния.

Request: pending → approved(partial possible)/declined/cancelled/expired. Grant: active → revoked/expired. Повтор запроса ограничен cooldown; владелец может заблокировать. Expiry проверяется при чтении, не только cron. Отказ не открывает причины/скрытые поля.

Verification: unverified → pending → verified/rejected/expired; сервер проверяет подпись webhook, event id, provider reference, issuer и привязку к текущему аккаунту. Клиентский redirect не доказательство. Возраст и identity — разные attestations. Хранить минимальный результат, не паспорт/биометрию. Процедура ID/liveness выбирается по требованию владельца и подтверждённым правилам провайдера/рынка, не утверждать универсальную юридическую обязательность одного метода. Нет production bypass-флага от клиента.

Media: uploading → quarantined → approved/rejected → deleted. Неудачная проверка/timeout остаётся в карантине. ACL применяется и к thumbnail/preview, оригиналу, видео-сегментам. Для закрытого контента требование «отзыв со следующего запроса» выполняется авторизованным media gateway без общего CDN-кеша. Самостоятельный подписанный URL нельзя считать немедленно отзываемым. Уже загруженные байты/скриншоты вернуть невозможно — продукт не обещает обратного.

Moderation: pending → assigned → actioned/dismissed → appeal → final. Опасные жалобы приоритетны, пользователь может скрыть материал немедленно; одна жалоба не должна автоматически глобально банить невиновного. Редактирование опубликованного контента создаёт новую проверяемую версию; нельзя заменить approved байты по прежнему ключу.

