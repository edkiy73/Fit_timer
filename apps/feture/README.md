# FetUre — AppBase product

FetUre is an independent app within the AppBase monorepo (React + TypeScript + Vite, with Task Mini as architectural reference). Production site: https://feture-mvp.vercel.app.

## Database co-location (2026-10-10)
- FetUre shares the **FitT Supabase project** (`anrhayozrhrmiwexmbhw`, Singapore), not FitTimer's application tables.
- Nine strictly `public.feture_*`-prefixed tables are deployed. `supabase/migrations/20261010_001_feture_domain.sql` is the authoritative domain/schema seed. Never reapply it to the same database without reviewing existing tables.
- 12 interest categories, 144 interests, and 18 *demonstration test descriptors* seeded from `data/concept-catalog.json`. Real questionnaires/scoring are NOT yet implemented.
- `supabase/migrations/20261010_002_catalog_read.sql` allows **anonymous SELECT** for ONLY the three public taxonomy tables; all six private tables have RLS enabled and NO anon/authenticated grants or policies.
- AppBase server sessions are authoritative. The database uses server-derived opaque `account_hash` (NOT `auth.users` IDs, and never a client-supplied email). Private features must require server-side identity verification before any service-role request.
- A shared Supabase project shares quota/availability and privileged project credentials. Prefixes/RLS protect from ordinary access, but **not** from compromised service-role credentials; never put such credentials in browser code.
- `api/catalog.js` is a narrow public server proxy with a publishable (anon) key, **not service-role**. It returns only the public taxonomy. No client direct DB calls. Vercel variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.

## Interfaces
- `/`: **native React** experience. Tabs «Мой мир», «Исследовать», «Сообщество», «Знакомства» are React components; no iframe. Interest editing, per-category jars and privacy choices are functional.
- `/concept.html`: archived clickable 3.1 reference, not production UI.
- React uses the live public taxonomy from `/api/catalog` with an explicit bundled offline fallback.
- Community posts, groups and dating profiles are clearly labeled **fictional demonstrations**, not live services.
- Private interests are stored in AppBase Core's IndexedDB-based local-first document mirror (`interest-map`, free document in sync registry). Per-interest timestamps merge changes when the standard authenticated AppBase sync backend is configured; FetUre production still lacks that server environment, so **cloud persistence is not yet active**. Sensitive local documents are cleared on confirmed sign-out to prevent cross-account disclosure.
- `/#/catalog`: AppBase React route reading public catalogue from Supabase through `/api/catalog`.
- `/#/account`: AppBase email sign-in shell. **Account storage and verification still require separately configured AppBase server backend**.
- `/#/admin`: AppBase admin shell.

## Next stages
1. Complete visual parity and accessibility verification for React screens, and migrate remaining demonstrative interactions to working product domains.
2. Integrate AppBase authenticated server-side storage for profile and private interest/test state; do not enable direct browser writes.
3. Only after verified identity and moderation, add community publishing, profile disclosure rules and optional dating.
4. When the product grows, consider moving prefixed tables to a separate database; namespace isolation does not imply independent quotas or service-role boundaries.

Run `npm ci --prefix apps/feture` and `npm --prefix apps/feture run check`.
Vercel root: `apps/feture`; build `npm run build`; output `dist`.

## React migration step (2026-10-10)
- `src/feture/model.ts`: strongly typed private state and per-record timestamp merge.
- `src/feture/use-interest-map.ts`: local-first AppBase document store hook; no client Supabase secrets.
- `src/feture/experience.tsx`: real React app shell, topics, per-topic editor with boundary/intensity separation, community/dating previews.
- `public/images/profile-*.webp`: portraits extracted from prior self-contained concept.
- The next blocker for real account sync is dedicated FetUre AppBase **server auth/store** environment and server account verification; do not route private writes through anonymous Supabase keys.
