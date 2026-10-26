# FetUre V20 audit — brief for section auditors

You are one of several auditors working in parallel on the **FetUre V20 clickable prototype**. Your job is a
deep, picky, *hands-on* UX/UI + functional audit of the sections assigned to you. The result is a list of
findings that a developer (or another AI) will fix one by one in V21. Findings must be concrete and implementable.

## What the prototype is
- One file: `/Users/bro/Cloude/Fit_timer/apps/feture/public/prototype-v20.html` (~8.3k lines; first ~3000 are CSS,
  line 3021 is a huge base64 image blob — **never print that line**; JS modules start at line 3023, markers
  `/* ---- s-feed.js ---- */` etc.). Use `grep -n` / `sed -n 'A,Bp' | cut -c1-600` to read code.
- Served locally at `http://localhost:8720/prototype-v20.html` (same file as https://feture-mvp.vercel.app/prototype-v20.html).
- Adult (18+) social app for kink-community people: feed, people/discover (dating), communities, events, chats, «Я» (me).
  A user can be in a **couple**: personal profile «Я» and couple profile «Мы»; the acting profile is chosen in the dock
  («Я» tab → sheet «Действовать как»; on desktop a popover from the sidebar avatar). All actions must come from the selected profile.
- It is a prototype: demo data, in-memory state, simulated server. **Do not** report missing backend/auth/persistence
  after reload/tests. Do report: dead buttons, wrong transitions, inconsistent state inside one session, wrong
  acting profile, privacy contradictions, confusing UX, visual defects, inconsistent components, bad copy.
- Read the owner's intent first: `apps/feture/docs/design-reference/V20-CHANGELOG.md` and `V20-SOLO-COUPLE-AUDIT.md`.
  Something documented as "by design" is not a bug unless it is clearly bad UX — then file it as `product` with reasoning.

## Tooling (already installed — do not npm install anything, do not run `playwright install`)
- Harness: `/private/tmp/claude-501/-Users-bro-Cloude/a8b4255e-63aa-4db0-bd29-6c857eec70d6/scratchpad/pw/h.mjs`.
  Read it. It exports `launch, page, boot, qa, setActor, go, state, snap, layout, controls, closeAll, save, sleep`.
  - `boot(p,{persona:'full'|'pair'|'new', actor:'me'|'couple', lang:'ru'|'en', theme:'light'|'dark'})`
  - `go(p,'P01',{id:'mia'})` = `window.FT_QA.go` (the prototype's own QA navigation). `window.FT_QA.list()` lists QA entries.
  - `qa(p, act, v)` clicks an option in the QA drawer (persona, theme, lang, pair test actions `qaPairAction`
    invite/incoming/photos/expire, `qaPairMember` me/partner, `qaAuto` wait/yes, `qaV13` yes/no/gone, `qaV13b` likes/note/mod,
    `qaPv` ok/no, `qaNet` on/off, `qaLongT` on/off, `qaNosp`, `qaXss`, `qaDating`, `qaPrem` 0/1, `qaClock` 0/15/120/1440 …).
    See `qa.js` module in the prototype (grep `QA_RUN`, `qaRender`).
  - `state(p)` → {screen, sheet, dialog, menu, viewer, match, toasts, h1}. `layout(p)` → automatic overflow/clip/small-target checks.
  - `snap(p,'issues/<section>/<ID>')` saves a PNG into `apps/feture/audit-v20/screens/…`; `{full:true}` = whole scroll height.
  - Prefer **real clicks** with Playwright locators (`p.locator('[data-act="likePost"]').first().click()`), typing with
    `p.keyboard`/`fill`, long-press via `p.mouse.down()`+wait+`up()`, swipes via mouse drags. That is the point of the audit.
- Write your scripts in your own folder `scratchpad/pw/<section>/` and import `../h.mjs`. Use **one browser at a time**
  (machine has 16 GB and several auditors run at once); close it when done. Viewport default 390×844 (phone, touch);
  check 320 and 1440 at least for your key screens too.
- Already available (made by the lead before you started):
  - Screenshots of every QA-listed screen for 4 personas at 390px: `apps/feture/audit-v20/screens/inv/390/<full|pair-me|pair-couple|new>/NNN-<ID>.png` (+ `-full.png` long versions).
  - `apps/feture/audit-v20/work/inventory-390-*.json` — per screen: state, layout warnings, list of controls, JS errors.
  - `apps/feture/audit-v20/work/crawl-<persona>.json` (being written while you work) — every control clicked one by
    one with its outcome (`NO VISIBLE CHANGE`, warns `no action X` = dead handler, errors), plus every sheet/dialog/menu
    found and its controls clicked. Use it to find dead buttons and popups in your sections; then verify by hand.
- Look at screenshots with the Read tool (it shows images). Look at them critically, like a Principal UI designer.

## What to check (for every screen, popup and state in your scope)
1. All screens, all interactive elements, all states (empty/filled, on/off, selected/unselected, sent/not sent,
   approved/declined, public/private, access/no access, Я vs Мы, new persona vs filled persona).
2. Open every popup / sheet / dropdown / context menu / long-press menu / confirm dialog / picker / nested popup.
   For each: how it opens, is it needed, placement, sizes, scroll, clipping, consistency with other popups, every
   button works, close/cancel/Esc/scrim/back, reopen (stale values?), result reflected in UI, could it be simpler.
3. Chains: change something → go elsewhere → come back → is it reflected? Counters equal list lengths? Toast text true?
4. Visual: spacing, alignment, sizes, radii, heights of same components, icon offsets, fonts, hierarchy, wrapping,
   truncation, redundant separators/titles/avatars/counters, image scaling, jumps between states, overlaps, density.
   Compare the same component across sections; name the best implementation as the standard.
5. Product logic & copy: is it clear what happens, predictable, too many steps, duplicates, contradictions between screens.

Not a bug: missing real server/auth/tests, demo data, reset after reload, features absent by design.
If a state exists in code but is unreachable from the UI, file it (category `product` or `functional`, note "unreachable").

## Output (write files — your final message is only a short summary)
1. `apps/feture/audit-v20/work/findings-<section>.json` — JSON array of findings:
```json
{
  "id": "FEED-001",            // your prefix + 3 digits, unique
  "section": "Лента",          // Russian section name
  "component": "Карточка публикации → меню ⋯",
  "category": "functional",    // functional | ux | ui | product
  "priority": "P1",            // P0 | P1 | P2 | P3 (definitions below)
  "state": "persona pair, actor Мы, 390px, light, RU; post p3 opened from feed",
  "steps": ["Открыть Ленту", "Нажать ⋯ на посте Mia", "Нажать «Скрыть»"],
  "actual": "Что происходит сейчас (факты, точные тексты)",
  "why": "Почему это неправильно",
  "expected": "Как должно работать",
  "fix": "Конкретное исправление: что поменять, где (функция/селектор/строка prototype-v20.html), какие тексты/размеры",
  "places": ["Все места, где проблема повторяется"],
  "related": ["ID других находок"],
  "screens": ["issues/feed/FEED-001.png"],   // paths relative to audit-v20/screens/, PNG made with snap()
  "verify": "Как проверить после исправления",
  "code": "prototype-v20.html:5412 ACT.hidePost"
}
```
   Write all text fields in **Russian** (UI strings quoted exactly as shown). Group repeating defects into one finding
   but list every place in `places`. Every finding needs a concrete `fix` — never "улучшить UX".
   Visual findings must have a screenshot (crop or annotate is optional; a clear full screenshot is fine).
2. `apps/feture/audit-v20/work/coverage-<section>.json` — what you covered:
   `[{ "type":"screen|popup|state|scenario|control", "id":"F05", "name":"Публикация и ответы", "opened_by":"…",
      "personas":["full","pair-me","pair-couple","new"], "status":"checked|partial|unreachable|not-checked", "notes":"…", "issues":["FEED-003"] }]`
   Every popup you find goes in here as type `popup` with how it is opened. Be honest: `partial`/`not-checked` where true.
3. Keep `apps/feture/audit-v20/work/notes-<section>.md` updated as you go (what is done, what is next), so the work
   can be resumed if you are interrupted. Save findings incrementally (rewrite the JSON file after each batch).

## Priorities
- **P0** — a core scenario is blocked or broken; crash/blank screen; action performed from the wrong profile (Я vs Мы);
  private content shown to someone without access; data the user entered silently lost.
- **P1** — serious functional bug or strong confusion in a main flow: dead button, wrong transition, state not
  reflected/contradictory between screens, counter ≠ list, popup that can't be closed properly.
- **P2** — noticeable UX/UI defect or inconsistency; bug in a secondary flow; misleading copy.
- **P3** — polish: small spacing/alignment/radius/size/copy issues.

## Rules
- **Do not modify** `public/prototype-v20.html` or anything outside `apps/feture/audit-v20/` and your scratch folder.
- No git commands that change state (no commit/checkout/stash). Do not touch other auditors' files.
- Be thorough but factual: reproduce every finding in the browser before filing it. If you could not reproduce
  something you saw in code, don't file it as a bug (you may mention it in notes).
- Aim for depth: an excellent section audit typically yields 25–60 findings including small visual ones.
