# FetUre V17 — changelog

V17 is a copy of V14 (`public/prototype-v14.html`, now frozen). There is no V15 or V16. The only area changed is the «Профиль» tab. The concept is "one profile": the tab is your profile as others see it, with the owner's controls in place. There is no separate preview, no second card for the couple, and no second copy of interests or the gallery.

Notes for reviewers: `public/prototype-v17-notes.html`. Contract test: `tests/prototype-v17-contract.mjs`. It runs the whole V14 contract against V17, which in turn runs the V13 contract. The only V13 assertion it swaps is that `profGo('couple')` now opens the profile tab instead of P03. After that it runs the V17 checks.

## 2026-10-25 — one profile page

The problem in V14 was that one profile lived in many places:
- The profile itself was a summary card on the tab, then «Как видят» (P03, a copy with demo buttons), then the editor (P02), which had its own «Как видят» button.
- Interests appeared on the tab, in the preview, in the editor and in «Все».
- The gallery appeared on the tab and in the preview.
- The private part appeared in the preview, the editor, P04 and Access.
- The couple had its own second card, its own preview (Q03) and its own editor entry.
- The tab's «Активность» list repeated the profile's own tabs.

Changes:
- **The tab is the profile.**
  - `SC.X01` renders `profileView(owner, r, {root:1})`.
  - The overlay header holds the identity switch on the left and the bell and settings on the right.
  - Your own page has no like, follow, compatibility or demo buttons.
- **Owner parts** (`ownPageParts`):
  - «Нужно решить», the couple proposal status and «Следующий шаг» appear under the actions. With no couple, the couple invitation appears here too.
  - The owner-only list «Видишь только ты» comes last:
    - for you: events, drafts & posts, connections, saved, access;
    - for the couple: couple access and couple settings.
  - Followers and following no longer have a row, because the counts under the name already open them.
- **«Я / Мы»** (`ACT.meOwner`):
  - With an active couple, one switch replaces the second card.
  - «Мы» renders the couple profile on the same page by setting `r.p.owner='couple'`, so `editableProfile()` and the interest actions target the couple.
  - The second action button becomes «Настройки пары».
- **One lens, on the private part only** (`ownPrivBlock`, `ACT.privLens`):
  - «Как видят: С доступом / Без доступа» switches between what you put there and the veil a stranger sees.
  - Below it are «Кому открыто · N» (P07) and «Изменить приватную часть».
  - Inside the veil, «Запросить доступ» switches the lens back to «С доступом».
- **One editor, opened at a section**:
  - «Изменить» on «Данные» and on the private part opens P02 with `p.at` (`media | details | jars | priv`). The editor scrolls there, and `details` unfolds the card.
  - The «Как видят» button is removed, because saving returns you to the page, and the page is the view.
  - The editor no longer copies the interest list. Interests already save immediately, so it shows one row, «Все интересы».
- **P03** is now only a preview of an unsaved draft or a partner's proposal (`p.preview`), and it shows a banner saying so. Without a draft it renders your own page.
- **Links to me open the tab:** `profGo('me'|'couple')` opens the tab through `ACT.openOwn`, with the couple selected when needed. Pushed `P03`/`Q03` routes from elsewhere render the same page.
- Copy: the couple variants use «вы» in the empty-state texts.

Verified with Chromium:
- V17 contract, including the full V13 and V14 contracts: pass.
- Profile tab flows: tab, «Мы», lens, couple lens, edit, edit at a section, couple edit, access and all interests. These ran for 3 personas × RU/EN × 4 widths (320/390/768/1440) × light/dark. That made 336 states, because couple flows are skipped for personas without a couple. Result: no JS errors and no page overflow. Long text, hostile input and no-space text also ran at 320 and 390 px: no errors and no overflow.

Not verified: real devices, screen readers, 200% zoom, live multi-client couples, user testing.
