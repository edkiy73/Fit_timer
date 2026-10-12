# FetUre — start here, manual-only dual-subscription team

**User command:** "Продолжай FetUre" or "Возьми FetUre Issue #NNN".

**Reserved Sol security task:** [#931 — O02 personal staff roles/moderation/editorial ACL](https://github.com/edkiy73/Fit_timer/issues/931) belongs to the **next manually launched Sol backend/security session**, not the active Sol visual-design session. This is a persistent GitHub handoff, **no user prompt or issue number memorization needed**: after the design queue is clear, inspect #931 before selecting more unassigned high-risk work. Start with the role/SQL/RPC action matrix and independent security review, **not** an immediate production migration or write. Existing #865 remains parent and open. Do not assume the Sol design agent switches models/roles automatically, and do not interrupt its visual work.

**Separate visual-design session:** for "допиливай дизайн FetUre", "продолжай дизайн", Sol visual implementation or Astra review use [DESIGN-START.md](DESIGN-START.md) and [Issue #908](https://github.com/edkiy73/Fit_timer/issues/908) before generic next-task selection; respect parallel photo/backend ownership. The user manually chooses model. Do not reread old chats or replace existing UI unnecessarily. Applies equally to Claude Code (subscription) and ChatGPT/Codex (subscription). **No model API keys, recurring jobs, automatic dispatch or paid fallback.** GitHub is the only cross-chat handoff, not old conversation history.

## Coordinator: 90-second startup
1. Refresh `main` and open PRs. Read only `AGENTS.md`, `apps/feture/AGENTS.md`, [MVP STATUS](../mvp-plan/STATUS.md) **top + next-action/handoff sections**, and [the roadmap](ROADMAP.md). Don't read 97KB archive.
2. Pick **one** unblocked actionable GitHub Issue under `FetUre MVP`, not an Epic and not work already in progress. Respect dependencies, security, owner UX priorities and live API blockers. If unclear, make a tiny analysis issue and stop.
3. Read the relevant single MVP card `../mvp-plan/cards/{A,P,W,C,R,D,V-O}.md` and at most 2–5 code/test files initially. Budget: no repo-wide scans or copying docs to subagents.
4. Default = **one implementation agent**. Delegate a narrowly scoped design/backend **review** only if complexity warrants it. For large new screens: designer writes a 10–20 line interface/UX contract first, then single implementer; QA separate after diff. Never parallel-edit the same files.
5. Branch per Issue, small PR (ideally ≤10 minutes per increment; split if larger), `Closes #NNN` only if criteria really satisfied. Protect `main`; refresh before merge.
6. Write a short [handoff](HANDOFF.md) in PR comment or Issue (not full new docs every time): exact issue / branch / status / changed files / commands and results / blockers / next step. Don't paste source code or logs.
7. If Claude quota expires, **stop**; don't buy extra credits. Next ChatGPT/Codex session continues *from GitHub PR/branch + handoff*. Reverse direction is identical. A normal chat without a coding workspace can inspect/comment but may not directly execute local tests.
8. **Owner does not manually check each PR.** The working agent takes a safe, reviewed PR through green required CI and merges it during this active user-requested session; then moves to the next ready issue. If green CI is absent, review is blocked, a conflict appears, or the change would enable public sensitive data/real payments/age proof or require unapproved production SQL, do not merge; resolve the technical blocker or ask only for a genuine owner policy/release choice. No unattended auto-merge. Record outstanding real-device/live/provider checks as **milestone acceptance**, not as an owner-per-PR gate.
9. Done must distinguish **merged implementation**, **CI + independent focused review**, **browser/device validation** and **real-user/live release acceptance**. Do not mark absent evidence done; do not hold safe private-by-default staged work hostage to unrelated final launch gates.

## Roles (call only as needed)
- **coordinator:** choose issue, dependencies, branch and short handoff; generally main agent, not spawned for a trivial task.
- **design-frontend:** premium product UX + React implementation; [visual reference](../design-reference/README.md), [UI QA](../ui-quality.md).
- **backend:** AppBase auth/DTO boundary, Supabase domain and privacy, explicit migration approvals.
- **qa-review:** independent read-only correctness/security/a11y/visual analysis; actionable findings only.

Compatible declarations: `.claude/agents/feture-*.md` and `.codex/agents/feture-*.toml`. Role text lives there, product contracts in `apps/feture/docs`. Native agent spawning depends on client support; fallback = apply role in main session, not simulate a paid service.

## Owner request workflow
- "Составь план": add/update small Issues and dependencies, not long status documents.
- "Продолжай" / "Го": pick ready Issue, implement, review + run relevant CI, **merge the safe checked PR without asking for a user test**, and continue the next dependency-ordered slice if possible. Pause only for an actual security/product release decision or an unresolved blocker. Browser QA unavailable here? Document it as a milestone gate; do not misstate the check.
- "Проверь": assess pending PRs, don't silently implement or merge.
- "Claude кончился": fetch the unfinished PR, exact commit and handoff; continue without re-reading history.
