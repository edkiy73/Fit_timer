# V21 — Feed (section `feed`, findings FEED-001…043)

Branch `v21/feed`, file `apps/feture/public/prototype-v21.html`. Of the 43 V20 audit findings, 41 are fixed and 2 are partial. Each fix was checked in a real browser at 390 px, and visual ones also at 320 px, 1440 px and in dark mode. The contract `tests/prototype-v21-contract.mjs` ends with `PASS V20 rules in V21`, and none of its assertions were swapped.

## «Я» and «Мы» in the feed
- **«Подписки» belong to the acting profile.** In «Мы», the tab is built from the couple's own follows, the couple's own posts and the couple's article subscriptions. One partner's personal network no longer shows there. The tab's filters, the activity stream and the event ranking follow the same rule (FEED-001).
- **Poll votes are per profile**, like reactions. A vote in «Мы» shows as «Alex и Kira · Ваша пара» in the voters list and does not mark the personal profile as voted (FEED-002). In people lists, the current profile reads «Ты» or «Ваша пара» (FEED-024).
- **Hiding an event** («Скрыть», previously «Реже такое») applies to the acting profile only, and the toast says whose feed changed (FEED-014).
- **«Мои публикации»**: in «Мы», the empty state talks about the couple. The couple's saved edits appear only in «Мы» (FEED-007, FEED-041).

## Publishing and editing
- **Every publish shows its toast again**: published, in review, edit is live, or edit is in review. Auto-approval in QA works again. The cause was a variable used outside its block in `ACT.publish` (FEED-004).
- **«Показать в ленте» off no longer loses the post.** It shows in «Мои публикации» marked «не в ленте». On the profile it appears in the gallery if it has pictures, otherwise under «Публикации». The «Моё» counter matches. A text-only post's switch reads «Только в профиле» (FEED-003).
- **Counts don't drift during a session.** Demo personas get their own gallery posts at session start; the couple's posts are added the first time any couple list is shown (FEED-006).
- **The editor's button and hint follow the review rule.** A small edit of a published post shows «Сохранить изменения» and «Изменения появятся сразу». New pictures, a wider audience or a big rewrite show «Правки на проверку» and «Пока идёт проверка, все видят прежнюю версию». The label updates while you type (FEED-012).
- **Leaving the editor** offers «Сохранить черновик» / «Не сохранять» / «Отмена», or «Сохранить правки» for a published post (FEED-018). A draft's header reads «Черновик» (FEED-029).
- **The formatting toolbar no longer collapses on blur**, so the first tap below the editor always lands (FEED-005).
- **Couple wording** in the editor and preview: «в профиле пары», «Только подписчики пары», «О чём хотите рассказать?» (FEED-013).
- **Layout:** pictures sit inside the composer card, right under the text (FEED-030). In an article the order is audience, title, text (FEED-038). «Статья» stays available after a poll or interests are added (FEED-022). The «Создать» sheet offers «Публикация», «Статья» and «Событие», and its labels match the editor's. «Мои интересы» has its own icon (FEED-028). In EN it's «Article» everywhere (FEED-037).
- **Preview** shows a clean card with one «Что будет дальше» summary: who gets a mark request, the photo review, and who sees the post until then (FEED-040).
- **Link dialog:** a bare address gets `https://`. A wrong one reopens the dialog with the typed value and the reason. There is an optional link text field (FEED-039).

## Feed screens
- **Empty states explain why:** filters, things you hid, or simply nothing yet. Empty «Подписки» asks for people only and hides chips and filters (FEED-010, FEED-017).
- **Hidden content can come back.** A row stays where a post was hidden («Вернуть · Не показывать автора»), «Скрыто в ленте: N» appears under the feed, and a «Скрытое в ленте» sheet lists posts, authors and activity per profile (FEED-011).
- **Quick topic chips** come from posts the tab actually shows (FEED-009). The filter button reads «Показать N публикаций» (FEED-035).
- **«Популярное»:** reply authors and replies now outweigh likes. Only interests with something this week are offered, and there is 16 px of space before the posts (FEED-016, FEED-031).
- **Topic page:** posts are newest first. An empty topic gets «Написать о #теме». Search starts with the topic, and your own interest is labelled (FEED-015, FEED-032).
- **Activity cards:** «+N» counts only tiles that aren't fully visible (FEED-023).
- **320 px:** the composer hint fits on one line. In the editor, «Как увидят» becomes an icon button and the tools sit in one scrolling row (FEED-020).
- **Desktop:** «⋯» menus on posts, replies, activity cards and discussions open as a popover at the button (FEED-034).

## Posts, replies, saving
- **Reply counters** count only live, visible replies. A deleted reply with nothing under it disappears (FEED-008).
- **Your own reply can be edited** and shows «изменено». Your published post's menu has «Скопировать ссылку» (FEED-025).
- **Article page:** the header reads «Статья», «Следить за статьями» appears under other people's articles, and an empty list says «Ответов пока нет. Напиши первым» (FEED-026).
- **The «Нравится» line** sits inside the post card (FEED-036). The media viewer background is opaque (FEED-027).
- **The bookmark reflects «Сохранённое»**, with no duplicates. Unsaving in «Сохранённое» removes the card with «Вернуть». Toasts name the real path «Я → Моё → …» (FEED-042, FEED-019).
- **Community discussion actions:** like, replies with a count, and share (FEED-043, partial).

## Moderation
- **Reports keep their reason, details and time.** An M01 card shows a reason badge, the details, the number of reports and the time of the last one. The post opens from the card, and removal asks for confirmation. The queue is sorted by urgency, and the admin screen has no dock (FEED-021).
- **The QA «Модерация» button opened the private-part editor**, because `M01` is an alias of P04. The queue now has its own id `MOD`.
- **Reporting from a post's page goes back**, since the post is hidden from you (FEED-033).

## Core changes (for the lead's merge review)
- Small in-place edits outside `s-feed.js`:
  - `postCard`: reply counter, saved state from the list, a «не в ленте» mark on your own posts.
  - `replyTree`: deleted stubs.
  - `pollVoters`, `pollHTML`, `ACT.pollPeople`.
  - `ACT.rMore`: edit item.
  - Profile `allMine` (not-in-feed posts) and `meMineLayer` (counter, plus seeding of the couple's gallery).
  - `ACT.rpSend`: stores the report and goes back.
  - C06 action row.
  - The QA moderation button now goes to `MOD`.
  - `ACT.feedEvLess`.
  - The rich-text link handler.
- Wrappers in the feed JS block, which redefine global functions:
  - `freshState`: seeds the own gallery.
  - `ask`: draft choice when leaving F07 only.
  - `replyComposer`: edit bar.
  - `ACT.sendComment`: saves an edited reply.
  - `ACT.postMenu`, `rMore`, `actMenu`, `discMenu`: a desktop popover through a temporary `sheet` override.

## Not done / partial
- FEED-011: there is no «Скрытое» entry in Settings and no «Снова показывать» in an author's profile ⋯ menu. Both belong to the settings and profile sections; the sheet `ACT.feedHidden` is ready to link from there.
- FEED-043: discussions can't be saved, because «Сохранённое» (G04) holds only posts.
- FEED-020: at 320 px the composer hint is cut with an ellipsis rather than replaced by a shorter text.

## Needs owner
- None.
