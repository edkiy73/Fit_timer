# notes-fix-feed (V21 fixer, section feed)

Status: DONE. 43 findings → 41 fixed, 2 partial (FEED-011 settings/profile entry, FEED-043 save for discussions), 0 needs-owner.
Worktree /Users/bro/Cloude/ft-wt/feed (branch v21/feed), commits: cd54ff6f (P0/P1), 13f2c9ef (P2/P3).
Outputs: work/fixes-feed.json, work/changelog-v21-feed.md, screens/v21/feed/*.png.
Repro/verify scripts: scratchpad pw/fix-feed/t1…t14.mjs (FT_URL=http://localhost:8744/prototype-v21.html).
Contract: PASS V20 rules in V21 (no swaps).
Gotchas: M01 is an ALIAS of P04 → moderation is go('MOD'); contract calls ACT.modDecide directly (confirmation lives in ACT.modRemove); contract v13 expects couple posts not seeded at freshState (only 'me' is seeded there).
