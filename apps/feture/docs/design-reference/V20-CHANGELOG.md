# FetUre V20 — changelog

V20 is built from V19 as the owner left it after #1270. V19 stays frozen.

The first V20 (#1271) was built from V19 before #1270. It reverted several decisions the owner had made in #1270:
- one avatar per couple;
- an upload is a post, with several files and text;
- each profile has its own «Открыть профиль».

It also left duplicates and floating hints on «Я». This version replaces it.

Owner decisions:
- From #1270, kept:
  - an upload is a post: several photos or videos, text, audience;
  - profile photos are picked from public posts;
  - private media are posts by access;
  - one avatar per couple;
  - the dock is the only switch;
  - each profile card has its own «Открыть профиль».
- Taken for V20:
  - the feed is optional: «Показать в ленте». It is off when the upload starts from the profile or a gallery, and on from «Создать».
  - a profile photo can be used before review: the owner sees it marked «На проверке», others see it after approval;
  - one video among the profile photos, never as the first (main) item;
  - a couple without its own photo is one circle split into two halves, the same size as a person's avatar;
  - the dock stays on input screens but hides while the keyboard is open.

Notes for reviewers: `public/prototype-v20-notes.html`. Contract test: `tests/prototype-v20-contract.mjs`. It is the V19 contract with #1270's checks, then the V20 checks. One V13 assertion changes on purpose: «Что у вас общего» now follows the dock instead of the identity saved in the route.

## 2026-10-26 — V20 rebuilt on the owner's V19

- **Couple avatar** (`av`):
  - With its own photo, the couple shows that photo.
  - Without one, it is one circle split into the two members' faces. The circle is as tall as a person's avatar, including on «Это взаимно».
- **Dock:**
  - The avatar is 24 px, like the other icons. In «Мы» it has a violet ring with a gap. The badge sits on the slot corner, not on the face.
  - The dock hides while the keyboard is open.
- **«Действовать как»:**
  - Two cards. A tap on the top of a card switches the mode.
  - The bottom of each card reads «Открыть профиль» for the current profile, or «Перейти в профиль пары / в мой профиль» for the other one, and switches to it.
  - The chosen card is lilac with a check mark.
  - Each card says in words what is waiting, e.g. "3 новые симпатии".
  - On desktop the cards open as a popover beside the account button at the bottom of the sidebar.
  - The switch toast is shorter.
- **The mode reaches every screen:**
  - «Что у вас общего» (P05), grant pages (P08) and access asked from a profile follow the dock, not the identity saved when the screen opened.
  - Own pages already open follow the dock too: access, followers, gallery, «Как видят», links.
  - Editors with unsaved input and chat threads keep their owner.
  - The couple's name is quoted where it meets another name: «Alex и Kira» и Leon.
- **«Я» → Профиль:** the same blocks for «Я» and «Мы»:
  1. members (couple only);
  2. profile photos;
  3. basics;
  4. details;
  5. interests;
  6. gallery;
  7. private part;
  8. links (personal only).
- **No duplicates and no hints:**
  - The floating footnotes are removed.
  - A picture is either public or private, never both: the migration skips a private copy of a public photo.
  - The «Все» album has its own four-photo mosaic, so it no longer repeats another album's cover.
  - The gallery block shows album covers, not the same pictures again.
  - The interests button reads «Ещё N» instead of a second «Все · N».
- **Profile photos** (`mePhotos20`):
  - One big main photo and small ones beside it. Only one empty slot is shown as «+».
  - Drag to reorder, with «Отменить». Alt + arrows works too, and the new place is announced.
  - A tap opens: view, make main, open the post, remove from the profile (the post stays).
  - For the couple, changes go through its one draft and the partner's approval.
- **Photo editor** (P02 «Фото профиля»):
  - The slots, then every public picture from your posts. A tap puts it in, numbered by place, or takes it out.
  - «Загрузить» opens the post editor with the feed off. The new post goes onto the profile.
- **Post editor:**
  - «Показать в ленте» sits under the text.
  - With the feed off, the post appears only on the profile and in the gallery.
  - The line under the audience says where the post will be seen.
- **Gallery** (P20):
  - Private posts live in the private part, not the gallery.
  - Followers-only items carry a small mark.
  - «Выбрать», then a bar: «В альбом», «Кто видит», «В профиль», «Удалить». The dock is hidden while selecting.
- **Private part:**
  - One block on «Я» with a summary and thumbnails.
  - The editor shows the description, plus the pictures by access with «Загрузить» (post editor, audience by access, feed off).
- **The couple:** «Моё» now has «События пары» and «Сохранённое» (shared by both profiles).
- **Demo personas** get their own gallery with albums («Мастерские», «Вечера» for followers only; the couple's «Вдвоём»). The new persona starts empty.

Not done: links for a couple, and the personal privacy settings (activity, mentions, likes) for the couple. Both need data the prototype doesn't have yet.

Not verified: real devices, touch long-press drag on hardware, screen readers, a live couple on two clients.
