# AppBase Starter + Task Mini plan — 2026-10-07

Status: **planned**  
Date: **2026-10-07**  
Repository baseline when this plan was written: `main` at `9222272013c55ea8a51860a876331c46c5cfd2d8`.

## Goal

Make new AppBase products fast to start and hard to mis-integrate.

Target model:

```text
AppBase Core
    ↓
templates/react-app
    = mandatory minimum platform baseline
    ↓
apps/task-mini
    = executable reference + one real product domain
    ↓
real products such as UnMute
    = product-specific complexity on top of the same contracts
```

The important distinction:

- **Starter** is the source of truth for the minimum infrastructure every new app gets.
- **Task Mini** is the working reference that proves the baseline can support a real domain.
- **UnMute** is a production example, not a template to copy.
- Product-specific behavior stays in the product. Core/shared UI grows only when reuse is proven.

## Desired outcome

After:

```bash
npm run app:create -- <slug> "<Name>" <reverse.domain.id> [ru|en]
```

a new app should already have the platform plumbing needed for a normal account-centric product:

- auth and account lifecycle;
- local-first sync;
- storage;
- billing client and entitlements;
- analytics and diagnostics;
- i18n and theme;
- legal/config surface;
- health/readiness;
- shared Admin;
- error handling;
- baseline tests and CI integration.

The app team should then spend most of its time on:

- domain schemas;
- repositories/merge policy;
- product UX;
- product analytics taxonomy;
- optional AI actions;
- optional native capabilities;
- product-specific Admin sections.

## Part A — Starter baseline

### A1. Define the baseline contract

Create one explicit, machine-checkable list of mandatory starter integration points.

At minimum verify:

- React + TypeScript + Vite;
- routing;
- Core aliases;
- AuthProvider/auth client;
- i18n;
- product theme;
- local-first sync;
- billing client;
- install analytics;
- client diagnostics;
- fatal error boundary;
- `#/admin`;
- `/api/admin`;
- `/api/health`;
- legal/config integration;
- tests;
- `npm run check`.

Classify platform capabilities as:

1. **required** — present in every generated app;
2. **optional** — supported by Core but enabled only by product capability/configuration;
3. **product-specific** — never added to the generic starter just because one product needs it.

Do not use source-file equality as the contract. Test behavior/integration points.

### A2. Audit generic lessons from UnMute

Review features that were proven in production and decide whether they belong in:

- Core;
- `packages/ui-react`;
- starter;
- optional capability;
- product-only code.

Priority candidates:

- route-not-found UX;
- route error UX;
- analytics/error outbox and retry behavior;
- account deletion lifecycle;
- billing bundles/subscriptions/renewal support;
- remote push;
- AI configuration;
- legal/terms configuration;
- native capability wiring.

Do not copy UnMute screens or product workflows into Starter.

### A3. Canonical startup lifecycle

Make starter startup boring and consistent.

Expected order, subject to implementation details:

```text
product theme
→ shared busy-state behavior
→ diagnostics
→ install analytics
→ sync bootstrap
→ router
→ fatal error boundary
```

The exact implementation may differ, but every generated app should follow one documented lifecycle.

### A4. Admin is mandatory platform infrastructure

Every generated app must include:

- `#/admin`;
- shared `AdminPanel`;
- `adminClient`;
- `/api/admin`;
- `/api/health`.

No new product should have to design the platform Admin shell again.

### A5. Turn shared Admin into the AppBase control plane

Admin should answer four questions for every common module:

1. Is this capability used by the product?
2. Is its backend/configuration ready?
3. Is it healthy now?
4. What does the owner need to configure next?

Target common modules:

| Module | Admin responsibility |
|---|---|
| Health | service readiness and warnings |
| Storage | backend state/migration/readiness |
| Auth | email login readiness, accounts, test login flow |
| Sync | transport/storage readiness |
| Analytics | installs/activity/platforms |
| Diagnostics | client errors |
| Billing | providers, payment configuration, payment journal |
| Entitlements | manual grant/revoke, subscriptions/purchases |
| AI | models/routes, secrets status, connection test |
| Remote Push | Android/iOS readiness and campaigns |
| Legal | owner/contact/legal settings |
| Secrets | write-only configuration/status |
| Product capabilities | enabled/disabled/readiness summary |

### A6. Capability-aware Admin

Admin should understand product capabilities/config.

Examples:

- AI disabled → clearly show disabled/not used, or omit detailed AI setup.
- Billing enabled but no provider → show enabled but not configured.
- Push enabled but Firebase/APNs missing → show incomplete readiness.
- Legal enabled but owner/contact missing → show actionable warning.

Avoid a UI where every possible module looks broken simply because the product intentionally does not use it.

### A7. Product extension contract

Keep the existing extension model:

```text
shared Core/Admin sections
+
product extraSections
```

Shared Admin owns platform infrastructure.

Product Admin owns domain operations such as:

- course/content editor;
- product catalogs;
- custom moderation;
- domain migrations;
- release/content publishing.

No `if (app === ...)` in shared code.

### A8. Generic fallback UX

Starter should include a calm, production-safe:

- not-found route;
- route-error screen;
- fatal error fallback.

New apps must not expose framework/developer error pages by default.

### A9. Observability hardening

Compare starter observability with the generic mechanisms already proven by production apps.

If retry/outbox/flush behavior is genuinely generic, move it to the correct shared layer and make Starter use it.

Do not duplicate product event taxonomy in shared code.

### A10. Generator acceptance test

The existing clean-starter CI should be extended from “generates and compiles” to “proves the baseline contract”.

Generate a temporary app and verify at least:

- app check passes;
- required source integration points exist;
- Admin builds;
- health/admin server composition exists;
- shared capability configuration is valid;
- no product-specific vocabulary leaked into Core/shared baseline.

### A11. Baseline manifest / contract test

Add a small machine-readable contract or equivalent test helper for mandatory integration points.

Purpose:

- starter changes are intentional;
- Task Mini can be checked against the same required baseline;
- future generic modules cannot silently appear in Starter while the reference app drifts.

## Part B — Task Mini

### B1. Preserve its role

Task Mini should remain intentionally small.

It exists to demonstrate:

- real domain model;
- Zod validation;
- local-first repository;
- merge semantics;
- Core sync registry;
- TanStack Query usage;
- auth + account sync;
- billing/entitlement example;
- product analytics events;
- product Admin extension contract.

Do not turn it into a miniature UnMute.

### B2. Starter-to-Task-Mini parity audit

Produce a migration checklist by comparing current Task Mini with the current required starter baseline.

Likely areas to reconcile include:

- fatal error boundary;
- diagnostics;
- install analytics;
- startup lifecycle;
- generic route/error UX;
- Admin capability/readiness contract;
- any newly required shared baseline integration.

### B3. Bring Task Mini to full required baseline parity

Task Mini must implement every **required** Starter capability unless there is an explicit documented exception.

Its product-specific task domain remains separate from the generic baseline.

### B4. Make Task Mini the reference Admin app

`#/admin` in Task Mini should exercise the shared Admin comprehensively.

For generic optional modules it is acceptable to show:

- disabled;
- enabled but not configured;
- healthy;
- warning;

without requiring real production secrets/providers.

The important thing is that the full generic Admin contract renders and behaves correctly.

### B5. Demonstrate one product-specific Admin extension

Add at most one small Task Mini `extraSection`, only to document the extension pattern.

Possible example:

- task statistics;
- task-specific maintenance/settings.

Keep it deliberately small. Its purpose is architectural demonstration, not feature growth.

### B6. Admin contract tests

Test the real chain:

```text
Task Mini API
→ Core admin handler
→ admin client
→ shared React Admin
```

Cover the generic sections/actions that the baseline promises.

### B7. Admin browser smoke

Add a Task Mini browser flow that:

- opens `#/admin`;
- authenticates with test Admin credentials;
- visits generic Admin sections;
- confirms enabled modules work;
- confirms intentionally unconfigured modules show a valid readiness state instead of crashing.

### B8. Drift protection

CI should fail when:

- Starter gains a new **required** integration point;
- Task Mini does not implement it;
- no explicit documented exception exists.

Do not compare Task Mini and Starter byte-for-byte.

Task Mini is a real app, so only baseline contracts should match.

## Part C — CI and documentation

### C1. CI rules

Changes under:

- `packages/core/**`;
- `packages/ui-react/**`;
- `templates/react-app/**`;

must exercise the relevant starter contract and Task Mini reference checks.

Keep the checks targeted and fast enough for normal PR use.

### C2. Document the three roles

Update architecture docs so future work consistently uses:

```text
templates/react-app
= minimum mandatory scaffold

apps/task-mini
= executable architecture reference + simple domain

apps/unmute
= complex production consumer
```

Do not tell developers to copy FitTimer or UnMute as the starting point for a new product.

## Part D — Delivery slices

### PR 1 — Baseline contract

- define required/optional/product-specific classification;
- document Starter/Task Mini roles;
- add baseline manifest/contract helper;
- audit current drift without broad product changes.

### PR 2 — Starter hardening

- canonical startup lifecycle;
- fallback/error UX;
- Admin control-plane/readiness improvements;
- observability changes proven to be generic;
- stronger generated-app acceptance checks.

### PR 3 — Task Mini parity

- migrate Task Mini to current required baseline;
- reference Admin coverage;
- one minimal product `extraSection`;
- targeted unit/contract/browser tests.

### PR 4 — Drift protection

- wire baseline checks into CI;
- make starter/reference divergence fail early;
- update architecture/readiness docs with final contracts.

## Definition of done

The work is done when all of these are true:

1. A newly generated app already contains the complete minimum AppBase infrastructure.
2. Its Admin opens without product-specific work.
3. Admin clearly distinguishes disabled, unconfigured, warning, and healthy capabilities.
4. Task Mini implements every required baseline contract.
5. Task Mini remains small enough to understand as a reference app.
6. Task Mini demonstrates one real domain and one product Admin extension without product logic leaking into Core.
7. CI proves a clean generated app and Task Mini whenever shared platform contracts change.
8. Adding a normal account-centric product should mainly require domain/UX work instead of rebuilding auth, sync, billing, diagnostics, Admin, health, legal, and analytics infrastructure.

## Scope boundary for future products

This plan is intended to make ordinary account-centric products quick to build: task managers, planners, trackers, education apps, personal utilities, CRM-lite products, AI utilities, and similar apps.

A social/multi-user network product (for example Tinder-like matching) would reuse the baseline but may need additional reusable capabilities such as:

- public profiles;
- relationships/matching;
- realtime;
- messaging;
- media;
- moderation/reporting;
- abuse prevention;
- geo/search ranking.

Do **not** pre-build that entire layer now.

When the first real product requires it, extract only the reusable primitives proven by that product, following the same Core → Starter → reference-app discipline.
