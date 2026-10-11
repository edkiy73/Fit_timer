# FetUre MVP → production — execution map

**Canonical product contracts:** [task router](../mvp-plan/README.md), domain cards and [STATUS](../mvp-plan/STATUS.md). This is a short map of **dependency stages and release gates**, not a replacement for requirements or an alternate checkbox history. GitHub [Issues](https://github.com/edkiy73/Fit_timer/issues?q=is%3Aissue+is%3Aopen+FetUre) are working tickets; Issues should link to original card ID and never claim unchecked live acceptance.

## Work order / dependency gates
| Stage | Domain cards | Must be genuinely demonstrable before next gated experience |
|---|---|---|
| **0 — production-quality foundation** | F01–F05, A01/A06 | Working email OTP on ≥2 account sessions, sign-out isolation, complete **visual** account/profile/onboarding, responsive base + real error states. Shared auth readiness **not** equivalent to live login. |
| **1 — privacy and identity** | A02/A03/A04/A05, P01/P03 | Reliable owner sync/offline; adult and legal consent gates; partial grants/revocation, moderation. QA prelaunch grant is **not** production age proof. Provider and legal approvals remain external. |
| **2 — media and self-discovery** | P02/P04, W01–W07 | Authorized photo upload/moderation, my world interests & map, questionnaires, journal, optional consented share/comparison. Prove server projection with 3 accounts, not CSS masking. |
| **3 — community** | C01–C04 | Approved posts, comments/reactions, groups/search, in-app inbox, real visibility and abuse controls. Seed data stays prelaunch-only and distinguishable in DB/admin. |
| **4 — partnerships and dating** | R01–R03, D01–D05 | Mutual pair consent, explainable compatibility, explicit opt-in dating, swipe cards, true idempotent matches and permissioned messages. No fake user-facing success. |
| **5 — production operations** | O01–O04, O02 admin | Scoped export/erasure, moderation operators, safe telemetry, backup+restore+deletion ledger, performance & budget checks. Age/privacy/moderation reviewed independently. |
| **6 — release evidence** | V01 decision, O05/O06 | Make explicit **include/deferral** decision on video; web/Android/iOS/tablet/fold/browser/device acceptance; native signed build at milestone only; policy/legal/vendor review and launch signoff. |

## Quality gates (apply to each relevant slice)
- UX: reference `../design-reference/README.md`; real React screenshots (minimum phone 390 and desktop 1440 for material UI), responsive 320/768/1024, dark/light, touch/Back/keyboard/blur sheets, no layout overflow.
- API: server identity derived, ownership and RLS isolation, validation, idempotent CAS and safe error projection, no private data in analytics logs.
- Speed: measure bundle and first interaction where relevant, no unnecessary animations/heavy queries, bounded pagination and retry budget.
- Risk: focused tests on auth, permissions, exposure, deletion, migrations and purchases; routine UI uses typecheck/build + short browser walkthrough (not dozens of brittle snapshots).
- Release: account creation and email delivery, 18+ provider (not QA override), consent & legal docs, 3-account boundary, media safety/moderation, proper data deletion/restore, deploy/rollback, native-store policy, device QA. **If any gate unknown, mark pending or blocked, not done.**

## Operating constraints
- Only subscriptions: Claude Code and ChatGPT/Codex, manually launched.
- Do **not** spawn a team for a 5-line fix. One coder; optional one independent QA for meaningful diff. No agent gets full archived plan or another agent's code dump.
- Never change shared `packages/core` or `packages/ui-react` silently; separate scoped PR + verify all consuming products.
- No routine per-commit APK/IPA or redundant Vercel deployment. Prefer a reviewed coherent PR to dozens of tiny pushes.
- MVP acceptance follows live proof; a checked implementation subsection in a card may still have open production gates.

## Next known high-value slices (verify fresh HEAD)
- A06: replace raw account link list and basic seven-step form with real premium account/profile/onboarding, using reference visual identity.
- O05: common AppBase admin compact UX + colour contrast/open PR #814; don't create another separate admin.
- A01/A02/A03/A04/A05: real auth and private, owner-safe synced experience, age/legal acceptance.
- C01 photo/media gated on P02; C02/C03 after real text-post pipeline; R/D then gated on privacy/consent.
- End with O01–O06 and provider-dependent launch gates; do not promise launch date based on green CI.
