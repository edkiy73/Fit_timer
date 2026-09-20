# FitTimer project map

Compact navigation map for agents. Use this instead of scanning the repository.

## Runtime flow

```text
Web/PWA
  index.html + style.css + app.js
          |
          +--> local state: kvGet/kvSet (IndexedDB -> localStorage fallback)
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

## Frontend

| File | Owns | Read when |
|---|---|---|
| `index.html` | screen/modal markup and structure | adding/moving UI, finding element IDs |
| `style.css` | shared visual system and screen styling | layout/spacing/visual bugs |
| `app.js` | main application behavior/state/workouts/programs/account/trainer/catalog/sync | behavior changes; search symbol first |
| `mobile.js` | Capacitor-aware mobile behavior/bridges | share, haptics, notifications, native differences |
| `app.config.js` | runtime public config bootstrap | API/public URL behavior |
| `sw.js` | PWA service worker/cache | stale assets/update behavior |
| `manifest.webmanifest` | PWA metadata | install/PWA metadata |
| `admin.html` | admin UI | catalog/trainer/AI admin settings |

Large-file rule: never fetch all of `app.js`, `style.css`, or `index.html` when a search/range is enough.

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
- `legacy/android-twa/` — archive; do not use for current implementation.

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
| mobile shell | `npm run build`, `npm run check:mobile` |
| broad invariants | `python3 check.py` |

Do not run every test by default. Run targeted tests first, then broaden only when the change crosses domains.

## Product docs — open only when relevant

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
- service worker/cache update behavior,
- Vercel region/env/storage changes.

For these, map the full request path before editing, but still avoid unrelated repo-wide reads.
