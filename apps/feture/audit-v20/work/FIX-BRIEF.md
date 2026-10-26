# FetUre V21 — brief for section fixers

You fix the findings of the V20 audit for ONE section in **V21** — the next clickable prototype, which becomes the
UX/UI specification of the MVP. The owner asked for «v21-final со всеми исправлениями»: fix every finding of your section
that is a real defect, verify each fix in a real browser, and document what you did.

## Your workspace (strict)
- You work ONLY in your own git worktree: `/Users/bro/Cloude/ft-wt/<section>/` (branch `v21/<section>`, created from `feture-v21`).
  The file you edit: `/Users/bro/Cloude/ft-wt/<section>/apps/feture/public/prototype-v21.html`.
- Do NOT edit the main checkout `/Users/bro/Cloude/Fit_timer/` (read-only for you: audit files, screenshots).
- Local server of your worktree: `http://localhost:<port>/prototype-v21.html` (port given in your task). Use it with the
  audit harness: `FT_URL=http://localhost:<port>/prototype-v21.html node your-script.mjs`, scripts in
  `/private/tmp/claude-501/-Users-bro-Cloude/a8b4255e-63aa-4db0-bd29-6c857eec70d6/scratchpad/pw/fix-<section>/` importing `../h.mjs`.
  One browser at a time; close it when done.
- Commit to your branch in your worktree when a batch is verified (`git -C /Users/bro/Cloude/ft-wt/<section> commit …`).
  Commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never touch other branches,
  never rebase/merge. The lead merges all section branches.

## Inputs
- Your findings: `/Users/bro/Cloude/Fit_timer/apps/feture/audit-v20/work/findings-<section>.json` (+ notes-<section>.md).
  Line numbers in findings refer to `prototype-v20.html`; V21 is V20 + ~220 lines, so search by function name, not line.
- Owner intent: `apps/feture/docs/design-reference/V20-CHANGELOG.md`, `V20-SOLO-COUPLE-AUDIT.md`, `apps/feture/AGENTS.md`.
- Already fixed by the lead in V21 (do not redo, do not fight): tab-local «‹» header back (`headerBack`), scrolling tab rows
  (`.seg.scroll`, `fitTabCounters`), «Я» tabs with dots, dock label «Сообщества» and C01 sub-tab «Каталог», toasts move to the
  top while a sheet/dialog is open, swipe-down to close sheets (`bindSheetDrag`), glass chat header, one 44 px «+» button,
  confirmation dialogs always have an icon and a solid red danger button, Settings «Проверка возраста» (`ACT.ageFromMe`),
  long names ellipsis next to pills, the QA tab on the right edge.

## How to change the file (merge-safe rules)
- Several fixers edit this one file in parallel; the lead merges with git. Keep your changes inside your section's code
  (its module: `/* ---- s-feed.js ---- */` etc.) and the functions your findings point to.
- New CSS goes ONLY between your markers `/* ==== V21 · <section> · CSS start ==== */` … `CSS end`. New standalone JS
  (helpers, wrappers, new ACT handlers) goes ONLY between `/* ==== V21 · <section> · JS start ==== */` … `JS end`
  (they run before main.js). Editing an existing function in place is fine when the finding is about that function.
- Shared core (`core.js`, `ui.js`: `sheet`, `ask`, `toast`, `go`, `back`, `render`, `bar`, `seg`, `av`, `grp`, the dock, sidebar):
  avoid editing. If a fix really needs a core change, make the smallest possible change and list it in your report under
  «Core changes» so the lead can review the merge. Never reformat or reorder existing code.
- Keep the prototype's style: same components, tokens, copy tone (Russian «ты», no gendered wording, RU+EN via `L('ru','en')`).
  Every new user-facing string needs RU and EN. No new features beyond what a finding asks for; no demo/test badges in UI.
- Comment each change briefly: `/* V21 (ID): what and why */` — same density as the existing V20 comments.

## Deciding what to fix
- Fix all P0/P1/P2 findings of your section. Fix P3 when it is cheap and safe (most are).
- If a finding is a product question that needs the owner (e.g. «who receives a gifted Premium for a couple?»), do the
  sensible minimal UX fix if one exists, otherwise mark it `needs-owner` with the concrete question.
- If you cannot reproduce a finding in V21, mark it `not-reproduced` with how you checked.
- If a finding is wrong or harmful to fix, mark `wont-fix` with the reason.

## Verification (required for every fix)
- Reproduce the finding's steps in the browser on V21 before and after; check the related places listed in the finding.
- Check 390 px, and 320 px + 1440 px for anything visual; dark theme for colour changes; EN for copy changes.
- Watch for JS errors (`p._errors`). After every batch run the contract:
  `cd /Users/bro/Cloude/ft-wt/<section>/apps/feture && node tests/prototype-v21-contract.mjs` — it must end with
  `PASS V20 rules in V21`. If an old rule fails because the finding intentionally changes that behaviour, do not weaken
  the prototype; instead add a `swap(...)` in `tests/prototype-v21-contract.mjs` with a comment `/* V21 (ID): … */`
  that updates that one assertion, and mention it in your report.
- Screenshots of fixed visual issues: save to `/Users/bro/Cloude/Fit_timer/apps/feture/audit-v20/screens/v21/<section>/<ID>.png`.

## Output files (write them; your final message is only a short summary)
1. `/Users/bro/Cloude/Fit_timer/apps/feture/audit-v20/work/fixes-<section>.json` — one entry per finding of your section:
   `{"id":"FEED-001","status":"fixed|partial|needs-owner|not-reproduced|wont-fix","what":"что сделано (RU, 1–3 предложения)",
     "verify":"как проверено","screens":["v21/feed/FEED-001.png"],"core":false}`
2. `/Users/bro/Cloude/Fit_timer/apps/feture/audit-v20/work/changelog-v21-<section>.md` — owner-readable changelog of your
   section in the style of `V20-CHANGELOG.md` (English is fine there, like V20), grouped by topic, plus «Not done» and «Needs owner».
3. Commit your worktree branch. Keep `work/notes-fix-<section>.md` updated as you go (done / next) for resuming.
