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

## Phase 4 — Account / Profile boundary

Owner: Architect + Extraction Engineer. Review: Security + QA.

Separate Account, generic Profile and FitTimer profile extension.

Generic Profile should not require age, gender, height, body measurements or fitness preferences. Profiles should eventually be an optional capability for products that do not need multiple people under one account.

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

## Phase 6 — Analytics / Diagnostics Core

Owner: Extraction Engineer. Review: QA/Privacy when identity changes.

Extract generic:

```text
analytics.track(event, properties?)
diagnostics.capture(error, context?)
```

Core must not own workout event names.

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

## Phase 8 — Notification Core

Owner: Architect + platform implementation. Review: UX + QA.

Core owns permission, scheduling/cancellation, push registration, preferences, cooldown/delivery mechanics and analytics.

FitTimer owns workout reminder, rest finished, missed/unfinished workout, progression and trainer-update semantics.

Generic mobile primitive should schedule generic notification items rather than expose `scheduleWorkoutNotifications` as a Core API.

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

## Phase 10 — Admin decomposition

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

## Phase 11 — Reusable UI foundation

Owner: UX/UI. Implementation: Extraction Engineer.

Extract only repeated primitives and tokens. Do not introduce a new frontend framework just for AppBase.

Candidate primitives: Button, Input, Select, Switch, Tabs, Card/ListRow, Modal/Sheet, Toast, Badge/Avatar, Loading/Empty/Error states.

Brand tokens should allow a future product to stop looking like FitTimer without rewriting every screen.

## Phase 12 — Retire legacy JS/global build path

Owner: Architect + DevOps. Review: QA.

ES modules/bundling should already have been introduced earlier when typed Core modules needed explicit imports/exports. This later phase is for finishing the transition:

- migrate remaining high-value infrastructure still on legacy globals;
- shrink/remove temporary global compatibility declarations;
- retire concatenation paths that no longer serve untouched legacy code;
- raise TypeScript strictness where temporary allowances remain;
- ensure production web/mobile builds use the same typed module graph where practical.

Do not combine final legacy-build removal with unrelated data/protocol migrations.

## Phase 13 — Dependency rules

Automate:

```text
src/core/** cannot import src/domain/**
domain may import core
app/bootstrap may compose both
```

## Phase 14 — Feature/capability config

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

## Phase 15 — AppBase readiness audit

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

## Phase 16 — Core upstream transition

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
11. Admin internal decomposition — new Core internals TypeScript where build/runtime permits.
12. UI primitives/tokens — TypeScript for new reusable behavior modules; stable markup/CSS remain as appropriate.
13. Retire remaining legacy global/concatenation compatibility.
14. Dependency checks + stricter TS settings.
15. Readiness audit.
16. Extract AppBase and validate proof products.
17. Switch Core ownership to AppBase and establish downstream update PRs.

Each item should remain a separate, reviewable task unless current evidence shows combining steps is safer.