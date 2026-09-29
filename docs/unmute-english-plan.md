# UnMute: English for Expats — план слияния с AppBase Core

Статус: **согласован по пп. 1–4 §2** (2026-09-28). **Этап 0 завершён** (PR #192–#195). **Фаза 1:** `apps/unmute` создан и задеплоен в Vercel → https://unmute99.vercel.app; Upstash Redis и почта подключены, Functions переводятся в Singapore (`sin1`). Раздел §0 — точка входа для любого исполнителя (человека или ИИ-агента), который продолжает работу.

Продукт — первое настоящее «App2» из [ADR по стеку](./appbase-stack-ci-strategy.md). Источник логики — репозиторий `edkiy73/English` (семейное приложение «English Trainer», один `index.html` ~4,6 тыс. строк, сборка `2026-09-04.17`; с тех пор не менялся). Интерфейс оттуда **не переносится**: берём контент и алгоритмы, интерфейс делаем с нуля.

---

## 0. Как продолжить работу

Этот раздел поддерживается актуальным: **каждый PR по плану обновляет §0 и статус своего пункта в §5**.

### 0.1. Где мы сейчас (2026-09-29)

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
| Фаза 3.3g — Bulk AI lexicon | ✅ в `main` (#209) | copy/paste prompt → validate → preview → atomic draft apply; no model API |
| Фаза 3.3h — exact form identity | ✅ в `main` (#213) | stable `formId`, homographs like `read/read`, context can pin exact grammatical form |
| Фаза 3.3i — legacy reference resources | ✅ в `main` (#212, #214) | `phrase-collection` + `verb-table`, both backed by global lexicon refs |
| Фаза 3.4a — answer normalization | ✅ в `main` (#215) | legacy `norm/expand/canon` port + parity tests |
| Фаза 3.4b — answer check | ✅ в `main` (#216) | optional words + movable time expressions + legacy `check()` parity |
| Фаза 3.4c — near miss | ✅ в `main` (#217) | legacy `lev/isFormPair/nearMiss`; new lexicon supplied through callback |
| Фаза 3.4d — card SRS | ✅ в `main` (#218) | `[0,1,3,7,16,35]`, box/due, learned threshold parity |
| Фаза 3.4e-1 — practice SRS | ✅ в `main` (#219) | drill/speaking/listening intervals + box/due parity |
| Фаза 3.4e-2 — practice review queue | ✅ в `main` (#220) | caps 3/2/2, oldest-due-first, deterministic waiting summary |
| Фаза 3.4f — course progress | ✅ в `main` (#221) | explicit practice modes + node completion policy + streak/current roadmap day |
| Фаза 3.4g — learner progress + sync | ✅ в `main` (#222) | per-set course/stats docs + global personal lexicon + conflict-safe merge + review summary + synced progress actions |
| Фаза 3.4h — legacy progress migration | ✅ в `main` (#223) | `eng-trainer-v2` → stable activities/practice/stats/words/manual days; ambiguity report; timezone due correction |
| Фаза 3.5 — frozen legacy parity | ✅ в `main` (#225) | pinned English snapshot; real legacy functions vs new answer/SRS/queue engine in CI |
| Фаза 4a — learner course loader | ✅ в `main` (#226) | `src/course-loader.ts`: published Set → cached fallback → local-first progress → current roadmap node |
| Фаза 4b — React/Query course runtime | ✅ в `main` (#227) | `src/course-runtime.tsx`: shared screen state + separate content/progress queries + live document-sync invalidation |
| Фаза 4c — Today learner shell | ✅ в `main` (#228) | `src/today.tsx`: loading/error/offline/current day/current node/course completion over live runtime |
| Фаза 4d — basic activity runner | ✅ в `main` (#229) | `src/learn.tsx` + `activity-progress.ts`: node session, theory/choice/text/translation, local-first save + SRS/stats |
| Фаза 4e-1 — pattern speed drill | ✅ в `main` (#230) | `src/pattern-drill.tsx`: legacy-style timed self-rating, 70% threshold, drill SRS + speed metric |
| Фаза 4e-2a — pattern listening | ✅ в `main` (#231) | `src/pattern-listening.tsx` + browser TTS: 6 phrases, 3 meanings, 70% threshold, listening SRS |
| Фаза 4e-2b — pattern speaking | ✅ в `main` (#232) | `src/pattern-speaking.tsx` + Web Speech recognition: max 6 phrases, legacy loose matcher, manual fallback, speaking SRS |
| Фаза 4e-3 — dialogue runner | ✅ в `main` (#233) | `src/dialogue.tsx`: partner TTS, text/voice answer, legacy check+loose matcher, score persistence |
| Фаза 4f-1 — interval review session | ✅ в `main` (#234) | cards (cap 30) + pattern drill/listening/speaking (3/2/2), pinned session, wrong cards return to the end |
| Фаза 4f-2 — personal word review | ✅ в `main` (#235) | `progress:words` + published lexicon: cap 20, translation → reveal English → remembered/forgot, word SRS |
| Фаза 4f-3 — mixed drill | ✅ в `main` (#236) | 10 shuffled phrases from ≥3 learned patterns; exact legacy eligibility; no SRS/metric writes |
| Фаза 4g — course map | ✅ в `main` (#237) | full 40-day roadmap skeleton, completed/current/prerequisite/purchase states, preview-safe paid nodes |
| Фаза 4h — clickable lexicon | ✅ в `main` (#238) | every English token in learner content opens one shared dictionary sheet; exact refs when available; no Add/SRS write on click |
| Фаза 4i — learner progress | ✅ в `main` (#239) | real persisted course/learning/SRS/answer/latest-performance data only; empty state instead of decorative zeroes |
| Фаза 4j — minimal onboarding | ✅ в `main` (#240) | one short screen, no questionnaire/account gate, synced done flag, existing/imported learners skip, Start → Day 1 |
| Фаза 5a — entitlements + access offer | ✅ в `main` (#241) | owned SKU or active Plus unlocks full set; day 8+ opens offer screen; learned paid activities remain reviewable after access ends |
| Фаза 5b-1 — two-device progress e2e | ✅ в `main` (#245) | anonymous day 1 + anonymous day 2 on separate devices → same account → per-record merge → both devices converge |
| Фаза 5b-2 — legacy progress file import | ✅ в `main` (#246) | Account imports `english-trainer-*.json` by merge, timezone due correction, ambiguity report, signed-in sync |
| Фаза 7a — AI talk contract | ✅ в `main` (#242) | server-built `talk.reply` prompt, strict JSON protocol, Core quota/logging, typed client |
| Фаза 7b — text AI conversation runner | ✅ в `main` (#243) | ai-conversation activity UI, server-built opener, typed turns, corrections/notes, sign-in/Plus gates, seen-on-finish |
| Фаза 7c-1 — talk.review contract | ✅ в `main` (#248) | server-built whole-conversation review, strict strengths/corrections/focus JSON, typed Plus client |
| Фаза 7c-2 — talk.review UI | ✅ в `main` (#249) | finish with learner turns → strengths/corrections/focus screen; review failure never blocks activity completion |
| Фаза 7d-1 — answer.explain | ✅ в `main` (#250) | wrong graded answer → opt-in Plus/light explanation; strict server-built why/tip JSON; no SRS mutation |
| Фаза 7d-2 — one free AI conversation | ✅ в `main` (#251) | one account-bound text conversation, 24h session / max 10 model calls, then Plus; answer.explain stays Plus-only |
| Фаза 7e — AI conversation voice | ✅ в `main` (#252) | Web Speech learner turn → same typed AI contract → automatic partner TTS; text fallback always available |
| Фаза 8a — notification policy + preferences | ✅ в `main` (#253) | max one reminder: due review > streak risk > daily lesson; synced opt-in/time/type settings |
| Фаза 8b — native reminder delivery | ✅ в `main` (#255) | Core native-notifications local schedule, explicit permission, `/review`/Today deep links; web/push intentionally not faked |
| Фаза 9a-1 — native speech boundary | ✅ в `main` (#256) | UnMute learner voice routes through Core speech when dedicated `UnMuteAudio` exists; Web Speech fallback otherwise; FitTimer command plugin explicitly rejected |
| Фаза 9a-2a — Android shell + UnMuteAudio | ✅ в `main` (#257) | Capacitor 8 Android shell; system SpeechRecognizer (3 alternatives) + Android TTS; native notifications plugin; Android debug build in CI |
| Фаза 9a-2b — iOS shell + UnMuteAudio | ✅ в `main` (#258) | Capacitor 8 iOS SPM shell; SFSpeechRecognizer (top 3 alternatives) + AVSpeechSynthesizer; speech/mic permissions; iOS simulator build in CI |
| Фаза 9a-3 — native device launch smoke | ✅ в `main` (#259) | Android headless emulator installs/launches debug APK; iOS simulator installs/launches built app; process stays alive after launch |
| Фаза 10a — launch funnel analytics | ✅ в `main` (#260) | onboarding/lesson/day/paywall/talk events wired; purchase event taxonomy reserved until deferred payment phase |
| Фаза 5c — готовность production | ✅ в этом PR | импорт `general-foundation` даёт 100% покрытие словаря (`lib/legacy-lexicon-supplement.mjs`, 993/993 слов, 0 неоднозначных), `scripts/import-legacy-content.mjs` падает при неполном покрытии и публикует через `content_publish`; `scripts/check-production.mjs` + workflow `unmute-production.yml`; админка грузится лениво (`src/admin-screen.tsx`) |
| Фазы 6, 10 (сторы), нейтрализация «Бали» | ждут | §5 |

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

### 0.4. Следующий шаг: запуск для семьи (MVP)

Состояние production (2026-09-29, `/api/health`): Redis подключён, регион `sin1`; **курс и словарь не опубликованы** (`/api/content` → `sets:[]`, `/api/lexicon` → `404`) — до фазы 5c публикация честно отказывала (`lexical_coverage_incomplete`: 472 слова без записи, 32 неоднозначных). Почта идёт с тестового отправителя Resend (`onboarding@resend.dev`) — такие письма доходят только владельцу аккаунта Resend. ИИ-провайдер не настроен.

Шаги (после merge фазы 5c и деплоя):
1. **Контент** (владелец или агент с доступом к `unmute99.vercel.app`): `#/admin` → «Контент» → «Импорт из English» (при существующем черновике — с перезаписью) → при желании «IPA bootstrap» → «Опубликовать». Или из терминала: `ADMIN_KEY=… node scripts/import-legacy-content.mjs --publish`. Проверка — workflow «UnMute — production readiness» зелёный.
2. **Почта** (только владелец): подтвердить свой домен в Resend и задать отправителя (как у FitTimer, `apps/fittimer/docs/setup-vercel.md`), redeploy.
3. **Семья:** выдать `course.general-foundation` в `#/admin` → аккаунты; контрольный проход телефон + компьютер: день 1 → вход → импорт старого файла.
4. **ИИ (Plus):** провайдер и лимиты в Vercel/админке (ключи — владелец).

`ADMIN_KEY` должен быть длинным случайным значением; если ключ где-то засветился — сменить в Vercel и redeploy.

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
| 10 | Поведение слов в учебном контенте | ✅ все английские слова нажимаемы для мгновенного словарного popup; отдельной кнопки/действия «добавить слово» нет. Клик сам по себе не создаёт запись SRS. `progress:words` нужен для уже существующего/импортированного word-review состояния |
| 11 | Первый запуск / onboarding | ✅ максимально короткий: **один экран** с тремя тезисами (говорить вслух, нажимаемые слова, интервальные повторы); без вопросов про уровень, страну, цель и минуты. Аккаунт не нужен. Уже имеющий реальный/импортированный course progress onboarding не видит |
| 12 | Полный доступ к курсу | ✅ `course.general-foundation` навсегда **или** активный Premium/UnMute Plus открывают весь set. После окончания доступа новые платные дни снова закрыты, но серверно подтверждённые уже изученные activities продолжают приходить для Review |
| 13 | Реальная оплата | ⏸ отложена владельцем: сейчас не подключаем checkout/store/web billing. Для разработки права выдаём через Admin; вернуться к провайдерам оплаты позже |

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

- Legacy `lessonId#index` используется только как входной ключ миграции. Runtime-прогресс хранится по новым стабильным activity IDs; старый индекс после импорта не является identity.
- Теория рендерится через санитайзер с белым списком тегов.
- Контентные тесты фиксируют объём (32 / 452 / 30 / 4 / 5 / 40 / 577) и целостность ссылок.
- Доступ задаётся полем `Unit.access`, а не в коде экранов.

### 3.4. Прогресс и синхронизация

Документы scope `account`, `free:true` (G4), подробно — `docs/unmute-progress-model.md`:

| Документ | Содержимое | Слияние |
|---|---|---|
| `progress:course:<setId>` | seen activities, card SRS, drill/listening/speaking SRS, manual roadmap days, learning days, metrics | по стабильной сущности, newer `at`; tombstones |
| `progress:stats:<setId>` | per-device + activity answer buckets | по bucket; агрегирование без потери офлайн-ответов другого устройства |
| `progress:words` | общий личный словарь по `lexemeId+senseId` | по lexeme+sense; tombstones |
| `settings` | язык, `onboardingDoneAt` и будущие настройки | документ настроек; поля merge-ятся отдельно, чтобы locale не затёр завершённый onboarding |

Локальная копия и конфликтный pull → merge → push уже работают через Core `document-sync.ts`. Без аккаунта состояние остаётся на устройстве; при первом входе локальные документы сливаются с серверными.

Импорт `eng-trainer-v2` уже переносит legacy IDs в стабильные activity/lexicon refs, исправляет старый timezone shift due-дней и отдельно сообщает неоднозначные слова/ссылки вместо угадывания.

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
- ✅ Сделано в фазе 1 + 4j: вход необязателен, `auth.askHandle: false`, «Аккаунт» предлагает войти, чтобы сохранить прогресс.
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
- ✅ **4a. Loader учебного состояния:** published Course Set загружается через `content/client` (с локальным snapshot-cache для офлайна), прогресс читается из локального mirror `document-sync`, `course-loader.ts` вычисляет default roadmap и `currentNode/currentDayIndex`. UI в этом шаге не меняется.
- ✅ **4b. React/Query runtime:** `LearnerCourseProvider` монтируется в пользовательском приложении и даёт всем будущим экранам одно состояние курса. Published content и локальный progress — разные query, поэтому каждое сохранение ответа не дёргает `/api/content`; изменения `document-sync` (local/remote) инвалидируют только progress query и сразу пересчитывают current node.
- ✅ **4c. Каркас «Сегодня»:** домашний экран впервые читает learner runtime и показывает загрузку/ошибку, офлайн snapshot, текущий день и node, число заданий, общий прогресс и завершение курса. Сам запуск/прохождение Activity остаётся следующим отдельным шагом.
- ✅ **4d. Базовый runner Activity:** «Сегодня» открывает закреплённый roadmap node; runner возобновляет первое непройденное activity, умеет theory/choice/text-input/translation, использует новый answer-check, сохраняет card SRS + learning day + per-device stats локально до sync. Сложные speaking/pattern/listening/dialogue/review/AI пока честно не помечаются выполненными.
- ✅ **4e-1. Pattern drill без распознавания речи:** перенесён legacy speed drill: время чтения зависит от длины фразы, затем 5 секунд на произнесение, пользователь сам подтверждает «сказал так же / не так», ошибочная фраза может вернуться в конец подхода. Итог проходит при ≥70%, сохраняется в `practice.drill` через тот же legacy-parity SRS и в `metrics['speed:<activityId>']`. Listening и speech-recognition остаются в 4e-2.
- ✅ **4e-2a. Pattern listening:** после успешного drill runner продолжает тем же pattern activity в режим «На слух»: до 6 фраз, английский эталон озвучивается Web Speech TTS (`en-US`), выбор из 3 русских значений собран из реального pattern-контента, порог успеха ≥70%. Результат сохраняется в `practice.listening` теми же legacy-parity интервалами; после перезапуска pattern возобновляется с первого ещё не начатого режима. Speaking/recognition остаётся отдельным 4e-2b.
- ✅ **4e-2b. Pattern speaking:** Web Speech Recognition слушает `en-US` с тремя альтернативами, результат сравнивается тем же legacy `looseSame` правилом (служебные `a/an/the/to/of` игнорируются, достаточно ≥70% слов цели). Есть повторный тап для остановки, понятные ошибки permission/no-speech/network/unsupported, «Показать ответ» и ручное «Всё же засчитать». До 6 фраз, итог ≥70% сохраняется в `practice.speaking`; matcher добавлен в frozen legacy parity.
- ✅ **4e-3. Dialogue runner:** перенесён реальный legacy flow диалогов: реплика партнёра автоматически озвучивается, ответ можно написать или сказать, проверка использует `check()` + тот же `looseSame` для голосовых альтернатив, затем показывается/озвучивается эталон. Итоговый процент сохраняется как `dialogue-score:<activityId>`, activity помечается `seen` и день — learning day; порог 70% влияет на подсказку/повтор, но как и в legacy завершённый диалог считается пройденным независимо от результата.
- ✅ **4f-1. Единый интервальный повтор курса:** «Сегодня» показывает due-очередь до нового материала. Сессия фиксируется при входе и объединяет карточки (до 30, oldest-due-first) и уже изученные pattern-режимы с legacy caps `drill 3 / listening 2 / speaking 2`. Неверная карточка падает в box 0 и возвращается в конец текущего подхода до правильного ответа; practice-mode проходит один due-заход и сохраняет свой SRS. Tombstones и будущие due не попадают в очередь. Слова остаются отдельным 4f-2.
- ✅ **4f-2. Личные слова в Review:** `progress:words` теперь живой query с document-sync invalidation и опубликованным lexicon snapshot. В общий pinned Review после карточек/паттернов добавляются до 20 due-слов: сначала перевод, затем раскрытие английской lemma + TTS, после чего «Вспомнил / Не вспомнил» применяет legacy word SRS `[0,2,6,16,35]`. Неверное слово не зацикливается в текущем подходе, но остаётся due для следующего — как в legacy. Сегодня учитывает due-слова в общем счётчике; устаревшие lexeme/sense ссылки не угадываются. Новых записей SRS по клику не создаём: по решению владельца все слова в учебном контенте просто нажимаемы для перевода; отдельного «добавить слово» не будет.
- ✅ **4f-3. Смешанный дрилл:** доступен после минимум трёх изученных pattern (`practice.drill.box > 0`), как frozen legacy `studiedPatterns()`. В мешок попадают фразы всех таких pattern, случайно выбираются 10, затем используется тот же 5-секундный speed-drill с возвратом неверной фразы в конец. Mixed-заход намеренно не меняет `practice.drill`, due-даты или speed metrics — frozen legacy также пропускает `gradePat()`/`S.speed` при `mixed=true`.
- ✅ **4g. Карта курса:** отдельный `/course` показывает полный roadmap из 40 дней с состояниями `пройден / текущий / доступен / сначала предыдущий / нужен полный курс`; доступные и пройденные дни можно открыть существующим runner. Preview API больше не обрезает карту до 7 дней: дни 8–40 приходят только безопасным skeleton без `activityIds`/completion и без платного контента. После day 7 `Today` больше не считает курс завершённым и не предлагает открыть day 8 без entitlement — вместо этого ведёт на карту. Paywall остаётся фазе entitlements.
- ✅ **4h. Нажимаемые английские слова:** один `LexiconProvider` загружает опубликованный lexicon через существующий offline cache и обслуживает все learner-экраны. Любой English token в теории, карточках, паттернах, listening/speaking/dialogue, Review, Today и карте можно нажать: открывается общий bottom-sheet с переводом, IPA/русским чтением и примерами, если они есть; слово автоматически можно прослушать. `lexiconRefs` используются как точный context/sense, когда контент его задаёт; при неоднозначности UI показывает варианты и не угадывает. Неизвестное слово всё равно кликабельно и озвучивается. Клик никогда не создаёт `progress:words` и отдельного действия «добавить» нет.
- ✅ **4i. Экран прогресса:** отдельный `/progress` читает только уже существующие `progress:course`, `progress:stats` и `progress:words`. Показывает реально пройденные дни roadmap, число дней занятий, текущую серию (обнуляется в UI после пропущенного дня), активные SRS-записи и due-now, агрегат сохранённых answer buckets, а также среднее **последних** speed/dialogue metrics по упражнениям. Историческую среднюю скорость/диалоги не выдумываем, потому что документ хранит только последнее значение на activity. Для нового пользователя вместо набора нулей — отдельный empty state.
- ✅ **4j. Минимальный onboarding:** первый новый anonymous learner видит **один короткий экран** с тремя тезисами: говорить вслух, нажимать любое английское слово, доверить интервальные повторы приложению. Никакой анкеты, шагов «Далее» и обязательного аккаунта. Кнопка сразу открывает текущий первый день. Завершение хранится локально (`unmute.onboarding.v1`) и в merge-safe `settings.onboardingDoneAt`, поэтому не повторяется после синхронизации на другом устройстве. Если уже есть живой/imported `progress:course`, onboarding автоматически пропускается и completion-флаг сохраняется. Событие аналитики — `onboarding_done`.
- Дизайн с нуля: палитра, типографика, компоненты на React Aria; вся копия через `t(key)`.
- Экраны: минимальное знакомство (1 экран без анкеты) → **Сегодня** → **Карта курса** → **Урок** → **Дрилл** (ввод/голос) → **Повторения** → **Диалоги** → **Слова** → **Прогресс** → **Аккаунт**.
- Голос в вебе: адаптер Web Speech под интерфейс `speech.ts`; если браузер не умеет распознавание — ввод текстом.
- e2e: «первый день без аккаунта», перезагрузка, работа без сети после загрузки.

### Фаза 5 — Прогресс в аккаунте и перенос семьи
- ✅ **5a. Entitlements + access offer:** `course.general-foundation` в `acc.owned` **или** активный `acc.sub` открывают полный set на сервере; смена прав меняет query key и немедленно перезагружает content. День 8+ на карте и окончание preview ведут на отдельный `/access` с вариантами «навсегда» / Plus, но без фальшивой покупки до фазы 6; вошедший пользователь может вручную перепроверить выданное из Admin право.
- ✅ **Изученное не закрываем:** во время полного доступа клиент сообщает серверу только реально появившиеся в course progress activity IDs; сервер принимает их только при текущем owned/Plus, сверяет с published set и пишет в отдельный authenticated retention-ledger — client-editable sync progress не является основанием раскрывать платный контент. После окончания доступа paid roadmap остаётся skeleton/locked, а retained activities возвращаются отдельно для Review. Клиентский offline-cache при истёкшем праве понижает `full → preview`, прямой `/learn/:nodeId` повторно проверяет purchase boundary, а открытое приложение обновляет права в момент истечения Plus.
- Реестр документов §3.4 (клиент + `lib/app-sync-schema.js`) и правила слияния по элементам поверх `document-sync` из этапа 0.
- Импорт файла `eng-trainer-v2`.
- Семье выдать полный доступ из админки.
- ✅ **5b-1. Два устройства + первый вход с локальным прогрессом:** production-build e2e создаёт разные анонимные изменения курса на двух независимых browser contexts, затем оба устройства входят в один аккаунт. `document-sync` обязан объединить activity records, не затерев ни одно; после pull оба устройства сходятся в одном состоянии, которое переживает reload. Тест идёт через настоящие `/api/auth` + `/api/sync` на memory store, без доступа к внутреннему mirror.
- ✅ **5b-2. Импорт старого файла:** в «Аккаунте» можно выбрать `english-trainer-*.json`; файл валидируется как legacy export, `saved` корректирует старое local-midnight due-numbering, существующий `importLegacyProgress()` переводит legacy IDs в стабильные activity/lexicon refs и выдаёт отчёт по неоднозначностям. Результат **merge-ится** с текущими course/stats/words: новый UnMute progress не откатывается. При выполненном входе после записи сразу запускается account sync. Production-build e2e импортирует реальный JSON через `<input type=file>` и затем проверяет сохранённую SRS-карточку на `/progress`.
- ✅ **5c. Готовность production:** reviewed-дополнение словаря (`lib/legacy-lexicon-supplement.mjs`) закрывает все 993 видимых английских слова курса: словоформы существующих слов, сокращения (`it's`, `don't`), грамматические окончания (`-ing`, `-ed`), имена и новые слова; 32 отдельных legacy-слова вроде `went` отданы глаголу (`go`), старая запись остаётся под своим ID как `deprecated` и передаёт IPA. CLI-импорт не проходит при неполном покрытии, `check-production.mjs` ежедневно проверяет живой прод.
- Осталось: публикация на production, почтовый домен, семейный full-access grant через Admin + контрольная MVP-проверка (§0.4).

**Здесь готов запуск для семьи (MVP).**

### Фаза 6 — Оплата (G6) — **отложена владельцем**
- Реальную оплату сейчас **не подключаем**. Каркас billing и entitlement уже есть, доступ для разработки/семьи выдаётся через Admin. Checkout, store billing, web-провайдеры, реальные цены, оферта/возвраты — вернуться отдельной фазой позже.

### Фаза 7 — ИИ-собеседник (Plus)
- ✅ **7a. `talk.reply` contract:** `lib/unmute-ai-actions.js` собирает prompt **на сервере** из topic/focus/history/latest learner message; клиент не присылает произвольный model prompt. Ответ — строгий JSON `reply/correction/note`, повторно валидируется и сервером, и клиентом. Используется существующий Core `ai-endpoint`: Premium auth, `light` quota, provider/model из Admin, fallback и 30-дневный hashed log. `/api/ai` — rewrite в уже существующий `api/admin.js`, поэтому новой Vercel Function не добавляем.
- ✅ **7b. Текстовый AI conversation runner:** activity `ai-conversation` теперь реально проходит внутри lesson runner. Стартовый ход генерируется сервером без фальшивого learner message; дальше отправляются только последние structured turns. UI показывает partner/learner thread, correction/note последней фразы и quota usage, если Core его вернул. Activity становится `seen` только после явного «Завершить разговор». Anonymous → вход, signed-in без Plus → экран доступа. Голос и бесплатная пробная беседа не смешиваются сюда и идут отдельными кусками.
- ✅ **7c-1. `talk.review` contract:** отдельный Plus/light action разбирает уже завершённый structured transcript только на сервере. Строгий ответ: `strengths[]`, `corrections[{original,better,why}]`, `focus`; сервер и клиент независимо валидируют JSON, никаких произвольных model prompts с клиента. UI разбора — следующий короткий 7c-2.
- ✅ **7c-2. UI разбора разговора:** если learner успел отправить хотя бы одну реплику, «Завершить разговор» сначала вызывает `talk.review` и показывает отдельный экран внутри activity: сильные стороны, до 3 meaningful corrections (`ты сказал → лучше так → почему`) и один focus на следующую попытку. Activity становится `seen` только после кнопки «Готово». Если разбор упал/закончился quota/истёк доступ, уже проведённый разговор не теряется: можно повторить review либо завершить activity без него. Если learner не отправил ни одной реплики, сохраняется прежнее быстрое завершение без бессмысленного review.
- ✅ **7d-1. `answer.explain`:** после неправильного `choice/text-input/translation` пользователь сам нажимает «Почему?»; только тогда тратится AI quota. Клиент отправляет структурированные `question / learnerAnswer / acceptedAnswers / courseExplanation`, а server registry сам строит model prompt и принимает только строгий JSON `{why,tip}`. Ответ не меняет оценку, SRS или accepted answers. Anonymous ведёт во вход, без Plus — на существующий экран доступа; тот же UI работает и в обычном уроке, и в Review.
- ✅ **7d-2. Одна пробная AI-беседа:** signed-in пользователь без Plus может один раз запустить `ai-conversation`. Trial хранится **на сервере по account hash**, поэтому переустановка/другое устройство его не сбрасывают. Один trial привязан к одному activity scope и browser-session id, разрешает `talk.reply` + финальный `talk.review`, живёт до 24 часов и ограничен 10 model calls (старт + ответы + review); после этого UI ведёт в Plus. `answer.explain` и любые другие AI actions пробой не открываются. Premium проходит прежний Core gate без trial-policy.
- ✅ **7e. Голосовой AI-разговор:** в том же `ai-conversation` можно нажать «Ответить голосом»: `Web Speech Recognition en-US` берёт лучшую распознанную альтернативу и отправляет её в тот же `talk.reply`, то есть серверный prompt/quota/trial остаются неизменными. Каждый ответ партнёра автоматически озвучивается через существующий TTS; последнюю реплику можно повторить. Ошибки/unsupported/permission/no-speech не блокируют беседу — текстовый input всегда остаётся fallback. Native speech слой остаётся фазе 9.

### Фаза 8 — Напоминания
- ✅ **8a. Политика + настройки напоминаний:** чистая product-логика выбирает максимум **одно** уведомление на подход, чтобы не спамить. Приоритет: **есть due-повторения → серия под угрозой → обычное напоминание про следующий урок**. После записанной активности сегодня обычные/streak reminders не нужны; due review остаётся отдельным конкретным действием. Курс без следующего урока не генерирует фиктивный daily reminder. В `settings` добавлены merge-safe настройки `enabled/time/daily/review/streak` с собственным `changedAt`; они синхронизируются между устройствами и редактируются в Account. По умолчанию всё выключено.
- ✅ **8b. Нативная доставка:** продуктовый adapter подключает существующий Core `native-notifications` к Capacitor `LocalNotifications`. Планировщик держит **одно ближайшее** системное напоминание в выделенном ID-range и пересчитывает его по прогрессу/настройкам; если выбранное время сегодня уже прошло, ищет следующий релевантный день. Разрешение ОС запрашивается только после явного включения пользователем; Android exact-alarm — отдельной явной кнопкой, без скрытого запроса. Тап по `review-due` ведёт в `/review`, streak/daily — в Today; arbitrary routes из payload отбрасываются whitelist-ом. Звук/вибрация не форсируются — остаются системным настройкам канала. Web сохраняет синхронизируемые preferences, но **не обещает** фоновые уведомления; push/PWA transport не подключаем, пока реально не выбран канал. Код готов к Capacitor-оболочке фазы 9; в обычном web он безопасный no-op.

### Фаза 9 — Android/iOS
- ✅ **9a-1. Граница native speech:** все learner voice/TTS пути UnMute (lesson/review/pattern/dialogue/AI/dictionary) идут через один `speech-runtime.ts`: если нативная оболочка предоставляет отдельный `UnMuteAudio`, используется Core `createSpeech`; иначе остаётся существующий Web Speech. `FitAudio` намеренно **не** подхватывается: это командный распознаватель FitTimer, который фильтрует обычную речь через workout-команды и не подходит для английского диктанта. Контракт нативного результата поддерживает до 3 alternatives, чтобы текущий loose matcher продолжил работать.
- ✅ **9a-2a. Android shell + system speech/TTS:** у UnMute собственный Capacitor 8 shell с package `app.unmute.english`. Тонкий plugin `UnMuteAudio` использует Android `SpeechRecognizer` в free-form `en-US`, возвращает до 3 системных alternatives и мапит permission/no-speech/network/abort ошибки в существующий Core contract; TTS использует системный `TextToSpeech` + системные voices. Никаких Vosk/workout-команд из FitTimer не переносим. `@capacitor/local-notifications` подключён тем же shell для уже готовой фазы 8b. CI после `cap sync android` реально собирает debug APK на Java 21 / Gradle 8.14.3.
- ✅ **9a-2b. iOS shell + system speech/TTS:** iOS shell создаётся через Capacitor 8 SPM, затем `UnMuteBridgeViewController` регистрирует product plugin instance `UnMuteAudio`. `SFSpeechRecognizer` работает в free-form `en-US`, возвращает top-3 `transcriptions`; `AVAudioEngine` подаёт микрофонный stream; `AVSpeechSynthesizer` даёт системный TTS/voices. `NSMicrophoneUsageDescription` и `NSSpeechRecognitionUsageDescription` добавляются автоматически. CI реально поднимает iOS shell и собирает simulator target без signing.
- ✅ **9a-3. Native device launch smoke:** Android job после debug build поднимает headless Android 35 emulator, устанавливает APK, запускает `app.unmute.english/.MainActivity` и проверяет живой process/foreground activity. iOS job использует детерминированный DerivedData, загружает доступный iPhone Simulator, устанавливает `App.app`, запускает bundle `app.unmute.english` и проверяет, что PID не умер сразу после старта. Это smoke именно оболочки/bridge bootstrap; реальные mic/speech permission и качество распознавания остаются проверкой на физическом устройстве, потому что симуляторы их достоверно не моделируют.
- Старые `FitAudio*` имена и поведение FitTimer не менять; общий reusable слой должен быть generic, а продуктовые плагины — тонкими адаптерами.
- Store purchases остаются отложенной фазой 6; native shell не должен притворяться, что IAP уже подключён.

### Фаза 10 — Запуск
- ✅ **10a. Воронка:** server whitelist теперь принимает `onboarding_done`, `lesson_completed`, `day_completed`, `talk_started` и bounded paywall events `paywall_shown.course/today/talk/other`. Урок/день считаются только при локальном первом завершении node в runner; повтор уже завершённого node событие не шлёт. `talk_started` пишется только после успешного первого AI reply. `/access` фиксирует место входа из course/Today/talk. Для отложенной оплаты заранее зарегистрированы bounded `purchase_started/completed.course.general-foundation` (+ `.other`), но **не эмитятся**, пока реального checkout нет — покупки не имитируем.
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
| ИИ съедает бюджет | Plus остаётся под месячными Core-лимитами; бесплатный trial — один на аккаунт, максимум 10 model calls и 24 часа |
