# Fit Timer — production roadmap

Обновлено: 22 сентября 2026.

Этот файл содержит только актуальные следующие этапы. История выполненных решений остаётся в Git,
а причины важных архитектурных ограничений — в `docs/why.md`.

## Статус

1. ✅ **Sync reliability**
   - manifest update защищён distributed lock;
   - document conflict resolution revision-first;
   - concurrent push и clock-skew regression tests обязательны в CI.

2. ✅ **Auth / abuse protection**
   - OTP limits по IP и email;
   - admin brute-force protection;
   - account/IP AI limits;
   - report/link abuse limits;
   - sensitive expensive actions fail-closed при недоступном rate-limit storage.

3. ✅ **AI stability — базовый слой**
   - общий server validator в `lib/ai-protocol.js`;
   - malformed HTTP 200 может переключить запрос на backup provider;
   - client повторно валидирует program/exercise перед применением;
   - non-structural program edits не могут молча менять shape;
   - regression tests включены в CI.

4. ✅ **Account deletion / privacy audit**
   - проверить все Redis keys/indexes/logs/device tokens;
   - убедиться, что delete account удаляет personal data и отзывает tokens;
   - catalog publications должны переживать удаление trainer personal data;
   - проверить retention AI/notification/auth diagnostics;
   - проверить локальные persisted keys и cleanup lists.
   - account indexes, auth traces, AI usage/logs, campaign cooldowns and trainer-link claims are purged;
   - authenticated trainer reports are tagged server-side and removed with account deletion;
   - anonymous legacy reports remain link-scoped and are not guessed by name.

5. ✅ **Push / notifications production verification (Android/web)**
   - ✅ Android app содержит Push Notifications plugin + Google Services integration;
   - ✅ GitHub release log подтверждает реальный `GOOGLE_SERVICES_JSON_BASE64`;
   - ✅ server FCM send + UNREGISTERED token cleanup покрыты regression CI;
   - ✅ notification preferences и push-device lifecycle остаются account-level;
   - ✅ реальная отправка push из admin проверена на устройстве;
   - ✅ отправка email из admin проверена в production;
   - iOS push вынесен в отдельный iOS release stage.

6. ✅ **Android release pipeline**
   - ✅ Android release подписывается постоянным key, `apksigner` проходит;
   - ✅ AAB/APK artifacts и `latest-apk` публикуются автоматически;
   - ✅ versionCode растёт от GitHub run number;
   - ✅ Firebase config попадает в release build;
   - не менять существующий Android signing material для «починки» обновлений.

7. ✅ **Web/PWA cleanup**
   - PWA/service worker/manifest/web PWA icons удалены;
   - старый Android TWA и его assetlinks-конфигурация удалены;
   - текущий `.well-known/assetlinks.json` создан заново и используется только для Android App Links `/p/<id>`;
   - остаются обычный web + Android/iOS через Capacitor.

8. ✅ **CI expansion**
   - canonical/generated drift теперь ломает CI, а не маскируется пересборкой;
   - AI symbol index и i18n проверяются до build;
   - syntax-check охватывает все `api/lib/tests/scripts`;
   - sync/auth/AI/push regressions обязательны;
   - source workflow запускается на `.ai/**` и `scripts/**`;
   - Android CI больше не стартует на docs/backend-only commits;
   - iOS simulator CI запускается на релевантные push в `main`.

9. **iOS release stage**
   - выполнять после Android release и до рекламной кампании;
   - Apple Developer signing/provisioning;
   - Push Notifications capability + APNs;
   - signed Archive;
   - TestFlight upload;
   - release smoke test на реальном iPhone.

10. **Billing**
   - Google Play Billing + server receipt verification + RTDN + restore;
   - RuStore Pay + server notifications;
   - YooKassa только там, где такой канал допустим;
   - Premium entitlement остаётся server-authoritative.

11. **Final production audit**
    - security/privacy;
    - store readiness;
    - docs/env consistency;
    - stale code/files;
    - user-facing error states;
    - web/Android/iOS release smoke tests.

## Repository cleanup status

Удалено как устаревшее:
- PWA: `sw.js`, `manifest.webmanifest`, PWA web icons, старый `README.txt`;
- старый `legacy/android-twa/`;
- старый TWA-вариант `.well-known/assetlinks.json` (текущий файл — отдельная App Links конфигурация);
- `docs/backend-gtm.md`;
- `docs/fresh-take.md`;
- `docs/claude-context-archive.md`.

Обновлено:
- `AGENTS.md`;
- `CLAUDE.md`;
- `.ai/project-map.md`;
- `.claude/agents/design-lead.md`;
- `docs/why.md`;
- `docs/mobile-release.md`;
- `docs/ai-runtime.md`;
- `docs/ai-generation-plan.md`;
- `docs/trainer-ui.md`.

Оставлены как активные:
- `docs/setup-vercel.md`;
- `docs/billing-setup.md`;
- `docs/i18n-plan.md`;
- `docs/notification-strategy.md`;
- `docs/mobile-release.md`;
- `docs/ai-runtime.md`;
- `docs/ai-generation-plan.md`;
- `docs/trainer-ui.md`;
- `docs/why.md`.

## Cleanup rule

Удалять файл только после проверки:
1. не участвует в build/runtime/CI;
2. на него нет живой ссылки или ссылка обновлена одновременно;
3. содержимое не является текущей source-of-truth документацией;
4. после удаления проходят соответствующие checks.

Спорные manual-use agent/persona файлы не удаляются автоматически.
