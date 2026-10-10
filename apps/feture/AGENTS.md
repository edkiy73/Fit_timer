# FetUre — product and development rules (2026-10-10)

**Scope:** `apps/feture/**`. These rules supplement the root `AGENTS.md` and take precedence for FetUre-specific UX and test policy. They apply to AI coding agents and human contributors.

## 1. Product, NOT a dating clone
FetUre is a product for learning about yourself, building a meaningful private/public profile, and participating in a community. Dating is **third**, optional, and disabled by default. The app must be useful without dating, a local user base, or a romantic partner.
- "Мой мир": deep, evolving personal profile, interest map/jars, tests, history and privacy controls.
- "Исследовать": large, editorially reviewed taxonomy, meaningful questions, interpretations and content, not arbitrary scores masquerading as science.
- "Сообщество": discussions, groups and moderation. During pre-launch development, realistic seed content has provenance in database/admin only, without consumer demo badges; remove/exclude synthetic participants before serving real users.
- "Знакомства": opt-in large photo cards, swipe, a **full profile scrolling inside the card**, profile-layer access requests and explainable compatibility. Never show someone's hard boundaries as high attraction or leak private data.

## 2. ALL four form factors are first-class (non-negotiable)
FetUre is **one responsive website AND native Android + iOS applications from the same React/TypeScript/AppBase product**. Never treat desktop/tablet as a scaled-up phone mockup or native devices as separate codebases.
- **Desktop** (about ≥ 1100px): full-width website, useful sidebar/nav, comfortable multi-column content and reading widths, sensible max-width, proper hover/keyboard.
- **Tablet** (about 768–1099px): a deliberate tablet navigation/layout with appropriately sized cards and dialogs; both portrait and landscape.
- **Phone** (320–767px): one-column reading, compact safe-area-aware bottom dock, usable swipe/profile scrolling, minimum 44px tap targets where practical.
- Also handle high-DPI, 200% browser zoom, rotated devices, dynamic keyboard, tall/short screens, CSS safe areas, reduced motion and no horizontal overflow.
- Only use responsive CSS and shared design components as needed; keep large desktop layouts independent of phone-only navigation. Avoid giant icons and fixed widths that overflow 320px.
- Visual quality on PC, tablet, and phone matters equally; check representative widths 320, 390, 768, 1024, 1440 after **material layout changes**, but do not turn every UI change into a heavyweight automated test matrix.

## 3. Shared stack, platform packaging
- UI: React + TypeScript + Vite; shared AppBase Core / Task Mini conventions; product-specific features remain within `apps/feture`.
- Website: Vercel `feture-mvp`, progressive-web readiness where appropriate, public website and desktop layouts.
- Android/iOS: **Capacitor**, aligned with the versions and native principles already used by UnMute and FitTimer. Native packaging hosts the same web distribution; platform-specific bridges are adapters, not parallel UIs.
- Mobile shell config, sync and release artifacts are product-specific. Android builds may use CI. iOS compiles/signs on macOS/CI, not on Windows or Linux.
- **Do not build/publish new APK/IPA on every UI commit**, and do not auto-trigger release jobs per push; assemble signed installables only at end-of-milestone or when explicitly requested. No App Store/Play release without readiness, security, content policy and moderation review.
- Do not create a second database, duplicated user management or an unapproved stack. FetUre data shares FitT PostgreSQL with `feture_*` tables for now; Core auth is canonical. No direct browser access to private data, no service-role key in bundles.

## 4. Privacy matters more than shortcuts
FetUre may contain highly sensitive personal information.
- Explicit consent and visibility, private by default. The classifications `private`, `granted`, `public` must be enforced server-side **before real sharing**.
- Hard/soft limits are NOT percentages of desire. A boundary excludes unsafe compatibility rather than subtracting arbitrary points.
- Anonymous public taxonomy is permitted, private profile/test/interest data is not. Validate authentication and record ownership on server. Seed profiles may support the pre-launch experience under section 6; never represent them as real participants after launch. Avoid sexualized images in common screens/marketing and plan moderation and 18+ handling.
- Local data, account switching and deletion must not expose one person's private map to another. Preserve data on sync failure.

## 5. RAPID MVP DEVELOPMENT: MINIMAL TESTING (explicit owner preference)
There will be **hundreds of UX and product revisions**. Prioritize correct UX and shipping useful increments, not accumulating fragile tests.
- Keep quick **TypeScript typecheck + production build** and a **small existing smoke/core contract check** as the usual automated gate; run those and any already-existing short tests that CI requires. Do NOT create exhaustive UI tests, snapshots, broad mocks or Playwright scenarios for every component, field, button, or pixel.
- Write **new** automated tests only for genuinely high-risk stable logic: authentication/authorization, private data disclosure, irreversible deletion, schema migration, lost data, billing, complex merge, and severe regressions. One small focused test is better than a suite.
- For rapidly changing UI: a quick manual responsive/interaction check is usually sufficient; no additional test file is expected. No "tests for coverage percentages" and no duplicated E2E/unit scenarios without reason.
- Never disable existing security/auth protection to save a test. Fix actual compile/build failures. CI remains a guardrail, not the feature.
- Batch several small related task cards when practical. **Stop before a task that needs reasoning effort above medium for a good result**, explain the concrete complexity and the recommended effort, and wait for the owner to switch/authorize that effort. Do not start such a task just because adjacent small cards are done.
- If the owner explicitly selects high effort, complete the authorized high-effort slice and its checks/publication, then stop before the next slice that can be done at medium effort. Record the next effort level; do not spend high effort on unrelated straightforward work.
- Scope tasks into small/medium chunks; prioritize the next user-visible improvement and avoid large unrelated refactors.

## 6. Public development URL, disposable data, no legacy compatibility
- The FetUre website at `https://feture-mvp.vercel.app` intentionally stays accessible. **Do not add production access restrictions, password/SSO gates, or global allowlists without a separate explicit request.** Accessible by link does not mean the product has started serving real users.
- Until the owner explicitly declares a launch with real users, **all FetUre development accounts, seed profiles, posts, media and schemas may be reset or replaced**. Do NOT add backward-compatibility shims, legacy profile readers, dual schema versions, long migration paths or dead code to preserve historic prototype/seed data. Prefer the correct current schema over a compatibility workaround.
- This freedom is strictly limited to FetUre-owned data and resources; never drop shared AppBase infrastructure or other product data in the shared FitT Supabase database. Destructive schema/data edits should be deliberate, scoped and visibly documented.
- Build a natural, well-populated UI without user-facing `demo`, `test data`, `under development` badges. Keep seed provenance in database/admin, not in the consumer UI. The site is publicly reachable: use licensed/generated media and **no real persons' sensitive data without permission**.
- Public access to the landing page must not bypass identity/age verification for 18+ content or server-side privacy permissions. Admin and restricted media stay protected.
- **When real users are explicitly supported**, switch to durability mode: versioned migrations, safe updates, retention/erasure policy, real backups and user-data guarantees. This pre-launch rule no longer applies to them.

## 7. Workflow and status honesty
- Preserve UI direction and useful behaviors from MVP 3.1, but production interface is React (`/concept.html` is reference only).
- Distinguish fully working features from demo stubs and unpublished native shells. Do not claim "APK/iOS ready", "cloud saved", "moderated community" or "functional dating" until independently verified.
- Limit Vercel deployment noise; prefer one merged chunk after checks rather than a chain of tiny main commits.
- Keep the product README and this file current when architectural assumptions or releases change.

## 8. Authoritative MVP execution plan
- Follow `docs/launch-mvp-plan-2026-10-10.md` and its dependency-ordered task cards; rationale and source verification: `docs/mvp-audit-2026-10-10.md`.
- The plan describes target behavior, not implemented capabilities. Start with F01 and record evidence before checking off tasks.
- PostgreSQL is the planned canonical FetUre domain store; current Core document-backed interest-map is transitional. Remove that duplicate path only as part of the complete A02/A03 switch. Core remains canonical for authentication and shared services.
- Interest strength, exploration progress, experience and boundaries are distinct. Never infer consent from a score or a match.
