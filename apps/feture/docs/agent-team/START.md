# FetUre — start here, manual-only dual-subscription team

**User command:** "Продолжай FetUre" or "Возьми FetUre Issue #NNN". Applies equally to Claude Code (subscription) and ChatGPT/Codex (subscription). **No model API keys, recurring jobs, automatic dispatch or paid fallback.** GitHub is the only cross-chat handoff, not old conversation history.

## Coordinator: 90-second startup
1. Refresh `main` and open PRs. Read only `AGENTS.md`, `apps/feture/AGENTS.md`, [MVP STATUS](../mvp-plan/STATUS.md) **top + next-action/handoff sections**, and [the roadmap](ROADMAP.md). Don't read 97KB archive.
2. Pick **one** unblocked actionable GitHub Issue under `FetUre MVP`, not an Epic and not work already in progress. Respect dependencies, security, owner UX priorities and live API blockers. If unclear, make a tiny analysis issue and stop.
3. Read the relevant single MVP card `../mvp-plan/cards/{A,P,W,C,R,D,V-O}.md` and at most 2–5 code/test files initially. Budget: no repo-wide scans or copying docs to subagents.
4. Default = **one implementation agent**. Delegate a narrowly scoped design/backend **review** only if complexity warrants it. For large new screens: designer writes a 10–20 line interface/UX contract first, then single implementer; QA separate after diff. Never parallel-edit the same files.
5. Branch per Issue, small PR (ideally ≤10 minutes per increment; split if larger), `Closes #NNN` only if criteria really satisfied. Protect `main`; refresh before merge.
6. Write a short [handoff](HANDOFF.md) in PR comment or Issue (not full new docs every time): exact issue / branch / status / changed files / commands and results / blockers / next step. Don't paste source code or logs.
7. If Claude quota expires, **stop**; don't buy extra credits. Next ChatGPT/Codex session continues *from GitHub PR/branch + handoff*. Reverse direction is identical. A normal chat without a coding workspace can inspect/comment but may not directly execute local tests.
8. Done means code reviewed + CI + relevant UX/security acceptance. Never mark real devices, provider age proof or multi-account tests done when not performed.

## Roles (call only as needed)
- **coordinator:** choose issue, dependencies, branch and short handoff; generally main agent, not spawned for a trivial task.
- **design-frontend:** premium product UX + React implementation; [visual reference](../design-reference/README.md), [UI QA](../ui-quality.md).
- **backend:** AppBase auth/DTO boundary, Supabase domain and privacy, explicit migration approvals.
- **qa-review:** independent read-only correctness/security/a11y/visual analysis; actionable findings only.

Compatible declarations: `.claude/agents/feture-*.md` and `.codex/agents/feture-*.toml`. Role text lives there, product contracts in `apps/feture/docs`. Native agent spawning depends on client support; fallback = apply role in main session, not simulate a paid service.

## Owner request workflow
- "Составь план": add/update small Issues and dependencies, not long status documents.
- "Продолжай": one highest-priority ready Issue and one PR; if context/time remains, next small *independent* Issue only after verification.
- "Проверь": assess pending PRs, don't silently implement or merge.
- "Claude кончился": fetch the unfinished PR, exact commit and handoff; continue without re-reading history.
