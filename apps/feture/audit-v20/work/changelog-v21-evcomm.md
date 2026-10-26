# V21 changelog — events and communities (`evcomm`)

Branch `v21/evcomm`. Source: the V20 audit `findings-evcomm.json` (55 findings) plus COMM-900 from the lead's click-crawler. Result: 53 fixed, 3 partial, 0 needs-owner. Details for each finding are in `fixes-evcomm.json`. Screenshots are in `screens/v21/evcomm/`.

## Who goes, who is interested (one source of truth)
- My own events, and any event still in review, show real answers only. «Идут» means approved applications, or «Иду» on an event without applications. «Интересуются» means `interestedPeople`. A pending application never counts as going. E03, E15, E17 and E18 now count the same people.
- An event nobody has answered yet says «Пока никто не ответил».
- A couple's row in E18 reads «это вы · двое», with a note that a couple counts as two. The partner no longer shows up as a separate made-up attendee.
- Attendance visibility is off by default, which matches what the organiser is told.
- A past event shows «Кто был · Были: N» and has no «will open» hints.

## Organiser panel (E15/E16) and editing (E11)
- The tiles depend on the event type. With applications: pending / approved / interested. Without: going / interested. The next-step alert has an «Открыть заявки» button. A cancelled event shows one status pill and no tiles, applications or edit. Pending applications close when the event is cancelled.
- E16 lets the organiser revoke an admission (with a confirmation) and approve a declined application after all. Every tab has a counter. While a decision is being sent, both buttons on the card are locked.
- Edit mode is known before the first render. The screen is titled «Редактирование события», the button reads «Сохранить изменения», and an alert explains that changes save at once. An edit keeps every field the form doesn't show: interested people, applications, community, couple ownership and the couple hold.
- An event can be linked to a community. «Создать событие» on a community page passes the community in, and step 1 has a «Сообщество» field.
- The step 4 preview has no organiser pill. It shows time, price and admission, the description, requirements and the application question.
- Price and currency sit in one row. When an event is edited, its price is split back into amount and currency.
- The two date fields now have even spacing.

## Couple ownership of events, drafts and communities
- Event cards and previews name the organiser «Alex и Kira». The pill reads «Вы организаторы» in «Мы» and «Организует ваша пара» in «Я».
- A draft remembers its owner. «Мои события» shows only the drafts of the current profile.
- A couple event waiting for the partner says «Ждёт согласия Kira» on E15, E03, the cards and E10. The submit toast reads «Отправлено Kira на согласование».
- The partner's review sheet for a couple event or event answer says what is proposed and shows the event, with an «Открыть событие» button. Its buttons are «Согласиться / Предложить иначе» for an answer and «Одобрить / Вернуть с комментарием» for an event. There is no «Версия N» badge.
- On a sent-back event, the author can use «Изменить событие» (the edit goes back to the partner as a new version) or «Снять событие» (the event moves to the couple's drafts). For an answer the buttons are «Изменить ответ» and «Отозвать ответ».
- Notifications and «Нужно решить» rows name the event.
- An answer waiting for the partner is marked on its button and can be withdrawn. Tapping the same answer again changes nothing; picking another answer replaces it. E10 has a «Ждут Kira» group. In «Я», a page shows «Вы идёте как пара…» when the couple is going.
- «Мои сообщества» follows the profile: «Вы ведёте / Пара участвует / Заявки пары» in «Мы», personal communities in «Я». The pills are «Вы ведёте / Ведёт ваша пара / Ведёшь лично».
- A community created as the couple is hosted by one row, «Alex и Kira · это вы · создатели». New communities have no invented members.
- The «Мы» copy uses «вы» throughout: join and create toasts, review alerts, E03 texts and the topic hint in the editor.

## Community membership and management
- A couple in a closed community can open and answer its discussions (COMM-001).
- Removing a member takes them off the list and lowers the count by one. Their request is marked «Удалена из сообщества», and a new approved request brings them back.
- A non-member who taps like or «Ответить» under a discussion reply gets a toast with «Вступить» (COMM-900). Before, nothing happened.
- Join errors appear inline under the checkbox instead of in a toast that covered it.
- Muting is stored per profile and can be undone. The page shows «без уведомлений», and the community's updates leave the notification list.
- A hidden community is labelled «скрытое · по приглашению». C10 offers a third option, «Скрытое», plus «Пригласить по ссылке». Opening the community puts it back in the catalogue.
- C08 gained «Где» (a city or online), a 16:9 cover photo and «Вопрос к заявке». Colour plates have readable labels.
- C10 tile words agree with their numbers. C11 shows «Одобрить» first and undoes a decline from the toast. The owner's C03 shows «N новые заявки ›».
- Catalogue interest chips mirror the filter and allow several at once. The «Фильтры» badge counts only what the chips don't show, and the selected chip scrolls into view.
- C03 no longer repeats the cover photo as the avatar. Its tabs fade at the edge when they overflow.

## Event page polish
- The answer and application status sit right under the organiser, and the status pill is on the cover. The header gets a background and the title once the cover scrolls away (E03 and C03).
- The organiser sees the actual link or address and can open it.
- Price and payment are one line. A «ticket bought» mark can be removed, and «Снять ответ» removes the mark too.
- Organiser announcements appear on the page.
- Toasts say where the link or address is and only mention things that exist. The bookmark updates its `aria-pressed` and label.
- The duplicate «Скопировать ссылку» is gone from the event menu, and the one-shot menu items close the menu.
- Single-choice options in the event filters are wrapping chips. The format is named «Офлайн · Берлин» everywhere. When nothing matches, the button says so and is disabled.
- The feed block is titled «Скоро».
- Demo times are Berlin wall-clock in any season. The picnic has a fixed time.
- The unreachable «Ответ и видимость» sheet code is removed.

## Core changes (for the merge review)
- `pname('me')` returns `S.me.name` before the nick (EVT-025).
- The `[data-author-reason]` updater checks the reply or compose actor and the right permission, instead of always «Я» (COMM-001).
- `filterSheet` shows a disabled `applyLabel(0)` button when nothing matches (EVT-021).
- `at()` in data.js builds Berlin wall-clock times through Intl (EVT-030). This affects every demo date built with `at()`.
- `evStatusPill`, `eventCard` and `myEventIds` (ui.js) handle couple organisers, the `holdPair` hold and the new `waiting` group.
- The `jointReview`, `jointCancel`, `returnAsk`, `NTXT.pair`, `rLike`, `rReply` and `currentNotifications` changes are wrappers in the evcomm JS block. The originals are untouched.
- The F07 topic hint and the feed «Скоро» title are one-string edits in the feed module.
- The contract passes with no swaps.

## Not done / partial
- EVT-010: the «Пара» tag is glued to the time («Паретолько что») in the notification list. That rendering belongs to the notifications section and was not changed.
- EVT-032: the row card supports `o.noOrg`, but the organiser's own profile page doesn't pass it yet. That page belongs to the profile section.
- COMM-013: the dock label at 320 px is handled by the lead's dock change.

## Needs owner
- None.
