# FetUre — product and development rules (2026-10-10)

**Scope:** `apps/feture/**`. These rules supplement the root `AGENTS.md` and take precedence for FetUre-specific UX and test policy. They apply to AI coding agents and human contributors.

## Design system — owner rule, 2026-10-28 (overrides any screen-level habit)

Every FetUre screen is built only from `src/fe/kit` (components) and its tokens (`src/fe/kit/tokens.css` + the
generated `v21.css` colours/radii). Read `src/fe/kit/README.md` first; `/n/kit` shows every component in every state.
- A screen never writes its own sheet, dialog, tabs, list row, chip, notice, button, icon button, input, textarea,
  select, switch, heading, inline style or stylesheet, and never its own colour, font, size, spacing or radius.
- Something the kit lacks is **added to the kit first** — component (or variant/state) + tokens + its section on
  `/n/kit` + a line in the README — and only then used. Never a local copy "for now".
- When the prototype disagrees with itself (several looks for one control, odd sizes), ask the owner which one the kit
  keeps; do not copy the inconsistency.
- `npm run check:kit` (inside `npm run check`, so CI) fails when any file hand-writes more than its baseline
  (`tools/fe-kit-baseline.json`). Moving pieces onto the kit lowers it: `node tools/check-fe-kit.mjs --update`.
- Reviews check reuse across the whole app, not only that one PR works.

## Owner decision — 2026-10-27 (V21)

New accounts and new couples start **in Discover (dating on, visible)**; without a profile photo nobody sees them there. Onboarding says so, offers to upload a photo right away and lets people switch Discover off; «Я → Видимость» repeats it. This replaces «dating off by default» below. Server-side reciprocal opt-in for candidate discovery, 18+ and consent rules stay. Details: `docs/design-reference/V21-INTEGRATION-GUIDE.md`.

## Latest owner product priority — 2026-10-13 03:33

Read [PRODUCT-SPEC-START](docs/design-reference/PRODUCT-SPEC-START.md) before selecting another FetUre product/design task. The owner now prioritizes a complete product/interface specification, all user journeys and screen designs before further internal feature expansion. [MASTER-PRODUCT-SPEC-V4](docs/design-reference/MASTER-PRODUCT-SPEC-V4.md) defines the target product; it is not a live acceptance report. Five permanent tabs are **Лента / Люди / Сообщества / Чаты / Я**, replacing both the 4+conditional-dating and the 02:53 map/topics/social/me/dating navigation below. Feed includes full Events (online/offline); Me contains map/explore/journal. RU/EN, notifications, search and Light/Dark/System are required. Social public profiles and exact-nickname search remain available outside dating. Social-profile likes may establish a mutual contact without enrolling in discovery; candidate discovery still requires reciprocal server-confirmed opt-in. Private sharing never enables chat: only mutual personal likes do. Do not treat likes on posts, group/event roles or Premium as a chat permission. Do not remove security gates or claim this target behavior is already implemented. Critical auth/data-loss/privacy fixes may continue; pause unrelated feature expansion and reconcile old Issues with this spec instead of deleting them wholesale. Latest explicit owner requirements supersede conflicting navigation/product queues below; existing server age/consent/ACL requirements remain.

## Current owner UX override — 2026-10-13 02:53

See [USER-JOURNEYS-V3](docs/design-reference/USER-JOURNEYS-V3.md) before any visual/frontend task. Account required before entering the app; real Core registration/login, no guest/test consumer mode and no purpose-selection onboarding. User domain data/prefs/drafts live only on the server: remove local-first/guest import/durable offline domain queues in a scoped functional change, retaining server idempotency/CAS/ownership. Temporary form/request memory is not persistent storage; Core credential handling is separate. Five permanent tabs: Моя карта, Темы, Общение, Я, Знакомства. Dating participation remains voluntary and off by default; its tab is always visible. No dating candidate browsing until the viewer explicitly opens their own eligible dating profile with server-confirmed opt-in. Reciprocal discovery must be server enforced; no CSS-only gate. Registration/minimal non-sensitive account provisioning precedes adult proof; sensitive fields/content retain age/consent ACL. This overrides earlier guest/local-first, purpose question and conditional-dock guidance, not security requirements. The public welcome/registration URL stays reachable; this is product sign-in, not a global deployment allowlist.

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
- User text is hostile by default. Escape on output (`esc()` in the prototype, React's default escaping in the app — never `innerHTML`/`dangerouslySetInnerHTML`), and normalise/validate on the **server** at write time. Read [docs/input-safety-backend-checklist.md](docs/input-safety-backend-checklist.md) before moving any text field to the backend or the React app.

## 5. RAPID MVP DEVELOPMENT: MINIMAL TESTING (explicit owner preference)
There will be **hundreds of UX and product revisions**. Prioritize correct UX and shipping useful increments, not accumulating fragile tests.
- Keep quick **TypeScript typecheck + production build** and a **small existing smoke/core contract check** as the usual automated gate; run those and any already-existing short tests that CI requires. Do NOT create exhaustive UI tests, snapshots, broad mocks or Playwright scenarios for every component, field, button, or pixel.
- Write **new** automated tests only for genuinely high-risk stable logic: authentication/authorization, private data disclosure, irreversible deletion, schema migration, lost data, billing, complex merge, and severe regressions. One small focused test is better than a suite.
- For rapidly changing UI: a quick manual responsive/interaction check is usually sufficient; no additional test file is expected. No "tests for coverage percentages" and no duplicated E2E/unit scenarios without reason.
- Never disable existing security/auth protection to save a test. Fix actual compile/build failures. CI remains a guardrail, not the feature.
- Owner override (2026-10-11): **continue the complete MVP plan at high effort without stopping to switch effort between cards**. Batch related tasks, verify and publish complete increments, then continue the next dependency-ordered task in the same session.
- An unavailable external credential/vendor/legal/physical-device requirement blocks that acceptance criterion only; record it honestly and continue independent authorized implementation. Never fabricate production verification, delivery or device evidence to mark a blocked card complete.
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

## 8. Authoritative MVP execution plan — token-aware routing

**DO NOT READ the original full plan by default.** The old path `docs/launch-mvp-plan-2026-10-10.md` is now a tiny redirect, not the original 97 KB document.

1. Read [current status and next task](docs/mvp-plan/STATUS.md) (~a few KB) before choosing work; verify `main` HEAD and task dependencies.
2. Use [task-card router](docs/mvp-plan/README.md) to read **only** the selected domain file (`cards/F.md`, `A.md`, `P.md`, `W.md`, `C.md`, `R.md`, `D.md`, `V-O.md`). Then read 2–5 relevant code/test files.
3. The archived full plan (`docs/mvp-plan/archive/full-original-2026-10-11.md`) and historical execution journal (`docs/mvp-plan/history/2026-10-10-to-11.md`) are **opt-in historical references only**; search narrowly for a given decision/date. Never load them end-to-end for ordinary work.
4. For each merged work increment, **update/replace** the relevant lines in `docs/mvp-plan/STATUS.md`, including next action and short handoff; do not append daily entries to the entrypoint, domain cards, or archived original. Record full milestone details in a separate, dated `history/` file only if they materially matter.
5. The task cards remain requirements, not claims of live acceptance. Preserve all privacy/consent, age-gate and device checks. Code + CI does not prove production acceptance. Read specialist docs only for a task that needs them.

Canonical Core auth and PostgreSQL-owned FetUre domain data remain the architecture; no second auth or client service-role secrets. No unrelated app changes.

## 9. Manual-only shared AI team and MVP Issue queue (owner decision 2026-10-12)

**Standing owner authorization, 2026-10-13:** The owner explicitly authorized publishing FetUre development commits to the public `edkiy73/Fit_timer` repository, creating PRs and independently merging verified changes during requested work. Do not ask for this same GitHub publication/PR/merge permission again. Run the existing checks and proportional independent review before a safe merge.
- [Start here](docs/agent-team/START.md) → [GitHub Issue index](docs/agent-team/ISSUES.md) → [one MVP card](docs/mvp-plan/README.md) → [12-line handoff](docs/agent-team/HANDOFF.md).
- Claude and ChatGPT/Codex are **equal manual executors**. Work can switch provider mid-Issue via GitHub branch/PR/handoff. Never depend on chat history or transfer whole repository context. Default one implementer, specialist agent only when useful.
- Current visual north star: [owner-approved Claude HTML reference](docs/design-reference/README.md) + [responsive/quality acceptance](docs/ui-quality.md). Full original HTML is **opt-in only**, not default agent context; desktop requires independent full-width design.
- The source of truth for requirements and live acceptance is still domain MVP cards + STATUS. Epics/Issues track work, **not alternative product specs**. Do not prematurely mark complete.
- **No scheduled autonomous development, separately paid AI APIs, credits or model-invoking GitHub Actions.** The prior paid workflows were removed; the previous subscription-based routine guide is obsolete.
- **Owner decision 2026-10-12: NO per-PR owner QA gate.** During an explicitly user-initiated coding session ("продолжай/го/делай"), the active Claude/ChatGPT/Codex agent is responsible for implementing, running focused automated + browser checks when feasible, fixing failures, obtaining an independent read-only review proportional to risk, and **merging a verified incremental PR itself**. Do not stop after each green PR asking the owner to click, test or approve. Update STATUS/handoff and proceed to the next ready slice. Merge only if current `main` and head are fresh, CI required by the repo passes, no unresolved blocking review issues/conflicts, and the change stays within its approved safety scope. Report which checks were *not* possible without implying they were performed.
- **Three gates, do not conflate:** (1) `PR/CI+review passed → safe code merge to main` (agent-owned); (2) `milestone UX/device acceptance` (agent does available browser/device QA and asks owner to assess the assembled feature at milestones, **not each PR**); (3) `launch/live enablement` (explicit owner decision where required). Unavailable external device/provider/live multi-account checks stay open as milestone acceptance, not as a blanket blocker for merging reversible, safely gated pre-launch implementation.
- **Risk escalation:** auth/permissions, private photos or data disclosure, adult proof, moderation, billing and irreversible operations need a focused independent security/privacy review plus existing tests. A staged private-media UI may merge after that review **only while publication and sharing remain server-denied until their separate consent, staff review and authorization gate**. Do not auto-approve or switch on public exposure. Stop and ask the owner for *actual product/policy choices*, launching real users, payments, final legal text, public release of sensitive media, shared-system destructive changes, production SQL/migrations without prior authorization, or app store publication. Shared Core changes also need cross-app CI and impact review, but not a routine owner visual sign-off.
- **Manual session vs unattended automation:** an agent explicitly working in an active user chat may choose and execute a safe merge. No background bots, scheduled autonomous development, GitHub auto-merge without agent review, separately paid AI APIs, or model-driven Actions. The owner can still request review-only ("проверь") or explicitly hold a PR; honor those requests.
