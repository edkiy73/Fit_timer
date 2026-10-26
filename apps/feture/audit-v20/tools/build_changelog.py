# -*- coding: utf-8 -*-
"""Assembles docs/design-reference/V21-CHANGELOG.md from the lead's part and the section changelogs (work/changelog-v21-*.md)."""
import os, re, json, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(ROOT, 'work')
OUT = os.path.join(os.path.dirname(ROOT), 'docs', 'design-reference', 'V21-CHANGELOG.md')
issues = json.load(open(os.path.join(ROOT, 'data', 'issues.json'), encoding='utf-8'))
vs = collections.Counter(x['v21']['status'] for x in issues)
head = f"""# FetUre V21 — changelog

V21 is V20 with the fixes from the V20 audit (`apps/feture/audit-v20/`). V20 stays frozen.
File: `public/prototype-v21.html`. Notes for reviewers: `public/prototype-v21-notes.html`. Contract: `tests/prototype-v21-contract.mjs` (the V20 contract run on the V21 file, with the swaps listed there).
Integration into the React app: `docs/design-reference/V21-INTEGRATION-GUIDE.md`.

## In numbers

The audit found {len(issues)} issues (P0 {sum(1 for x in issues if x['priority']=='P0')}, P1 {sum(1 for x in issues if x['priority']=='P1')}, P2 {sum(1 for x in issues if x['priority']=='P2')}, P3 {sum(1 for x in issues if x['priority']=='P3')}).
In V21: fixed {vs['fixed']}, partial {vs['partial']}, not reproduced {vs['not-reproduced']}, moved to the React spec {vs['spec']}, needs the owner {vs['needs-owner']}. Every item with what was done and how it was checked: `apps/feture/audit-v20/V21-FIX-STATUS.md`.

## Owner decisions taken for V21 (27.10.2026)

- Headings use **Geologica**, body text stays **Onest**.
- The brand red is **#DF234A**. In dark theme filled buttons use #DF234A too (white text 4.7:1); red text and icons in dark theme stay the lighter #FF4566 so they read on the dark background.

## Shared components and navigation (lead)

- **Header back «‹»** leaves the screen within its own tab (`headerBack`). It no longer jumps to another tab; the browser/system Back still walks the shared history (NAV-001).
- **Tab rows never cut labels.** When labels don't fit, the row scrolls sideways with a fade at the edge, and the chosen tab scrolls into view. Tabs in headers use 14 px like everywhere else (VIS-002, VIS-006).
- **«Я» tabs** size to their labels; the «new» dot sits inside its label; at 320 px the row scrolls (VIS-003).
- **The section is called «Сообщества»** in the dock, the sidebar and the screen title; inside it, «Каталог / События». Dock labels never end in «…»; at ≤374 px they are 10 px (VIS-001, GEN-001).
- **Toasts never cover sheets.** While a sheet, dialog or popover is open, a toast shows at the top; opening a sheet clears toasts from the previous screen (VIS-010).
- **Sheets close with a swipe down** on the handle or header (≥25% of the height or a quick flick), with the same unsaved-input guard as «×» (VIS-013).
- **Confirmations** always have an icon; irreversible ones have a solid red button (VIS-011).
- **One «+» button** everywhere: 44 px, 14 px radius (VIS-004).
- **Chat header:** the person sits on the same glass as the header buttons, so messages no longer show through the name and status (VIS-009).
- **Sidebar:** one avatar of yourself, on the account button; the «Я» item uses the profile icon (RESP-001).
- **Small targets** (hashtags, links in block headers, «Реже такое», mentions) keep their look but get a 44 px tap area (GEN-002).
- **Long names** end in «…» next to badges and under like tiles (VIS-014, VIS-015).
- **320 px:** the editor title fits next to «В черновик»; the act-as wait line is short («3 симпатии · 3 запроса») (RESP-003, RESP-004).
- **Settings → «Проверка возраста»** opens the check (the row called a missing handler) (SET-001). Settings also has «Скрытое в ленте» (FEED-011).
- **Review tool:** the «V21» tab sits on the right edge and hides under sheets and dialogs; the drawer title says V21 (GEN-003).

"""
parts = [head]
order = ['auth', 'feed', 'evcomm', 'people', 'me', 'couple']
for k in order:
    f = os.path.join(W, f'changelog-v21-{k}.md')
    if not os.path.exists(f): continue
    t = open(f, encoding='utf-8').read().strip()
    t = re.sub(r'^(#+) ', lambda m: '#' + m.group(1) + ' ', t, flags=re.M)  # demote one level
    parts.append(t + '\n')
needs = [x for x in issues if x['v21']['status'] in ('needs-owner', 'partial')]
parts.append('## Open for the owner and partial items\n\n' + '\n'.join(f"- **{x['id']}** ({x['v21']['label']}): {x['v21']['what']}" for x in needs) + '\n')
parts.append('## Not verified\n\nReal devices and touch hardware (touch was emulated), the on-screen keyboard, payments, a live couple on two devices, screen readers.\n')
open(OUT, 'w', encoding='utf-8').write('\n'.join(parts))
print('written', OUT, sum(len(p) for p in parts))
