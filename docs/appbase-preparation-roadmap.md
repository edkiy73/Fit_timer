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

## Phase 1 — Type-safety foundation

Owner: Architect + DevOps. Implementation: Extraction Engineer.

Introduce TypeScript as a checker first, not as a mass rewrite:

```text
typescript
tsconfig.json
src/types or equivalent contract location
npm run typecheck
```

Allow JS/TS coexistence. Start with contracts for AppConfig, Account, Profile, entitlement/subscription, sync envelope/document, AI request/response, notification preferences, analytics/error payloads and public config.

Keep FitTimer models separate: Program, Plan, Exercise, WorkoutSession, WorkoutStats, Trainer, CatalogEntry.

Add runtime validation at external boundaries when useful; TypeScript alone does not validate API/Redis/backup/AI input.

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

## Phase 12 — ES Modules + TypeScript runtime

Owner: Architect + DevOps. Review: QA.

Do this after boundaries exist. The current concatenation build hides dependencies; a lightweight bundler such as esbuild is a plausible direction, but should be re-evaluated at implementation time.

Do not combine module-system migration with major data/protocol changes.

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

1. Type-safety foundation.
2. Central AppConfig.
3. Storage facade.
4. Account/Profile contracts.
5. Generic Sync facade.
6. Analytics/Diagnostics extraction.
7. AI runtime split.
8. Notifications split.
9. Mobile bridge split.
10. Admin internal decomposition.
11. UI primitives/tokens.
12. ES modules/TS runtime build.
13. Dependency checks.
14. Readiness audit.

Each item should remain a separate, reviewable task unless current evidence shows combining steps is safer.