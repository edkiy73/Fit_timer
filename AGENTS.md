# FitTimer — agent instructions

This file is the default entry point for AI coding agents working in this repository.
Goal: make the smallest correct change with the least repository reading and the least rework.

## 1. Start here, not with a repo-wide scan

Before editing:
1. Read this file.
2. Read `.ai/project-map.md`.
3. Prefer one-shot context packaging: `npm run ai:context -- "task"`. It returns the route, likely files/tests/docs, targeted excerpts, symbol hints, recent commits and current diff.
4. If needed, route the task through `.ai/feature-router.json` (or `npm run ai:route -- "task"`) to get the smallest likely file/test set.
5. Search `.ai/symbol-index.json` only when the context pack is insufficient.
6. Identify the feature area and read only the mapped files.
7. Search source text only if the context pack/router/index are insufficient.
8. Read `docs/why.md` or a feature doc only when the task touches that feature.

Do **not** read all of `CLAUDE.md`, `app.js`, `style.css`, or `index.html` by default.
They are large. Fetch/search only relevant ranges. `CLAUDE.md` is detailed product history/reference, not the normal first read.


### AppBase architecture work

The repository contains a dedicated, token-conscious agent team for the planned FitTimer → AppBase extraction. Use it **only** for architecture/extraction work, not for ordinary FitTimer bugs or UI tasks:

- entry/orchestration: `.ai/appbase-agents/00_TEAM_ORCHESTRATION.md`;
- roles: `.ai/appbase-agents/01_ARCHITECT.md` through `07_PRODUCT_INTEGRATION.md`;
- current roadmap: `docs/appbase-preparation-roadmap.md`.

Default AppBase task flow is **Architect → Extraction Engineer → QA → Architect**. UX, Security, Release/DevOps and Product Integration are specialists activated only by the triggers in the orchestration file. Do not give every agent the full repository or full conversation history; pass the TASK CARD, targeted context/diff, required contracts and a short HANDOFF.

### Target upstream model

The long-term ownership model is:

```text
        AppBase Core
        /    |     \
       ↓     ↓      ↓
   FitTimer Lingua TaskApp
```

Interpretation:
- AppBase becomes the upstream source of reusable Core/infrastructure after the first stable extraction.
- Product repositories consume Core updates; product-specific domain code must not flow back into Core automatically.
- Before AppBase is mature enough to be upstream, FitTimer may temporarily be the source of newly extracted generic Core changes. Treat this only as a transition phase.
- Once AppBase is established, reusable fixes/features should normally be implemented in AppBase Core first, then propagated to products through reviewed update PRs.
- Product-discovered Core bugs may be fixed in the product first only when urgency requires it; then backport the generic fix to AppBase promptly and re-sync downstream products.
- Never maintain permanent bidirectional automatic file synchronization between AppBase and products. Prefer explicit versioned Core updates or reviewable sync PRs.
- Automatic propagation may create PRs, but should not silently merge Core changes into products unless that policy is explicitly proven safe for the relevant repository.

### TypeScript migration policy

For AppBase preparation, migrate to TypeScript **as early and as quickly as it is useful, but not as a separate mass rewrite**:

- establish TypeScript/typecheck before the first substantial Core extraction;
- all new reusable/Core modules should be TypeScript by default;
- when an existing module is substantially refactored, extracted, or given a new architectural boundary, migrate the touched module to TypeScript in the same task unless there is a concrete compatibility/build reason not to;
- do not postpone a touched Core module's TS conversion to a later cleanup pass without recording the reason;
- untouched stable FitTimer domain/UI code may remain JavaScript until it is materially changed;
- introduce ES modules/bundling when explicit imports/exports are needed for the first real Core modules; do not keep new typed Core code dependent on global concatenation merely to delay build changes;
- keep JS/TS coexistence during migration and tighten strictness progressively rather than filling the codebase with `any`, global declarations, or unsafe assertions;
- TypeScript does not replace runtime validation for API, Redis, backup, AI, deep-link, billing, or other external data.

The goal is to avoid two wasteful extremes: a risky all-at-once rewrite and a slow migration that makes us refactor the same modules twice.

### Evidence, uncertainty and recommendations

Agents must calibrate claims to evidence:
- distinguish verified repository/test/tool facts from reasoned conclusions, proposals and unknowns;
- never describe a design as "ideal", "definitely correct", "the only right solution" or equivalent when material uncertainty or reasonable alternatives remain;
- for architecture choices, mention a meaningful alternative when it affects the decision and briefly explain why the chosen option fits current constraints better;
- if verification is incomplete, say exactly what was not verified instead of converting confidence into certainty;
- update plans when new repository evidence invalidates an earlier assumption. Roadmaps are working guidance, not immutable truth.

### Repository freshness and concurrent work

- Before starting any coding task, fetch/read the current `main` HEAD and base the work on that exact revision. Never assume a checkout, previous chat, cached file, or earlier connector result is still current.
- Prefer an isolated feature branch for multi-file work. Do not edit `main` from stale file contents while another agent or person may be working.
- Immediately before every push, PR merge, or direct write to `main`, refresh `origin/main` (or the GitHub `refs/heads/main` ref) again and compare it with the revision the work started from.
- If `main` advanced, inspect the intervening commits/diff and reconcile them before publishing. Never force-push, reset, or overwrite a newer file with an older full-file copy just to make the write succeed.
- For GitHub contents/API edits, re-fetch the target file SHA before updating it. A stale-SHA failure is a signal to re-read and merge, not to retry blindly.
- After reconciling concurrent changes, rerun the smallest relevant checks before merge/push.

## 2. Repository facts

- Production branch: `main`.
- Production web/API: `https://fittimer99.vercel.app`.
- Admin: `/admin.html`.
- Mobile: Capacitor 8, app id `ru.fittimer.app`.
- Web UI is plain HTML/CSS/JS; no React/Vue framework.
- TypeScript foundation: `tsconfig.json` + `src/types/`; new reusable/Core modules should be TS by default, while untouched legacy JS may coexist during migration.
- Canonical product identity/defaults: `config/product.json`; `app.config.js` is generated by `npm run build:config` and checked by `npm run check:config`.
- Canonical frontend sources: `src/html/`, `src/styles/`, `src/app/`.
- Generated compatibility files: `index.html`, `style.css`, `app.js`; rebuild with `npm run build:sources` and do not edit them directly.
- Mobile bridge/runtime helpers: `mobile.js`.
- Mobile build copies web sources to `dist/`; never edit `dist/` directly.
- Serverless API: `api/`; shared server code: `lib/`.
- Storage: Vercel Storage / Upstash Redis.
- Native shells: `android/`, `ios/`.

## 3. Minimal-read routing

Use `.ai/project-map.md` to choose files. Typical routing:

- UI/layout/copy -> search `src/html/` + `src/styles/`; add the mapped `src/app/` part only for behavior.
- App behavior/state/workouts/programs/progression -> search `src/app/` and open only the matching part.
- Android/iOS bridge, share, haptics, notifications -> `mobile.js`, then native files only if bridge code requires it.
- Auth/account -> `api/auth.js`, `lib/store.js`, relevant account code in `app.js`.
- Trainer -> `api/trainer/[handle].js`, trainer-related `app.js`, targeted trainer tests.
- Catalog -> `api/catalog.js`, `admin.html`, catalog code in `app.js`.
- Sync -> `api/sync.js`, sync symbols in `app.js`, `tests/sync-*.js`.
- AI -> `lib/ai.js`, `lib/ai-endpoint.js`, `api/admin.js`, `docs/ai-runtime.md`.
- Vercel/storage/env -> `vercel.json`, `lib/store.js`, `docs/setup-vercel.md`.
- Android/iOS release -> read `docs/mobile-release.md` first.

## 4. Product invariants — preserve unless the user explicitly changes them

- There is one normal email account. Trainer mode belongs to that account; there is no separate trainer account/login.
- Trainer creation/editing requires a real account. If no account exists, route the user to registration/login instead of creating a local trainer identity.
- Nickname/handle is account-bound and used consistently across account/trainer identity.
- Trainer data sync is independent from Premium entitlement.
- Account is free; paid features/subscription are separate.
- Do not store date of birth; use full age where age is needed.
- People managed by a trainer are called **«подопечные»**, not «клиенты», in user-facing Russian copy.
- User-facing copy addresses the user informally but should avoid gendered wording.
- Marketing, onboarding, paywall and explanatory copy must use plain language for non-technical users: lead with the benefit/outcome, not implementation. Avoid terms such as server, provider, runtime, sync, API or model unless the user genuinely needs that technical detail.
- Existing catalog programs survive deletion of trainer/account personal data.
- Do not bring back a visible “sync status” card; sync is automatic.
- Reuse existing UI patterns, components/classes and visual language before inventing new ones.
- Icons come from the existing icon system; do not introduce emoji or arbitrary external icons.
- Keep signing secrets/keystores unchanged. Never regenerate or replace release signing material just to fix an update/install issue.

## 5. Editing rules

- Diagnose before editing. Find the owner function/selector/API first.
- Prefer the smallest patch. Do not refactor neighboring code unless it is required for correctness.
- Do not create duplicate UI components/styles when an existing pattern can be reused.
- Do not edit generated `dist/`, root `index.html`, root `style.css`, or root `app.js`; edit `src/**` and rebuild.
- For ordinary UI changes, do not edit `android/` or `ios/`; change shared frontend first.
- Shared server helpers belong in `lib/`, not `api/`.
- Keep Vercel function count within the project limit checked by `check.py`.
- Preserve backwards compatibility for persisted local data and existing Redis data unless migration is explicitly part of the task.
- Never expose secret env values, admin keys, service tokens or signing credentials in code, logs or chat.

## 6. Token/read budget

For a normal bug or UI task:
- First pass: at most 2–5 relevant source files plus targeted tests.
- Search `.ai/symbol-index.json` before fetching source files; fall back to repository search only when needed.
- For `app.js` / `style.css` / `index.html`, fetch only the surrounding range of matched symbols/selectors.
- Do not reread unchanged files during the same task.
- Do not open broad docs “for context” unless the task maps to them.
- If the first hypothesis is wrong, stop and re-diagnose before making a second unrelated patch.

Repo-wide reading is appropriate only for architecture, migrations, broad refactors or explicit audits.

## 7. Verification ladder

Run the cheapest relevant verification first:

0. For TypeScript/Core/config changes run `npm run typecheck` and `npm run test:foundation`.

1. After frontend source edits run `npm run ai:index`, then `npm run check:sources` and `npm run check:ai-index`; continue with targeted checks only after both pass.
2. Relevant targeted `tests/*.js`.
3. `python3 check.py` for broad frontend/API invariants.
4. `npm run build` when shared web/mobile source changed.
5. `npm run check:mobile` for mobile-related work.
6. Native Android/iOS build only when native configuration/code changed or the task explicitly requires an APK/IPA build.

Do not repeatedly run expensive full builds while a cheaper check is still failing.

## 8. Mobile rules

Before changes to Android/iOS, API origin, public links, timer/audio, notifications, sharing, or release/build flow, read `docs/mobile-release.md`.

Canonical mobile flow:
```bash
npm ci
npm run mobile:sync
npm run check:mobile
```

`npm run mobile:sync` rebuilds `dist/`, runs Capacitor sync, and regenerates mobile assets.

## 9. Vercel/API rules

- Keep API resource-oriented: extend an existing endpoint/action before adding a new function.
- Current public API is intentionally compact; `check.py` guards function count.
- Runtime env/storage wiring is documented in `docs/setup-vercel.md`.
- AI provider/model/pricing/limits are server/admin configured; do not bake provider secrets or pricing into APK/web clients.
- AI has primary/fallback provider support and server-side logging/retention rules; read `docs/ai-runtime.md` before changing it.

### Vercel deployment discipline

The repository uses `vercel.json -> ignoreCommand -> scripts/vercel-ignore.mjs` to conserve Vercel Hobby deployments.

- Changes limited to `.github/`, `.ai/`, `docs/`, `tests/`, `android/`, `ios/`, or agent/readme files should normally be ignored by Vercel automatically.
- Intermediate commits may include **`[skip vercel]`** when production does not need that individual checkpoint. Use this for test-only fixes or partial work that will be followed by a deploy-enabled commit.
- **Never put `[skip vercel]` on the final commit of a batch that changes production web/API/admin behavior.** The final production-relevant commit must be deploy-enabled.
- **`[deploy]`** forces a deployment even when changed paths would otherwise be ignored.
- Do not disable Git deployments globally just to save quota. Prefer the ignored-build policy above.
- After using `[skip vercel]`, verify the Vercel status says the build was canceled by the Ignored Build Step rather than treating it as a production deployment.
- Batch related production changes when practical so one final deploy contains the complete verified slice.

## 10. Completion standard

A task is complete when:
- the requested behavior is implemented,
- the relevant existing behavior is not duplicated,
- the smallest relevant tests/checks pass,
- mobile/web/API impact has been considered,
- the final response states exactly what changed and what was verified.

Do not claim a build, deployment, device test, or store behavior was verified unless it actually was.
