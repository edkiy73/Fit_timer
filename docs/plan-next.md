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

5. 🚧 **Push / notifications production verification**
   - ✅ Android app содержит Push Notifications plugin + Google Services integration;
   - ✅ GitHub release log подтверждает реальный `GOOGLE_SERVICES_JSON_BASE64`;
   - ✅ server FCM send + UNREGISTERED token cleanup покрыты regression CI;
   - ✅ notification preferences и push-device lifecycle остаются account-level;
   - ⏳ проверить Vercel `FIREBASE_SERVICE_ACCOUNT_*` и реальную delivery на устройстве;
   - ⏳ iOS: добавить/проверить Push Notifications capability вместе с реальным signing/provisioning;
   - ⏳ end-to-end на устройстве: register → send → open action → token cleanup.

6. **APK / iOS release pipeline**
   - update compatibility/signing/versionCode;
   - signed Android release artifact;
   - iOS signing/archive/TestFlight path;
   - не менять существующий signing material для «починки» обновлений.

7. ✅ **Web/PWA cleanup**
   - PWA/service worker/manifest/web PWA icons удалены;
   - старый Android TWA и `.well-known/assetlinks.json` удалены;
   - остаются обычный web + Android/iOS через Capacitor.

8. **CI expansion**
   - обязательные core auth/catalog/AI/limits/backup checks;
   - release-sensitive checks перед store work;
   - не превращать CI в полный e2e на каждый маленький commit без причины.

9. **Billing**
   - Google Play Billing + server receipt verification + RTDN + restore;
   - RuStore Pay + server notifications;
   - YooKassa только там, где такой канал допустим;
   - Premium entitlement остаётся server-authoritative.

10. **Final production audit**
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
- старый TWA `.well-known/assetlinks.json`;
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
