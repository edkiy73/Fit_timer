# UnMute: English for Expats — план слияния с AppBase Core

Статус: **согласован по пп. 1–4 §2** (2026-09-28). **Этап 0 завершён** (PR #192–#195). **Фаза 1:** `apps/unmute` создан и задеплоен в Vercel → https://unmute99.vercel.app; Upstash Redis и почта подключены, Functions переводятся в Singapore (`sin1`). Раздел §0 — точка входа для любого исполнителя (человека или ИИ-агента), который продолжает работу.

Продукт — первое настоящее «App2» из [ADR по стеку](./appbase-stack-ci-strategy.md). Источник логики — репозиторий `edkiy73/English` (семейное приложение «English Trainer», один `index.html` ~4,6 тыс. строк, сборка `2026-09-04.17`; с тех пор не менялся). Интерфейс оттуда **не переносится**: берём контент и алгоритмы, интерфейс делаем с нуля.

---

## 0. Как продолжить работу

Этот раздел поддерживается актуальным: **каждый PR по плану обновляет §0 и статус своего пункта в §5**.

### 0.1. Где мы сейчас (2026-09-28)

| Пункт | Статус | Где лежит |
|---|---|---|
| 0.1–0.2 Необязательный вход, `askHandle` | ✅ в `main` (PR #192) | `packages/ui-react/src/auth.tsx` |
| 0.3–0.5 Локальная синхронизация, слияние, бесплатные документы | ✅ в `main` (PR #192) | `packages/core/src/core/document-sync.ts`, `packages/core/server/sync-core.js` (поле `base`), `apps/task-mini/src/tasks/*`, `apps/task-mini/lib/app-sync-schema.js` |
| 0.6 Префикс ключей | ❌ отменён: своя база и домен у каждого приложения | — |
| 0.7 Покупки навсегда + выдача в админке | ✅ PR #193 | `packages/core/server/entitlements.js`, `packages/core/server/admin/accounts.js` (`user_owned`, `products_list`), `packages/core/src/core/auth.ts` (`owned`, `hasEntitlement`), `packages/ui-react/src/admin.tsx` (форма доступа), `apps/task-mini` (SKU `export`) |
| 0.8 Каркас оплаты | ✅ PR #194 | `packages/core/server/billing.js` (`applyBillingEvent`, `createBillingHandler`, `createTestBillingAdapter`, `billing_log`), `packages/core/src/core/billing.ts` (`createBillingClient`), `packages/ui-react/src/admin.tsx` (вкладка «Платежи»), `apps/task-mini/api/billing.js`, кнопка «Купить экспорт» |
| 0.9 Язык интерфейса (переключение — по желанию приложения) | ✅ PR #195 | `packages/ui-react/src/i18n.tsx` (`I18nProvider`, `useI18n`, `LanguagePicker`, `missingKeys`); языки — `config/product.json → i18n`; Task Mini RU/EN |
| 0.10 Стартер получает всё из этапа 0 | ✅ PR #195 | `templates/react-app` (необязательный вход, `auth.askHandle`, `document-sync` с документом `settings`, `api/billing.js`, `products`, i18n), `scripts/create-app.mjs`, `scripts/test-react-app-template.mjs`, `docs/new-app-readiness.md` |
| **Фаза 1 — `apps/unmute`** | ✅ инфраструктура готова; production + Redis + mail, регион `sin1` | `apps/unmute` (сгенерирован, `askHandle: false`, RU, флаги §3.1, временные бирюзовые токены), `.github/workflows/unmute.yml`; Vercel-проект `unmute` (`prj_qQFaxRe7iSRRv3XkthR089UAwraO`, Root Directory `apps/unmute`, файлы вне корня включены), домен `unmute99.vercel.app` (`unmute.vercel.app` занят другой командой) |
| Фаза 3.1 — модель контента | ✅ в `main` (PR #198) | `docs/unmute-content-model.md`, `apps/unmute/src/content/*` |
| Фаза 3.2 — DB content store | ✅ в `main` (PR #199) | `apps/unmute/lib/content-store.js`, `api/content.js`, `src/content/client.ts` |
| Фаза 3.2a — общий словарь | ✅ в `main` (PR #200) | `docs/unmute-lexicon.md`, `apps/unmute/src/lexicon/*`, `lib/lexicon-store.js`, `api/lexicon.js` |
| Фаза 3.3 — legacy importer | ✅ в `main` (PR #201) | `apps/unmute/lib/legacy-import.mjs`, `scripts/import-legacy-content.mjs` |
| Фаза 3.3a — Admin Content + paired release | ✅ в `main` (PR #202) | `lib/content-admin.js`, `lib/content-release.js`, `src/admin-content.tsx` |
| Фаза 3.3b — Lexicon editor | ✅ в `main` (PR #204) | draft CRUD, revision conflicts, `needs-review` workflow |
| Фаза 3.3c — normalized draft workspaces | ✅ в `main` (PR #205) | entity-level draft storage; immutable published snapshots stay unchanged |
| Фаза 3.3d — Course constructor | ✅ в `main` (PR #206) | roadmap browser + activity CRUD/reorder + progress compatibility |
| Фаза 3.3e — Sets + roadmap constructor | ✅ в `main` | multi-set CRUD, set metadata, node CRUD/reorder, selective paired releases |
| Фаза 3.3f — Whole-course lexical coverage | ✅ в `main` (PR #208) | 993 visible forms audited; exact forms/phrases/pronunciation/example metrics |
| Фаза 3.3g — Bulk AI lexicon | 🟡 PR в работе | copy/paste prompt → validate → preview → atomic draft apply; no model API |
| Фазы 2, 3.2–10 UnMute | ждут | §5 |

`apps/unmute` создан и задеплоен. Репозиторий `edkiy73/English` не трогаем — он только источник контента и алгоритмов (§1.1).

### 0.2. Правила работы

- Прочитать `CLAUDE.md` (корень), `docs/appbase-stack-ci-strategy.md` (ADR), этот план. FitTimer-специфичные правила `CLAUDE.md` относятся к `apps/fittimer`.
- Core (`packages/core`) не импортирует продукты и не содержит их названий/слов: `packages/core/tests/boundaries.js` падает даже на слово «FitTimer» в комментарии.
- Изменение Core/ui-react держит зелёными **все** приложения в том же PR. FitTimer на новые модули не переводится (ADR D3).
- Новые браузерные тесты ждут условий, а не времени (`waitForTimeout` запрещён, ADR D6).
- Один пункт плана = один PR; в конце PR обновить §0 и строку пункта в §5.

### 0.3. Как проверять (локально, до пуша)

```bash
# Core: typecheck, границы, runtime, document-sync, entitlements, billing, smoke
cd packages/core && npm ci && npm run check
# Task Mini: typecheck, smoke, unit; затем e2e на production-сборке с настоящим api/* в памяти
cd apps/task-mini && npm ci && npm run check && node tests/e2e.mjs
# Шаблон нового приложения (как в CI)
npm run starter:check
npm run app:create -- starter-check "Starter Check" com.example.startercheck en \
  && npm ci --prefix apps/starter-check && npm --prefix apps/starter-check run check; rm -rf apps/starter-check
# FitTimer: статика + unit/server, затем браузер (нужен playwright-core, в CI ставится отдельно)
cd apps/fittimer && npm ci && npm test
npm install --no-save playwright-core@1.55.0 && FIT_CHROME=/opt/pw-browsers/chromium npm test -- --browser
```

Тестовые серверы работают на памяти (`ALLOW_MEMORY_STORE=1`): `/api/auth` отдаёт `devCode`, поэтому вход по почте проверяется без почты. Пример — `apps/task-mini/tests/e2e.mjs` (сборка + `api/*` + два браузерных контекста + админка).

### 0.4. Следующий шаг: завершить фазу 1 (сделать может только владелец)

Сделано: `apps/unmute` сгенерирован и настроен, CI (`unmute.yml`), Vercel-проект `unmute` с доменом `unmute99.vercel.app`, слова и бренд UnMute запрещены в Core (`packages/core/tests/boundaries.js`).

Осталось в панели Vercel (у агента нет прав создавать базы Marketplace):
1. **База:** Vercel → Storage → Create → Upstash for Redis → имя `unmute` → Connect Project → `unmute` (все окружения). Интеграция сама добавит `KV_REST_API_URL`, `KV_REST_API_TOKEN` и др. Supabase пока не создаём (решение владельца).
2. **Секреты** в Vercel → Project `unmute` → Settings → Environment Variables (Production): `ADMIN_KEY` (новый, не как у FitTimer), `RESEND_API_KEY` (можно тот же, что у FitTimer; отправитель — `apps/fittimer/docs/setup-vercel.md`).
3. Redeploy production.

Проверка после этого: https://unmute99.vercel.app открывается без аккаунта, вход по почте приходит письмом, `https://unmute99.vercel.app/api/health` показывает хранилище `redis`, `#/admin` пускает по `ADMIN_KEY`.

Дальше — **фаза 3** (перенос контента и движка из `edkiy73/English`, §5); её можно делать параллельно, база для неё не нужна.

### 0.4a. Как устроена оплата (сделано в 0.8, нужно для фазы 6)

- Провайдер подключается адаптером `{id, testOnly?, checkout?({email, sku, product}) → {url}|{events}, verifyWebhook({headers, body, query}) → {ok, events}}`; адаптеры передаются в `createBillingHandler({adapters})` в `api/billing.js` продукта.
- Событие `{orderId, email, sku, status: paid|refunded|canceled, until?, autoRenew?}` применяет `applyBillingEvent`: идемпотентно по провайдеру+заказу+статусу, SKU только из каталога (`config/product.json → products`; подписка — `kind: "subscription", days`). `paid` → покупка навсегда (`acc.owned`) или Premium (`acc.sub` с `orderId`); `refunded` → забрать; `canceled` у подписки → выключить продление, оплаченный срок остаётся. Покупка до первого входа создаёт аккаунт.
- Журнал — `bill:log:YYYY-MM` (400 дней), без почты и номеров заказов; в админке вкладка «Платежи».
- Тестовый провайдер `test` работает только при `ALLOW_MEMORY_STORE=1` (в проде его нет — это проверено тестом).
- Открыто для фазы 6: провайдерам с подписью по «сырому» телу запроса (Stripe/Paddle) понадобится доступ к исходным байтам — проверить, как Vercel отдаёт тело в `api/*`, до подключения первого такого провайдера.

### 0.5. Подводные камни, уже найденные

- Документы scope `profile` сервер без Premium не синхронизирует вообще; бесплатные данные продукта — только scope `account` с `free:true`.
- Сервер синхронизации при равной ревизии с другого устройства принимает «последнее доставленное»; поэтому `document-sync` всегда шлёт `base`, иначе чужие правки теряются.
- В песочнице агента команды иногда временно блокируются; это не ошибка кода — повторить позже.
- Браузерные тесты FitTimer без `playwright-core` падают все за 0 с — это окружение, не регрессия.

---

## 1. Исходные данные

### 1.1. Что берём из English Trainer

| Что | Объём | Где в `index.html` |
|---|---|---|
| Уроки: теория (HTML) + карточки выбор/ввод | 32 урока, 452 карточки (+`MORE_CARDS`) | `LESSONS`, `MORE_CARDS`, `EX`, `FIX`, `ALT` |
| Речевые паттерны RU→EN (вслух или письменно) | 30 наборов | `PATTERNS` |
| Диалоги-сценки с проверкой ответа | 4 | `DIALOGS`, `PHRASE_RU` |
| Темы разговоров с ИИ (сейчас «скопируй промпт в Gemini») | 5 | `AI_TALKS`, `buildAiPrompt` |
| План на 40 дней | 40 дней | `PLAN` |
| Словарь для перевода по тапу | 577 слов | `DICT`, `openWord`, `findExamples` |
| Фразы, неправильные глаголы, теги | 9 / 40 / — | `PHRASES`, `VERBS`, `TAGS` |

Алгоритмы — главная ценность, переносятся с проверкой на совпадение:
- **проверка ответа**: нормализация, раскрытие сокращений, числа словами, необязательные и «мягкие» слова, Левенштейн, «почти правильно» (`norm`, `expand`, `canon`, `check`, `nearMiss`, `isFormPair`, `lev`);
- **интервальные повторения**: интервалы `INTERVALS`/`PINT`/`VINT`/`LINT`, дневные лимиты `PAT_CAP`/`VOC_CAP`/`LIS_CAP`, отдельные очереди карточек, паттернов, слов, аудирования;
- **план и серия**: день плана, завершённость урока, серия дней, пауза;
- **голос**: озвучка en-US и распознавание речи в паттернах и диалогах.

Прогресс — один JSON в `localStorage["eng-trainer-v2"]` (`srs, pat, voc, lis, err, words, dia, ai, rest, speed, day, streak, total, right, theme`). Есть экспорт/импорт в файл — через него семья перенесёт прогресс.

### 1.2. Что уже даёт AppBase (по `docs/new-app-readiness.md`)

`npm run app:create -- <slug> "<Name>" <reverse.domain.id> ru` создаёт приложение, в котором уже есть:

| Возможность | Откуда |
|---|---|
| React + TS + Vite + Router + Query + Zod + React Aria, алиасы Core | `templates/react-app` |
| Вход по коду на почту, сессия, выход, удаление аккаунта; необязательный вход; права аккаунта | Core `auth.ts` (`hasEntitlement`) + `@appbase/ui-react/auth` (`AuthGate`, `AuthProvider`, `useOptionalAuth`, `SignInForm`, `askHandle`) |
| Сервер аккаунта, синхронизации, здоровья | `packages/core/server/*` через `api/*` |
| Синхронизация: транспорт и локальная копия со слиянием | Core `sync-client.ts`, `document-sync.ts` (`createDocumentSync`, `startAutoSync`, `mergeRecordMaps`) |
| Защищённая админка `#/admin`: здоровье, аналитика, аккаунты, ошибки клиента, хранилище; слоты для своих разделов | Core `admin.ts` + `@appbase/ui-react/admin` |
| Аналитика установки, отчёт об ошибках, экран фатальной ошибки | Core `observability.ts` + `@appbase/ui-react/error-boundary` |
| Тема через токены | Core `ui.ts` |
| Vercel-конфиг, unit/smoke/e2e, CI на `packages/core/**` и `packages/ui-react/**` | стартер |

Кроме того в Core (не подключено в стартере, включается по флагам): ИИ-рантайм с реестром действий продукта и OpenRouter, уведомления и push, мост к нативному голосу `speech.ts`, выбор базы Upstash/Supabase.

### 1.3. Чего не хватало именно UnMute

Статусы: G1–G5 закрыты этапом 0 (0.1–0.7), G7 решён организационно, G6/G8/G9 — впереди.

| # | Пробел | Где решать | Почему |
|---|---|---|---|
| G1 | **`AuthGate` не пускает в приложение без входа.** UnMute должен учить сразу, аккаунт — чтобы сохранить прогресс и покупать | `packages/ui-react`: провайдер сессии с необязательным входом (`AuthProvider` + `useOptionalAuth`), `AuthGate` остаётся для приложений, которым вход обязателен | общий UI; Task Mini и стартер должны остаться зелёными |
| G2 | **Ник обязателен при первом входе** (`needsHandle` → шаг «придумай ник»). Сервер ник не требует — он только сообщает `needsHandle` | ui-react: настройка продукта «спрашивать ник при входе», по умолчанию **да** (FitTimer, Task Mini, стартер без изменений); UnMute ставит **нет** | решение владельца: не спрашивать только в UnMute |
| G3 | **Sync-клиент — только транспорт**: нет локальной копии с ревизиями, очереди без сети, слияния, повтора | ✅ сделано в Core (`document-sync.ts`) на двух потребителях сразу — Task Mini и будущий UnMute (решение владельца: этап 0) | общий механизм, проверен e2e на двух устройствах |
| G4 | **Без Premium сервер синхронизирует только бесплатные документы аккаунта**; документы профиля всегда платные | правка Core не нужна: прогресс UnMute — документы scope `account` с `free:true` в реестре | аккаунт и синхронизация бесплатны |
| G5 | **Нет покупок курса**: права = одно поле `acc.sub.until`, выдаётся только из админки | Core: `acc.owned` (купленное навсегда) рядом с `acc.sub`; отдача прав в `verify`/`status`; раздел админки «выдать/забрать» | `acc.sub` не меняется — Premium FitTimer не затронут |
| G6 | **Нет оплаты**: только настройки цен и флаги «ключ задан» | Core: модуль `billing` с адаптерами провайдеров и вебхуками; какой продукт что открывает — в приложении | стартер прямо относит billing к продукту; но проверка чеков и вебхуков — общая инфраструктура, делать её один раз |
| G7 | **Изоляция данных приложений.** Ключи хранилища не содержат имени приложения (`a:<hash>`, `s:<hash>`), таблица Supabase `appbase_kv` общая | **решение владельца: у каждого приложения своя база (свой Upstash, свой проект Supabase) и свой домен**; выбор движка — та же `APPBASE_STORE`, что у FitTimer. Префикс ключей в Core не нужен | два приложения никогда не пишут в одну базу |
| G8 | **Нативный аудио-плагин** (`FitAudio*`) живёт в `apps/fittimer/android|ios` | вынести в переиспользуемый пакет перед нативной сборкой UnMute | в вебе хватает Web Speech API |
| G9 | **i18n**: стартер генерируется с одной локалью | слой `t(key)` в приложении с первого экрана | чтобы потом добавить EN/UA и др. без переделки |

---

## 2. Решения владельца

Пункты 1–4 решены 2026-09-28.

| # | Вопрос | Предложение |
|---|---|---|
| 1 | Идентификатор приложения (не меняется после публикации в сторах) | ✅ `app.unmute.english` |
| 2 | Slug / папка / Vercel-проект | ✅ `unmute` → `apps/unmute` |
| 3 | База данных и домен | ✅ у каждого приложения своя база (свои проекты Upstash/Supabase) и свой домен; движок выбирается `APPBASE_STORE`, как у FitTimer |
| 4 | Ник при первом входе | ✅ не спрашивать — **только в UnMute**; остальным приложениям поведение по умолчанию не меняется |
| 5 | Вход до начала учёбы | не нужен: учиться сразу, аккаунт — для сохранения прогресса и покупок |
| 6 | Профили в аккаунте | выключены: один человек = один аккаунт |
| 7 | Бали в примерах | нейтрализовать отдельной задачей после переноса |
| 8 | Первый канал оплаты, цены, нарезка пакетов (§4) | до фазы 6 |
| 9 | Судьба репозитория `English` | после переноса семьи — заморозить, README со ссылкой на `apps/unmute` |

---

## 3. Устройство UnMute

### 3.1. Структура (поверх сгенерированного стартера)

```text
apps/unmute/
  config/product.json          name "UnMute: English for Expats", brand, features
  lib/product.js, app-analytics.js, app-sync-schema.js   (из стартера, наполняются)
  lib/unmute-entitlements.js   SKU → какие блоки курса открывает (фаза 5)
  lib/unmute-ai-actions.js     ИИ-действия (фаза 7)
  api/auth.js sync.js health.js admin.js   (из стартера)
  scripts/import-legacy-content.mjs        одноразовый перенос контента
  src/content/     JSON курса + Zod-схемы
  src/engine/      чистая логика: проверка ответов, повторения, план, серия
  src/progress/    локальный прогресс, слияние, синхронизация
  src/features/    экраны
  src/i18n/        ru.json
```

`features`: `profiles:false, premium:true, ai:true, notifications:true, voice:true, sharing:false, biometrics:false`.

### 3.2. Модули ядра в UnMute

| Модуль | Роль в UnMute |
|---|---|
| `auth.ts` + ui-react (с G1) | вход по почте, удаление аккаунта; экран «Аккаунт» |
| `storage.ts` | прогресс на устройстве, работа без сети |
| `sync-client.ts` + свой слой (G3) | прогресс на нескольких устройствах |
| `observability.ts` | события обучения и воронки покупки, ошибки |
| админка + свои разделы | права пользователей, контент/цены позже |
| ИИ-рантайм | ИИ-собеседник и разбор ошибок (Plus) |
| `notifications.ts`, `push.js` | напоминание о занятии и повторениях |
| `speech.ts` | голос в нативной сборке; в вебе — адаптер Web Speech с тем же интерфейсом |
| `ui.ts` | токены темы |

### 3.3. Контент

Одноразовый скрипт исполняет блок данных `English/index.html` и пишет JSON; дальше JSON — единственный источник.

```text
Unit    { id, title, access: 'free' | 'plus' | 'pack:<id>', lessonIds[] }   ← «кусок курса»
Lesson  { id, title, subtitle, theory (HTML из белого списка), cards[], tags[] }
Card    { kind: 'choice'|'type', prompt, ru, options?, answer, explain, alts? }
Pattern { id, title, items: [ru, en][] }
Dialog  { id, title, planDay, lines: {q, ru, task, accept[], answer}[] }
Talk    { id, planDay, title, topic, chips[], focus[] }
PlanDay { day, lessonIds[], goal, examples[] }
DictEntry { word, ru }
```

- Id уроков и индексы карточек сохраняются — от них зависит импорт старого прогресса (`srs["pres-simple#3"]`).
- Теория рендерится через санитайзер с белым списком тегов.
- Контентные тесты фиксируют объём (32 / 452 / 30 / 4 / 5 / 40 / 577) и целостность ссылок.
- Доступ задаётся полем `Unit.access`, а не в коде экранов.

### 3.4. Прогресс и синхронизация

Документы scope `account`, `free:true` (G4):

| Документ | Содержимое | Слияние |
|---|---|---|
| `progress:cards` | повторения карточек (`srs`) | по элементу, побеждает более поздний `at` |
| `progress:drills` | паттерны, аудирование, лексика, скорость | по элементу |
| `progress:words` | личный словарь | по элементу |
| `progress:journal` | день, серия, пауза, счётчики, ошибки, диалоги, ИИ-темы | серия и счётчики — максимум, остальное по `at` |
| `settings` | тема, перевод, голос, напоминания | по полю |

Свой слой над `sync-client.ts`: локальная копия с ревизией, отметка «изменено», отправка при появлении сети, при конфликте — pull, слияние по элементам, повторная отправка. Размеры — десятки КБ при лимите 3 МБ на документ.

Без аккаунта прогресс живёт только на устройстве. При первом входе локальный прогресс сливается с серверным, а не затирается.

Импорт старого прогресса: экран «Перенести из English Trainer» принимает файл экспорта `eng-trainer-v2`, валидирует Zod и раскладывает по документам.

---

## 4. Монетизация

### 4.1. Принципы
- Контент без себестоимости — **покупка навсегда** (пакет). ИИ и всё, что стоит денег при каждом использовании, — **только подписка** с месячным лимитом.
- Аккаунт и синхронизация бесплатны; потерять прогресс из-за неоплаты нельзя.
- Выученное не закрывается: повторения по открытым урокам работают всегда, в том числе после окончания подписки.

### 4.2. Уровни

| Уровень | Что открыто |
|---|---|
| **Бесплатно** | Дни 1–7 плана целиком, их паттерны и повторения, 1 диалог, перевод по тапу, голосовые дриллы, серия, напоминания, 1 пробная беседа с ИИ |
| **Пакет навсегда** | Тематический блок: уроки + паттерны + диалоги + повторения |
| **Весь курс навсегда** | Все текущие пакеты со скидкой |
| **UnMute Plus** (месяц/год) | Все пакеты, пока подписка активна; ИИ-собеседник по темам плана; разбор ошибок ИИ; новые пакеты по мере выхода |

Нарезка текущих уроков (предложение):

| Пакет | Уроки | Доступ |
|---|---|---|
| Старт | `abc`, `mech`, `pres-simple`, `pres-cont`, `past-simple` | бесплатно |
| Основа грамматики | `pres-perf`, `future`, `questions`, `contr`, `articles`, `there`, `prep-time`, `compare` | пакет |
| Модальные и вежливость | `haveto`, `cancould`, `should`, `would`, `supposed`, `perfmodal`, `cond`, `hedge` | пакет |
| Живая речь | `survival`, `mistakes`, `get`, `caus`, `prep-verb`, `put`, `colloc`, `linkers`, `relative`, `story`, `about-me` | пакет |
| Жизнь экспата (новый контент) | аренда, банк, врач, визы, соседи, мастера, школа | отдельные пакеты — основной доход от покупок |

### 4.3. Где появляется предложение
1. Карта плана: день 8 с замком → экран пакета.
2. ИИ-разговор после пробной беседы → Plus.
3. Экран «Неделя пройдена».
4. «Аккаунт → Мои покупки / Восстановить покупки».

Не во время урока и дрилла, не чаще раза в день вне этих мест.

### 4.4. Каналы оплаты

| Канал | Провайдер |
|---|---|
| Android | Google Play Billing (подписка + разовые), RuStore — опционально |
| iOS | App Store IAP |
| Web, зарубежные карты | Merchant of Record (Paddle / Lemon Squeezy) — проверить, примут ли владельца продавцом |
| Web, российские карты | ЮKassa |

Начать с одного канала (решение 8), остальные — по одному PR на провайдера.

---

## 5. Фазы

Каждая фаза — отдельный PR; CI зелёный для Core, ui-react, FitTimer, Task Mini и UnMute.

### Этап 0 — Task Mini как эталонное приложение (до генерации UnMute)

Решение владельца: всё общее, что вскрыл UnMute, сначала закрепить в Core / ui-react / стартере и показать на Task Mini. Тогда UnMute (и любое следующее приложение) получает это из генератора, а не изобретает внутри себя.

Критерий, что идёт в этап 0: механизм нужен **любому** приложению и не содержит слов конкретного продукта. Контент, движок обучения, пакеты курса — остаются в UnMute.

| # | Что | Где | Как проявится в Task Mini | Закрывает |
|---|---|---|---|---|
| 0.1 | ✅ Необязательный вход: `AuthProvider` + `useOptionalAuth` (сессии может не быть), `SignInForm` как отдельный экран; `AuthGate` — обёртка поверх с прежним поведением | `packages/ui-react/auth` | задачи работают без аккаунта; «Войти» → `#/account` | G1 |
| 0.2 | ✅ `askHandle` (по умолчанию `true`) у `AuthGate`/`SignInForm`; `claimHandle()` в контексте — задать ник позже | `packages/ui-react/auth` | Task Mini оставляет `true`; тесты покрывают оба режима | G2 |
| 0.3 | ✅ Core `document-sync.ts`: локальная копия с ревизиями и отметкой изменений, pull → слияние продукта → push с `base`; сервер принимает запись, только если ревизия не изменилась, иначе возвращает `stale` → повтор; `startAutoSync` (после изменений, при появлении сети, при возврате в приложение); `mergeRecordMaps` — слияние по элементам с «надгробиями» | Core client + `sync-core.js` (поле `base` необязательное, клиенты без него работают как раньше) | задачи синхронизируются между устройствами; e2e «два устройства» | G3 |
| 0.4 | ✅ Первый вход с локальными данными: данные устройства сливаются с аккаунтом, не затираются (в том числе при входе в другой аккаунт; `clear()` — для приложений, которым это не нужно) | Core (0.3) | e2e «создал задачи без аккаунта → вошёл → задачи на месте и на втором устройстве» | G3 |
| 0.5 | ✅ Бесплатная синхронизация: данные продукта — документ аккаунта с `free:true` | `lib/app-sync-schema.js` Task Mini | без Premium задачи синхронизируются | G4 |
| 0.6 | ~~Префикс ключей хранилища~~ — **отменено**: у каждого приложения своя база и свой домен (решение владельца, см. G7) | — | — | G7 |
| 0.7 | ✅ Права аккаунта: `acc.owned` (покупки навсегда) рядом с `acc.sub` (Premium); Core `server/entitlements.js` (`hasPremium`, `hasOwned`, `grantOwned`, `revokeOwned`); `verify`/`status` отдают `owned`; клиент `session.owned` + `hasEntitlement(session, sku)`; `AuthProvider` обновляет права при запуске, `refresh()`; каталог SKU продукта — `config/product.json → products`; админка: действия `user_owned`, `products_list`, на вкладке «Пользователи» — выдача/отзыв покупки и Premium, колонка «Покупки» | Core server + `auth.ts` + ui-react | «Экспорт задач» (SKU `export`) открывается правом, выданным в общей админке; e2e проходит это в браузере | G5 |
| 0.8 | ✅ Каркас оплаты: адаптер провайдера, вебхук с подписью, идемпотентность, журнал; тестовый провайдер только на памяти (§0.4a) | Core `billing.js`/`billing.ts`, ui-react «Платежи» | «Купить экспорт» → право сразу; повтор вебхука ничего не меняет; возврат забирает; e2e в браузере | G6 (каркас) |
| 0.9 | ✅ Язык интерфейса: `I18nProvider` + `t()` + `LanguagePicker` в ui-react, словари в приложении; языки — `config/product.json → i18n.locales`; один язык = переключателя нет (решение владельца: переключение по желанию каждого приложения); выбор хранится на устройстве, по умолчанию — язык системы | ui-react, Task Mini | Task Mini на RU/EN, e2e переключает язык | G9 |
| 0.10 | ✅ Шаблон нового приложения получает всё из этапа 0: необязательный вход, `auth.askHandle`, `document-sync` (язык хранится в бесплатном документе `settings`), права и `api/billing.js`, i18n; e2e шаблона на настоящих `api/*` | `templates/react-app`, `scripts/create-app.mjs` | CI генерирует свежее приложение и прогоняет его проверки | — |

Не входит в этап 0 (делается вместе с UnMute, чтобы не строить механизм без реального потребителя): реальные провайдеры оплаты, ИИ-действия, уведомления, вынос нативного аудио-плагина (G8).

Этап 0 завершён: 0.1–0.5 (PR #192), 0.7 (PR #193), 0.8 (PR #194), 0.9–0.10. Шаблон `templates/react-app` отдаёт новому приложению всё из этапа 0. FitTimer в этапе 0 не переводится на новые модули (ADR D3) — только остаётся зелёным.

### Фаза 1 — Генерация приложения и деплой (после этапа 0)
- `npm run app:create -- unmute "UnMute: English for Expats" app.unmute.english ru`.
- `product.json`: короткое имя «UnMute», флаги §3.1, временные токены бренда.
- Свой workflow для e2e по образцу `task-mini.yml` (пути `apps/unmute/**`, `packages/core/**`, `packages/ui-react/**`).
- Vercel-проект `unmute`: Root Directory `apps/unmute`, «Include files outside the root directory», своя база (Upstash и/или Supabase, `APPBASE_STORE`) и свой домен по решению 3, почта, `ADMIN_KEY`.
- Готово: превью открывается, вход по почте работает, `#/admin` защищена, `npm run check` зелёный.

### Фаза 2 — Вход в UnMute
- Необязательный вход и экран `#/account` приходят из шаблона; в UnMute — `auth.askHandle: false` и место предложения войти (сохранить прогресс).

### Фаза 3 — Контент и движок
- ✅ 3.1 Модель контента зафиксирована в `docs/unmute-content-model.md`: независимые покупаемые Set, у каждого свой roadmap; несколько сетов можно проходить параллельно; глобального уровня пользователя нет.
- ✅ 3.1 Каркас Zod: `Set → Roadmap → Node → Activity`, стабильные ID, revisions, prerequisites, независимые activity-типы; free preview первого сета = `dayIndex <= 7`, уже изученное остаётся доступно для повторений.
- 3.2 Контент хранится в серверной БД, не внутри приложения: отдельный versioned content-store (`draft → validate → immutable publish revision`), публичный API отдаёт только published; клиент кэширует последнюю revision локально для офлайна. Legacy-importer пишет первый сет `general-foundation` сразу в БД.
- 3.2a Общий словарь приложения: `Lexeme → forms → senses → examples`, стабильные ID, без runtime-угадывания форм/значений; course activities могут явно фиксировать `lexemeId/senseId`. Словарь хранится и версионируется в БД отдельно от сетов.
- 3.3 Одноразовый importer legacy `English/index.html`: применяет `EX/MORE_CARDS*/FIX/ALT`, собирает `general-foundation` и общий lexicon, проверяет контрольные объёмы, загружает draft в БД; `--publish` выпускает immutable revisions. Неоднозначные `;`-значения словаря маркируются `needs-review`, а старый динамический поиск примеров не переносится.
- 3.3a Admin → «Контент»: детерминированный import legacy в draft, отчёт, очередь `needs-review`, отдельный Publish. Курс и lexicon публикуются только как единый paired release: сначала создаются обе immutable revisions, затем одним release pointer становятся видимы пользователям; одиночный publish через `/api/content`/`/api/lexicon` запрещён.
- 3.3b Lexicon editor: Admin редактирует senses/переводы/части речи в draft, добавляет/удаляет значения, явно снимает `needs-review`; optimistic revision check защищает от потери изменений между вкладками. Повторный legacy-import не может молча затереть ручной draft — нужен явный overwrite.
- 3.3c Draft storage для конструктора нормализован: activity/lexeme/node живут как отдельные immutable entity revisions, а draft pointer хранит только ссылки и порядок. Старые монолитные production drafts читаются и лениво мигрируют при первой правке. Publish по-прежнему собирает и валидирует цельный immutable snapshot.
- 3.3d Course constructor в Admin: просмотр roadmap/day nodes, список activity в фактическом порядке, создание activity любого поддерживаемого типа, редактирование, reorder, detach без уничтожения reusable entity, явный `preserve/reset` прогресса. Существующей activity запрещено менять `id/type`; существенная смена типа создаётся как новая сущность.
- 3.3e Конструктор больше не привязан к `general-foundation`: из Admin можно создать новый Set, задать CEFR/access/free preview, добавить/редактировать/переставить roadmap nodes и редактировать activities внутри выбранного Set. Release выбирает конкретные draft-сеты и сохраняет уже опубликованные сеты нетронутыми.
- 3.3c Полный lexical coverage: publishable content должен иметь аудит всех видимых English forms, explicit forms без runtime stemming, pronunciation/example/context coverage; Phrase Bank и irregular verbs считаются отдельными reference resources, а не случайными UI-константами. Bulk AI paste — основной способ массового обогащения, single-entry editor только для коррекции.
- 3.4 `src/engine/`: проверка ответа, повторения, лимиты, план, серия — чистый TS.
- 3.5 **Эталонные тесты**: старые функции из `index.html` прогоняются в Node на наборе ответов (верные, сокращения, опечатки, «почти»), новый движок обязан совпасть на 100%.
- 3.6 Конструктор контента в Admin строится поверх той же модели: редактирование Set/Roadmap/Node/Activity, drag&drop, publish revision и явный выбор preserve/reset прогресса при существенном изменении упражнения.

### Фаза 4 — Новый интерфейс
- Дизайн с нуля: палитра, типографика, компоненты на React Aria; вся копия через `t(key)`.
- Экраны: знакомство (уровень, где живёшь, цель, минут в день) → **Сегодня** → **Карта курса** → **Урок** → **Дрилл** (ввод/голос) → **Повторения** → **Диалоги** → **Слова** → **Прогресс** → **Аккаунт**.
- Голос в вебе: адаптер Web Speech под интерфейс `speech.ts`; если браузер не умеет распознавание — ввод текстом.
- e2e: «первый день без аккаунта», перезагрузка, работа без сети после загрузки.

### Фаза 5 — Прогресс в аккаунте и перенос семьи
- Реестр документов §3.4 (клиент + `lib/app-sync-schema.js`) и правила слияния по элементам поверх `document-sync` из этапа 0.
- Импорт файла `eng-trainer-v2`.
- Права (`acc.owned`, админка «Права») — из этапа 0.7; в UnMute — только карта SKU → блоки курса.
- Замки по `Unit.access` + правам; экраны пакета и Plus пока без оплаты.
- Семье выдать полный доступ из админки.
- e2e: «два устройства — один прогресс», «импорт старого файла», «вход с локальным прогрессом».

**Здесь готов запуск для семьи (MVP).**

### Фаза 6 — Оплата (G6)
- Контракт `billing` — из этапа 0.8 (§0.4a); здесь — реальный адаптер первого канала (решение 8), включение провайдеров в админке; оферта, политика конфиденциальности, возвраты — до включения в проде.

### Фаза 7 — ИИ-собеседник (Plus)
- `lib/unmute-ai-actions.js`: `talk.reply`, `talk.review`, `answer.explain`; лимиты и журнал — Core `ai-endpoint`; доступ по `acc.sub`, одна пробная беседа.
- Голосом: распознавание → ИИ → озвучка.

### Фаза 8 — Напоминания
- Ежедневное напоминание, «есть повторения», «серия под угрозой» через Core `notifications`/`push`.

### Фаза 9 — Android/iOS
- Вынести аудио-плагин FitTimer в общий пакет (G8) без смены имён `Fit*` для FitTimer; зелёный FitTimer Android/iOS CI.
- Capacitor-оболочки UnMute, покупки в сторах (адаптеры фазы 6).

### Фаза 10 — Запуск
- Воронка: `onboarding_done`, `lesson_completed`, `day_completed`, `paywall_shown{place}`, `purchase_started/completed{sku}`, `talk_started`.
- Страницы в сторах; нейтрализация контента «про Бали» (решение 7); заморозка репозитория `English`.

---

## 6. Риски

| Риск | Что делаем |
|---|---|
| Новый движок иначе проверяет ответы | эталонные тесты фазы 3 |
| Правка ui-react ломает Task Mini/стартер | `AuthGate` сохраняет поведение; CI уже проверяет свежесгенерированный стартер |
| Общая база с FitTimer смешает аккаунты | у каждого приложения своя база (решение 3) |
| Этап 0 затянется и отложит UnMute | в этап 0 только механизмы, нужные любому приложению; провайдеры оплаты, ИИ, натив — вне его |
| `acc.owned` задевает Premium FitTimer | `acc.sub` не трогаем; регрессия Premium в CI |
| Слияние прогресса теряет данные при первом входе | слияние по элементам, e2e «вход с локальным прогрессом» |
| Web Speech есть не везде | всегда ввод текстом; нативное распознавание — фаза 9 |
| ИИ съедает бюджет | только Plus, лимиты Core, одна пробная беседа |
