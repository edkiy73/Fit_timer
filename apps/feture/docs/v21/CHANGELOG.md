# FetUre V21 — changelog

V21 is V20 with the fixes from the V20 audit (`apps/feture/audit-v20/`). V20 stays frozen.
File: `docs/v21/prototype-v21.html` (moved from `public/` on 29.10.2026). Notes for reviewers: `prototype-v21-notes.html`. The contract test `tests/prototype-v21-contract.mjs` was removed with the cleanup (the V20 contract run on the V21 file, with the swaps listed there).
The React integration guide, the V20 audit (`audit-v20/`) and per-branch screens were removed on 29.10.2026 (git history keeps them); the app is the source of truth now.

## In numbers

The audit found 302 issues (P0 5, P1 33, P2 120, P3 144).
In V21: fixed 295, partial 0, not reproduced 4, moved to the React spec 1, needs the owner 0. Every item with what was done and how it was checked: `apps/feture/audit-v20/V21-FIX-STATUS.md`.

## Owner decisions taken for V21 (27.10.2026)

- Headings use **Geologica**, body text stays **Onest**.
- The brand red is **#DF234A**. In dark theme filled buttons use #DF234A too (white text 4.7:1); red text and icons in dark theme stay the lighter #FF4566 so they read on the dark background.
- Interests by access open together with «Описание» (ME-025).
- Quizzes are removed (ME-041).
- In a couple, the dock «Я/Мы» keeps opening «Действовать как» (CPL-007).
- Terms and privacy texts stay short summaries in the prototype; the final texts are edited in the admin (AUTH-015).
- Everyone starts in Discover — a person and a couple; without a photo nobody sees you there. Onboarding says so, offers a photo right away and lets you switch Discover off (AUTH-019). `AGENTS.md` notes the change.
- «Как видят» shows the real «Что у вас общего» block computed with a sample viewer (CPL-023).

## Shared components and navigation (lead)

- **Header back «‹»** leaves the screen within its own tab (`headerBack`). It no longer jumps to another tab; the browser/system Back still walks the shared history (NAV-001).
- **Tab rows never cut labels.** When labels don't fit, the row scrolls sideways with a fade at the edge, and the chosen tab scrolls into view. Tabs in headers use 14 px like everywhere else (VIS-002, VIS-006).
- **«Я» tabs** size to their labels; the «new» dot sits inside its label; at 320 px the row scrolls (VIS-003).
- **The section is called «Сообщества»** in the dock, the sidebar and the screen title; inside it, «Каталог / События». Dock labels never end in «…»; at ≤374 px they are 10 px (VIS-001, GEN-001).
- **Toasts never cover sheets.** While a sheet, dialog or popover is open, a toast shows at the top; opening a sheet clears toasts from the previous screen (VIS-010).
- **Sheets close with a swipe down** on the handle or header (≥25% of the height or a quick flick), with the same unsaved-input guard as «×» (VIS-013).
- **Confirmations** always have an icon; irreversible ones have a solid red button (VIS-011).
- **One «+» button** everywhere: 44 px, 14 px radius (VIS-004).
- **Chat header:** the person sits on the same glass as the header buttons, so messages no longer show through the name and status (VIS-009).
- **Sidebar:** one avatar of yourself, on the account button; the «Я» item uses the profile icon (RESP-001).
- **Small targets** (hashtags, links in block headers, «Реже такое», mentions) keep their look but get a 44 px tap area (GEN-002).
- **Long names** end in «…» next to badges and under like tiles (VIS-014, VIS-015).
- **320 px:** the editor title fits next to «В черновик»; the act-as wait line is short («3 симпатии · 3 запроса») (RESP-003, RESP-004).
- **Settings → «Проверка возраста»** opens the check (the row called a missing handler) (SET-001). Settings also has «Скрытое в ленте» (FEED-011).
- **Review tool:** the «V21» tab sits on the right edge and hides under sheets and dialogs; the drawer title says V21 (GEN-003).


## V21 — Auth, settings, Premium and system states (section `auth`)

Branch `v21/auth`, 48 findings: 46 fixed, 2 partial (AUTH-015, AUTH-019). Verified in Chrome at 390 / 320 / 1440 (+375×667, 320×568, 1024), RU and EN, light and dark for colour changes; V21 contract passes.

### Privacy by default
- **Sign-up «About you» (AUTH-016).** The step now asks *who sees the answers below* — «Only you» (default), «By access», «Everyone» — and explains it. The choice is stored as the audience of «Details» (`S.me.detailsVis`): the tag in Me follows it, «Me → Visibility» has a «Who sees “Details”» row, and the «How others see it» previews (everyone / with access / Discover card) hide the answers accordingly. New accounts start private; seed personas keep their public answers.
- **Terms sheet (AUTH-015).** «Private by default» now matches the real tags; «Terms of use» and «Privacy policy» open as short readable sheets with Back.

### Registration
- **No app inside sign-up (AUTH-017).** Community cards on step 2 open a preview sheet (description, topics, Join / Request, Close). Without a session `go()` cannot open app screens.
- **Nickname (AUTH-001/002/003).** Exactly one message under the field: hint, «available» or an error; existing profiles' nicknames (people and couples) are taken, case-insensitively; a nickname starts and ends with a letter/digit, no «..».
- **Email code (AUTH-005/006).** Five wrong codes lock the input until a new code; wrong digits are cleared; an expired code makes «Resend» available at once.
- **Email (AUTH-007, AUTH-013).** «..» and over-long local parts are rejected; the send limit is an error under the field with a live countdown. The email decides the account: the existing address signs in from either mode, any other address creates a new account (with a clear toast).
- **Terms checkbox (AUTH-004).** The whole row toggles; the terms open from a separate link below.
- **Date of birth (AUTH-011, AUTH-025).** Days follow the month; years 13–100 back; a wrong date shows right away; «Day / Month / Year» fit at 320 px.
- **Under 18 (AUTH-010, AUTH-023).** «Back to start» clears the sign-up from history; «The date is wrong» returns with an empty date and a new date needs an explicit confirmation.
- **Steps (AUTH-014).** One progress bar and the same h2 on every step (no «N / 3» pill).
- **Step 2 (AUTH-018, AUTH-022).** The chosen topics still set the first feed, but it is said on the step and in the toast «Account created. Your feed shows: …» with «Show all». Join buttons read «Skip» / «Don’t request»; descriptions are two lines.
- **First feed (AUTH-019).** A closable «Finish your profile» card lists what is missing.
- **OAuth (AUTH-012).** Sheets are «Continue with Apple / Google»; no Face ID on the web.

### Welcome and desktop
- **Slides (AUTH-008, AUTH-009, AUTH-024).** Slide text is never cut: the picture shrinks (and hides on screens ≤600 px tall); a short positioning line shows on phones; the progress bars have a 44 px touch zone and autoplay resumes 4 s after a touch.
- **Desktop forms (AUTH-021).** On ≥1024 px A02–A05 are a 460 px card with the logo; the welcome buttons stay on one line.

### Age check and verification
- **Age check (SET-001…004).** A07 opens in the state of the check; the result arrives even after leaving «Checking…» (notification, Settings row, toast); «Wait for answer» in QA keeps it pending until «approve all». Texts say what the check really unlocks; «ID document» shoots a document, not the face; one intro line.
- **Photo verification (SET-005).** «Take a selfie» opens the front camera; requirements use a neutral icon; «How verification works» looks like an opening row.

### Settings
- Notifications (SET-006, SET-007): honest «Discreet» text (the phone always shows the app), columns «Push / Email», brand colour for «on», quiet hours editable in 30-minute steps.
- Sign-in & security (SET-008): change the primary email with a code, Google shows the user's address, «This device» from the browser, one button style.
- Your data (SET-009): «Download my data» (`feture-data-DATE.json`), the couple sentence only in a couple and naming the partner, Enter confirms, nickname case-insensitive.
- Help (SET-010): community rules, how to report, «Contact support» sheet, FAQ titles equal sheet titles, Premium text matches B01.
- Settings list (SET-011, SET-021, SET-023): every row has an icon, couple blocks are labelled, long emails stay one line, new «Privacy & visibility» row; the «Likes are off → Settings» toasts open Me → Visibility.

### Premium
- Cancel renewal shows «renewal cancelled» and «Resume renewal»; a gift has nothing to cancel (SET-012).
- Gifting has a confirmation step like an own purchase, priced term cards, a clean success toast and errors under the nickname field (SET-013).
- Paywall: close button off the hero, both features explained, the sheet has an accessible name (SET-014).

### System states and accessibility
- Offline (SET-015): the bar shows on sign-in screens (incl. welcome) with its own text; server settings fail with «Retry» instead of a false «saved».
- Maintenance (SET-016): logo and icon plate; an action cut off by maintenance reports itself afterwards.
- Contrast (SET-017): hints, «or with email», «pick any», the resend countdown use `--mute` (≥4.5:1 both themes).
- `#ctx` aria-label follows the language (SET-020).

### Core changes (small, for the lead's review)
- `pickLocalMedia(accept, multiple, o)` — optional `o.capture` (SET-005).
- `drawSheet` — `aria-label` falls back to `b.label` (SET-014).
- Wrappers in the auth JS block: `go` (no app screens without a session), `render` (offline text on auth screens, `#ctx` label, maintenance notice), `run` (remembers an action dropped by maintenance), `qaApproveAll` (resolves the age check), `V.nick`, `V.email`, `meProfileLayer`, `meVisLayer`, `meAsPerson`, `SC.P03.render`, `SC.F01.render` (welcome card).
- In-place one-line edits outside the auth/settings modules: `ACT.likeBack` and the likes-off toast in `ACT.likeProfile` (SET-023 — adjacent to the people fixer's PRF-003 line), `helpText` and the `K07` export override in s-completion (SET-009/010).

### Not done / handed over
- SET-018 dark primary button — fixed by the lead (`--accent-fill`); my override removed. The A01 welcome button gradient starts at `#FF3D61` (≈3.4:1 with white) — worth checking with `--accent-fill`.
- AUTH-020 — fixed in `v21/me` (ME-017); not duplicated here.
- AUTH-013 — QA-panel hint about which email signs in not added (QA panel belongs to the lead).

### Needs owner
- AUTH-015: final legal text of the Terms of use and the Privacy policy (current sheets are short structured summaries).
- AUTH-019: a new couple is visible in Discover by default (`coupleProfile()` has `dating:true, datingVisible:true`, and Q01 says so). That contradicts «dating off by default». Should a new couple start with dating off (and Q01 say «turn it on together in couple settings»)? Change belongs to the couple section.

## V21 — Feed (section `feed`, findings FEED-001…043)

Branch `v21/feed`, file `apps/feture/public/prototype-v21.html`. Of the 43 V20 audit findings, 41 are fixed and 2 are partial. Each fix was checked in a real browser at 390 px, and visual ones also at 320 px, 1440 px and in dark mode. The contract `tests/prototype-v21-contract.mjs` ends with `PASS V20 rules in V21`, and none of its assertions were swapped.

### «Я» and «Мы» in the feed
- **«Подписки» belong to the acting profile.** In «Мы», the tab is built from the couple's own follows, the couple's own posts and the couple's article subscriptions. One partner's personal network no longer shows there. The tab's filters, the activity stream and the event ranking follow the same rule (FEED-001).
- **Poll votes are per profile**, like reactions. A vote in «Мы» shows as «Alex и Kira · Ваша пара» in the voters list and does not mark the personal profile as voted (FEED-002). In people lists, the current profile reads «Ты» or «Ваша пара» (FEED-024).
- **Hiding an event** («Скрыть», previously «Реже такое») applies to the acting profile only, and the toast says whose feed changed (FEED-014).
- **«Мои публикации»**: in «Мы», the empty state talks about the couple. The couple's saved edits appear only in «Мы» (FEED-007, FEED-041).

### Publishing and editing
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

### Feed screens
- **Empty states explain why:** filters, things you hid, or simply nothing yet. Empty «Подписки» asks for people only and hides chips and filters (FEED-010, FEED-017).
- **Hidden content can come back.** A row stays where a post was hidden («Вернуть · Не показывать автора»), «Скрыто в ленте: N» appears under the feed, and a «Скрытое в ленте» sheet lists posts, authors and activity per profile (FEED-011).
- **Quick topic chips** come from posts the tab actually shows (FEED-009). The filter button reads «Показать N публикаций» (FEED-035).
- **«Популярное»:** reply authors and replies now outweigh likes. Only interests with something this week are offered, and there is 16 px of space before the posts (FEED-016, FEED-031).
- **Topic page:** posts are newest first. An empty topic gets «Написать о #теме». Search starts with the topic, and your own interest is labelled (FEED-015, FEED-032).
- **Activity cards:** «+N» counts only tiles that aren't fully visible (FEED-023).
- **320 px:** the composer hint fits on one line. In the editor, «Как увидят» becomes an icon button and the tools sit in one scrolling row (FEED-020).
- **Desktop:** «⋯» menus on posts, replies, activity cards and discussions open as a popover at the button (FEED-034).

### Posts, replies, saving
- **Reply counters** count only live, visible replies. A deleted reply with nothing under it disappears (FEED-008).
- **Your own reply can be edited** and shows «изменено». Your published post's menu has «Скопировать ссылку» (FEED-025).
- **Article page:** the header reads «Статья», «Следить за статьями» appears under other people's articles, and an empty list says «Ответов пока нет. Напиши первым» (FEED-026).
- **The «Нравится» line** sits inside the post card (FEED-036). The media viewer background is opaque (FEED-027).
- **The bookmark reflects «Сохранённое»**, with no duplicates. Unsaving in «Сохранённое» removes the card with «Вернуть». Toasts name the real path «Я → Моё → …» (FEED-042, FEED-019).
- **Community discussion actions:** like, replies with a count, and share (FEED-043, partial).

### Moderation
- **Reports keep their reason, details and time.** An M01 card shows a reason badge, the details, the number of reports and the time of the last one. The post opens from the card, and removal asks for confirmation. The queue is sorted by urgency, and the admin screen has no dock (FEED-021).
- **The QA «Модерация» button opened the private-part editor**, because `M01` is an alias of P04. The queue now has its own id `MOD`.
- **Reporting from a post's page goes back**, since the post is hidden from you (FEED-033).

### Core changes (for the lead's merge review)
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

### Not done / partial
- FEED-011: there is no «Скрытое» entry in Settings and no «Снова показывать» in an author's profile ⋯ menu. Both belong to the settings and profile sections; the sheet `ACT.feedHidden` is ready to link from there.
- FEED-043: discussions can't be saved, because «Сохранённое» (G04) holds only posts.
- FEED-020: at 320 px the composer hint is cut with an ellipsis rather than replaced by a shorter text.

### Needs owner
- None.

## V21 changelog — events and communities (`evcomm`)

Branch `v21/evcomm`. Source: the V20 audit `findings-evcomm.json` (55 findings) plus COMM-900 from the lead's click-crawler. Result: 53 fixed, 3 partial, 0 needs-owner. Details for each finding are in `fixes-evcomm.json`. Screenshots are in `screens/v21/evcomm/`.

### Who goes, who is interested (one source of truth)
- My own events, and any event still in review, show real answers only. «Идут» means approved applications, or «Иду» on an event without applications. «Интересуются» means `interestedPeople`. A pending application never counts as going. E03, E15, E17 and E18 now count the same people.
- An event nobody has answered yet says «Пока никто не ответил».
- A couple's row in E18 reads «это вы · двое», with a note that a couple counts as two. The partner no longer shows up as a separate made-up attendee.
- Attendance visibility is off by default, which matches what the organiser is told.
- A past event shows «Кто был · Были: N» and has no «will open» hints.

### Organiser panel (E15/E16) and editing (E11)
- The tiles depend on the event type. With applications: pending / approved / interested. Without: going / interested. The next-step alert has an «Открыть заявки» button. A cancelled event shows one status pill and no tiles, applications or edit. Pending applications close when the event is cancelled.
- E16 lets the organiser revoke an admission (with a confirmation) and approve a declined application after all. Every tab has a counter. While a decision is being sent, both buttons on the card are locked.
- Edit mode is known before the first render. The screen is titled «Редактирование события», the button reads «Сохранить изменения», and an alert explains that changes save at once. An edit keeps every field the form doesn't show: interested people, applications, community, couple ownership and the couple hold.
- An event can be linked to a community. «Создать событие» on a community page passes the community in, and step 1 has a «Сообщество» field.
- The step 4 preview has no organiser pill. It shows time, price and admission, the description, requirements and the application question.
- Price and currency sit in one row. When an event is edited, its price is split back into amount and currency.
- The two date fields now have even spacing.

### Couple ownership of events, drafts and communities
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

### Community membership and management
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

### Event page polish
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

### Core changes (for the merge review)
- `pname('me')` returns `S.me.name` before the nick (EVT-025).
- The `[data-author-reason]` updater checks the reply or compose actor and the right permission, instead of always «Я» (COMM-001).
- `filterSheet` shows a disabled `applyLabel(0)` button when nothing matches (EVT-021).
- `at()` in data.js builds Berlin wall-clock times through Intl (EVT-030). This affects every demo date built with `at()`.
- `evStatusPill`, `eventCard` and `myEventIds` (ui.js) handle couple organisers, the `holdPair` hold and the new `waiting` group.
- The `jointReview`, `jointCancel`, `returnAsk`, `NTXT.pair`, `rLike`, `rReply` and `currentNotifications` changes are wrappers in the evcomm JS block. The originals are untouched.
- The F07 topic hint and the feed «Скоро» title are one-string edits in the feed module.
- The contract passes with no swaps.

### Not done / partial
- EVT-010: the «Пара» tag is glued to the time («Паретолько что») in the notification list. That rendering belongs to the notifications section and was not changed.
- EVT-032: the row card supports `o.noOrg`, but the organiser's own profile page doesn't pass it yet. That page belongs to the profile section.
- COMM-013: the dock label at 320 px is handled by the lead's dock change.

### Needs owner
- None.

## V21 — People, other people's profiles, access (section `people`)

Branch `v21/people` (3 commits). All 46 V20 audit findings: 45 fixed, 1 already fixed by the lead's V21 base (PRF-006). Screens: `audit-v20/screens/v21/people/`.

### Blocks belong to the profile that made them
- **A block only affects the profile that made it (PRF-001, P0).** Blocking as «Мы» ends only the couple's likes, match, chat, follows, requests and links with that person. Your personal chat, follow and match stay, and the reverse is also true. The confirmation text names the same profile. «И для пары / И для меня» in «Заблокированные» now also ends the other profile's ties. The partner gets a notification only when the couple blocks someone.
- Unblocking as «Мы» says «Mia снова увидит профиль пары «Alex и Kira»…» (PRF-022). A blocked profile's tab title is «Недоступно», not the person's name (PRF-023).

### Follows as «Мы»
- Follows made as the couple are counted: in followers, in following, and in «Моё» of the couple (PRF-002). Couples show both numbers, followers and following (PRF-029).
- In someone's follower list as «Мы»: «это вы» marks only the acting profile, and your personal profile reads «твой личный профиль». The buttons say «Подписаться от пары / Отписать пару» (PRF-021).
- The follow button on a Discover card redraws like the one on the profile: the check mark, «от пары» and the counter all update (PPL-003).

### Discover (D03/D04/D09)
- **«Рядом» filter:** without a location you see «Определить примерное место», and «Показать» stays inactive with the reason under it. After the location is set, the radius and the count appear (PPL-001).
- Filters: Esc, ✕ or the scrim in a nested list (Интересы, Гендер…) or in the city picker go back to the filters and keep the draft. There is a working «back» arrow (PPL-004). «Сбросить» is inactive when nothing is set. The summary line appears only when filters are on and starts with a capital letter. Reset crosses are 32 px (PPL-012).
- «Вернуть» skips matches and brings back the last pass or like. It is inactive when there is nothing to bring back (PPL-002).
- The swipe tip is a short line between the tabs and the card, so it no longer covers the photo labels (PPL-007).
- An empty deck caused by filters says «С этими фильтрами никого нет» and names the filter that narrows it most (PPL-013).
- Action buttons over a scrolled card stand on a solid fade (PPL-015). After «Это взаимно» closes, focus returns to «Нравится» (PPL-017).
- **Recently viewed:** tapping a card opens the profile. A passed card has its own round «Вернуть в подборку» button, which turns into a check mark once the person is back (PPL-010). The paywall block follows the grid instead of covering the last row. The Premium sheet is named for screen readers (PPL-011). Its ✕ sits inside the banner, and the pill reads «нужно сейчас» (PPL-016).
- Couples in «Симпатии» have a «пара» pill, and the desktop side rail shows «пара · …» (PPL-014).
- **«Скоро» mode:** «Люди» stays in the dock (five permanent tabs). The deck shows the teaser without filters or history, and «Симпатии» keep working (PPL-008).
- **Couple dating off:** the couple gets the same two choices as «Я», «Смотреть незаметно» or «Смотреть и показываться» (with the partner's OK). There is also a link to Visibility. In «Настройки пары» the separate on/off switch is replaced by a row with the current mode that opens the couple's «Я → Видимость» (PPL-009).

### Shared interests: one number, one word
- The photo label, the circle, the «Есть темы для разговора» block, «Это взаимно» and P05 all say «N общих тем: в X совпадаете, в Y дополняете друг друга» (PPL-005).
- Another couple's name next to another name is quoted, and its verb is plural: «Ты и «Lena и Max»…», «если «Nika и Jonas» ответят…» (PPL-006).
- As «Мы» the comparison speaks for the couple: «Вам ближе давать…», «У вас это табу» (PRF-011).
- P05 with too little data no longer shows a comparison. The header says «Пока одна общая тема · Игрушки» (PRF-027).

### Other people's profiles (P01/P08)
- Photo taps work over the whole photo: left, right and centre. The follower links still work (PRF-004). On phones the header photo is portrait 4:5 and keeps faces in frame. Desktop is unchanged (PRF-005).
- Past the photo the back and ⋯ buttons sit on a solid bar with a mini avatar and the name. P08 lands below it (PRF-007).
- A couple without a photo: the split avatar sits above the name, never under it (PRF-012).
- Liking a couple while your dating is off shows a note with a «Включить знакомства» link (Я → Видимость) instead of a dead button. The dead «Знакомства» toast button that led to the missing D02 is gone (PRF-003).
- The action buttons come right under the description, with the context lines after them. «и ещё 1» doesn't wrap (PRF-020). Seed bios no longer say «Тестовый профиль» (PRF-024).
- Galleries have no repeated pictures. Long album names wrap to two lines, and followers-only albums are marked for visitors too (PRF-028).
- Private parts of seed profiles contain only pictures that are not public (PRF-008).

### «⋯» menu, links
- «Скопировать ссылку» closes the menu (PRF-014). «Указать связь» looks unavailable when the person doesn't accept links, and a tap still explains why (PRF-015).
- Your own link on someone's profile reads «alex_b · ты» («· вы» for the couple) (PRF-025). QA link answers now also reach requests sent as «Мы» (PRF-026).

### Access (P07, grant sheet)
- The P07 footnote reads «Запросы к тебе / к вам и кто может просить доступ — в «Я → Приватное»» and is a link there (PRF-009).
- The tabs «Открыто мной / Мне открыли / Мои запросы» fit 320 px, and «10 из 10» doesn't wrap. The QA entry «ко мне» is now «открыто мной» (PRF-010).
- An expired request has «Запросить снова». Ari and Leon have private parts, so the veils «Прежний доступ закончился» and «Решили не открывать · через N дн.» can be seen (PRF-018).
- Access types are always listed in the order description, interests, photos, video (PRF-016). The veil says «Отменить запрос» (PRF-017).
- The grant sheet: «Kai просит доступ», «Просит: описание, фото», unrequested items are marked «не запрошено», and there is an «Отказать» button (PRF-019).

### QA
- QA «Это взаимно» as a couple no longer matches the couple with its own partner (PRF-030).

### Core changes (for the lead's merge review)
- `drawSheet` (ui.js) has two new optional sheet fields. `backAct` renders a working «back» button in the header, because the sanitised `lead` strips buttons; the old `dfBack`/`fBack` lead arrows were dead in V20 too. `aria` gives a header-less sheet its aria-label.
- `TABDEF` (ui.js): «Люди» is always in the dock (PPL-008).
- The desktop side rail «Тебе симпатизируют» adds «пара · » (PPL-014).
- `cleanScopes` (data.js) returns a fixed order (PRF-016). Seed `PEOPLE`: privText for ari/leon (PRF-018) and six bios (PRF-024).
- `paywall` (Premium sheet): `aria`, ✕ position via CSS, pill text (PPL-011/016).
- QA (`qaV13`/`qaApproveAll`, `QA_RUN.match`, QA_LIST P07 entry).
- Contract `tests/prototype-v21-contract.mjs`: a `deepSwaps` hook patches the V13 contract as it is read, with 2 swaps. The V13 doBlock-from-«Я» rule now blocks as «Мы» (PRF-001). Q01 expects `pairVisOpen` instead of `pairDating` (PPL-009). `ACT.pairDating` still exists and is still tested. Result: `PASS V20 rules in V21`.

### Not done
- PRF-006: nothing to do. The lead's `.seg.scroll` already gives full tab labels.
- Mia's private part now has 2 unique pictures. The seed image pool is small and her gallery uses most of it.

### Needs owner
- None.

## FetUre V21 — «Я» (section `me`) changelog

Branch `v21/me`, file `apps/feture/public/prototype-v21.html`. Fixes for the V20 audit findings ME-001…ME-052 plus the lead's
crawler item ME-900. Per-finding status and verification: `work/fixes-me.json`; screenshots: `screens/v21/me/`.

### Profile photos
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

### Discover mode and visibility
- **«Смотрю незаметно» from «Выключены» turns dating on hidden** — it used to make you visible (ME-002).
- «Принимать симпатии из профиля»: «Не зависят от режима знакомств»; concrete toasts; the switch no longer sticks when the value
  was never set (ME-043). Couple wording: «Наша карточка в подборке», «Нам открыли» (ME-046).

### Private part and access
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

### «Как видят» (P03)
- «Знакомства» is the real Discover card (name, age, place, online, counts, «Листай вниз…», no extra chips) with the whole profile
  under it (ME-007). «Что у вас общего» on your own preview is a neutral placeholder, no self-comparison numbers (ME-008).

### «Я» page
- One empty-block pattern (icon, title, hint, «+») for interests, gallery («Загрузить первое фото», no «Все · 0») and links
  (ME-016). Interests: no duplicate count, filters in one scrolling row, a legend of the icons, «Все интересы» → X02 (ME-036).
  «Данные»: label above value on phones, 180 px label column on wide screens (ME-037). «Личный профиль» stays on one line at
  320 px (ME-042). In a couple with «не в отношениях» a gentle prompt to update the status (ME-047).
- «Моё»: «Мои события 0» like the other rows; couple titles «Публикации пары», «События пары», «Нам открыли» (ME-028). The
  desktop right column lists your upcoming events (going, applied, interested, organising), soonest first (ME-027).

### Gallery and albums
- «Все» is a mosaic of what is there (4/3/2 pictures, or the one picture) on «Я» and in P20 — never another album's cover (ME-019).
  The create button says «Альбом»; album names wrap to two lines (ME-018). The open album is named under the row (ME-021).
- New album / rename: «Введи название», «Альбом с таким названием уже есть», Enter submits, 0/40 counter (ME-020, ME-052);
  «Альбом переименован», «Альбом удалён · Отменить» (restores the album and its posts).
- Select mode: audience change says what happened to the profile and can be undone (ME-048); «В профиль» names skipped
  followers-only photos (ME-050).

### Editor, interests, links, followers
- One «Сохранить» in every editor section, inactive until something changes (ME-031); the «Данные» screen is always open (ME-030);
  an empty nickname is an error (ME-032); ↶/↷ in the text editor are active only when there is something to undo/redo (ME-051).
- Interest sheet: «Добавить» is disabled until a level is chosen, with a hint (ME-900); «Убрать» asks over the sheet and «Отмена»
  keeps it (ME-035); history records a «Кто видит» change as its own entry and skips no-op saves (ME-049); 14 px under the progress
  bar, review footer «Назад» + «Сохранить» (ME-034).
- Link request card: time on its own line (ME-038). P22: one list card, sides without a leading «·», no name in the header,
  «Кто видит» (ME-039).
- Followers (P10): «⋯ → Убрать из подписчиков» with undo, «Подписаться в ответ», undo of unfollow keeps the place; on ≤360 px
  the buttons go under the name (ME-029).

### Verified, fixed by the lead
- ME-011 («Я» tabs and dots), ME-015 (toasts over sheets), ME-040 (search tabs) — checked in V21, not changed.

### Core changes (for the merge review)
- `meTabIcon` and the sidebar «Я» button use `ownAv21()` instead of `av()` (ME-006/045).
- Drag reorder (`.ph-slots` branch): moves `.mainph` to the first cell (ME-014).
- `window.CTX` «me» branch rewritten (ME-027).
- RTE toolbar: ↶/↷ start `disabled`; `ACT.rte` / `IN.rte` are wrapped in the me JS block (ME-051).
- `.kv` layout changes via container queries in the me CSS block (also P01/P03 «Данные») (ME-037); `.frow` wraps at ≤360 px (ME-029).
- Small in-place edits outside s-profile/s-me: `grantSheet`/`reqCardHTML`/`accessSummary` (access), `SC.F07` album row and
  audience label (ME-044), `linkReqCard`/`SC.P22`/`linksBlock` (links), `SC.F10`/`SC.E10` titles.

### Not done
- ME-005: not reproduced in V21 (one «Назад» returns to «Я»). The missing publish toast comes from `ReferenceError: obj` in
  `ACT.publish`; the feed branch already fixes it (`status` instead of `obj`), so «Я» does not touch it.
- Deleting a profile photo's post from F05 (feed code) does not go through the last-photo dialog; the four paths named in ME-004
  do.

### Needs owner
- ME-025: private interests have no permission of their own (`REQ_SCOPES` = description, photos, video), so a grant never shows
  «Интересы по доступу». Should interests become a fourth permission, or open together with «Описание»? (Either changes what
  existing grants disclose, so it was not changed silently.)
- ME-041: should «Я → Моё» get a «Тесты · скоро» entry, or should X05/X07–X09 and their QA items go, with history entries
  labelled «из теста (архив)»?

Contract: `node tests/prototype-v21-contract.mjs` → `PASS V20 rules in V21` (no swaps needed).

## V21 — couple, chats, notifications (section `couple`)

Branch `v21/couple` (worktree `ft-wt/couple`), file `apps/feture/public/prototype-v21.html`.
Fixes the 40 findings of `findings-couple.json`: 34 fixed, 4 partial, 2 already fixed by the lead (not reproduced).
Per-finding detail: `fixes-couple.json`. Screens: `audit-v20/screens/v21/couple/`.

### Getting into a couple (P0)
- **A way into a couple from the interface.** «Я → Моё» starts with a «Пара» group, and Settings → Account has the same row.
  It says where the couple stands: «Профиль пары» (→ Q01), «Приглашение в пару отправлено · Ждём ответа Mia · можно отозвать»,
  «Sofi приглашает тебя в пару» (→ «Нужно решить»), «Приглашение в пару отклонено», and a stopped couple
  «Пара «…» остановлена · Восстановить можно до … · согласий 1/2» (→ Q07). An active couple shows «Пара · настройки пары» in Settings.
  The markup lives in one helper (`pairEntry21`) called from `meMineLayer` and K01.
- **A «no» is heard.** The partner reads «alex_b предлагает создать с тобой совместный профиль». Declining leaves the inviter a
  notification and a note on Q01 («Mia: приглашение отклонено · можно пригласить снова»). Closing the invitation sheet without an
  answer returns the QA tool to Alex.
- **Nickname check says one thing.** Format first («Ник — от 3 до 20 символов…»), then own nick / couple profile / not found / already
  in a couple — always exactly one line under the field.
- **A new couple starts empty.** Only the demo couple Alex & Kira has the ready album; «Мои публикации» shows an empty state per profile.

### Stopping, restoring, expiry
- Q07: after your consent the button becomes «Согласие отправлено · ждём Kira» (disabled) with a toast; «Создать новую пару» is
  secondary and asks «Восстановить «…» после этого будет нельзя»; the second consent ends with «Пара восстановлена».
- Expired: «Срок восстановления истёк. Совместный профиль удалён; личные аккаунты не затронуты.»; the joint archive button only when
  there is something in it. Notifications of a stopped / deleted couple are grey, tagged «Пара остановлена / удалена», and a deleted
  couple's notification no longer navigates.
- An archived couple chat shows revoked media as «Фото · один просмотр — Недоступно после разъединения пары» and has no
  comparison / access pills.

### Two people, one couple
- **Seen by the partner** (QA «Проверяемый участник: Партнёр») every caption names the other member: «Отправить alex_b»,
  «Изменения ждут alex_b», Q01 «Ждём согласия партнёра · alex_b». «Нужно решить» no longer shows Alex's personal decisions to the
  partner; the act-as personal card is the partner's own.
- **The approver can act.** «Мы → Видимость» shows «Kira предлагает изменения профиля и видимости · Посмотреть…» and the row says
  «Kira предлагает изменить — решение выше». «Нужно решить» names what changes (profile / visibility / both).
- **Review shows the difference in words**: one paragraph, added words highlighted, removed words struck through; approving confirms
  with a toast. The first switch of approval no longer says «снова».
- Access request cards count matches for the profile the request is addressed to, whatever the dock says.
- The dock «Люди» badge counts for the chosen profile on every screen (it used to change inside a couple chat).

### «Мы» speaks as «мы»
- Likes tabs «Вам / Ваши», empty state «Дополнить профиль пары» → couple photos.
- «Что у вас общего»: real avatars on both sides (split couple circle vs the person), «Вам ближе…», «У вас — табу».
- Post editor «Видно в ленте и в профиле пары»; event «Показывать наше участие», «Подать заявку от пары», application form says
  it is from the couple and the organiser sees both nicknames and ages; «Наша карточка в подборке», «Только наши подписки»;
  «Доступы пары» with «Открыто парой / Открыто паре / Запросы пары».
- No gender / «человек»: «когда Mia подтвердит у себя», «по ссылке партнёр зарегистрируется», «Kira решает отдельно».
- 320 px: the couple name wraps to two lines instead of «Alex и …».
- One empty-block pattern in the profile (photos, couple interests, links): a dashed row with icon, title, hint and «+».
- Gallery «Все» is a mosaic of what there is (2–4 pictures), never another album's cover.
- «Как видят» reads like a viewer: «Нравится», «Подписаться».

### Chats
- On phones the message field is always there in a conversation: «Ответить» in the message menu and conversation starters land in a
  visible, focused field (no extra «Написать ответ» step).
- «К последним сообщениям» floats above the message field (and above the dock in an ended chat); it never covers «Отправить».
- Chat list: search with placeholder «Имя или ник», a close cross, searching names and nicknames, filtering new matches too,
  «Ничего не нашли по «…»» + «Сбросить». A contact without messages appears once (in «Новые совпадения»), a couple match has the small
  couple badge on its avatar. An ended empty chat leaves the list; one with history says «Контакт прекращён».
- Couple chat header: «Чат пары» chip and «· видит Kira» in a neutral colour.
- Disappearing media: «осталось 1 ч 10 мин», not «2 ч».
- The «Не пропустить ответ?» offer is a quiet toast in a conversation, not a sheet that steals the next tap.
- ≥1024: the right column of a conversation is about the person (profile, what you share, private part); on Notifications it no
  longer links to itself.

### Notifications
- No «Alex и Kira ·» prefix (the «Паре» label says it); organiser updates and community notices carry «Тебе / Паре».
- Decision cards use one name format (name, age). Sharing with a couple: «Оба в паре «Eva и Tom» увидят …».

### Core / shared code touched (for the merge)
- `closeAuthorMenu` (ui) also resets `#side .mebtn[aria-expanded]`; the sidebar account button renders `aria-expanded` from the
  open popover (renderSide template) — CPL-011.
- `C.likesIn`, `C.newMatches` (dock counters) use `activeActor()` — CPL-008.
- CSS for `.main[data-screen="H02"]` composer and `.chat-down` position (in the couple CSS block) — CHAT-001/002.
- Small in-place edits outside the couple module: `meMineLayer` (one call), K01 account card (one call), `meJars18` and `linksBlock`
  empty states (CPL-022), `meVisLayer` (CPL-005/016), `ACT.meSwitchTo` (CPL-007), `actorCardsHTML`/`ACT.dockMe` (CPL-011/015),
  `SC.F10` empty state (CPL-003), `AUD()`, `MENTION_FROM`, E03/E06 copy, `accessSummary`, `linkReqCard`, QA `qaPair` invite guard.
- Contract: `node tests/prototype-v21-contract.mjs` → `PASS V20 rules in V21`; no assertion swapped.

### Not done
- CPL-011: closing the act-as popover by clicking the same sidebar button again (the popover is modal; Esc / click outside close it).
- CPL-023: the «Что у вас общего» block in «Как видят» stays (V10 contract: the real block with a demo note).
- NTF-003: «Eva и Tom» avatar shows letters because the members of that demo couple have no photos (data, not the component).
- Organiser questions in an application form («Был ли у тебя опыт…») are the organiser's own text and stay as written.

### Needs owner
- CPL-007: in a couple, should a tap on the dock «Я/Мы» open the profile right away (act-as sheet on a second tap / long press), or
  keep the V19 rule «the dock avatar opens «Действовать как»»? V21 keeps V19 and makes the already-chosen card open the profile.

## Open for the owner and partial items



## Not verified

Real devices and touch hardware (touch was emulated), the on-screen keyboard, payments, a live couple on two devices, screen readers.
