# AppBase technology stack + CI strategy — discussion draft

Status: **proposal for review, not an implementation decision**.

Date: 2026-09-28.

This document exists because AppBase is no longer only a FitTimer extraction project. We now have a real second consumer (`apps/task-mini`) and expect another real application soon. Before App2 starts, we should explicitly choose the frontend stack, backend conventions, migration policy for FitTimer, and CI tiers.

The old roadmap rule _"do not introduce a new frontend framework just for AppBase"_ was correct while there was only one mature product and the goal was safe Core extraction. The situation has changed: the next decision is about **standardizing multiple products**, not adding a framework for abstraction's sake.

Nothing in this document authorizes a React rewrite or CI reduction by itself. Each implementation phase should be reviewed separately.

---

## 1. Goals

We want:

1. One understandable default stack for new AppBase products.
2. A framework-neutral Core that is not coupled to React, FitTimer, or any product UI.
3. Shared UI primitives/design tokens where reuse is real.
4. A clear decision on whether FitTimer should move to the same frontend stack before App2 becomes substantial.
5. Fast PR feedback without weakening regression protection.
6. Full platform checks at the correct boundary instead of rebuilding everything after every unrelated change.
7. No "two permanent worlds" where FitTimer and every future app require different frontend expertise forever.

Non-goals:

- rewriting stable code only to increase a migration percentage;
- moving product/domain semantics into Core;
- replacing Supabase/OpenRouter/Vercel merely because the frontend stack changes;
- replacing working native Capacitor shells solely to adopt React;
- removing full regression suites.

---

# Part A — Technology stack

## 2. Proposed target topology

```text
<repo>/
  packages/
    core/               framework-neutral AppBase Core
    ui-react/           shared React UI foundation (if React is adopted)
    contracts/          optional future package if shared schemas outgrow Core
  apps/
    fittimer/
    task-mini/
    <app2>/
```

Dependency direction:

```text
apps/*  ───────→ packages/ui-react ───────→ React ecosystem
  │
  └────────────→ packages/core

packages/core ✕→ React
packages/core ✕→ packages/ui-react
packages/core ✕→ product/domain code
packages/ui-react ✕→ FitTimer domain
```

Core must remain usable by:
- a React application;
- a plain TypeScript application;
- server handlers;
- mobile/native adapters;
- tests.

---

## 3. Frontend candidate stack

### Proposed default for new real applications

- **React + TypeScript**
- **Vite** for app development/build unless an app has a concrete reason to use another bundler
- **AppBase Core** for identity, storage, sync, capabilities, notifications, observability, mobile primitives, etc.
- **shared React UI package** for reusable visual primitives and design tokens
- **TanStack Query** candidate for server state / cache / mutations
- **React Router or TanStack Router** — decision required before App2
- **Zod or equivalent runtime schema validation** at external/API/config boundaries
- **Capacitor** for mobile shells where native packaging is required
- **Playwright** for user-facing browser/E2E flows
- focused unit/integration tests below E2E

The exact libraries/versions should be pinned only after the architecture review. The important decision is the responsibility split, not a shopping list.

### What React should own

React should own product UI composition:

- screens;
- routing/layouts;
- forms;
- modal/sheet/dialog composition;
- local interaction state;
- loading/error/empty rendering;
- product-specific components.

### What React should NOT own

Do not move these into React just because UI uses React:

- sync protocol;
- storage engine;
- auth transport;
- server store;
- AI provider/runtime;
- notification scheduling engine;
- analytics transport;
- product capability normalization;
- native bridge contracts.

Those stay in `packages/core` or product backend modules.

---

## 4. Shared UI strategy

If React is adopted, do **not** copy FitTimer markup/CSS into every new application.

Create a small `packages/ui-react` only after we have at least two concrete consumers for the primitive being extracted.

Candidate shared pieces:

- design tokens: spacing, typography, radii, elevations, semantic colors;
- Button;
- Input / Textarea;
- Select;
- Checkbox / Switch;
- Card / ListRow;
- Dialog / Sheet;
- Toast;
- Tabs;
- Badge / Avatar;
- Spinner / Skeleton;
- EmptyState / ErrorState;
- Page / Container / Stack primitives.

### Build vs adopt

Default principle:

> Use mature accessible primitives where they save real work; keep our package as a thin AppBase layer, not a forked design system.

Candidates to compare before implementation:
- Radix/shadcn-style primitives;
- React Aria;
- other headless accessible component libraries.

Selection criteria:
- accessibility quality;
- mobile/touch behavior;
- styling freedom;
- dependency weight;
- long-term maintenance;
- ability to keep app brands visually independent;
- no forced Material/iOS visual identity;
- ease of use inside Capacitor WebView.

Do not choose a UI kit simply because it has the largest component count.

---

## 5. FitTimer + React: the decision we need before App2

This is the most important open question.

### Option A — New apps use React; FitTimer stays on current ESM/DOM stack

**Pros**
- lowest immediate risk;
- no FitTimer rewrite before App2;
- new product can start quickly.

**Cons**
- two frontend stacks;
- shared UI package initially benefits App2 more than FitTimer;
- future cross-product UI work needs two implementations;
- FitTimer remains the architectural exception;
- migration becomes harder after App2 establishes patterns and the two stacks diverge further.

This is safest short-term but risks becoming permanent.

### Option B — Migrate FitTimer to React first, then start App2

**Pros**
- one frontend stack before the platform grows;
- App2 starts from patterns already proven by the real complex product;
- shared UI and routing conventions are validated by FitTimer;
- old DOM/global UI compatibility can be retired sooner;
- future developers only need one frontend model.

**Cons**
- largest short-term project;
- migration can create regressions in a mature app;
- App2 start is delayed;
- dangerous if treated as a big-bang rewrite;
- existing browser tests depend on some FitTimer internals and may need adaptation.

This is attractive strategically **only if migration can be incremental and bounded**.

### Option C — Start App2 and migrate FitTimer incrementally in parallel

**Pros**
- App2 is not blocked;
- new architecture is exercised immediately;
- FitTimer screens can migrate one boundary at a time.

**Cons**
- temporary two-stack complexity;
- shared UI decisions may be made from a small/simple App2 rather than FitTimer reality;
- parallel product work can compete with migration work;
- risk that "temporary" migration never finishes.

### Current working preference

Do **not** decide purely from ideology ("React is modern") or sunk cost ("FitTimer already works").

Before App2 implementation, run a short **React feasibility/audit phase** on current FitTimer and answer:

1. How many independently navigable screens/views exist?
2. Which screens are strongly coupled through shared mutable state?
3. Which modules already expose clean functions/adapters and are easy to render from React?
4. Which browser tests stub internal bindings and would break during componentization?
5. Can React mount one screen/route at a time without replacing startup/auth/sync/native behavior?
6. Can existing CSS/tokens be reused initially so migration is architectural rather than visual?
7. Can old and new renderers coexist behind a route/screen boundary for a short migration?
8. What is the smallest vertical slice proving:
   - routing;
   - profile state;
   - Core storage/sync;
   - a modal;
   - i18n;
   - Capacitor/native interaction;
   - browser tests?

### Decision gate

Prefer **Option B (FitTimer first)** if the audit shows:
- incremental screen-by-screen mounting is feasible;
- Core/domain logic can stay unchanged;
- no data/storage/auth protocol migration is required;
- existing CSS can be retained initially;
- migration can be split into reviewable PRs with the app always runnable.

Prefer **Option C** if FitTimer has a few hard legacy clusters that would block App2 for too long but most new frontend conventions are clear.

Use **Option A** only as an explicit long-term decision, not by default/inertia.

---

## 6. If FitTimer moves to React: migration rules

No big-bang rewrite.

### Phase R0 — audit and spike

- map current routes/screens and state ownership;
- identify DOM imperative hotspots;
- classify modules:
  - Core/infrastructure: keep;
  - product domain: keep;
  - UI/controller code: migrate;
- choose router and UI primitive library;
- build one non-critical vertical slice;
- prove Capacitor build + browser tests still work.

Exit criteria: we know whether migration is incremental and what the cost/risk shape looks like.

### Phase R1 — React shell

Introduce:
- React entry;
- root providers;
- i18n bridge;
- error boundary;
- router;
- AppBase Core adapters;
- shared UI tokens.

Do not migrate all screens yet.

### Phase R2 — leaf screens first

Migrate screens with limited cross-state coupling:
- settings/about/simple lists/details first;
- reuse existing API/Core functions;
- avoid redesign.

### Phase R3 — account/profile/admin-like complexity

Migrate flows that exercise:
- profile switching;
- async mutations;
- dialogs;
- validation;
- server state.

### Phase R4 — workout/runtime critical path

Migrate the highest-risk FitTimer flows only after foundations are proven:
- active workout;
- timers/rest;
- voice;
- partial completion;
- resume;
- notifications/native interactions.

### Phase R5 — retire legacy renderer

Only when:
- all production routes use React;
- regression suite covers behavior rather than old internals;
- old DOM helpers have no callers;
- test bridge/global compatibility can be removed.

At no point should React migration also change sync formats, account formats, local storage keys, native package IDs, or payment behavior unless separately required.

---

## 7. Backend target stack

The backend is already closer to the desired platform shape than the frontend.

### Keep

- **Node.js server runtime**
- **Vercel functions/deployment**
- **AppBase server Core**
- **provider-neutral store interfaces**
- **Supabase/Postgres adapter**
- **OpenRouter/provider-neutral AI runtime**
- **product-owned AI actions/schemas**
- **health/diagnostics/analytics abstractions**

### Standardize further

For new apps:

1. server API composition should start from Core handlers/adapters rather than copying FitTimer handlers;
2. runtime validation should exist at every untrusted external boundary;
3. product-specific tables/documents/events remain outside Core;
4. server secrets never enter browser bundles or APK;
5. store/provider selection stays configuration-driven;
6. migrations need explicit versioned scripts/SQL and rollback/verification rules;
7. API errors should have stable machine-readable codes;
8. shared request/response schemas should be typed from one source where practical.

### Do we need a separate backend framework?

Current answer: **not yet**.

Do not add NestJS/Express/Fastify merely for standardization while current Vercel function composition remains understandable. Revisit if:
- route count becomes hard to manage;
- middleware composition becomes repetitive;
- local integration testing becomes awkward;
- long-running/background workloads exceed serverless model;
- multiple independent backend services emerge.

---

# Part B — CI strategy

## 8. Current measured PR timings

Measured from PR #179 workflow run on 2026-09-27:

| Gate | Wall time | Main cost |
|---|---:|---|
| AppBase — all apps consistency | ~1m13s | full Core + app checks |
| Android debug build | ~1m56s | Gradle debug build ~1m30s |
| iOS simulator build | ~1m41s | Xcode simulator build ~1m25s |
| Browser tests | ~7m14s | 35 browser/E2E tests run serially |

The workflows run in parallel, so the PR critical path is the browser suite.

### Browser bottleneck

Current browser runner has **35 scenarios** and executes:

```js
for (const name of list) {
  await run(name)
}
```

That means one Node/browser scenario at a time.

In the measured run:
- browser setup: ~31s;
- browser/E2E execution: ~6m39s.

This is the first optimization target.

### Android/iOS

These are not abnormally slow for real native builds.

Android:
- dependencies + Capacitor sync: ~8s;
- Gradle setup: ~7s;
- debug build: ~90s.

iOS:
- dependencies + Capacitor sync: ~8s;
- Xcode simulator build: ~85s.

The better optimization is **when they run**, not trying to make Xcode/Gradle unrealistically instant.

---

## 9. Desired CI model

Use tiers.

### Tier 0 — local / pre-commit fast checks

Target: seconds.

Examples:
- formatting/lint if adopted;
- TypeScript changed-package checks;
- targeted unit tests;
- dependency/boundary tests.

Not a required duplicate of full CI.

### Tier 1 — every relevant PR: fast confidence

Target critical path: **~2–3 minutes**.

Run:
- Core/app typecheck;
- boundary tests;
- unit/integration tests;
- browser smoke subset;
- affected app build;
- native checks only when relevant paths changed.

### Tier 2 — full regression

Run:
- full browser suite;
- Android build;
- iOS simulator build;
- all-app consistency.

Trigger:
- merge to `main`;
- release PR/tag;
- manually on demand;
- PR when affected paths justify it.

Important: Tier 2 is not removed. It moves to the boundary where its cost is justified.

---

## 10. Browser test optimization plan

### C1 — collect per-test timing

Have the runner publish a machine-readable timing summary.

Why:
- identify the slowest 20%;
- distinguish CPU/browser contention from intentional waits;
- prevent regressions in test duration.

### C2 — classify tests

Each browser test should be labeled conceptually:

- **smoke** — must run on almost every frontend PR;
- **feature** — run when relevant area changes;
- **full regression** — main/release;
- **server/API** — may belong in integration suite rather than browser suite.

Do not keep a scenario in Playwright merely because that is where it was first written.

### C3 — safe parallelism

Run independent browser tests in multiple workers.

Start conservatively:
- 3–4 workers;
- isolate ports/storage/test accounts;
- no shared mutable fixtures;
- retain serial group for tests that intentionally share state.

Target: reduce ~6m39 execution toward ~2m without changing assertions.

### C4 — remove accidental waits

Audit:
- fixed sleeps/timeouts;
- repeated app boot;
- repeated account setup;
- repeated server startup;
- network polling that could wait on explicit conditions.

Prefer condition-based waits.

### C5 — browser smoke suite

Define a small suite covering highest-value cross-cutting invariants, for example:

- app boots;
- login/account basic flow;
- profile switch/isolation;
- navigation;
- active workout basic flow;
- partial/resume behavior;
- sync basic flow;
- one AI guarded flow;
- one notification/settings flow.

Exact list should come from current failure history, not arbitrary count.

---

## 11. Affected-path CI

Do not build mobile shells for changes that cannot affect them.

### Android/iOS should run when changes touch

Examples:
- `apps/fittimer/src/**`;
- `apps/fittimer/mobile.js`;
- native Android/iOS folders;
- Capacitor config;
- FitTimer dependencies;
- shared Core client modules bundled into FitTimer;
- build scripts used by mobile;
- product config consumed by native build.

### They should normally skip for

Examples:
- docs only;
- unrelated app-only UI (`apps/task-mini/**`) if Core/FitTimer untouched;
- server-only modules that are not bundled into mobile;
- admin-only server code where mobile artifact is unaffected.

Path rules need tests so an important dependency cannot silently bypass native CI.

---

## 12. Avoid duplicated work

Current `apps/fittimer check` performs a broad set of tests/builds, while browser/mobile workflows perform additional builds.

Audit duplicate steps:

- repeated `npm ci`;
- repeated source generation;
- repeated ESM build;
- repeated static/unit checks;
- repeated Capacitor sync.

Potential optimizations:
- cache npm and Gradle properly;
- produce/reuse build artifacts within a workflow when safe;
- split "source consistency" from "full FitTimer build";
- avoid running the same unit suite in multiple gates.

Do not share artifacts across logically incompatible environments if that reduces confidence.

---

## 13. CI acceptance criteria

We should consider the CI work successful when:

1. typical UI/Core PR critical path is <= 3 minutes on normal GitHub runners;
2. full regression still exists and runs automatically before/at `main`;
3. mobile builds do not run for unrelated app/docs-only changes;
4. a Core change still checks every consumer;
5. path filtering itself is tested;
6. browser tests can run in parallel without flaky shared state;
7. failed tests preserve useful logs/artifacts;
8. releases still require the full native/release gates.

---

# Part C — decisions to review with another AI

## 14. Questions that need challenge/review

### Frontend

1. Is React the right default for our product mix, or would another component framework materially reduce complexity?
2. React Router vs TanStack Router for our scale and mobile/web sharing?
3. TanStack Query: adopt from day one or only when App2 needs server-state caching?
4. Radix/shadcn-style primitives vs React Aria vs another accessible headless foundation?
5. Should `packages/ui-react` exist immediately, or only after the first duplicated primitive between FitTimer/App2?
6. Should design tokens live in `packages/ui-react`, a framework-neutral `packages/design-tokens`, or product config?
7. Is Vite preferable to extending the existing esbuild scripts for React apps?

### FitTimer migration

8. Can FitTimer realistically migrate screen-by-screen without a dual-router/state mess?
9. What is the safest first vertical React slice?
10. Which current FitTimer state should be moved into explicit domain stores/services before React migration?
11. Should CSS be kept nearly unchanged initially?
12. What current browser tests are too coupled to implementation details?
13. Is it better to migrate FitTimer **before** App2, or use App2 as the reference React implementation and migrate FitTimer immediately after?

### Backend

14. Is current Vercel-function composition sufficient for 3–5 apps?
15. Do we need shared runtime schemas package now?
16. At what point would a dedicated API framework provide enough value?
17. Which Supabase capabilities should remain deliberately unused until a product need appears?

### CI

18. Which browser tests can safely run in parallel?
19. Which 8–12 flows deserve PR smoke status?
20. Can browser tests be split by changed feature paths without hiding cross-feature regressions?
21. Which Core paths truly affect native apps and therefore require Android/iOS builds?
22. Should full browser/native regression run on every `main` merge or on a merge queue/release gate?
23. Are there useful caches/artifacts we are not exploiting?

---

## 15. Proposed decision sequence

Do not start App2 UI implementation until steps 1–4 are decided.

1. Review this document with another architecture-focused AI.
2. Audit FitTimer React migration feasibility (R0 only, no product rewrite).
3. Choose:
   - React yes/no;
   - FitTimer Option A/B/C;
   - router;
   - UI primitive foundation;
   - state/data strategy.
4. Record the chosen stack as an ADR/decision section in the repo.
5. Optimize CI C1–C3 before a large migration so React work does not wait 7+ minutes per PR.
6. If FitTimer-first is chosen, migrate by vertical slices.
7. Start App2 on the finalized common stack.
8. Extract UI primitives only when two real consumers prove the abstraction.

---

## 16. Working hypothesis to challenge

The current hypothesis is:

> Keep AppBase Core framework-neutral. Standardize new product UIs on React + TypeScript. Prefer migrating FitTimer incrementally to the same stack before App2 becomes large, **if** a short feasibility audit proves it can be done without a big-bang rewrite. In parallel, restructure CI into fast PR gates and full main/release regression, with browser parallelization as the first performance win.

This is intentionally a hypothesis, not a locked decision.
