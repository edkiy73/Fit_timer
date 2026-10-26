# FetUre V19 — changelog

V19 is built from V18. V18 stays frozen. The idea comes from the owner: «Я / Мы» is chosen in one place, the avatar in the dock, and it applies to the whole app. In «Мы», likes, follows, communities, events and posts work as they do for a single person. Notifications, chats and «Нужно решить» are shared.

Owner decisions:
- **Approvals:**
  - Partner approval is needed only for an event answer, and only when the partner switched approval on.
  - Likes, follows and joining communities go out at once, and the partner is notified.
- **Events and communities:**
  - «Идём» from the couple takes 2 places.
  - The couple joins a community as one member. A closed community needs a request that the host approves.
- **Remembered mode:** the last choice is remembered.
- **Dock tap:** tapping the dock avatar opens «Действовать как»: «Я», «Мы» and «Открыть профиль».

Notes for reviewers: `public/prototype-v19-notes.html`. Contract test: `tests/prototype-v19-contract.mjs`. It runs the V14 contract (with V13 inside it), renaming `S.datingActor` to `S.actor` and taking the composer author from the mode. Then it runs the V18 rules (switching via `meSwitchTo`) and the V19 checks.

## 2026-10-26 — one «Я / Мы» mode, in the dock

- **The mode:**
  - `activeActor()` reads `S.actor`, which replaces `S.datingActor`.
  - `datingActor`, `actionAuthor()` (as its fallback), `replyActor()` and the composer's initial author all follow it.
  - `setActor()` switches the mode, keeps a new draft (its author follows) and resets the dating deck.
- **Stores per identity:** community membership, join requests and event answers go through `joinedSet()`, `pendingSet()` and `rsvpMap()`, which hold the couple's own sets in «Мы». The personal check in `communityMemberCanWrite` and the QA «approve all» are explicit: the QA one approves the couple's requests too.
- **The dock** (`meTabIcon`, `ACT.dockMe`):
  - The «Я» tab shows the current avatar, with a violet ring and the label «Мы» in «Мы».
  - With a couple, a tap opens «Действовать как» with a waiting count per profile and «Открыть профиль». Without a couple, a tap opens the profile.
  - The sidebar avatar button opens the same sheet.
  - Every author pill (composer, profile, Discover) opens this sheet (`ACT.authorMenu`).
  - The V18 name switch and long press are removed.
- **Always visible:**
  - In «Мы», `body.as-couple` draws a violet strip at the top and a «Мы» mark on hearts.
  - Buttons name the author: «Нравится · от пары», «Подписаться от пары», «Вступить от пары» / «Заявка от пары», «Пойдёте вдвоём?», «Идём · 2 места».
  - The feed composer stub shows the couple avatar and «Что у вас нового?».
- **Couple actions** (`canAct` no longer limits react, follow, community or event to «Я»):
  - post, discussion and reply likes are kept per identity in `reactions`;
  - follows go into `social(actor).follows`;
  - a community joined by the couple lets the couple write there as one member;
  - each light action sends the partner a `coupleAct` notification.
- **Events:**
  - The couple is shown in «Кто идёт» and counts as two.
  - With approval on, «Идём» / «Интересно» queues a `rsvp` joint item (`queueJointRsvp`). The event shows «Ждёт <partner>», and the partner reviews it in «Нужно решить» → «Одобрить / Вернуть» (`approveJointWork`).
- **No silent fallback:** in «Мы», `likeActor` no longer falls back to «Я». When the couple can't like, the button is hidden and the note says why and how to switch.
- **Own items keep their identity:**
  - Chat threads use their own `actor`.
  - Links to my other profile (`ACT.openOwn`) open it read-only (P03) and never switch the mode.
- **«Я» screen:** it shows the current mode. In «Мы» it marks the route as the couple's (`p.owner`), so interest edits, draft and approval go to the couple (`editableProfile`).
- **Shared:** the notifications feed, chats (with the «Личные / От пары» filter), «Нужно решить», saved items, blocks and settings.

Verified with Chromium:
- V19 contract, including V13, V14 and the V18 rules: pass.
- Click-through in «Мы»:
  - the dock reads «Мы» and the tint is on;
  - a feed like goes out as the couple;
  - the composer reads «Опубликовать как · Мы»;
  - a profile shows «Нравится · от пары» and «Подписаться от пары»;
  - a community shows «Вступить от пары»;
  - an event shows «Пойдёте вдвоём?» and «Идём · 2 места», and «Идут» grows by two;
  - Discover acts as the couple;
  - chats stay shared;
  - the mode is remembered across tabs.
- 13 flows across the app in «Мы» (feed, Discover, communities, a community, an event, chats, «Я» and its Visibility, a profile, the composer, the dock sheet, notifications), plus the feed in «Я». These ran for 3 personas × RU/EN × 320/390/768/1440 × light/dark: 232 states, because couple flows run only for the persona with a couple and a few states had no clickable switch. Result: no JS errors and no page overflow.
- On desktop, the review «V19» button covered the sidebar profile switch and was moved to the right.

Not verified: real devices, screen readers, live two-client couples, user testing.
