# FetUre V20 — changelog

V20 is built from V19 as it was before #1270, plus the parts of #1270 that were right. V19 stays frozen, including #1270.

The plan came from a review of #1270. Its direction was right: one switch in the dock, one place for media, one avatar per couple. Its execution was not:
- the dock avatar was clipped and the badge covered the face;
- the «Действовать как» sheet had four targets for two choices, and «Открыть профиль» switched the mode without saying so;
- the dock came back on the composer, the chat and the editors, even with the keyboard open;
- every upload became a feed post;
- public and private photos shared one grid, and the same photo showed twice;
- albums were hidden;
- photo order was changed with «Раньше / Позже» buttons.

The plan, with screenshots and mockups, was published for the owner before any work started.

Owner decisions:
- **Feed:** an upload goes to the feed only when «Также выложить в ленту» is ticked. It is off by default.
- **Switching:** «Я / Мы» is switched in the dock only. The composer and chat name the author in a line that can't be tapped.
- **Review:** a profile photo can be used before review. The owner sees it at once, marked «На проверке». Others see it after approval.
- **Video:** one video is allowed among the profile photos, never as the first (main) item.

Notes for reviewers: `public/prototype-v20-notes.html`. Contract test: `tests/prototype-v20-contract.mjs`. It runs the V14 contract (with V13 inside it), then the V18 and V19 rules, then the V20 checks.

## 2026-10-26 — switcher, profile photos, gallery

- **Kept from #1270:**
  - no author pickers beside the composer, replies or profile actions;
  - no «Мы» badge on hearts;
  - a couple with its own photo shows that photo as its avatar;
  - a new post's preview (F09) and its composer follow the dock;
  - image paths may be absolute `https` or relative `images/`.
- **Dropped from #1270:**
  - "every upload is a post";
  - profile photos as references to posts;
  - private photos as posts "by access";
  - the mixed media grid;
  - the per-photo «Раньше / Позже» sheet;
  - the dock on focused screens and with the keyboard open.
  - V19's drag-to-reorder, crop, replace and private photo/video grids come back.
- **Dock:**
  - The avatar is 24 px, the size of the other icons.
  - In «Мы» it has a violet ring with a 2 px gap.
  - The badge sits on the tab's corner with a background-coloured ring, not on the face.
  - A couple without its own photo shows both members' faces, never a single letter.
- **«Действовать как»** (`actorMenuHTML`):
  - The sheet has two rows and one link.
  - A tap on a row switches the mode and closes the sheet.
  - The chosen row has a lilac background and a check mark. Red is kept for buttons, deletion and counters.
  - Each row says in words what is waiting, e.g. "3 новые симпатии · 1 запрос доступа", instead of a bare number.
  - «Открыть мой профиль / профиль пары» opens only the current profile and never switches the mode.
  - On desktop, the account button at the bottom of the sidebar opens a 300 px popover beside it (arrow keys, Esc) instead of a centred dialog.
  - The «Я» item in the sidebar opens the profile.
  - The switch toast is shorter: «Теперь от пары «Alex и Kira»», shown for 2 s.
- **Who posts:**
  - The composer reads «Публикуется от …», reply bars «Ответ от …». Chat threads read «Ответ от …» with the thread's own identity, which never follows the dock.
  - None of these lines can be tapped.
- **«Я» → Профиль:**
  - Block order: profile photos → basics → details → interests → gallery → private part → links.
- **Profile photos** (`mePhotos20`):
  - They use the layout others see: one big main photo and five small ones.
  - My own photos can be dragged into a new order right on the screen. The order is saved at once, with «Отменить» in the toast.
  - A tap opens a sheet: view, make main, crop 4:5, replace, show in / remove from the gallery, remove from the profile (with «Вернуть»).
  - Only the first empty slot is a clear «+». The other empty slots are faint.
  - The couple's photos open the editor, because changes go through the one couple draft.
  - On desktop the slots form five columns.
- **The photo editor** (P02 «Фото профиля»):
  - Same big-main layout, drag to reorder.
  - «Загрузить» and «Из галереи» buttons.
  - «Из галереи» lets you pick several photos the gallery shows to everyone. Each gets a number, and photos are added in that order.
  - Rules (`phRules`): at most one video, and a video is moved off the first place with a toast.
- **Review:**
  - New profile photos are listed in `phReview` and marked «На проверке» for the owner.
  - «Как видят» (P03, Q03) hides them until review approves them.
- **Gallery on «Я»** (`galleryOwn20`):
  - Album covers with counts, a lock mark on followers-only albums, «Новый альбом», «Загрузить» and the latest five pictures.
  - Private media never appear here.
  - Demo personas get their own gallery with albums («Мастерские», and «Вечера» for followers only). The new persona starts empty.
- **Upload** (`galDest`):
  - Pick files, then one sheet: album, who sees it (everyone or followers), «Поставить в профиль», «Также выложить в ленту».
  - Without the feed tick, each file becomes its own gallery item that stays out of the feed. With it, all files go out as one feed post.
  - New photos are reviewed.
  - A couple upload waits for the partner unless the couple trusts each other.
- **Gallery select mode** (P20):
  - «Выбрать», then a bar: «В альбом», «Кто видит», «В профиль», «Удалить».
  - The dock is hidden while selecting.
  - Making a profile photo followers-only takes it off the profile, because everyone sees the profile.
  - Own followers-only items carry a small mark.
  - The selected album is outlined in ink, not red.
- **Drop files** (desktop):
  - Drop files on the profile photos, the editor, the gallery or the private part to upload them without the file picker.
- **Keyboard:**
  - Alt + arrows move the focused photo in any drag grid.
  - The new place is announced.
- **Private part:** one block and one editor again: description, photos, video and interests by access.

Verified with Chromium:
- V20 contract, including the V13, V14, V18 and V19 rules: pass.
- Click-throughs:
  - real files through the file picker go to the gallery and to the profile;
  - drag order, the photo sheet, «Из галереи» and select mode work;
  - the switcher works as a phone sheet and a desktop popover;
  - the composer and replies in «Мы» name the author.
- QA matrix: see the notes page.

Not verified: real devices, touch long-press drag on hardware, screen readers, live two-client couples, user testing.
