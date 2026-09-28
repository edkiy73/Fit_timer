# ADR: AppBase technology stack + CI strategy

Status: **accepted** (2026-09-28). Supersedes the discussion draft of the same name.

Context: AppBase now has two consumers (`apps/fittimer`, `apps/task-mini`) and a third real app (App2) is expected. This record fixes the frontend stack for new apps, FitTimer's position, the backend conventions and the CI model, so these questions are not reopened on every task. Change a decision only when one of its **revisit triggers** fires; then update this file in the same PR.

---

## D1. Core stays framework-neutral

`packages/core` never imports React or any UI framework, `packages/ui-*`, or product code (enforced by `packages/core/tests/boundaries.js` and `apps/fittimer/tests/dependency-boundaries-unit.js`).

Core owns sync, storage, auth transport, server store, AI runtime, notification scheduling, analytics transport, capability normalization and native bridge contracts. React (in apps that use it) owns only UI composition: screens, routing, forms, dialogs, local interaction state, loading/error/empty rendering.

## D2. Default stack for new apps

| Concern | Choice |
|---|---|
| Language | TypeScript |
| UI | React |
| Build/dev | Vite |
| Routing | React Router |
| Server state (API calls outside Core sync) | TanStack Query |
| Runtime validation at untrusted boundaries (API input, config, AI output) | Zod |
| Accessible headless primitives | React Aria Components |
| Mobile packaging | Capacitor (only when a native build is needed) |
| E2E | Playwright; unit/integration tests below it |

Why these: mainstream, well-typed, no forced visual identity, good touch handling inside a Capacitor WebView. Versions are pinned in the app's `package.json` when the app is created, not here.

**Reference implementation: `apps/task-mini`.** For a real new product, generate the clean starter with `npm run app:create -- <slug> "<Name>" <reverse.domain.id> [ru|en]`; use Task Mini to inspect a working domain example. Do not copy FitTimer.

| Piece | Where in `apps/task-mini` |
|---|---|
| Vite config: Core aliases `@appbase/core/*`, `@appbase/types/*`, relative `base` | `vite.config.mts`, `tsconfig.json` |
| Domain model + Zod schema, Core sync registry | `src/domain.ts` |
| Persistence through Core storage, validated on read | `src/tasks/repository.ts` |
| Async data + optimistic mutations (TanStack Query) | `src/tasks/queries.ts` |
| Routes (hash router: works on any static host and in a WebView) | `src/app.tsx`, `src/main.tsx` |
| Accessible controls (React Aria Components) | `src/components/*` |
| Product theme tokens via Core (D4) | `src/theme.ts`, `src/styles.css` |
| Component tests (Vitest + Testing Library + fake IndexedDB) | `src/app.test.tsx` |
| E2E against the production build (Playwright) | `tests/e2e.mjs` |
| Server composition from Core (auth, sync, health) | `api/`, `lib/` |

The whole stack costs ~150 KB gzip of JavaScript for Task Mini; watch this budget as apps grow.

Each app deploys as its own Vercel project with Root Directory `apps/<name>` and "Include files outside the root directory" enabled (server functions import `packages/core/server`). Apps never build each other.

Revisit only if: the stack blocks a concrete product requirement that another option solves materially better.

## D3. FitTimer stays on its current ESM/DOM stack

No planned React migration.

Why:
- `apps/fittimer/src/app/` is ~18k lines of imperative DOM code in ten mutually importing parts with shared state behind `set*Shared()` setters; "screen by screen" would in practice be a rewrite of the whole frontend;
- 27 browser tests use ~240 `page.evaluate` calls, many through the internal test bridge, so a migration would also rewrite most of the regression suite;
- what apps actually share is Core and design tokens (D4), not product screens — each product keeps its own brand and UX.

FitTimer keeps improving on its own stack: move state next to the code that changes it, and move browser tests from internal stubs to behavior-level assertions (see the roadmap, Phase 13 "next").

Revisit only if:
- FitTimer needs a large redesign touching most screens (then new screens may be built in React as islands mounted into existing `.screen` containers), or
- the same non-trivial UI component has to be implemented twice, for FitTimer and a React app, more than occasionally.

## D4. Shared design = framework-neutral tokens

Semantic tokens are CSS custom properties. Products declare them in `config/product.json → brand.ui.{dark,light}`; Core `themeCssVars` maps them to the shared variable names (`--bg`, `--card`, `--surface`, `--accent`, `--accent-ink`) and `applyCssVars` applies them (`packages/core/src/core/ui.ts`). FitTimer (DOM) and Task Mini (React) use the same functions; no token package is tied to React.

`packages/ui-react` contains only UI that is platform-level infrastructure rather than product UI: the auth flow (`AuthProvider`/`useOptionalAuth`/`SignInForm`/`AuthGate`), the shared Admin, the fatal error boundary and the interface-language layer (`I18nProvider`/`useI18n`/`LanguagePicker`; dictionaries stay in each app). They are consumed by Task Mini and the generated React app starter. Product-specific components stay inside each app; new shared primitives move here only after reuse is concrete.

## D5. Backend unchanged

Keep Node.js on Vercel functions, server Core in `packages/core/server`, provider-neutral store/AI adapters and product-owned AI actions/schemas. No NestJS/Express/Fastify.

Conventions for new server code: Zod validation at every untrusted boundary; stable machine-readable error codes; product tables/documents/events stay outside Core; secrets never enter client bundles or APKs; data migrations are explicit versioned scripts.

Revisit only if: route composition or middleware becomes repetitive across apps, or a workload does not fit the serverless model.

---

## D6. CI model

`main` deploys straight to production (Vercel), so **the full regression suite runs on every PR**. There is no "smoke on PR, full on main" split — a regression found after merge is already in front of users. CI is made fast instead of thinner.

Rules:
1. **Browser tests run sharded** across parallel jobs, each with its own dev server and static server, so tests never share server state between shards. The runner balances shards by recorded per-test durations (`apps/fittimer/tests/browser-timings.json`) and prints a timing summary.
2. **Tests wait for conditions, not for time.** New browser tests must not add fixed `waitForTimeout` sleeps; existing ones are removed as the tests are touched.
3. **Path filters decide which apps are checked:**
   - `packages/core/**`, root `package.json`, `scripts/apps.mjs` → every app;
   - `apps/<name>/**` → that app only;
   - Markdown and `apps/*/docs/**` never trigger builds or tests.
   Every app with a browser suite has its own workflow filtered to its paths + `packages/core/**` (FitTimer: `browser-tests.yml`, Task Mini: `task-mini.yml`).
4. **Android/iOS builds** keep their own path filters (FitTimer client/native/build paths + `packages/core/**`) and run in parallel with the rest; they are not on the critical path.
5. **Releases** (manual Android dispatch, `main` push builds) keep the full signed native pipeline.

Target: PR critical path ≤ 3 minutes on standard runners, with no reduction of coverage.

Measured when introduced (35 browser tests, local run): serial suite 417 s → 379 s after removing fixed sleeps from `nav-transitions` (104 s → 66 s); four shards of 92–96 s each, every shard green on its own fresh server. The remaining ~210 fixed sleeps in other tests are removed as those tests are touched (rule 2).

Revisit only if: the critical path exceeds ~5 minutes again, or another app gets a browser suite large enough to need its own shards.
