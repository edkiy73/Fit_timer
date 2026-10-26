# FetUre V20 audit — progress log (for resuming)

- Branch: `audit/feture-v20-ux`. Prototype: `apps/feture/public/prototype-v20.html` (unchanged).
- Local server: `python3 -m http.server 8720` in `apps/feture/public`.
- Harness + scripts: scratchpad `pw/` (h.mjs, inventory.mjs, crawl.mjs). Playwright-core 1.55 + system Chrome.

## Done
1. Code inventory: 77 screens (`SC.*`), 573 `ACT.*` handlers, 151 `sheet()` calls, 40 `ask()` dialogs,
   QA tooling `window.FT_QA` (go/list/screen), QA drawer options (personas, pair test actions, theme, lang…).
2. Pass 1 inventory: 100 QA-listed screens × 4 personas (full, pair-me, pair-couple, new) at 390 px —
   screenshots `screens/inv/390/**`, data `work/inventory-390-*.json`. No JS errors.
3. Pass 2 crawler started: every control on every screen clicked one at a time, outcome recorded,
   every sheet/dialog/menu found and its controls clicked → `work/crawl-<persona>.json`.
4. Section auditors (parallel): auth/settings, feed, events+communities, people/profiles/access,
   «Я» hub/editor/gallery, couple/chats/notifications → `work/findings-<section>.json`, `coverage-<section>.json`.

5. Lead findings (`work/findings-lead.json`, generator `scratchpad/pw/lead/findings.py`): 22 so far —
   VIS-001…013 (dock label, seg tabs, «Я» tabs, create buttons, avatar scale, typography, selects, chat header,
   toasts over sheets, dialogs, tag sheet, sheet grab), RESP-001…004, GEN-001…003, NAV-001/002 (header back crosses tabs, scroll lost).
6. Responsive matrix (`work/resp-main.json`, `resp-bound.json`, screens `screens/resp/**`), dark pass (`screens/dark`),
   component metrics (`work/metrics-390.json`), crawler v1 triage (`work/crawl-triage.json`, `overlays.json` — 64 popups).
7. Crawler v2 restarted (fixed no-change detector). Report builder ready: `tools/build_report.py`, `tools/report-template.html`,
   `tools/convert-shots.mjs`; plan stub `tools/plan.json`.

## In progress / next
- Lead: responsive matrix (320/375/430/768/1024/1440/1920 + boundaries), cross-cutting component consistency (VIS),
  crawler triage (dead buttons, no-change controls), coverage reconciliation vs code.
- Then: merge findings → `data/issues.json`, dedupe, verify top issues, write reports 01–06 and `report.html`.
