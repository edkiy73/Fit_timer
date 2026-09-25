# FitTimer → AppBase preparation roadmap

Baseline used when this document was introduced: `main` at `bfe07675d0061ef0a6ab3e458a13e93701f48bcf`. Always refresh `main` before implementation; this SHA is historical context, not a permanent base.

## Goal

Do not turn FitTimer into a framework during active product work. Prepare hard boundaries so a later snapshot/fork can delete the fitness domain and retain a strong reusable application base.

Target dependency rule:

```text
App / Product Domain → Core
Core ✕→ Product Domain
```

## Decision discipline

This roadmap is a working architecture proposal, not a claim that every step is uniquely correct. Before each phase, the Architect should re-check the current repository and constraints. If a simpler or safer approach becomes available, update the roadmap rather than following it mechanically.

## Long-term repository topology

The target after the first stable AppBase extraction is:

```text
        AppBase Core
        /    |     \
       ↓     ↓      ↓
   FitTimer Lingua TaskApp
```

This is an ownership model, not necessarily a specific packaging technology.

### Bootstrap phase

Initially FitTimer contains the proven production infrastructure, so extraction naturally starts there:

```text
FitTimer generic code → AppBase bootstrap
```

This is temporary. Do not build a permanent architecture where AppBase is continuously overwritten from FitTimer.

### Mature phase

After AppBase has:
- stable Core boundaries;
- its own build/tests;
- proof-product validation;
- a defined version/update mechanism;

AppBase becomes canonical upstream.

Then the normal flow is:

```text
AppBase Core change
      ↓
reviewable/versioned update
      ↓
FitTimer / Lingua / TaskApp
```

Product-domain changes remain local.

If FitTimer or another product discovers a reusable Core bug, two flows are acceptable depending on urgency:

```text
preferred:
AppBase fix → downstream update

urgent production exception:
Product hotfix → generalize/backport to AppBase → downstream reconciliation
```

The second route is an exception, not the default ownership model.

### Delivery mechanism

Do not lock the project prematurely to one transport. Re-evaluate when the Core boundary exists.

Plausible options:
- versioned Core package;
- automated Core update PRs;
- another explicit versioned dependency/copy mechanism.

Current preference is reviewable automated PRs first because they preserve product autonomy and make diffs/tests visible without forcing all apps into lockstep. A package may become preferable later if Core APIs stabilize enough.

Avoid permanent bidirectional automatic sync.

## Coupling points already identified

- `src/app/10-data-sync.js` mixes generic storage/profiles/analytics/sync with fitness programs, stats and progression state.
- `api/sync.js` is close to document sync but hard-codes FitTimer document names/scopes.
- `mobile.js` mixes reusable Capacitor bridges with FitTimer program links and workout/rest notification semantics.
- `api/admin.js` mixes reusable users/AI/analytics/errors/campaigns/pricing/releases with catalog/trainer/fitness-AI logic.
- AI provider/runtime infrastructure is reusable, but FitTimer action/protocol semantics still need a cleaner boundary.
- product identity is still spread across config/build/native/release paths.

## Phase 0 — Safety baseline

Owner: QA. Review: Architect.

Before broad extraction, keep regression coverage around:
- clean install and existing-account login;
- profile create/edit/delete;
- rapid Profile A ↔ B switching;
- profile data isolation during locale/background sync;
- Premium server authority;
- sync pull/push, stale revisions and deletion;
- backup import/export;
- public links/trainer relation;
- notification preferences;
- AI entitlement/quota;
- Android update config.

Profile isolation is a Core invariant, not a FitTimer detail.

## Phase 1 — TypeScript + module foundation

### Current implementation status

Foundation work now has a concrete starting point on the AppBase preparation branch:
- strict TypeScript/no-emit configuration and reusable Core contracts;
- canonical `config/product.json` with generated public runtime config;
- CI typecheck/foundation checks;
- existing browser regression suite already covers profile switching, storage migration, sync, backup and account flows.

This does **not** mean Core extraction is complete. Account/Profile, Sync and other runtime owners still remain in legacy FitTimer modules until their dedicated extraction tasks.


Owner: Architect + DevOps. Implementation: Extraction Engineer.

The migration should start **before substantial Core extraction** and then move quickly by converting infrastructure at the moment it is meaningfully touched.

First establish:

```text
typescript
tsconfig.json
JS/TS coexistence
src/types or equivalent contract location
npm run typecheck
```

Start contracts for AppConfig, Account, Profile, entitlement/subscription, sync envelope/document, AI request/response, notification preferences, analytics/error payloads and public config.

Migration rule from this point forward:

- new Core/reusable modules are TypeScript by default;
- when an existing JS module is substantially extracted/refactored into Core, convert the touched module to TypeScript in that same task unless a concrete compatibility/build blocker makes that unsafe;
- do not convert untouched stable UI/domain files merely to increase a migration percentage;
- do not leave materially touched Core modules in JS for a future cleanup pass without documenting the blocker;
- tighten strictness progressively instead of using broad `any`, unsafe casts or giant global declarations.

Because the current frontend is concatenated into a shared global scope, introduce ES modules + a lightweight bundler **when the first real Core extraction needs explicit imports/exports**. This is expected early (around the first AppConfig/Storage/Core slices), but the exact task boundary should be chosen from the current dependency graph rather than forced blindly.

Keep FitTimer domain models separate: Program, Plan, Exercise, WorkoutSession, WorkoutStats, Trainer, CatalogEntry.

Add runtime validation at external boundaries; TypeScript alone does not validate API/Redis/backup/AI/deep-link/billing input.

The objective is fast convergence to TypeScript without either a risky full-app rewrite or double work where modules are deeply refactored in JS and then rewritten again shortly afterward.

## Phase 2 — Central AppConfig

Owner: Architect + DevOps.

Create one controlled source for reusable product identity/capabilities where practical:

```text
id
name
slug
apiUrl
publicUrl
brand
features
```

Do not change FitTimer production package id, signing, App Links or release semantics just to make this abstraction clean.

## Phase 3 — Storage Core

Owner: Extraction Engineer. Review: QA.

Extract generic KV capability from `src/app/10-data-sync.js`:

```text
get(key)
set(key, value)
remove(key)
global/profile namespace helpers
```

Core storage must not know `customPrograms`, `stats`, `progWeights`, warm-up or trainer semantics.

Preserve existing persisted keys unless migration is explicitly required.

### Storage implementation status

The first real Core extraction now moves low-level local storage into `src/core/storage.ts`:
- IndexedDB + localStorage fallback/migration;
- optional external storage bridge;
- mirror-key behavior;
- namespace-key helper;
- write-failure callback.

FitTimer keeps the existing `kvGet/kvSet/kvDel/kvClearAll` adapter and the existing `fittimer/kv` database/key formats, so this phase does not intentionally migrate user data.

The current `storage.runtime.js` is a generated compatibility bridge for the existing concatenated frontend. It is **not** the intended permanent module architecture. While that bridge exists, `verbatimModuleSyntax` stays disabled because the runtime intentionally compiles a global namespace; strict TypeScript checks remain enabled. ES modules/bundling should restore normal module semantics before Core develops cross-module imports/exports that make this bridge awkward.

## Phase 4 — Account / Profile boundary

Owner: Architect + Extraction Engineer. Review: Security + QA.

Separate Account, generic Profile and FitTimer profile extension.

Generic Profile should not require age, gender, height, body measurements or fitness preferences. Profiles should eventually be an optional capability for products that do not need multiple people under one account.

### Account/Profile implementation status

The client boundary now keeps the persisted profile shape compatible while separating ownership:
- `src/core/identity.ts` owns generic Account/Profile defaults only;
- `src/types/core.ts` contains generic Account/Profile contracts;
- `src/types/fitness.ts` contains FitTimer-only profile fields such as gender, age and workout timing/audio preferences;
- existing stored/synced profile JSON stays flat for compatibility in this phase;
- FitTimer adapters compose the generic profile draft with fitness fields.

This is intentionally **not** the server sync split yet. `api/sync.js` still sanitizes the legacy flat profile record and should be separated in the next sync-focused phase rather than combined with this client boundary change.

## Phase 5 — Generic Document Sync facade

Owner: Architect + Extraction Engineer. Review: Security + QA.

Move toward a generic contract conceptually like:

```text
scope
type
id
revision
payload
deleted
```

FitTimer registers its document semantics; Core owns transport/conflict mechanics.

Prefer an adapter over the current Redis/protocol first. Do not migrate production storage format solely for naming cleanliness.

A good milestone: adding a test non-fitness document type should not require rewriting the sync engine.

### Sync registry implementation status

The existing wire/storage protocol remains unchanged, but document admission is now separated from transport/conflict logic:
- `src/core/sync.ts` provides a typed generic client document registry;
- `lib/sync-registry.js` provides the equivalent generic server helper;
- FitTimer registers `stats`, `index`, `program:*`, trainer/client documents and notification preferences outside Core;
- the server keeps accepting legacy `progWeights` from older clients for compatibility;
- free-account access for notification preferences is expressed as a document capability instead of a hard-coded branch in the sync engine;
- tests prove the generic registry can accept a non-fitness `note:*` document without teaching Core about that domain.

Redis keys, revisions, payload fields, profile IDs and current conflict rules are intentionally unchanged in this phase.

## Phase 6 — Analytics / Diagnostics Core

Owner: Extraction Engineer. Review: QA/Privacy when identity changes.

Extract generic:

```text
analytics.track(event, properties?)
diagnostics.capture(error, context?)
```

Core must not own workout event names.

### Analytics / Diagnostics implementation status

The first observability boundary now separates transport/aggregation from FitTimer semantics:
- `src/core/observability.ts` owns generic client `track()` and `capture()` transport/payload construction;
- FitTimer keeps only context wiring such as current locale, Premium state and device ID;
- `lib/analytics-core.js` owns generic event counting, anonymized device cohorts and retention storage;
- `lib/fit-analytics-schema.js` owns FitTimer event names such as workout milestones and AI usage;
- `lib/analytics.js` remains a compatibility wrapper so existing API/admin callers do not change;
- `lib/diagnostics.js` was already domain-neutral and remains the generic server-side redaction/aggregation implementation.

Existing `/api/auth` actions, Redis analytics keys, retention TTLs and diagnostic payload shapes are intentionally preserved.

## Phase 7 — AI Runtime / Product Actions split

Owner: Architect. Implementation: Extraction Engineer. Review: Security + QA.

Core AI responsibilities:
- auth/entitlement;
- quotas;
- provider/model selection;
- fallback/timeouts;
- usage/logging;
- text/image transport.

Product action responsibilities:
- action id;
- prompt/input mapping;
- quota class;
- output validation;
- FitTimer protocol semantics.

Example direction:

```text
fitness.program.create
fitness.exercise.modify
language.lesson.create
tasks.project.plan
```

A simple demo action should be able to use AI runtime without importing fitness protocol code.

### AI action registry implementation status

The first AI boundary now separates product action semantics from the endpoint/runtime dispatcher:
- `lib/ai-action-registry.js` is a generic registry for action id, mode, quota bucket and optional execution/validation metadata;
- `lib/fit-ai-actions.js` owns the existing FitTimer actions (`program.*`, `exercise.*`, `video.parse`, `image.*`);
- `lib/ai-endpoint.js` no longer contains the FitTimer action regex, quota classification, image aspect-ratio mapping or video dispatch branch;
- current action ids remain unchanged for client compatibility;
- current Premium/auth/quota/logging behavior and provider fallback stay unchanged.

This is deliberately a first split. Provider/settings code in `lib/ai.js` still contains some product-adjacent test/config concerns and can be refined later without mixing that work into action routing.

## Phase 8 — Notification Core

Owner: Architect + platform implementation. Review: UX + QA.

Core owns permission, scheduling/cancellation, push registration, preferences, cooldown/delivery mechanics and analytics.

FitTimer owns workout reminder, rest finished, missed/unfinished workout, progression and trainer-update semantics.

Generic mobile primitive should schedule generic notification items rather than expose `scheduleWorkoutNotifications` as a Core API.

### Notification policy implementation status

The first notification boundary now moves product-neutral policy into typed Core:
- `src/core/notifications.ts` owns a generic preference store and generic delivery-budget limiter;
- FitTimer retains its categories, workout/premium candidate generation and copy;
- existing account-level `notificationPrefs` sync shape is unchanged;
- exact-time reminders still bypass the passive daily budget exactly as before;
- engagement suppression against workout days is passed into Core as a product callback instead of being hard-coded into Core.

### Native notification transport implementation status

The next slice moves product-neutral Capacitor notification transport into `src/core/native-notifications.ts`:
- local notification permission checks/requests;
- exact-alarm capability checks;
- generic schedule/cancel/remove-delivered operations;
- replace-a-reserved-ID-range scheduling;
- push permission/registration.

`mobile.js` remains the FitTimer adapter that constructs rest/workout/inactivity payloads and handles FitTimer action events. Core does not know workout, rest, program or Premium semantics.

## Phase 9 — Mobile bridge split

Owner: Extraction Engineer + DevOps. Review: QA.

Core candidates:
- app lifecycle;
- URL-open primitive;
- share/filesystem temp;
- push/local notifications;
- theme;
- biometrics;
- haptic primitive;
- microphone/voice primitive;
- update primitive.

FitTimer side:
- program deep-link parsing;
- workout voice behavior;
- rest/workout notification construction;
- fitness-specific custom event names.

### Mobile bridge implementation status

The reusable mobile boundary now includes `src/core/mobile.ts`:
- generic app lifecycle subscription with background duration;
- raw app-URL/open + launch-URL primitives;
- temporary-file native sharing;
- haptic impact;
- native theme bridge;
- app version/build/distribution info;
- external URL opening;
- biometric status/authentication.

FitTimer still owns:
- validation/parsing of `/p/<id>` links;
- `fittimer://workout/resume` semantics;
- background behavior for voice/audio/wake-lock/workout state;
- workout haptic choice/call sites;
- custom updater/download/install flow;
- microphone/TTS/SpeechRecognizer behavior.

This keeps Core unaware of programs/workouts while preserving the existing `window.FitNative` compatibility surface for the current app.

## Phase 10 — Infrastructure adapters: Supabase + OpenRouter

Owner: Architect + DevOps/Backend. Review: Security + QA.

Detailed migration plan: `docs/infrastructure-adapters.md`.

Target architecture:

```text
AppBase Core
├─ Server Store interface
│  ├─ current Upstash adapter
│  └─ Supabase/Postgres adapter
└─ AI Provider interface
   ├─ direct providers
   └─ OpenRouter adapter
```

Rules:
- AppBase must not require Supabase or OpenRouter to function conceptually; both are provider adapters.
- Supabase database migration is separate from authentication migration.
- Do not expose Supabase service-role or OpenRouter keys to browser/APK.
- Preserve current sync/account wire contracts during initial storage migration.
- Start Supabase with shadow writes/parity checks before any authoritative cutover.
- Keep direct AI provider paths while OpenRouter reliability/cost/capabilities are measured.
- Do not keep permanent dual-write or bidirectional migration paths.

Recommended order:
1. Supabase project/env + server-only connection health.
2. Provider-neutral server-store interface around actual AppBase needs.
3. Supabase schema and shadow writes.
4. Parity/revision/tombstone monitoring.
5. OpenRouter provider adapter behind existing AI Runtime.
6. Provider routing/fallback comparison.
7. Controlled Supabase read/write cutover only after acceptance gates.

Supabase Auth, Realtime and Storage are deferred unless a concrete product need justifies them.

### Infrastructure foundation implementation status

The first adapter slice is now implemented without changing production authority:
- active Supabase project `FitT` has a server-only connection adapter and health probe;
- no product table schema or storage cutover is performed yet;
- Upstash remains the authoritative store;
- OpenRouter is available as an optional **text** provider in the existing AI routing/fallback system;
- Gemini/OpenAI remain supported and the default route is unchanged;
- health diagnostics expose only configuration/connectivity state, never secret values.

The provider-neutral document store and first shadow schema are now implemented:
- generic `lib/document-store.js` contract;
- Supabase adapter in `lib/supabase-document-store.js`;
- migrated `public.appbase_documents` table in `FitT`;
- env-gated sync shadow writes and parity comparison;
- privacy purge for profile/account deletion;
- Upstash remains authoritative and Supabase reads never serve production sync responses.

The next decision is operational rather than architectural: add Supabase server env to Vercel, enable shadow write first, observe parity, then enable compare. Do not switch authoritative reads yet.

## Phase 11 — Admin decomposition

Owner: Architect + Extraction Engineer. Review: Security + QA.

Keep Vercel function count compact. `/api/admin` may remain a dispatcher while implementation moves to internal Core vs FitTimer modules.

Core Admin candidates:
- users;
- analytics;
- errors;
- campaigns;
- AI settings/testing infrastructure;
- pricing/payments settings;
- release/config health.

FitTimer Admin candidates:
- catalog;
- trainers;
- catalog AI/editor logic;
- fitness image prompts/assets.

Milestone: Core Admin can conceptually run without catalog/trainer modules.


### Admin decomposition implementation status

Phase 11 is now implemented as an internal module boundary while keeping one Vercel Admin endpoint:
- `api/admin.js` is a thin authenticated/rate-limited dispatcher;
- reusable admin behavior lives under `lib/admin/core/*` (accounts, analytics/diagnostics, campaigns, AI settings/testing, release checks);
- FitTimer catalog/trainer behavior lives under `lib/admin/fittimer/*` (catalog text/protocol helpers, catalog AI editing/translation, image prompts/generation, moderation/drafts/CRUD/trainers/seed);
- Core Admin does not import FitTimer Admin modules;
- product-specific release asset names are injected by the FitTimer dispatcher rather than owned by Core;
- generic AI usage buckets are exposed as `heavy/light/image`; FitTimer maps them to program/exercise/image labels in its Admin UI;
- `/api/admin` remains a single Vercel function, so the split does not multiply serverless endpoints.

The Phase 11 milestone is satisfied: Core Admin can conceptually be reused without catalog/trainer modules.

## Phase 12 — Reusable UI foundation

Owner: UX/UI. Implementation: Extraction Engineer.

Extract only repeated primitives and tokens. Do not introduce a new frontend framework just for AppBase.

Candidate primitives: Button, Input, Select, Switch, Tabs, Card/ListRow, Modal/Sheet, Toast, Badge/Avatar, Loading/Empty/Error states.

Brand tokens should allow a future product to stop looking like FitTimer without rewriting every screen.


### UI foundation implementation status

The first reusable UI slice is now typed Core rather than product markup:
- `src/core/ui.ts` owns generic visibility, text, modal open/close, busy-button state and delegated action primitives;
- `src/core/ui.runtime.js` is generated by the same Core build pipeline as the other AppBase compatibility runtimes;
- the module contains no FitTimer selectors, catalog/trainer/workout concepts or product copy;
- this slice is intentionally not yet wired across existing FitTimer screens. Product adoption will be incremental so modal history, accessibility and current visual behavior stay stable.

Phase 12 is therefore **started, not complete**. The next UI slice should adopt these primitives in touched FitTimer screens and then extract only CSS primitives/tokens that prove reusable in real usage.

## Phase 13 — Retire legacy JS/global build path

Owner: Architect + DevOps. Review: QA.

ES modules/bundling should already have been introduced earlier when typed Core modules needed explicit imports/exports. This later phase is for finishing the transition:

- migrate remaining high-value infrastructure still on legacy globals;
- shrink/remove temporary global compatibility declarations;
- retire concatenation paths that no longer serve untouched legacy code;
- raise TypeScript strictness where temporary allowances remain;
- ensure production web/mobile builds use the same typed module graph where practical.

Do not combine final legacy-build removal with unrelated data/protocol migrations.

## Phase 14 — Dependency rules

Automate:

```text
src/core/** cannot import src/domain/**
domain may import core
app/bootstrap may compose both
```

## Phase 15 — Feature/capability config

Only after real modules exist, support capabilities such as:

```text
profiles
premium
ai
notifications
biometrics
sharing
```

Do not create `if (app === 'fitness')` / `if (app === 'language')` branches inside Core.

## Phase 16 — AppBase readiness audit

Before fork/snapshot:
- typecheck/contracts exist;
- product identity is centralized enough to bootstrap a new app safely;
- generic Storage API exists;
- Account/Profile are separated from fitness extension;
- generic document-sync facade/registry exists;
- Analytics/Diagnostics are generic;
- AI Runtime does not own fitness prompts/schemas;
- notification Core does not own workout semantics;
- mobile Core does not own program/workout links;
- Core Admin is separated from FitTimer Admin;
- Core → Domain imports are prevented;
- profile/auth/sync/backup regressions remain green.

## Phase 17 — Core upstream transition

After the AppBase extraction and proof-product checks, explicitly switch ownership:

1. mark AppBase Core as canonical upstream;
2. record the AppBase Core version/commit consumed by each product;
3. create a repeatable downstream update path;
4. start with reviewable automated PRs unless a different mechanism proves simpler;
5. verify one generic Core change can update FitTimer and one non-fitness app;
6. retire the temporary FitTimer → AppBase bootstrap sync path;
7. document the hotfix/backport procedure for urgent product-first fixes.

Do not call this phase complete merely because repositories share similar files; ownership and update direction must be explicit.

## After the fork: AppBase extraction

Delete fitness programs, exercises, workout engine, progression, warm-up, fitness progress, trainer/trainee, fitness catalog, fitness AI actions/prompts, fitness notifications and fitness deep links.

The remaining base should still support Account/Auth, optional Profiles, generic Storage/Sync, AI runtime, entitlements, notifications, analytics/diagnostics, Core Admin and web/mobile shells.

## Universality proof

Use at least:

```text
Mini Language App
Mini Task Manager
```

If either requires Core to learn `Lesson`, `Course`, `Task`, `Project` or another product business entity, inspect whether that is a real reusable capability gap or a sign of premature abstraction.

## Suggested task sequence

1. TypeScript/typecheck foundation.
2. Introduce ES modules/bundler at the first Core slice that needs explicit imports/exports; likely AppConfig/Storage, but verify current dependencies first.
3. Central AppConfig — TypeScript.
4. Storage facade — migrate touched storage/Core code to TypeScript.
5. Account/Profile contracts — migrate touched infrastructure to TypeScript.
6. Generic Sync facade — TypeScript for new Core surface.
7. Analytics/Diagnostics extraction — TypeScript.
8. AI runtime split — migrate touched reusable runtime modules to TypeScript.
9. Notifications split — migrate reusable engine/platform surface to TypeScript.
10. Mobile bridge split — type the JS/TS boundary as far as the current Capacitor setup safely allows.
11. Infrastructure adapters — Supabase foundation/shadow migration + OpenRouter provider.
12. Admin internal decomposition — new Core internals TypeScript where build/runtime permits; surface provider health/config only after adapters exist.
13. UI primitives/tokens — TypeScript for new reusable behavior modules; stable markup/CSS remain as appropriate.
14. Retire remaining legacy global/concatenation compatibility.
15. Dependency checks + stricter TS settings.
16. Readiness audit.
17. Extract AppBase and validate proof products.
18. Switch Core ownership to AppBase and establish downstream update PRs.

Each item should remain a separate, reviewable task unless current evidence shows combining steps is safer.