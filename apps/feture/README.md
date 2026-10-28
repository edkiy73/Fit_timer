# FetUre

An 18+ community app: profiles and interests, posts with photo and video, communities and events, Discover, a
private part opened by access, chats. One React + TypeScript + Vite app for the website and the Android app
(Capacitor); iOS later. Pre-launch. Site: https://feture-mvp.vercel.app (the app is `/#/n/feed`).

**Rules for anyone changing it: [AGENTS.md](AGENTS.md).** Infrastructure decisions: [docs/infra/](docs/infra/README.md).

## Parts

- `src/fe/` — every user screen (route `/n/*`), built from the kit `src/fe/kit/` ([README](src/fe/kit/README.md),
  Storybook published at `/kit/`).
- `src/feture/` — staff pages: AppBase admin sections (`/admin`) and the staff workspace (`/operator`), plus the
  `/api/fe` client (`fe-api.ts`).
- `api/fe.mjs` + `server/` + `contracts/` — the app's command API ([server/README.md](server/README.md)); SQL in
  `supabase/migrations/` (schema `feture` in the shared FitT Supabase project, Tokyo). Design notes: `docs/server/`.
- `api/admin.js`, `api/auth.js`, `api/domain.js`, `lib/` — AppBase sign-in, admin and the earlier backend that the
  admin sections still use.
- `e2e/` — interaction scenarios with personas ([e2e/README.md](e2e/README.md)); test world: [docs/test-world.md](docs/test-world.md).
- `android/` — Capacitor shell; releases: [docs/android-release.md](docs/android-release.md).
- `docs/v21/` — the frozen V21 prototype for side-by-side comparison (open `prototype-v21.html` in a browser).

## Run and check

    npm ci                      # in apps/feture
    npm run dev                 # local site; /api needs the Vercel env, so use preview + proxy for real data
    npm run check               # everything CI runs: kit/server ratchets, typecheck, unit, Postgres (PGlite) tests, build
    npm run storybook           # the kit

Scenarios on a local build (production API, your own lane; never print the admin key):

    npm run build && npx vite preview --port 4250 --strictPort &
    FE_ADMIN_KEY=… E2E_LANE=me APP=http://localhost:4250 node e2e/run.mjs e2e/scenarios/me/profile.mjs

## Deploy

- Website: Vercel project `feture-mvp` (root `apps/feture`, build `npm run build`, output `dist`) deploys `main`;
  `scripts/vercel-ignore.mjs` skips commits that change only docs/tests.
- Android APK: GitHub Actions «FetUre — APK для установки» (`.github/workflows/feture-android.yml`), then publish the
  build in-app as a required update (see AGENTS.md).
- Database: apply new files from `supabase/migrations/` to the live project (see `server/README.md`).
