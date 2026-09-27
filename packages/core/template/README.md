# AppBase app template

This directory is the neutral reference composition for AppBase Core.

## Server composition

The files under `api/` and `lib/` are smoke-tested in place against `packages/core/server`.
When creating a real app under `apps/<name>/`, keep the same composition points but use the repository-relative Core imports shown by `apps/task-mini/`:

```text
apps/<name>/config/product.json
apps/<name>/lib/product.js
apps/<name>/lib/app-sync-schema.js
apps/<name>/lib/app-analytics.js
apps/<name>/lib/app-ai-actions.js
apps/<name>/api/auth.js
apps/<name>/api/sync.js
apps/<name>/api/health.js
```

The app owns product vocabulary and registries. Core must never import the app.

## Client starter

`client/main.ts` demonstrates the minimum client-side Core imports. A real app defines the same TypeScript aliases as `apps/task-mini/tsconfig.json`:

- `@appbase/core/* -> ../../packages/core/src/core/*`
- `@appbase/types/* -> ../../packages/core/src/types/*`

Use `apps/task-mini/` as the executable second-consumer proof rather than copying FitTimer.
