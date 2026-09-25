# FitTimer project map

Compact navigation map for agents. Use this instead of scanning the repository.

## Runtime flow

```text
Web
  src/html/* + src/styles/* + src/app/*
  -> generated index.html + style.css + app.js
          |
          +--> local state: FitTimer async kv* adapter -> `core/storage.js` ES module -> IndexedDB/localStorage
          |
          +--> API calls ------------------------------+
                                                       |
Capacitor Android/iOS                                 |
  same built frontend in dist/                        |
  + mobile.js + Capacitor plugins                     |
  + native shell only where required                  |
                                                       v
                                           Vercel Serverless API
                                             api/*.js
                                                  |
                                             lib/*.js
                                                  |
                                           Upstash Redis
```

Production web/API: `https://fittimer99.vercel.app`
Mobile app id: `ru.fittimer.app`
Production branch: `main`

## One-shot context pack

Use `npm run ai:context -- "task description"` as the preferred first step for product-language tasks. It combines the feature route, likely files/tests/docs, matching source excerpts, symbol hints, recent commits and current diff into one compact response. Add `--write` to save it as `.ai/context-pack.md` for local agent sessions.

## Feature router

`.ai/feature-router.json` maps natural-language task categories to the smallest likely source files, tests, docs and verification commands. Use `npm run ai:route -- "task description"` before source search when the task is described in product language rather than by a known symbol.

## AI lookup index

`.ai/symbol-index.json` is a generated lookup table for canonical frontend sources. It maps files to function names, HTML element ids and `data-act` actions. Search it before opening source files. Regenerate after frontend source changes with `npm run ai:index`; verify with `npm run check:ai-index`.


## AppBase architecture work

For the planned extraction of a reusable application base, do not start with a repo-wide scan or load every specialist role.

- Orchestration / routing: `.ai/appbase-agents/00_TEAM_ORCHESTRATION.md`.
- Architect: `.ai/appbase-agents/01_ARCHITECT.md`.
- Implementation: `.ai/appbase-agents/02_EXTRACTION_ENGINEER.md`.
- Regression gate: `.ai/appbase-agents/03_QA_REGRESSION.md`.
- On-demand specialists: `04_UX_UI_SYSTEM.md`, `05_SECURITY_PRIVACY.md`, `06_RELEASE_DEVOPS.md`, `07_PRODUCT_INTEGRATION.md` in the same folder.
- Preparation phases and known coupling points: `docs/appbase-preparation-roadmap.md`.

Normal AppBase route: Architect → Engineer → QA → Architect. Specialists join only when their trigger applies. The agent set is intentionally designed to avoid repeated full-context handoffs.

## Frontend

| File | Owns | Read when |
|---|---|---|
| `src/html/*.html` | canonical screen/modal markup chunks | adding/moving UI, finding element IDs |
| `src/styles/*.css` | canonical style chunks | layout/spacing/visual bugs |
| `src/app/*.js` | canonical behavior chunks | behavior changes; search part first |
| `src/i18n/*.js` | RU/EN dictionaries + locale runtime | UI language, translation keys, locale persistence |
| `index.html`, `style.css`, `app.js` | generated compatibility outputs | never edit directly; `npm run build:sources` |
| `mobile.js` | Capacitor-aware mobile behavior/bridges | share, haptics, notifications, native differences |
| `app.config.js` | generated runtime public config bootstrap | API/public URL behavior |
| `config/product.json` | canonical product identity, default URLs, capability flags and basic brand values | app identity/AppBase/bootstrap changes |
| `src/types/*.ts` | TypeScript contracts for reusable Core boundaries | Core/AppBase/type changes |
| `src/core/*.ts` | canonical reusable AppBase Core ES modules | Core extraction/refactoring |
| `core/*.js` | generated browser ES modules compiled from `src/core/*.ts` | never edit directly; `npm run build:core` |
| `admin.html` | admin UI | catalog/trainer/AI admin settings |

Foundation checks:
- `npm run typecheck` — strict TypeScript contracts/Core check.
- `npm run test:foundation` — product config/AppBase foundation invariants.
- `npm run build:config` / `npm run check:config` — generate/verify public runtime config from `config/product.json`.
- `npm run build:core` / `npm run check:core` — transpile/verify browser ES modules under `core/`.

Localization:
- `src/i18n/ru.js` / `src/i18n/en.js` — user-facing dictionaries.
- `src/i18n/index.js` — locale detection, persistence, `t()`, and `data-i18n*` application.
- `npm run i18n:check` — verifies dictionary parity and HTML translation keys.

Canonical JS chunks:
- `src/app/00-core.js` — shared core/navigation/start helpers.
- `src/app/10-data-sync.js` — FitTimer storage adapter, users, sync/calendar foundations; low-level KV ownership is in `src/core/storage.ts`.
- `src/app/20-account.js` — profile/account/subscription/login/biometrics.
- `src/app/30-progress-media.js` — warmup, photos, export/import, onboarding.
- `src/app/40-programs-ai.js` — progression, home/programs, sharing, AI/images.
- `src/app/50-trainer-catalog.js` — trainer/trainees/catalog.
- `src/app/60-builder.js` — program builder/exercise editor/text+AI creation.
- `src/app/70-workout.js` — steps, timer/engine, finish/result sharing.
- `src/app/80-platform.js` — theme, voice/hands-free, notifications.
- `src/app/90-events.js` — event/action wiring.

Large-file rule: search `src/**` and open only the matching chunk. Root `app.js`, `style.css`, and `index.html` are generated outputs.

## Backend

| Route/file | Responsibility |
|---|---|
| `api/auth.js` | email-code auth, account lifecycle |
| `api/catalog.js` | catalog read/submission |
| `api/admin.js` | admin actions; AI/config rewrites also target here |
| `api/health.js` | deployment/env/backend diagnostics |
| `api/share.js` | create shared program links |
| `api/report.js` | trainee report submission |
| `api/sync.js` | account/device data sync |
| `api/p/[id].js` | shared program + link/report access |
| `api/trainer/[handle].js` | public trainer page + trainer updates |

Shared backend modules:
- `lib/store.js` — Redis/storage abstraction and persistence helpers.
- `lib/util.js` — shared server utilities.
- `lib/mail.js` — Resend/email.
- `lib/seed.js` — seed/catalog data.
- `lib/ai.js` — AI provider/runtime logic.
- `lib/ai-endpoint.js` — AI endpoint orchestration.
- `lib/analytics.js` — anonymous product funnel and retention milestones.
- `lib/diagnostics.js` — redacted client error aggregation.

Rule: helper modules go in `lib/`, not `api/`, because every API JS file can become a Vercel function.

## Mobile

```text
source web files
   -> npm run build
   -> dist/
   -> cap sync
   -> android/ + ios/
```

Key files:
- `capacitor.config.json` — app id, webDir, plugin config.
- `scripts/build-web.mjs` — builds `dist/` and injects runtime URLs.
- `scripts/check-mobile.mjs` — mobile structure/config validation.
- `android/app/src/main/java/ru/fittimer/app/MainActivity.java` — Android host.
- `android/app/src/main/java/ru/fittimer/app/FitAudioPlugin.java` — Android audio bridge.
- `android/app/src/main/java/ru/fittimer/app/FitSystemPlugin.java` — Android system bridge.
- `ios/` — iOS Capacitor shell.

Current Capacitor dependencies include App, Filesystem, Haptics, Local Notifications, Share and Splash Screen.

## Infrastructure

- Vercel hosts static frontend + serverless API.
- Upstash Redis is the current server storage.
- `vercel.json` controls regions/function duration/rewrites/cache headers.
- `/api/ai` rewrites to `/api/admin?ai_endpoint=1`.
- `/api/config` rewrites to `/api/admin?public_config=1`.
- Environment/storage setup: `docs/setup-vercel.md`.
- Do not assume dashboard settings match repository config; inspect both when region/runtime behavior matters.

## Tests/checks by area

| Area | Start with |
|---|---|
| account/auth | `tests/account-flow.js`, API-related tests |
| catalog/store | `tests/catalog-flow.js`, `tests/store-page.js`, `tests/admin-flow.js` |
| trainer | `tests/trainer-page.js`, `tests/trainer-feedback.js` |
| sync | `tests/sync-api.js`, `tests/sync-flow.js` |
| sharing/links | `tests/link-length.js`, `tests/api-flow.js` |
| reports | `tests/report-auto.js`, `tests/report-detail.js` |
| navigation | `tests/nav-flow.js` |
| programs | `tests/program-actions.js`, `tests/start-overview.js` |
| AI | `tests/ai-api.js`, `docs/ai-runtime.md` |
| analytics | `tests/analytics-unit.js`, `tests/analytics-api.js` |
| diagnostics | `tests/diagnostics-unit.js` |
| mobile shell | `npm run build`, `npm run check:mobile` |
| broad invariants | `python3 check.py` |
| all browser/e2e flows | `node scripts/run-browser-tests.mjs` (dev-server on 8124 + static on 8123; CI: `browser-tests.yml`) |
| local storage | `tests/storage-idb.js` |

Do not run every test by default. Run targeted tests first, then broaden only when the change crosses domains.

## Product docs — open only when relevant

- `docs/appbase-preparation-roadmap.md` — FitTimer → reusable AppBase preparation roadmap.
- `docs/mobile-release.md` — mobile architecture/build/release.
- `docs/setup-vercel.md` — Vercel, Redis, email, backend setup.
- `docs/ai-runtime.md` — current AI runtime/configuration.
- `docs/ai-generation-plan.md` — AI generation design/history.
- `docs/trainer-ui.md` — trainer UX.
- `docs/why.md` — rationale and historical bug traps.
- `CLAUDE.md` — detailed accumulated product context; search/read only relevant sections, not whole-file by default.

## High-risk cross-cutting areas

These often require reading more than one layer:
- auth/account/trainer identity,
- sync + persisted data compatibility,
- sharing in browser vs Capacitor APK,
- AI entitlement/config/provider fallback,
- app update/signing/versioning,
- Vercel region/env/storage changes.

For these, map the full request path before editing, but still avoid unrelated repo-wide reads.
