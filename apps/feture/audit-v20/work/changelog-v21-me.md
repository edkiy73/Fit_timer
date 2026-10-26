# FetUre V21 — «Я» (section `me`) changelog

Branch `v21/me`, file `apps/feture/public/prototype-v21.html`. Fixes for the V20 audit findings ME-001…ME-052 plus the lead's
crawler item ME-900. Per-finding status and verification: `work/fixes-me.json`; screenshots: `screens/v21/me/`.

## Profile photos
- **«Сделать главным» works again** (ME-001). The old V19 editor handler had the same name and overrode the V20 one; it is now
  `ACT.phMainLegacy`. The menu item has a star icon (new `I.star`).
- **The last photo can't silently disappear while you are shown in Discover** (ME-004). One rule for the photo menu, the photo
  editor's «Сохранить», gallery «Кто видит → Только подписчики» and gallery «Удалить»: a dialog «Это последнее фото профиля»
  offers «Убрать и смотреть незаметно» or «Оставить фото». Agreeing switches the mode to «Смотрю незаметно» and says so;
  «Отменить» brings back both the photo and the mode.
- **Your photo in review is yours to see** (ME-006): header, dock and sidebar show your newest main photo while it is in review
  (others still see only the approved one). Turning dating on / «Показываюсь» / the selfie check name the review instead of
  «добавь фото».
- **The couple's photos are really saved** (ME-045): «Сохранить» in the couple's photo editor now submits the couple draft like
  any other couple edit — at once when trusted (the couple avatar becomes the main photo, «Фото пары сохранены»), otherwise
  «Отправлено партнёру».
- Wide screens keep the phone layout — one big 4:5 main photo, small ones beside it, max 560 px (ME-012); empty slots look like
  places for a photo (ME-013); «главное» stays on the first cell while dragging (ME-014).
- The full editor (P02 without a section) starts with the same «Фото профиля» block as «Я» instead of the old V19 media block;
  «Добавить» toasts open the photo editor (ME-010). Texts: «Без фото тебя нет в подборке» only when you are shown, «Из твоих
  публикаций» / «Из ваших» for the couple (ME-017).

## Discover mode and visibility
- **«Смотрю незаметно» from «Выключены» turns dating on hidden** — it used to make you visible (ME-002).
- «Принимать симпатии из профиля»: «Не зависят от режима знакомств»; concrete toasts; the switch no longer sticks when the value
  was never set (ME-043). Couple wording: «Наша карточка в подборке», «Нам открыли» (ME-046).

## Private part and access
- **Turning the private part off is one procedure everywhere** (ME-003, ME-022): the «Приватное» switch and the editor switch ask
  the same question (it names how many accesses are revoked and requests closed; in the editor it applies on «Сохранить»), revoke
  every access and close every open request, new ones too — «Нужно решить», the dock badge and the tab dot drop at once.
  «Открыть доступ» while the part is off offers to turn it on instead of opening the sheet.
- Request cards and the grant sheet say what is already shared («Уже открыто: Описание · ещё 23 ч», preselected; «Новый доступ
  заменит прежний») (ME-024). The grant sheet offers only what the private part has, with counts (no «Видео» without video), and
  says «Отозвать можно … «Я → Приватное»» (ME-025, partly — see Needs owner).
- Empty private part: one «Добавить в приватную часть» row («пока здесь пусто, доступ никто не попросит»), no «· 0» (ME-026);
  in «Как видят» an empty private part is hidden like for a real viewer (ME-009); no duplicate «Добавить» links in the editor
  (ME-033). P07's hint points to «Я → Приватное» with an «Открыть» button (ME-023).
- Private upload (F07, «Приватная часть»): no gallery album, «Увидят только те, у кого есть доступ…: сейчас 2», audience
  «Приватная часть · 2 с доступом» (ME-044).

## «Как видят» (P03)
- «Знакомства» is the real Discover card (name, age, place, online, counts, «Листай вниз…», no extra chips) with the whole profile
  under it (ME-007). «Что у вас общего» on your own preview is a neutral placeholder, no self-comparison numbers (ME-008).

## «Я» page
- One empty-block pattern (icon, title, hint, «+») for interests, gallery («Загрузить первое фото», no «Все · 0») and links
  (ME-016). Interests: no duplicate count, filters in one scrolling row, a legend of the icons, «Все интересы» → X02 (ME-036).
  «Данные»: label above value on phones, 180 px label column on wide screens (ME-037). «Личный профиль» stays on one line at
  320 px (ME-042). In a couple with «не в отношениях» a gentle prompt to update the status (ME-047).
- «Моё»: «Мои события 0» like the other rows; couple titles «Публикации пары», «События пары», «Нам открыли» (ME-028). The
  desktop right column lists your upcoming events (going, applied, interested, organising), soonest first (ME-027).

## Gallery and albums
- «Все» is a mosaic of what is there (4/3/2 pictures, or the one picture) on «Я» and in P20 — never another album's cover (ME-019).
  The create button says «Альбом»; album names wrap to two lines (ME-018). The open album is named under the row (ME-021).
- New album / rename: «Введи название», «Альбом с таким названием уже есть», Enter submits, 0/40 counter (ME-020, ME-052);
  «Альбом переименован», «Альбом удалён · Отменить» (restores the album and its posts).
- Select mode: audience change says what happened to the profile and can be undone (ME-048); «В профиль» names skipped
  followers-only photos (ME-050).

## Editor, interests, links, followers
- One «Сохранить» in every editor section, inactive until something changes (ME-031); the «Данные» screen is always open (ME-030);
  an empty nickname is an error (ME-032); ↶/↷ in the text editor are active only when there is something to undo/redo (ME-051).
- Interest sheet: «Добавить» is disabled until a level is chosen, with a hint (ME-900); «Убрать» asks over the sheet and «Отмена»
  keeps it (ME-035); history records a «Кто видит» change as its own entry and skips no-op saves (ME-049); 14 px under the progress
  bar, review footer «Назад» + «Сохранить» (ME-034).
- Link request card: time on its own line (ME-038). P22: one list card, sides without a leading «·», no name in the header,
  «Кто видит» (ME-039).
- Followers (P10): «⋯ → Убрать из подписчиков» with undo, «Подписаться в ответ», undo of unfollow keeps the place; on ≤360 px
  the buttons go under the name (ME-029).

## Verified, fixed by the lead
- ME-011 («Я» tabs and dots), ME-015 (toasts over sheets), ME-040 (search tabs) — checked in V21, not changed.

## Core changes (for the merge review)
- `meTabIcon` and the sidebar «Я» button use `ownAv21()` instead of `av()` (ME-006/045).
- Drag reorder (`.ph-slots` branch): moves `.mainph` to the first cell (ME-014).
- `window.CTX` «me» branch rewritten (ME-027).
- RTE toolbar: ↶/↷ start `disabled`; `ACT.rte` / `IN.rte` are wrapped in the me JS block (ME-051).
- `.kv` layout changes via container queries in the me CSS block (also P01/P03 «Данные») (ME-037); `.frow` wraps at ≤360 px (ME-029).
- Small in-place edits outside s-profile/s-me: `grantSheet`/`reqCardHTML`/`accessSummary` (access), `SC.F07` album row and
  audience label (ME-044), `linkReqCard`/`SC.P22`/`linksBlock` (links), `SC.F10`/`SC.E10` titles.

## Not done
- ME-005: not reproduced in V21 (one «Назад» returns to «Я»). The missing publish toast comes from `ReferenceError: obj` in
  `ACT.publish`; the feed branch already fixes it (`status` instead of `obj`), so «Я» does not touch it.
- Deleting a profile photo's post from F05 (feed code) does not go through the last-photo dialog; the four paths named in ME-004
  do.

## Needs owner
- ME-025: private interests have no permission of their own (`REQ_SCOPES` = description, photos, video), so a grant never shows
  «Интересы по доступу». Should interests become a fourth permission, or open together with «Описание»? (Either changes what
  existing grants disclose, so it was not changed silently.)
- ME-041: should «Я → Моё» get a «Тесты · скоро» entry, or should X05/X07–X09 and their QA items go, with history entries
  labelled «из теста (архив)»?

Contract: `node tests/prototype-v21-contract.mjs` → `PASS V20 rules in V21` (no swaps needed).
