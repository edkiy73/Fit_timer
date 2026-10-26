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

## Open for the owner

1. **A «Подарить Premium» to a couple.** Who receives it: the account that is the couple's «owner», or both?
2. **A couple's private part and access from two people.** When a couple opens its private part to a person, both partners are shown as the sharers. The demo has one shared list; a per-partner view is not designed yet.
3. **Chats as the couple with someone who matched «Я»:** should a match with one partner open a chat for the other as well?

## Not verified

Real devices, touch drag on hardware, a live couple on two clients.
