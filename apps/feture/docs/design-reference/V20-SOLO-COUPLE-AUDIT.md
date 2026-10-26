# FetUre V20 — audit: solo, couple and every pair of them

2026-10-26. Method: a script opened the same screens as three viewers and compared their blocks, tabs and actions.

- **Viewers:** a person without a couple, «Я» of a person in a couple, «Мы» of the same person.
- **Targets:** a person, a person with a private part, a couple (Eva & Tom), another couple (Lena & Max), and the viewer's own profile.
- **Screens:** the profile page, the «⋯» menu, the access request, «Что у вас общего», the four tabs of «Я», the editor and its sections, «Как видят», followers and following, blocks, events, posts, saved, gallery, access, links, interests, chats, People, the feed, the composer, communities, the inbox and settings.
- **JS errors:** none in any of the runs.

## Found and fixed

| # | What did not match | Fix |
|---|---|---|
| 1 | **No tabs on couple pages.** The «Активность» tab was switched off for every couple in code (`activityShown` returned `false`), although the couple has its own setting «Кто видит активность». | The tab works for a couple like for a person and follows the couple's setting. |
| 2 | **Events and communities the couple organises** are stored under my account with the mark «от пары». They did not show on the couple's profile, but did show on my personal one. | A profile lists what it organises: «Я» does not list the couple's, the couple lists its own (`orgEventsOf`, `hostedCommunitiesOf`). |
| 3 | **Followers and following of a couple** had no «Подписчики / Подписки» tabs. Unfollowing as the couple removed the follow from the wrong list (`me`). | The same tabs for everyone; follow and unfollow, and undo, use the profile you act as. |
| 4 | **The «⋯» menu of a couple** had no «Указать связь», though a link with a couple is allowed. The link row also used «Я» instead of the profile you act as. | The row is there for couples; the label and actions follow the acting profile. |
| 5 | **Private part of a couple, editor.** For «Я» it has «Описание», «Интересы по доступу» and «Фото и видео по доступу». For a couple it was an empty block: «включено» was derived from content for the editor, but from «не выключено» on the «Приватное» tab. | One rule everywhere: on unless switched off. The couple gets the same sections. |
| 6 | **Access to a couple could not be requested:** the demo couples had no private part, so «Запросить доступ» never appeared on a couple page. | Eva & Tom have one. Requests from «Я», «Мы» and a person without a couple all arrive in the right profile. |
| 7 | Interests compared only with the personal profile. | Fixed earlier in this round: as the couple it compares with, and edits, the couple's interests. |
| 8 | **«Действовать как»:** the two cards had different heights (a two-line subtitle and big paddings). | Both cards are 76 px in every view. |
| 9 | **«Данные пары», empty:** a tall card with a two-line hint and extra margins. | One short line, 47 px. |
| 10 | **Dashed «Добавить» tiles were clipped** at the edges: the gallery grid had `overflow:hidden` with a rounded corner. The script scans every dashed element against its clipping ancestors; it found only this one. | The grid does not clip; tiles are rounded one by one. |

## Differences that are by design

- «Лайк», «Подписаться», «Написать ответ», «Вступить», the event answers and «Опубликовать» say «от пары» when you act as the couple.
- A chat with a person you matched with as «Я» is not available as the couple until the couple matches too.
- «Подарить Premium» is offered for a person, not for a couple.
- A tab (posts, articles, events, activity, communities) appears when it has something in it, for people and couples alike. The demo couples have posts and activity, so you see two tabs; events, articles and communities appear as soon as a couple has them.
- Blocks, saved items and hidden posts belong to the profile that made them.

## Owner decisions (2026-10-26)

1. **«Подарить Премиум» паре — получают оба партнёра.** The «⋯» menu of a couple offers the gift; the sheet names both partners, the price is for two, and both accounts get Premium. A partner who already has it starts the gift after the current period.
2. **Приватную часть пара открывает только вдвоём, закрыть может любой.** Opening access always waits for the partner, even when «Подтверждение партнёром» is off: that setting now covers the profile and posts only. Revoking stays immediate. The couple's «Приватное» tab lists what waits for the partner («откроется, когда подтвердит …») or for you.
3. **Чат пары после матча одного партнёра — как есть.** A personal match stays personal; the couple gets a chat only after its own mutual like.

## Second pass (same day)

Method: a crawler opened 51–54 screens as seven viewers (solo, «Я» in a couple, «Мы»; RU and EN; 390 and 1280 px), clicked every unique button on each screen (3 400+ clicks) and checked JS errors, horizontal overflow, clipped text and dashed borders, overlapping buttons, empty cards, untranslated text and broken images. Then the same screens were compared side by side by eye for solo / «Я» / «Мы».

JS errors: none. Found and fixed:

| # | What did not match | Fix |
|---|---|---|
| 11 | «Мы → Видимость»: «Моя карточка в подборке». | «Наша карточка в подборке». |
| 12 | «Мы → Моё»: «Мне открыли … тебе, и твои запросы»; the access screen tabs «Открыто мной / мне / Мои запросы». | «Нам открыли … вам, и ваши запросы»; «Открыто нами / нам / Наши запросы». |
| 13 | The access screen pointed to «Я → Видимость» for who may ask; that setting is in «Приватное». | «Я → Приватное» / «Мы → Приватное». |
| 14 | «Публикации пары» without posts showed a blank screen; drafts made the row title wrap. | An empty state; drafts moved to a second line. |
| 15 | «События пары», «Сообщества пары» were titled «Мои …» with «Ты ведёшь / Ты участник»; the couple list also showed communities I run personally. | Titles and headings speak as the couple; the list shows only what the couple runs. Same for the desktop side column and the shortcuts. |
| 16 | The composer as the couple: «Видно … в твоём профиле», «Твои интересы …». | «в профиле пары», «Интересы пары …». |
| 17 | «Симпатии» as the couple: «Тебе / Твои», «…помогают людям найти тебя», and «пара публикаций» read as «the couple’s posts». The desktop side column listed personal likes in couple mode. | «Вам / Ваши», «…найти вас»; the side column shows the couple’s likes. |
| 18 | An access request addressed to me showed the shared interests counted for the couple when I acted as the couple. | The summary is counted for the profile the request is addressed to. |
| 19 | «Нужно решить» as the couple listed my personal items first. | The acting profile’s group comes first. |
| 20 | «Что у вас общего» as the couple: «“Alex и Kira” и Kai», «Тебе ближе давать». | «Пара Alex и Kira · Kai», «Вам ближе давать». |
| 21 | Event application as the couple: «Организатор увидит ник, возраст»; event: «Показывать моё участие». | Couple wording. |
| 22 | EN, couple: «We’re interested / going / not going» ran off the screen. | The three buttons share the width and wrap to two lines. |
| 23 | New event as the couple: «Организатор Alex и Kira» had the avatar on its own line (no style). | One row. |
| 24 | Couple name field in the editor had the «@» nickname icon. | The couple icon. |
| 25 | Couple chat: «Eva» above the bubble and «Eva: …» inside it. | The text has no name; the chat list shows «Eva: …». |
| 26 | Search tabs at 390 px: «Публ… Сооб… Соб…». | Scrollable chips with full labels, like the inbox filters. |
| 27 | «Фото профиля» with one photo: a grey empty tile under «+». | «+ Ещё фото» fills the column. |
| 28 | Interests: «Все · 5 / Видят все · 5» filter when all are visible to everyone; «Новый альб…» clipped. | The filter shows only when there are two kinds; album names wrap to two lines. |
| 29 | Path hints «Профиль → Сохранённое», «Профиль → Мои публикации», «Профиль → Настройки» — no such tab. | «Я / Мы → Моё → …», «Я → Настройки». |

Checked and left as is: the chats list in «Мы» also shows personal chats (one inbox, each chat says whose it is); likers are ordered by closeness to the acting profile; «Разъединить пару» stays in «Мы → Видимость → Пара».

## Not verified

Real devices, touch drag on hardware, a live couple on two clients.
