# Fit Timer — Claude project instructions

This file is intentionally compact because Claude Code loads it automatically.
Do not expand it into a project encyclopedia again.

## Start here

For every coding task:

1. Read `AGENTS.md`.
2. Read `.ai/project-map.md`.
3. Prefer `npm run ai:context -- "task"` for natural-language tasks; it produces one compact context pack with route, excerpts, symbols, recent commits and diff.
4. Fall back to `.ai/feature-router.json` / `npm run ai:route -- "task"` when needed.
5. Search `.ai/symbol-index.json` only when the context pack is insufficient.
6. Identify the feature area.
7. Search source text only if the context pack/router/index are insufficient.
8. Read only the relevant source chunk and targeted docs.

Do **not** read generated root `app.js`, `style.css`, `index.html`, or the archived context by default. Search `src/**` and open only the matching chunk.

The previous full project context is preserved verbatim in:
`docs/claude-context-archive.md`

Historical rationale and bug traps live in:
`docs/why.md`

## Project snapshot

Fit Timer is a Russian-first workout timer / training app.

- Web/PWA + Android/iOS via Capacitor 8.
- Production: `https://fittimer99.vercel.app`
- Production branch: `main`
- App id: `ru.fittimer.app`
- Canonical frontend: `src/html/`, `src/styles/`, `src/app/`
- Generated frontend outputs: root `index.html`, `style.css`, `app.js` — never edit directly
- Mobile runtime/bridge: `mobile.js`
- Serverless backend: `api/`
- Shared backend code: `lib/`
- Server storage: Upstash Redis via Vercel integration
- Admin UI: `admin.html`
- Generated mobile web bundle: `dist/` — never edit directly
- Current native shells: `android/`, `ios/`
- `legacy/android-twa/` is archive only

## Critical product rules

These are invariants unless the user explicitly changes them.

### Account and trainer identity

- There is **one normal email account**.
- There is no separate trainer account/login.
- Trainer mode exists inside the normal account.
- A trainer cannot be created without an account.
- If a logged-out user tries to become a trainer, show registration/login instead.
- Nickname/handle belongs to the account and is reused for trainer identity.
- Trainer data sync is independent from Premium entitlement.
- Account itself is free; paid features/subscription are separate.
- Do not store date of birth; use full age where age is required.

### Localization

- RU/EN localization is complete. New user-facing copy must use `t(key)` or `data-i18n*` and be added to every locale dictionary.
- `appLocale` is the UI/content locale. TTS language follows it automatically; the user only chooses a concrete TTS voice. Voice-command recognition language remains a separate offline-pack setting.
- Keep dictionaries in sync and run `npm run i18n:check`, `npm run check:sources`, and `npm run check:ai-index`.
- For a new language, register its dictionary + `LOCALE_META`, add the selector option, and follow `docs/i18n-plan.md`. Do not duplicate catalog program IDs or fork canonical AI prompts by language.

### Language and terminology

- User-facing language is Russian unless the feature explicitly requires another language.
- Address the user informally ("ты") but avoid gendered wording.
- Marketing, onboarding, paywall and explanatory copy must use plain language for non-technical users. Sell the user benefit/outcome first; avoid implementation terms such as server, provider, runtime, sync, API or model unless that detail is necessary.
- People managed by a trainer are called **«подопечные»**, not «клиенты».
- Reuse established wording before inventing new terminology.

### UI

- Reuse existing components/classes/patterns before creating new ones.
- Avoid duplicated controls, helper texts, or cards.
- Keep layouts compact; do not add card wrappers just for decoration.
- Icons must use the existing icon system. No emoji or arbitrary external icons.
- Screens use existing `.screen` / `hidden` mechanics.
- Modals use existing modal patterns; preserve back-button/modal-stack behavior.
- Do not reintroduce a visible sync-status card.

### Data behavior

- Existing catalog programs survive deletion of trainer/account personal data.
- Preserve compatibility with existing local persisted data and Redis data unless migration is explicitly requested.
- Do not silently wipe local data when server-side ownership/deletion cannot be confirmed.

## Read routing

Use `.ai/project-map.md` for the full map. Common paths:

- UI/layout/copy → targeted `src/html/` + `src/styles/`
- App behavior/workouts/programs/progression → targeted `src/app/` chunk
- Native share/haptics/notifications/mobile-only behavior → `mobile.js`, then native code only if required
- Auth/account → `api/auth.js`, `lib/store.js`, relevant account code in `app.js`
- Trainer → `api/trainer/[handle].js`, trainer-related frontend code, trainer tests
- Catalog → `api/catalog.js`, `admin.html`, catalog frontend code
- Sync → `api/sync.js`, sync frontend symbols, sync tests
- AI → `lib/ai.js`, `lib/ai-endpoint.js`, `api/admin.js`, `docs/ai-runtime.md`
- Vercel/storage/env → `vercel.json`, `lib/store.js`, `docs/setup-vercel.md`
- Android/iOS release or build/update/install → read `docs/mobile-release.md` first

## Mobile rules

Before changing Android/iOS, API origin, public links, timer/audio, notifications, sharing, signing, or release flow, read `docs/mobile-release.md`.

Normal mobile flow:

```bash
npm ci
npm run mobile:sync
npm run check:mobile
```

`npm run mobile:sync` rebuilds `dist/`, runs Capacitor sync, and regenerates assets.

For normal UI changes:
- edit shared frontend first;
- do not directly modify native projects unless a native bridge/config change is actually required.

Never regenerate or replace release signing material merely to fix APK update/install problems.

## Vercel/backend rules

- Prefer extending an existing resource endpoint/action over creating another serverless function.
- Shared helpers belong in `lib/`, not `api/`.
- `check.py` guards the function-count limit and other broad invariants.
- Runtime environment/storage setup is documented in `docs/setup-vercel.md`.
- Do not expose secret env values, admin keys, provider tokens, or signing credentials.

Current important rewrites:
- `/api/ai` → `/api/admin?ai_endpoint=1`
- `/api/config` → `/api/admin?public_config=1`

## AI runtime

Before changing AI generation/provider logic, read `docs/ai-runtime.md`.

Keep these principles:
- provider/model/pricing/limits are server/admin configured;
- provider secrets never belong in web/APK clients;
- primary/fallback provider support must remain possible;
- avoid duplicating AI configuration across frontend and backend;
- retention/logging behavior must follow the existing server-side design.

## Efficient working method

For a normal bug/UI task:

- First pass: 2–5 relevant source files plus targeted tests.
- Search before reading large files.
- Fetch only relevant line ranges from large files.
- Do not reread unchanged files in the same task.
- Diagnose first; edit second.
- Prefer one coherent patch over iterative speculative patches.
- If the first hypothesis fails, stop and re-diagnose instead of stacking unrelated fixes.

Repo-wide reading is justified only for architecture, broad refactors, migrations, or explicit audits.

## Verification ladder

Use the cheapest relevant verification first:

1. After frontend edits: `npm run ai:index`, `npm run check:sources`, `npm run check:ai-index`
2. Targeted syntax/static check
3. Relevant `tests/*.js`
4. `python3 check.py`
5. `npm run build`
6. `npm run check:mobile`
7. Native Android/iOS build only when native code/config changed or a package build is explicitly required

Do not repeatedly run expensive full builds while a cheaper failing check remains unresolved.

## Completion standard

A task is complete only when:
- requested behavior is implemented;
- existing patterns were reused where practical;
- relevant regression checks passed;
- web/mobile/API impact was considered;
- the final summary says exactly what changed and what was actually verified.

Never claim deployment, APK/device behavior, store behavior, or a build was verified unless it really was.

## Detailed references

Read only when relevant:

- `AGENTS.md` — default agent workflow and constraints
- `.ai/project-map.md` — compact architecture/navigation map
- `docs/mobile-release.md` — mobile architecture/build/release
- `docs/setup-vercel.md` — Vercel, Redis, email, backend setup
- `docs/ai-runtime.md` — current AI runtime/config
- `docs/ai-generation-plan.md` — AI generation design/history
- `docs/trainer-ui.md` — trainer UX
- `docs/why.md` — historical rationale and known traps
- `docs/claude-context-archive.md` — old full context, preserved for rare deep-reference needs
