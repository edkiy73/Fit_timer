# FetUre: запуск отдельной дизайн-сессии

**Источник задач:** [дизайн-поток #908](https://github.com/edkiy73/Fit_timer/issues/908) и связанные рабочие Issues. **Актуальная дата запуска:** 2026-10-12. **Владелец вручную выбирает модель**, никакого автоматического переключения моделей, API-агентов, фоновых задач и платных интеграций.

## Кто что делает

- **Sol 6.1** (если владелец выбрал в новом чате): основной visual/frontend implementer, React, адаптивность, Motion, interaction и финальный продуктовый UX. Выполняет PR, проверяет CI, самостоятельно объединяет безопасные изменения.
- **Astra Pro** (отдельная вручную запущенная сессия, по необходимости): независимая проверка сложного UX/layout/design-system решения, производительности, безопасности и согласованности desktop/tablet/mobile. Не блокировать простой UI PR ожиданием отдельной Astra.
- **GPT-6 High / функциональный поток:** API/SQL, private grants, auth, фото/медиа, критичные баги и продуктовые компоненты. Не редактировать те же visual файлы параллельно без координации.

## Очередь, не создавать дублей

1. [#909 — DUX01 visual audit / foundation](https://github.com/edkiy73/Fit_timer/issues/909). **Первый стартовый Issue.** Реальная React-сборка vs reference, точечные компоненты и токены.
2. [#841 / #874 / #875 — аккаунт, профиль, onboarding](https://github.com/edkiy73/Fit_timer/issues/841): реализация **уже частично/существенно в main**; повторно не писать сервер, сначала конкретные visual gaps. Тон/визуал из Claude.
3. [#910 — DUX02 Мой мир / Исследовать](https://github.com/edkiy73/Fit_timer/issues/910); продуктовый parent [#849](https://github.com/edkiy73/Fit_timer/issues/849).
4. [#911 — DUX03 опросники / дневник](https://github.com/edkiy73/Fit_timer/issues/911); функциональные #850/#851.
5. [#842 — общая AppBase админка](https://github.com/edkiy73/Fit_timer/issues/842): не строить вторую; существующий AdminWorkspace, compact lists/filters/editor popups, focus/Back.
6. **Сообщество, включая События (обязательный сценарий):** [#1020 DUX05 афиша и детали](https://github.com/edkiy73/Fit_timer/issues/1020) → [#1021 DUX06 создание и мои события](https://github.com/edkiy73/Fit_timer/issues/1021) → [#1022 DUX07 RSVP/организатор](https://github.com/edkiy73/Fit_timer/issues/1022) → [#1023 DUX08 модерация/аналитика](https://github.com/edkiy73/Fit_timer/issues/1023) с зависимостями от server #989/#994 и SQL gate #1019. [#1016 — настоящие просмотры постов рядом с реакциями](https://github.com/edkiy73/Fit_timer/issues/1016) — independent visual slice. Не новый пункт дока и не отдельная админка. UI — общие карточки, responsive sheets, настоящий desktop; никакой имитации пользователей/RSVP/просмотров или успешного API. После текущих #842/#1015 не терять эти задачи при переключении сессий.
7. Пары/знакомства (R/D) — по реальным backend-контрактам/consent, в рамках того же визуального языка, без fake matches.
8. Отдельная независимая проверка на настоящих устройствах, включая сценарии событий: [#869](https://github.com/edkiy73/Fit_timer/issues/869); выпуск: #870.

## Передача следующего Sol-потока после дизайна

Если текущие готовые визуальные задачи завершены или заблокированы и нет пересекающихся PR, **не придумывать следующую задачу** и не требовать от владельца помнить промпт. Передать следующий свободный Sol-поток к [#931 — персональные роли сотрудников: безопасность и SQL](https://github.com/edkiy73/Fit_timer/issues/931) (родитель #865). Это **отдельная вручную запущенная backend/security-сессия**, а не автоматическое продолжение дизайна или изменение роли посреди незавершённого PR. Первый шаг — матрица ACL + независимое ревью; опасные SQL/производственные изменения только после явного разрешения. Сохранить progress/handoff в Issue.

## Дизайн-источники и границы

- [Краткий эталон Claude](../design-reference/README.md): Geologica, мягкие тёплые light/dark темы, умеренные rose/lilac accents, иерархия радиусов, 120–340ms Motion, blur dock и правильно закрываемые bottom sheets. Полный HTML `../design-reference/claude-mvp-concept-2026-10-12.html` читать **точечно**, только для нужных экранов; его «десктоп» — 390px simulator, не desktop-макет.
- [FetUre AGENTS](../../AGENTS.md), [правила агентов](START.md), [UI checklist](../ui-quality.md), [актуальный статус](../mvp-plan/STATUS.md). Проверить реальный `main` и открытые PR **до** изменений. Не считать устаревший текст Roadmap или статус Issue доказательством отсутствия уже реализованной функции.
- Стек: существующие React, TypeScript, Motion, React Aria, Core/Task Mini и AppBase components. Не вводить новую UI-библиотеку, не менять shared Core или `packages/ui-react` в продуктовом PR. Если нужно — отдельный scoped PR и check других приложений.
- Функции, серверные privacy/age/consent, сохранение, отказ/undo, offline queue, idempotency/retry и private-by-default не изменять ради дизайна. Не редактировать параллельный фото-/медиа- backend, SQL или операторский sensitive image flow.
- 320/390px phone; 768/1024 tablet и fold; 1440 desktop c полноценной компоновкой; light/dark, 200% zoom, keyboard/Tab/Escape/Android Back, safe areas, touch, reduced motion, длинные кириллические тексты, no horizontal overflow. При материальной UI-правке реальные скриншоты **запущенного React** на 390/1440 минимум. Если в сессии нет браузера — честно зафиксировать VISUAL QA PENDING и передать #869.
- Показывать пользователю **законченные крупные визуальные этапы**, не требовать проверки каждого PR. Один осмысленный визуальный блок → небольшой PR → typecheck/build/CI + нужное review → safe merge → короткий GitHub handoff. Нет фоновой работы между чатами.

## Готовый промпт для Sol

> Продолжай отдельный визуальный поток FetUre в GitHub `edkiy73/Fit_timer`. Прочитай `apps/feture/AGENTS.md`, `apps/feture/docs/agent-team/DESIGN-START.md`, `apps/feture/docs/design-reference/README.md` и короткий START. Проверь свежие main, открытые PR и #908. Начни с #909 (visual audit/design foundations), затем follow-up #841/#874/#875, #910, #911, #842, а после текущего #1015 переходи к **событиям по #1020 → #1021 → #1022 → #1023**, плюс #1016 для просмотра постов (строго по готовности server #994 и SQL #1019). Для UI событий не добавляй пятый dock tab; это подраздел «Сообщества». Не переписывай работающие функции. Используй Claude HTML как визуальный ориентир, но делай **настоящий качественный React** для телефона, планшета/fold и desktop, со светлой/тёмной темой, анимациями и удобными попапами. Реальные данные и privacy/security/CAS/auth/API не меняй; фото/Storage/moderation/SQL другого потока не трогай. Разбей изменения на небольшие логичные PR, проверяй CI и независимые отзывы, безопасные PR сливай сам без ожидания моего подтверждения. Проверяй React screenshots 320/390/768/1024/1440, темы и UX, если браузер доступен; иначе честно отмечай, что visual QA не выполнена, и создавай handoff в Issue #869. Продолжай следующую готовую задачу, пока есть возможность. Описание прогресса и оставшиеся блокеры записывай в GitHub Issues. **Не делай вид, что всё проверено, если есть только CI.**

**Astra review (опциональный промпт):**

> Проверь последний крупный visual PR FetUre на соответствие `apps/feture/docs/design-reference/README.md` и `DESIGN-START.md`. Сравни настоящие React экраны на телефоне/планшете/desktop, темы, mobile keyboard/Back/focus, reduced motion, CLS/performance и семантику privacy. Не редактируй код параллельно; оставь конкретные замечания в PR и отметь, что не удалось проверить.
