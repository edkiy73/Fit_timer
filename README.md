# AppBase monorepo

One repository for AppBase Core and every app built on it.

```text
packages/core/       AppBase Core — shared client (TypeScript) + server (Node) foundation
templates/react-app/ Minimum mandatory React + TypeScript + Vite starter scaffold
apps/task-mini/      Executable architecture reference + one small real product domain
apps/fittimer/       Fit Timer — production web/API/Android/iOS app
apps/unmute/         Complex production consumer of the same AppBase contracts
docs/                repository-level plans
```

Create a real new product from the neutral starter, not by copying Task Mini, FitTimer or UnMute:

```bash
npm run app:create -- <slug> "<Name>" <reverse.domain.id> [ru|en]
```

Use Task Mini to inspect a working domain/Admin/billing example after generation.

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
