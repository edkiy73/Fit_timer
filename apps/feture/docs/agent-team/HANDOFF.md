# 12-line handoff — Claude ↔ ChatGPT

Write this **at the end of an interrupted/merged/blocked coding slice**, as PR/Issue comment (or one updated comment). Do not create giant handoff documents; don't duplicate test logs.

```md
FetUre HANDOFF
Issue: #NNN | epic: [A/P/W/C/R/D/V/O] | priority: P0/P1/P2
Status: ready / working / review / blocked / merged
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

**New session startup:** read root and FetUre AGENTS, current STATUS, this handoff, PR diff, one MVP domain card and 2–5 touched files. Don't transfer whole chat transcripts, archived plan, CSS dumps or entire test logs. Reconcile latest main before any write. An interrupted branch is *not* merged, tested or production-ready. If a coding session died before it pushed any files, state that the work cannot be recovered from GitHub and re-evaluate the Issue instead of inventing progress.
