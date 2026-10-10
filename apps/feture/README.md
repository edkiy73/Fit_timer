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
- All 144 topics have Russian definitions and searchable synonyms from the same public editorial release, with selected related topics. The interest editor explains the term before asking for a personal response. `npm run check:catalog` validates this release during checks and builds; draft publishing/admin editing are not implemented yet. See [editorial contract](docs/catalog-editorial.md).
- Community posts and dating profiles still use hardcoded fixtures in the inspected React source, not working social services. Any legacy demonstration labels are implementation debt: current owner policy requires seed provenance in database/admin only and no technical badges in consumer UI during pre-launch development.
- Private interests are stored in AppBase Core's IndexedDB-based local-first document mirror (`interest-map`, free document in sync registry). Per-interest timestamps merge changes when the standard authenticated AppBase sync backend is configured; FetUre production still lacks that server environment, so **cloud persistence is not yet active**. Sensitive local documents are cleared on confirmed sign-out to prevent cross-account disclosure.
- `/#/catalog`: AppBase React route reading public catalogue from Supabase through `/api/catalog`.
- `/#/account`: AppBase email sign-in shell. **Account storage and verification still require separately configured AppBase server backend**.
  The code form explains the 15-minute lifetime, supports correcting the email address, clears the previous code after a successful resend, and distinguishes request/day limits from other failures.
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

## Cross-platform and test policy
- Read `AGENTS.md` in this directory: mandatory website and Android/iOS coverage, lean testing.
- Desktop ≥1100px: sidebar; tablet 768–1099px: horizontal tab bar; phone <768px: safe-area bottom dock. Same React code on all sizes.
- `public/site.webmanifest` and `public/icon.svg`: installable web metadata. No service worker that could cache stale private data.
- `capacitor.config.json` and `scripts/mobile.mjs`: Capacitor 8.5.2 shell setup in parity with UnMute. `npm run mobile:prepare:android` and `npm run mobile:prepare:ios` (macOS/Xcode) build the web bundle and sync native shells, but **do not compile/sign APK or IPA**.
- Native API requests use `src/api-url.ts` so `capacitor://localhost` or `https://localhost` sends requests to `https://feture-mvp.vercel.app`; browsers keep same-origin requests. The mobile shell is not production-auth ready until its dedicated backend secrets are configured.
- Do not introduce extra UI test suites during rapid iteration: typecheck, build and minimal existing checks; only new high-risk data/privacy/auth regressions warrant focused tests.

## MVP implementation handoff (2026-10-10)
The authoritative dependency-ordered backlog is [the SOL 6.1 MVP plan](docs/launch-mvp-plan-2026-10-10.md). Read [the audit and sources](docs/mvp-audit-2026-10-10.md) for verified repository facts, source conflicts and decisions. **F01–F03 web foundations** are complete; **F04 restrictive server foundation** is implemented; **F05 scoped seed framework** is complete and applied; the next slice is **A01** (connect existing Core account/email services and verify sign-in), starting at medium effort. Native hardware acceptance remains O05. See [the environment readiness snapshot](docs/environment-readiness-2026-10-10.md) for live service blockers. The domain-storage design in the plan is a target, not an already deployed migration.

F01 deployment discipline: `vercel.json` uses `scripts/vercel-ignore.mjs`; documentation/tests and other product changes skip FetUre builds, own/shared runtime changes deploy, missing Git history deploys. Actual Vercel skip status remains to be observed after a documentation-only push.


## Navigation and UI foundation (F02/F03)
- Hash routes: `/#/explore`, `/#/explore/:categoryId`, `/#/community`, `/#/dating`. Search (`q`), interest editor (`interest`) and definitions (`hint`) are represented in the URL. Browser back restores the screen/scroll and closes the top URL overlay.
- React Aria dialogs trap/restore focus and close on Escape/outside click. Shared typed primitives live in `src/feture/components/`; Motion tokens in `src/feture/motion.ts`, with reduced-motion support.
- Account settings offer system/light/dark appearance; only the appearance preference is stored in localStorage. Interest records remain in the existing IndexedDB store.
- `src/feture/native-navigation.tsx` adds a native back adapter and root exit confirmation. Real Android/iOS acceptance is pending O05; no signed binaries were built.
- Nonfunctional social actions and fake like were removed. The remaining fixtures are read-only pre-launch content until server domains replace them.


## Private domain API foundation (F04)
`POST /api/domain` verifies Core device-token headers and reads only the caller's profile through a fixed server query. Owner hashes, roles and age flags in payloads are rejected. Map reads remain gated until trusted age verification (A04); cloud persistence and real sharing are not active. See [API contract and limits](docs/domain-api-contract.md). Production still lacks Core store/mail/server-secret configuration; missing services yield explicit errors. No live database or environment changes were made.

Server CommonJS modules are checked with strict TypeScript/JSDoc contracts, and `npm run check` includes the focused `npm run test:security` boundary check. Core logout now revokes the server token. Authenticated requests and push dispatch enforce an absolute 90-day session deadline; network failures retain local credentials for retry. A01 live email acceptance remains blocked by production configuration.


## Seed operations (F05)
See [operator contract and commands](seed/README.md) and [verification evidence](seed/verification-2026-10-10.md). F05.1 offline inputs are a historical baseline. The current SQL generator previews live rows before reviewed atomic apply/cleanup through the Supabase operator workflow. Private sidecar provenance separates the 156 reference catalog records from 3 synthetic profiles; no Core accounts are created. Synthetic cleanup preserves the reference catalog and refuses dependent records. Runtime UI/API behavior has not changed.

## A01 service setup

See [required configuration and sign-in acceptance](docs/auth-service-setup.md).
`npm run check:auth-env` performs an offline, value-redacted configuration check;
it never sends email, accesses the database or proves a live sign-in. Existing
Vercel Secret values cannot be retrieved for transfer via the connector. Production
FetUre still needs server storage/mail configuration. A01 remains incomplete: server logout/expiry are implemented and checked locally,
but real OTP delivery, two controlled production accounts and live recovery are pending.
