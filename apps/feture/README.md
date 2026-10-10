# FetUre — AppBase application

This app is bootstrapped from `templates/react-app`, using React 19, TypeScript 6, Vite 8 and AppBase Core/Shared UI, with Task Mini as architectural example.

## Current status
- `/`: offline-capable **HTML MVP concept 3.1** in a full-viewport iframe at `public/concept.html`. Its UX is **demo-only**: tests/likes/profiles are not persisted to server and no real members exist.
- `/#/account`: shared AppBase account UI (requires configured server).
- `/#/admin`: shared AppBase Admin UI.
- `data/concept-catalog.json`: 12 directions, 144 interests, 18 demonstration test cards extracted from concept.
- `supabase/migrations/20261010_001_feture_domain.sql`: reviewed candidate domain schema with RLS, not yet deployed. Run only in a dedicated FetUre Supabase project.

## Architecture next
Replace iframe with React domain screens gradually, introduce typed repositories using AppBase adapters, apply migration to **FetUre-only** Supabase, authenticate users, save private answers and map, implement moderation and audience-gated feed, then implement opt-in dating/profile-embedded swipe UI. Never seed fake prototype people as production users or store sensitive answers without RLS.

Commands: `npm ci --prefix apps/feture`, `npm --prefix apps/feture run check`.
Vercel Root Directory `apps/feture`, framework Vite, output `dist`. Shared workspace files outside the root are required.

The scaffold is not a completed migration of the HTML prototype to the app database.
