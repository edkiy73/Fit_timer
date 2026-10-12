# 12-line handoff — Claude ↔ ChatGPT

Write this **at the end of an interrupted/merged/blocked coding slice**, as PR/Issue comment (or one updated comment). Do not create giant handoff documents; don't duplicate test logs.

```md
FetUre HANDOFF
Issue: #NNN | epic: [A/P/W/C/R/D/V/O] | priority: P0/P1/P2
Status: ready / working / review-needed-by-agent / blocked-technical / blocked-owner-decision / merged
Base main SHA: <7+ characters> | branch: ... | head SHA: ...
PR: #NNN or none | next owner: Claude / Codex / either
Goal and acceptance: <one or two lines>
Changed files: <paths, max 5 most relevant>
Verified: <exact commands + results, browser sizes if actually tested>
NOT verified: <age proof/live users/native/privacy/visual QA as applicable>
Blockers/dependencies: #... | provider/credential/decision, if any
Next action: <one small concrete action and first file>
Risks/rollback: <one line if material>
```

**Approval rule (2026-10-12):** `review-needed-by-agent` is NOT an owner approval request. A green reviewable PR is checked and merged by an agent during the active chat after focused independent review and green required CI, unless it triggers an explicit owner product/release gate. Write `blocked-owner-decision` only for a concrete unavoidable policy, live-launch, public-sensitive-sharing, payment, age-proof, irreversible prod SQL or shared destructive decision; name the exact choice. Unavailable native/live user tests are milestone acceptance gaps, **not a blanket per-PR merge hold**. Keep `merged + milestone acceptance pending` as separate facts. No scheduled/automatic bot merges or paid AI APIs.

**New session startup:** read root and FetUre AGENTS, current STATUS, this handoff, PR diff, one MVP domain card and 2–5 touched files. Don't transfer whole chat transcripts, archived plan, CSS dumps or entire test logs. Reconcile latest main before any write. An interrupted branch is *not* merged, tested or production-ready. If a coding session died before it pushed any files, state that the work cannot be recovered from GitHub and re-evaluate the Issue instead of inventing progress.
