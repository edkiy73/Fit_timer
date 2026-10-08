# AppBase Starter + Task Mini plan — 2026-10-07

Status: **PR1–PR4 complete; PR5 final drift/documentation guard in progress**  
Date: **2026-10-07**  
Finalization review: **2026-10-09**  
Repository baseline when this plan was written: `main` at `9222272013c55ea8a51860a876331c46c5cfd2d8`.

## Implementation result

The architecture described below is now implemented, not merely proposed:

- Starter has **17/17 required baseline capabilities** with no declared gaps.
- Task Mini has the same **17/17 required baseline**, one small product Admin extension, browser coverage and an executable billing reference.
- Billing is Core-owned: canonical entitlements/journal, BillingRouter, one regional/platform policy, Apple/Google/Stripe/YooKassa adapters, server verification, store notifications, restore/reconciliation, readiness, editable SKU mappings, provider controls, operational health and manual Admin audit.
- Generated apps receive provider-neutral purchase/restore entry points and shared Admin billing infrastructure.
- Task Mini proves one-time purchase, subscription, external checkout + webhook, failure/cancel, duplicate webhook, refund/revocation, expiry, restore, second-session visibility and manual Admin grant/revoke.
- Shared CI checks Starter/Task Mini contracts on Core/UI/template changes; PR5 adds explicit CI-contract and provider-boundary drift guards.
- Task Mini browser E2E runs the same API handlers under a local Node HTTP server, so the reference product is not coupled to the Vercel runtime.
- **FitTimer migration remains outside this plan and has not been started automatically.** The migration gate at the end of this document still applies.

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


## Hosting independence — architectural requirement

AppBase Core must be **hosting-neutral**. Product code must not depend on Vercel, Cloudflare, Supabase hosting conventions, or another specific deployment platform.

The target is:

```text
Product app
    ↓
AppBase Core contracts
    ↓
hosting/provider adapters
    ↓
Vercel / Cloudflare / another host
```

A hosting migration should primarily replace infrastructure adapters and deployment configuration, not require changes across every product.

### H1. Core must not depend on hosting-specific request/runtime APIs

Shared server modules should use AppBase-owned contracts for:

- request/response handling;
- environment/config access;
- persistent key/value or database storage;
- object/file storage when needed;
- scheduled/background jobs where supported;
- email delivery;
- push delivery;
- AI providers;
- billing providers;
- logging/observability.

Hosting-specific APIs belong behind adapters.

### H2. Product APIs must stay portable

Product API code should express product behavior and compose Core services.

Avoid product code that directly imports or assumes:

- Vercel request/response types;
- Vercel KV/Blob/Storage APIs;
- Cloudflare Workers bindings;
- Supabase-specific client behavior;
- platform-specific cron/event objects;
- provider-specific secret/config lookup.

Where a platform needs a thin entry wrapper, keep it at the deployment edge.

### H3. Deployment adapters are replaceable

The same app should be able to have adapters such as:

```text
server/adapters/vercel/*
server/adapters/cloudflare/*
server/adapters/node/*
```

without changing product domain code.

The exact folder structure can differ; the requirement is the boundary, not these names.

### H4. Data portability is separate from hosting portability

Do not tie product data format to one storage provider.

Core should define provider-neutral storage contracts and explicit migration/export paths so moving from one platform/provider does not force product rewrites.

This applies especially to:

- account/session data;
- sync documents;
- analytics;
- billing journal;
- admin settings;
- secrets metadata;
- push registrations.

### H5. Starter must prove hosting-neutral composition

Starter should not encode Vercel as the architecture.

It may ship a Vercel deployment target initially, but the product/runtime composition must be separable from that target.

Acceptance criteria should include:

- product code does not import hosting-specific SDKs directly;
- Core contracts can be instantiated with a different adapter;
- hosting configuration lives outside product domain logic;
- a second host adapter can be added without changing product screens/domain modules.

### H6. Task Mini becomes the portability smoke app

Task Mini should be the smallest app used to prove host independence.

Long-term portability smoke:

1. run the same Task Mini product code against the default hosting adapter;
2. run it against at least one alternate/local Node-compatible adapter;
3. verify auth, sync, Admin, health, analytics and billing test flows keep the same product contracts.

A full second production deployment is not required in the first pass; the architecture and automated smoke should make that deployment possible without product rewrites.

### H7. Admin and health must expose platform readiness without leaking platform coupling

Shared Admin may show which infrastructure adapter/provider is active and whether it is healthy, but product code should consume generic readiness states.

Example:

```text
Storage: healthy
Mail: configured
Push: not configured
Hosting adapter: vercel
```

Changing the hosting adapter must not require rewriting product Admin sections.


### H9. Admin configures providers; deployment config chooses the host

Shared Admin should be the **control plane for runtime services**, but not a button that migrates the whole application between hosting platforms.

Admin may configure or select, where safe and supported:

- AI providers/models/routes;
- mail provider;
- push provider/configuration;
- billing providers and modes;
- provider-neutral storage/backend options that are designed for runtime switching;
- feature/capability flags;
- legal settings;
- limits, pricing and other server-owned operational settings;
- primary/fallback providers where a module supports failover.

Admin should also contain an **Infrastructure** view that shows at least:

```text
Hosting adapter: Vercel
Storage: healthy
Mail: configured
Push: not configured
Billing: configured
AI: primary configured, fallback missing
```

The Infrastructure view must use generic AppBase readiness contracts so it keeps working when the active host/provider changes.

The following remain **deployment-level concerns**, not normal Admin switches:

- moving the application itself from Vercel to Cloudflare/Node/another host;
- DNS/domain cutover;
- build/runtime selection;
- platform function/worker configuration;
- platform environment/secrets wiring needed before the new deployment can boot;
- infrastructure migration steps that cannot be made transactional/safe from inside the running app.

Rule:

```text
Admin
= configure and observe services inside the running AppBase deployment

Deployment configuration
= choose where/how AppBase itself runs
```

Changing hosting must not require changes to product-specific Admin sections.

### H8. Definition of portability

A hosting migration is considered healthy when changing host primarily touches:

- deployment config;
- platform entry wrappers;
- infrastructure adapters;
- environment/secrets wiring;

and does **not** require changing:

- product domain schemas;
- product screens;
- product repositories/merge rules;
- product analytics taxonomy;
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
| Infrastructure | active hosting adapter, active providers, readiness and next setup actions |

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


### A12. Billing is a first-class AppBase capability

Billing must be implemented as a reusable Core capability, not separately inside FitTimer, UnMute, or future products.

Target composition:

```text
Product
    ↓
AppBase Billing client / BillingRouter
    ↓
provider adapters
    ├── Apple In-App Purchase
    ├── Google Play Billing
    ├── Stripe
    └── YooKassa
    ↓
AppBase Entitlements
```

Product code should describe products and access rules. It must not contain provider-specific checkout, webhook, receipt-validation, subscription-state, or regional-policy logic.

### A13. One canonical entitlement model

Core owns the canonical access state regardless of where the payment happened.

At minimum the normalized model must support:

- user/account;
- product/entitlement key;
- active/inactive state;
- source/provider;
- purchase type: subscription or one-time;
- start/expiry timestamps where applicable;
- auto-renew state where available;
- original provider transaction/order reference;
- cancellation/refund/revocation state;
- last verification timestamp.

Provider examples:

```text
apple
google
stripe
yookassa
promo
admin
```

Applications ask Core whether an entitlement is active. They do not infer Premium from local receipts.

### A14. BillingRouter and regional/platform capability policy

Core must expose one provider-neutral decision layer that determines which payment methods a product may offer for the current build/context.

Inputs may include:

- platform;
- distribution channel;
- store/storefront or country when reliably available;
- product/SKU;
- configured providers;
- product billing policy.

Output is a list of allowed/available payment methods plus readiness metadata.

Example contract:

```json
{
  "methods": ["google_play", "stripe"],
  "product": "premium_monthly"
}
```

Rules:

- the client never hardcodes "show Stripe in country X";
- regional/store rules live in one updateable Core policy layer;
- a method that is forbidden, unavailable, or not configured is not rendered;
- policy and provider readiness are separate concerns;
- changing payment policy must not require changes to product screens.

The first supported provider set should cover the broad default case:

1. Apple IAP for Apple storefront purchases;
2. Google Play Billing for Play-distributed Android purchases;
3. Stripe for international direct/external card payments where allowed;
4. YooKassa for Russian cards/SBP and other supported Russian payment methods where allowed.

Do not add many country-specific gateways until a real market requires them.

### A15. Provider adapter contract

Each billing provider adapter should normalize the same operations where the provider supports them:

- create/start checkout;
- validate/verify purchase;
- receive and verify webhook/server notification;
- normalize payment/subscription events;
- restore/reconcile purchases;
- cancel/revoke/refund state ingestion;
- health/readiness;
- provider product/SKU mapping.

Provider SDKs, secrets, signatures, receipt formats and webhook payloads stay inside adapters.

### A16. Server-owned purchase state and reconciliation

Every payment path must converge on the server:

```text
Apple / Google / Stripe / YooKassa
        ↓
verified provider event / receipt
        ↓
AppBase Billing journal
        ↓
canonical entitlement update
        ↓
account sync
        ↓
product sees access
```

Requirements:

- webhook/server notifications are idempotent;
- duplicate events do not duplicate grants;
- refunds/revocations remove access according to product policy;
- expired subscriptions stop access without requiring an app update;
- purchases made on another device become visible after account sync;
- provider outages can be reconciled later from the journal/provider state;
- the billing journal is provider-neutral enough to survive provider/hosting migration.

### A17. Billing configuration in shared Admin

Shared Admin must make billing operational without product-specific billing screens.

At minimum provide:

- capability enabled/disabled;
- provider enabled/disabled;
- provider readiness;
- write-only secret/key configuration where appropriate;
- Apple/Google/Stripe/YooKassa configuration status;
- AppBase product → provider SKU mapping;
- prices/currency metadata used by the product;
- payment journal;
- entitlement lookup by account;
- manual grant/revoke with audit trail;
- webhook/server-notification health;
- latest reconciliation/error state;
- regional/provider policy summary.

Admin should distinguish:

```text
disabled
enabled but not configured
configured but unhealthy
healthy
```

Do not expose secret values after saving them.

### A18. Starter billing contract

Every generated app gets the billing integration points even if billing is disabled initially.

Starter must include:

- Core billing client;
- entitlement client/state;
- product billing config/manifest;
- provider-neutral purchase entry point;
- restore/reconcile entry point;
- API composition for billing;
- Admin billing/entitlement sections;
- readiness/health integration.

A new app should be able to enable billing mainly by configuration and product definitions rather than copying implementation from another app.

Illustrative product config:

```text
billing: true
products:
  - premium_monthly
  - premium_yearly
```

The exact config shape may differ; the requirement is that provider-specific code is not copied into the product.


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


### B9. Task Mini is the executable billing reference

Task Mini must prove the complete generic billing path with harmless test products.

It should include at least:

- one test subscription;
- one test one-time purchase;
- Premium/paid-state UI driven only by Core entitlements;
- display of only the methods returned by BillingRouter;
- successful purchase;
- cancelled checkout;
- failed purchase;
- restore/reconcile;
- expired subscription;
- refund/revocation;
- purchase on another device/session followed by account sync;
- external/test checkout followed by webhook and entitlement activation.

Provider-specific production credentials are not required for every CI run. Adapters may use deterministic test/fake modes where appropriate, but the same Core contracts must be exercised.

### B10. Billing contract tests

Add focused tests for:

```text
provider event/receipt
→ verified normalized billing event
→ billing journal
→ entitlement transition
→ account/client refresh
→ Task Mini paid feature unlocked/locked
```

Also cover:

- webhook idempotency;
- duplicate events;
- provider failure;
- unknown SKU;
- refund;
- expiration;
- manual Admin grant/revoke;
- BillingRouter filtering of unavailable/disallowed methods.

Task Mini should fail CI if it bypasses Core and starts depending directly on a payment provider.


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

### PR 3 — Core billing foundation

- canonical billing journal and entitlement model;
- BillingRouter and regional/platform payment-method policy;
- provider adapter contract;
- Apple IAP and Google Play Billing adapters;
- Stripe and YooKassa adapters;
- verified webhook/server-notification ingestion;
- restore/reconciliation;
- shared Admin billing/provider/SKU/readiness management;
- Starter billing composition and tests.

### PR 4 — Task Mini parity + billing reference

- migrate Task Mini to current required baseline;
- reference Admin coverage;
- one minimal product `extraSection`;
- executable subscription and one-time-purchase reference flows;
- entitlement, restore, refund, expiration and webhook test flows;
- targeted unit/contract/browser tests.

### PR 5 — Drift protection

- wire baseline checks into CI;
- make starter/reference divergence fail early;
- include billing/provider-boundary checks;
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
9. Product code is hosting-neutral: moving from Vercel to Cloudflare, Node, or another supported host primarily means swapping deployment/adapters rather than rewriting each app.
10. Task Mini can run its core platform flows through a non-production/local alternate hosting adapter as a portability smoke.
11. Apple, Google, Stripe and YooKassa payment paths converge on one provider-neutral billing journal and entitlement model.
12. Product applications do not contain provider-specific payment logic or regional payment-policy tables.
13. Task Mini proves subscription, one-time purchase, restore, refund/revocation, expiration and external-webhook entitlement flows end to end.
14. A newly generated app can enable billing by product/configuration plus provider credentials rather than copying code from FitTimer, UnMute, or Task Mini.

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


## After this plan — FitTimer migration gate

FitTimer migration to the final AppBase reference stack is deliberately **not part of PR1–PR5**.

After PR1–PR5 are complete and the final Core/Starter/Task Mini contracts are verified:

1. stop;
2. review the resulting reference stack and migration impact on FitTimer;
3. ask the product owner explicitly whether to start the FitTimer migration;
4. do not begin that migration automatically.

If approved later, create a separate FitTimer migration plan based on the finished AppBase contracts rather than assumptions made before PR1–PR5.
