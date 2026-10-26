# Auth / Settings auditor — notes (status: done)

Scripts: scratchpad `pw/auth/` (u.mjs helpers, chain.mjs = register through UI, s1–s28 scenario scripts,
contrast.mjs = automatic WCAG check, fb1–fb4.py finding batches → `python3 build.py` writes `work/findings-auth.json`,
cov.py → `work/coverage-auth.json`). Screenshots: `screens/issues/auth/**`.

## Result
48 findings: P1 ×5, P2 ×19, P3 ×24 (AUTH-001…025, SET-001…023).

## Covered
- A01 welcome (slides, swipe mouse/touch, autoplay, RU/EN, 320–1440), terms sheet.
- A02/A03/A04/A04X/A05 (both steps)/full registration chain to the first screen, OAuth sheets, U18, back/history.
- A07 age check (all states), needAge sheet, V01 (send, approve, reject), K01 + every row, K05, K06, K07 + delete,
  P12 (Я/Мы, «И для пары»), S01 + help sheets, logout.
- B01 (buy offline/online, cancel, restore), gift (all validation paths), received gift, paywall, limit, Premium on/off undo.
- Maintenance, offline, long/no-space/hostile texts, EN pass (main tabs + my screens), dark pass with contrast numbers.

## Not checked / notes for the lead
- D09 history paywall (people section), chip picker limit inside sheet.
- Cross-cutting (not filed by me, for VIS): dock label «Комьюнити» clipped at 320 px; inactive dock labels contrast
  2.85:1 light / 3.73:1 dark; desktop sidebar has two buttons to «Я» (nav item + avatar) for a single persona;
  dock tab is «Комьюнити» while QA/spec call the tab «Сообщества».
- «Все уведомления» counter did not visibly change after a photo-verification rejection notification (not verified in depth — notifications auditor).
