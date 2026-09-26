# AppBase monorepo

One repository for the AppBase Core and every app built on it.

```text
packages/core/     AppBase Core — shared client (TypeScript) + server (Node) foundation
apps/fittimer/     Fit Timer — web, API (Vercel), Android/iOS (Capacitor)
docs/              repository-level plans
```

- Architecture and roadmap: `docs/appbase-preparation-roadmap.md`
- Agent instructions: `AGENTS.md`, `CLAUDE.md`
- Fit Timer details: `apps/fittimer/README.md`

## Common commands

```bash
npm run setup          # install packages/core and apps/fittimer dependencies
npm run core:check     # AppBase Core: typecheck, boundaries, runtime + smoke tests
npm run fittimer:build # Fit Timer web + mobile bundle (apps/fittimer/dist)
npm run check          # Core check + Fit Timer typecheck/boundaries/sources/build/mobile checks
```

A change in `packages/core/` must keep every app green in the same pull request.
