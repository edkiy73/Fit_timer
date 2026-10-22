# FetUre V13 — changelog

V13 is a copy of V12 (`public/prototype-v12.html`, now frozen). Contract test: `tests/prototype-v13-contract.mjs`.

## 2026-10-22 — gallery, albums, profile photos in the gallery, notes

- **Gallery on the profile** (own, other people, couple; also on «Профиль»): one 3-column grid of every post with photos or video — no photo/video split. Up to 4 rows on the profile, «Смотреть всё · N» opens the full gallery (P20).
- Tiles show the first picture; a counter marks posts with several pictures, a play mark marks video.
- Tapping a tile opens the post (likes, replies) with «‹ 2 из 7 ›» and a horizontal swipe to step through the gallery (or the chosen album).
- **Albums**: chips on P20 («Все», albums, «+ Альбом»); own albums can be renamed or deleted (posts stay in the gallery). The post composer offers «Альбом в галерее» (or «Новый альбом…») once a photo/video is attached; the post menu moves a published post between albums.
- **Profile photos in the gallery**: in the profile editor each photo/video has «Показывать и в галерее». On save it becomes a gallery post in the «Фото профиля» album and gets likes and replies; unticking or deleting the photo removes it. Such posts never appear in the feed or in «Мои публикации».
- **Notes**: a long-read post type — title (3–120), text up to 10 000 characters with headings/lists/quotes, optional cover photo. Feed card: cover, «Заметка · N мин чтения», title, excerpt, «Читать полностью»; the post screen shows the full text. Profile tab «Заметки» (empty own tab offers «Написать заметку»). Notes are not gallery tiles. Demo notes: n1 (Noa), n2 (Kai).
- Demo people get a deterministic gallery (6–11 posts, 1–3 pictures, 2–3 albums, replies and likes).

## 2026-10-22 — links, consent for people on photos, «Популярное», re-check of round 1

- **Links (Связи)**: partners, play partners, D/s (дом / саб), mentoring (учит / учится), metamours, friends. A link exists only after the other person confirms it («Нужно решить»). Each side picks who sees it (всем / подписчикам / только нам двоим), and the more private choice applies. A change of kind is confirmed again. Removing a link notifies the other person. Settings: «Кто может предлагать» (все / мои подписки / никто). Blocking removes links. Couple profiles and your own partner are excluded, since the couple already shows the pair. Entry points: profile «…» → «Указать связь», profile block «Связи», «Профиль → Связи» (P21), editor P22.
- **People on photos**: the composer has «Люди на фото» for posts, notes and community discussions. Until everyone marked confirms, only the author and the marked people see the post, with a banner explaining why. Each marked person gets a request in «Нужно решить» and can confirm or decline. A decline hides the post, and the author is asked to replace the photo. A declined mark can't be removed while the photos are the same; new photos ask everyone again and clear a dispute. Anyone pictured can use «Это я на фото — против публикации», which hides the post for everyone until moderation. A marked person can remove their own mark. The gallery has a «Со мной» / «Отметки» chip.
- **«Популярное»**: a third feed tab showing the most discussed posts of the week in my interests. Replies weigh more than likes. Taboo topics, follower-only posts, reported posts, posts under review and posts without everyone's consent never show. «Как подбираем» explains the rules, and there is no ranking of people. Communities with 4+ discussions get «Популярное за неделю». The new discussion menu lets hosts pin or unpin, keep a discussion out of Popular, or remove it (the author is notified); authors can delete their own.
- **Notifications**: incoming link requests and photo marks land in «Нужно решить». Link confirmations, refusals and removals, photo-mark confirmations, refusals and removals, disputes and host removals land in the inbox, with a «Связи» filter. Every one of these actions also notifies the other person. QA panel: «Связи и отметки на фото: ответ людей».
- **Round-1 fixes**: profile-photo gallery marks live on the profile, so couple changes wait for the partner. Own posts under review appear in the own gallery with a clock mark. Empty albums are hidden from others. The «Фото профиля» album can't be deleted. «Мои публикации» doesn't count gallery-only posts. Drafts of notes show their title. Search finds notes by title. Reported posts are hidden for the reporter.

## 2026-10-22 — likes, albums, moderation, @mentions, following notes

- **Likes**:
  - Liking someone's post notifies the author. In the author's inbox, likes on one post fold into one line («Mia и ещё 2 — нравится твоя публикация»).
  - The post screen shows «Нравится: Leon, Zoe, Lena и ещё 8». Tapping it opens the list of people. Those who hide their likes are counted but not listed.
- **Albums**:
  - Albums are cards with covers (Все / albums / Со мной / Новый альбом) instead of plain chips.
  - New album settings: who sees it (всем / подписчикам), order (сначала новые / старые), cover (pick a post), move left/right, rename, delete.
  - A followers-only album makes its posts followers-only too, with a confirmation. Opening the album asks whether to open its posts as well.
  - The composer and «Альбом в галерее» keep a post's audience in step with its album. Others never see followers-only albums.
- **Moderation (admin, M01)**:
  - The queue holds «это я на фото» disputes and reports on posts. The moderator chooses «Удалить публикацию», or «Вернуть» / «Нарушений нет».
  - Both sides are told the outcome. The author sees «Удалено модераторами» with the reason on their post, and the reporter gets «Жалоба рассмотрена».
  - Removed posts disappear from the feed, the profile, the gallery and Popular.
- **@mentions**:
  - The composer has an «Упомянуть» tool (people picker). `@name` in posts, discussions and replies becomes a profile link.
  - Mentioned people are notified once per post. People who limit mentions are not notified, and the author is told that before publishing.
  - A mentioned person can «Убрать упоминание меня»: their name stays as plain text and the author is told.
  - New setting: «Кто может упоминать меня» (все / мои подписки / никто).
- **Following notes**: the «Заметки» tab of someone's profile has «Следить за заметками». Their new notes reach «Подписки» and the inbox even without following the person, and the author isn't notified. The feed filter gains «Заметки».
- **QA**: «Активность других людей» simulates likes on my posts, a new note, and opens moderation.

## 2026-10-22 — mentions at the caret, discussion likes, partner photo marks, V13 notes page

- **@mentions**: typing `@ma` shows up to 5 people under the editor. A pick replaces the typed part, and people who limit mentions are marked «без уведомления». «Упомянуть» inserts at the caret instead of the end of the text.
- **Discussion likes**: a like button and «Нравится: …» on the discussion screen, ♥ count in the community list. The author is notified, and likes count towards «Популярное за неделю».
- **Partner mode**: a photo mark on the partner reaches the partner's «Нужно решить», and their answer comes back to Alex as a notification. The partner's inbox also shows mentions and likes addressed to them.
- **«Что изменено» page**: `public/prototype-v13-notes.html`, linked from the V13 footer.

## 2026-10-22 — media mosaic without needless fill, swipe over video in the viewer

- **Post mosaic**: cells now take the pictures' own proportions. The layout is chosen among a few candidates (side by side, stacked, big + row, big + column, 2×2), and the one needing the least blurred fill wins, with the post height kept between 2:1 and 4:5. Standard shots (3:2, 4:5) get no fill at all. Fill appears only for extreme ratios or when a layout would make the post too tall or too flat. Demo image proportions are known up front; unknown ones (uploads, video) re-lay the grid once loaded and are remembered.
- **Viewer**: swipe left/right now works over a video too. A tap still belongs to the player, and the bottom 72 px strip keeps the native controls (scrubbing doesn't flip slides).
