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

## 2026-10-26 — second round: owner review of the merged V20

- **Article instead of «Заметка».** An article is a regular post with a title and a long text: any photos and videos, a poll, «Мои интересы». Its pictures go to the gallery and albums like any other post's. Before, an article had one cover and its pictures were left out of the gallery.
- **«Показать в ленте»** is on by default everywhere, including uploads from the profile and gallery. The line that repeated the switch is gone. Private uploads keep the feed off and hide the switch.
- **Texts «от пары»:**
  - reply boxes read «Ответить от пары…», the chat box «Сообщение от пары», and the reply launcher «Написать ответ от пары»;
  - an event answer reads «Нам интересно / Идём вдвоём / Не идём» (the `2 места` wording is gone), with toasts in «вы» form;
  - the community strip shows the couple's avatar and «Обсуждение от пары»;
  - the member row reads «это вы».
  - Buttons wrap instead of clipping at 320 px.
- **«Действовать как»:** the whole card switches. «Открыть профиль» is a separate round icon button on the right edge, divided by a line, so a tap on the card can't open the profile by mistake. The footer is true: «Чаты, уведомления и «Нужно решить» приходят в одно место. У каждого видно, кому адресовано».
- **Dock avatar** is no longer cut at the left. The generic dock rule (`overflow:hidden`, padding on spans) had been clipping it.
- **No profile photo:** one compact prompt row with a camera icon instead of a huge empty card. The empty ghost slots only appear next to real photos.
- **Photo frame:** the picker shows 4:5 tiles, exactly what the profile crops to. Uploading from the profile asks for a 4:5 frame and names it in the title.
- **Chats:** the filter reads «Чаты пары», and a couple's rows carry a violet «Чат пары» tag, so they no longer look like they came from the couple.
- **Disappearing media:** the cartoon match is replaced by a quiet ring with an eye that shows the time left.
- **«Моя карточка в подборке»** has no icon. Inside «Как видят», the tabs sit on the back button's line.
- **Counters on «Моё»** come from the screens they open:
  - posts and articles are counted and listed for the current profile only;
  - events count what the events screen lists, and a couple's events are listed separately;
  - saved counts what is visible;
  - followers and following are counted for the couple too.
- **Private part:** interests by access are now part of it. The block on «Я» shows them as chips, and the editor lists them with «Добавить».
- **Blocks belong to the profile that made them.** A block from «Мы» doesn't hide the person in «Я», and the other way round. The confirmation says whose block it is. In the list, «И для пары / И для меня» passes a block on to the other profile.
- **Settings:** the «moved to Me → Visibility» section and the stale version line are gone.
- **The couple's discover mode** is the same three-way choice as a person's: visible, browsing hidden, off. Hiding is immediate. Turning on goes through the partner when approval is on.
- **Events in «Мы»:**
  - the organiser is the couple, shown by name and avatar, and listed in the couple's events and not in «Я»;
  - with partner approval on, the event waits in «Нужно решить», and the partner approves or sends it back;
  - otherwise the partner is notified.
- **Creating an event:**
  - the header back button goes one step back, and «Назад» is labelled;
  - format and price are chips like the type;
  - the price has a currency choice (€ $ £ ₽ CHF).
- **A community made in «Мы»** is hosted by the couple. The couple joins it, and the partner is notified.
- **Fixed on the way:** the feed's long words wrap, and the «Идут / Интересуются» line keeps at most three faces on a narrow screen.

Not done: links for a couple, and the personal privacy settings (activity, mentions, likes) for the couple. Both need data the prototype doesn't have yet.

Not verified: real devices, touch long-press drag on hardware, screen readers, a live couple on two clients.

## 2026-10-26 — third round: «Я» by topic, couple parity

Owner decisions for this round:
- «Я» gets four tabs by topic;
- small edits of an approved post skip review;
- couple settings work like the couple's discover mode;
- the couple gets links like a person.

- **«Я» has four tabs by topic:**
  - **Профиль** — what everyone sees: photos, basics, details, interests, gallery, links;
  - **Приватное** — what access opens, the requests, who has access and who may ask. Only three people are listed, then «Все · N» opens the full list;
  - **Видимость** — discover mode, the Discover card, likes from the profile, who sees activity, who can mention you, likes shown to followers. The couple also has its own section here;
  - **Моё** — lists only. For the couple it also shows what is waiting for the partner.
- **No status chips under the name.** A tab with something new carries a small dot: new links, access requests, a couple setting waiting for the partner. «Нужно решить» is one row, shown only when something is waiting.
- **Links:**
  - a new request is answered right in the «Связи» block, and its title says how many are new;
  - the couple has links too, with people and with other couples;
  - its requests come to the same «Нужно решить» as personal ones;
  - the partner is told when the couple adds or confirms a link.
- **Couple parity:** likes from the profile, who sees activity, who can mention us, likes shown to followers, and who can propose links.
  - Closing or limiting a setting applies at once, and the partner is notified.
  - Opening one up goes through the partner when approval is on. The setting shows «Ждёт согласия партнёра», and the partner sees it in the change review.
- **Profile photos editor:** changes are a draft until «Сохранить» (for the couple without trust: «Отправить партнёру»). Leaving with unsaved changes asks first. A post uploaded from the editor is added to the draft.
- **Dragging photos on the profile:**
  - the first cell stays the big one while you drag;
  - cells glide to their new places instead of jumping;
  - pictures already loaded are reused after a re-render, so nothing blinks on drop.
- **Editing an approved post:**
  - new pictures, a wider audience, or a large text change (more than 30% new words, at least 12) go to review;
  - meanwhile everyone sees the approved version, and «Мои публикации» lists the change under «Правки на проверке»;
  - anything smaller goes live at once.
- **Smaller fixes:**
  - no ring around the dock avatar;
  - «Как видят» tabs line up with the back button and have the same gaps in all three views;
  - «Ещё N» under the interests is centred.

Not verified: real devices, touch drag on hardware, a live couple on two clients.
