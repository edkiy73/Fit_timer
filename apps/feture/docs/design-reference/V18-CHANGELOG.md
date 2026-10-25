# FetUre V18 — changelog

V18 is built from V17's code, keeping its routing: links to "me" open the tab. Its page layout is replaced. V14 and V17 stay frozen.

The input was the UX audit of «Я» in V14 and V17, plus the owner's decisions:
- the tab is called «Я»;
- «Я / Мы» is switched on the name, and the tab is a shortcut;
- the couple has one draft that simply updates;
- the share-profile button is removed.

Notes for reviewers: `public/prototype-v18-notes.html`. Contract test: `tests/prototype-v18-contract.mjs`. It runs the V14 contract, and with it V13, against V18, keeping the one V13 swap V17 needed (`profGo('couple')` opens the tab). Then it runs the V18 checks.

## 2026-10-25 — «Я»: one screen, three layers

- **Tab** (`meTabName`): always «Я».
- **Head** (`meHead18`):
  - The head holds the avatar and the name with ▾. Tapping the name opens the «Чей профиль» sheet (`ACT.meSwitch`).
  - To the right are the bell, «Как видят» (P03) and Settings (K01).
  - Status chips that can be tapped: «Нужно решить · N», the Discover mode, and the private part with its access count. A requests chip shows only when there is nothing else to decide.
- **«Я / Мы»**:
  - A long press, or right click, on the «Я» tab opens the same sheet from any screen.
  - Without a couple, the sheet offers «Создать профиль пары» (Q01).
  - Switching keeps the current layer.
  - `actionAuthor()` returns `couple` on «Мы», so grants, revokes and interest edits act for the couple.
- **Профиль layer** (`meProfileLayer`):
  - Blocks come in the order others see them: photos & video, basics, details, interests, private part, gallery, connections.
  - Each block carries an audience tag (`audTag`) and opens P02 with `p.only = media | basics | details | priv`. P02 then shows that section only, with the tag in its bar and «Готово». The button reads «Отправить <partner>» when the partner's approval is needed.
  - Interests are one list with an audience filter (`jarF`) and «Показать все» (`jarsAll`). A tap always edits. History opens X04.
  - For «Мы»: members come from the personal profiles, and a banner shows the draft status. Pending by me: "one draft, new edits update it". Pending by the partner: "proposes changes" opens the diff. When the partner sends changes back, the banner shows that and their note.
- **Видимость layer** (`meVisLayer`):
  - **Discover:**
    - For me: mode (`k4mode`), «Моя карточка в подборке» and likes from profile.
    - For the couple: `pairDating`.
  - **Joint work** (couple).
  - **Access requests**: `reqCardHTML` cards with «Открыть / Отказать».
  - **Private part:**
    - on/off (`privSw`): turning it off asks first, then revokes everything; for the couple it goes through `pairSafety('sharing')`;
    - who may ask (`reqFrom`);
    - shared-by-me rows with «Отозвать» and «Отозвать все».
  - **Profile privacy** (me): activity, mentions, likes.
  - **Couple rules** («Мы»): partner approval, archive, unlink.
- **Моё layer** (`meMineLayer`):
  - Posts & notes with draft count, my events, followers, saved, and «Мне открыли».
  - «Мне открыли» opens P07 with `mine:1`: only «Открыто мне» and «Мои запросы».
- **«Как видят»** (P03):
  - One read-only preview with three views: «Все», «С доступом» and «Знакомства». The Discover view is the card in Discover (`datingCard18`), with a note on whether you are in Discover now.
  - Preview buttons are `disabled`, with no «демо-режим» toasts and no menu.
  - A partner's proposal still opens P03 with `preview`.
- **Couple proposal review** (`proposalDiff`): the review sheet lists what changes, field by field (was / now) — name, about, city, photos, role, format, seeking, private part — before «Одобрить / Вернуть».
- **Settings** (K01): the Dating and Profile privacy sections are replaced by one link, «Знакомства и приватность → Я» (`ACT.openVis`).
- **Removed:**
  - «Поделиться» on the own profile;
  - the «Как видят» menu with its share row;
  - the V17 in-page lens.
- **Private part on** (`privEnable`): opens the private block editor. In block mode, "who may ask" and "revoke all" point to Visibility.

Verified with Chromium:
- V18 contract, including the full V13 and V14 contracts: pass.
- Click-throughs:
  - editing «Основное» saves and returns to «Я» with the new text;
  - a long press on the tab opens «Чей профиль»;
  - switching to «Мы» works;
  - turning off the private part asks first;
  - Settings → «Знакомства и приватность» opens «Я → Видимость».
- The «Я» screen ran in 17 flows: three layers, «Чей профиль», «Мы» with its layers, four block editors, interests «Показать все», «Как видят» in all three views, «Мне открыли» and Settings. These ran for 3 personas × RU/EN × 320/390/768/1440 × light/dark: 720 states, because couple flows are skipped for personas without a couple. Result: no JS errors and no page overflow.
- Long text, hostile input and no-space text at 320 and 390 px: 186 states, clean. V17 shows the same overflow in the editor's basics form with hostile or no-space text; V18 fixes it with a `minmax(0,1fr)` column and wrapping.

Not verified: real devices, screen readers, 200% zoom, live multi-client couples, user testing.
