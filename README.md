# AppBase monorepo

One repository for AppBase Core and every app built on it.

```text
packages/core/     AppBase Core — shared client (TypeScript) + server (Node) foundation
apps/fittimer/     Fit Timer — production web/API/Android/iOS app
apps/task-mini/    Reference app on the standard stack (React + TS + Vite) — start new apps from it
docs/              repository-level plans
```

- Architecture and roadmap: `docs/appbase-preparation-roadmap.md`
- Agent instructions: `AGENTS.md`, `CLAUDE.md`
- Fit Timer details: `apps/fittimer/README.md`
- Neutral starter guidance: `packages/core/template/README.md`

## Common commands

```bash
npm run setup          # install Core + dependencies for every apps/* package
npm run core:check     # AppBase Core checks
npm run apps:check     # run scripts.check for every apps/* package
npm run check          # Core + every app
npm run apps:browser   # run test:browser in every app that defines it
npm run check:affected -- <base>  # CI: Core + only the apps changed since <base>
```

A change in `packages/core/` must keep every app green in the same pull request. New apps must live under `apps/<name>/` and define `scripts.check`.
