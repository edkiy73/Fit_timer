# V21 — couple, chats, notifications (section `couple`)

Branch `v21/couple` (worktree `ft-wt/couple`), file `apps/feture/public/prototype-v21.html`.
Fixes the 40 findings of `findings-couple.json`: 34 fixed, 4 partial, 2 already fixed by the lead (not reproduced).
Per-finding detail: `fixes-couple.json`. Screens: `audit-v20/screens/v21/couple/`.

## Getting into a couple (P0)
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

## Stopping, restoring, expiry
- Q07: after your consent the button becomes «Согласие отправлено · ждём Kira» (disabled) with a toast; «Создать новую пару» is
  secondary and asks «Восстановить «…» после этого будет нельзя»; the second consent ends with «Пара восстановлена».
- Expired: «Срок восстановления истёк. Совместный профиль удалён; личные аккаунты не затронуты.»; the joint archive button only when
  there is something in it. Notifications of a stopped / deleted couple are grey, tagged «Пара остановлена / удалена», and a deleted
  couple's notification no longer navigates.
- An archived couple chat shows revoked media as «Фото · один просмотр — Недоступно после разъединения пары» and has no
  comparison / access pills.

## Two people, one couple
- **Seen by the partner** (QA «Проверяемый участник: Партнёр») every caption names the other member: «Отправить alex_b»,
  «Изменения ждут alex_b», Q01 «Ждём согласия партнёра · alex_b». «Нужно решить» no longer shows Alex's personal decisions to the
  partner; the act-as personal card is the partner's own.
- **The approver can act.** «Мы → Видимость» shows «Kira предлагает изменения профиля и видимости · Посмотреть…» and the row says
  «Kira предлагает изменить — решение выше». «Нужно решить» names what changes (profile / visibility / both).
- **Review shows the difference in words**: one paragraph, added words highlighted, removed words struck through; approving confirms
  with a toast. The first switch of approval no longer says «снова».
- Access request cards count matches for the profile the request is addressed to, whatever the dock says.
- The dock «Люди» badge counts for the chosen profile on every screen (it used to change inside a couple chat).

## «Мы» speaks as «мы»
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

## Chats
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

## Notifications
- No «Alex и Kira ·» prefix (the «Паре» label says it); organiser updates and community notices carry «Тебе / Паре».
- Decision cards use one name format (name, age). Sharing with a couple: «Оба в паре «Eva и Tom» увидят …».

## Core / shared code touched (for the merge)
- `closeAuthorMenu` (ui) also resets `#side .mebtn[aria-expanded]`; the sidebar account button renders `aria-expanded` from the
  open popover (renderSide template) — CPL-011.
- `C.likesIn`, `C.newMatches` (dock counters) use `activeActor()` — CPL-008.
- CSS for `.main[data-screen="H02"]` composer and `.chat-down` position (in the couple CSS block) — CHAT-001/002.
- Small in-place edits outside the couple module: `meMineLayer` (one call), K01 account card (one call), `meJars18` and `linksBlock`
  empty states (CPL-022), `meVisLayer` (CPL-005/016), `ACT.meSwitchTo` (CPL-007), `actorCardsHTML`/`ACT.dockMe` (CPL-011/015),
  `SC.F10` empty state (CPL-003), `AUD()`, `MENTION_FROM`, E03/E06 copy, `accessSummary`, `linkReqCard`, QA `qaPair` invite guard.
- Contract: `node tests/prototype-v21-contract.mjs` → `PASS V20 rules in V21`; no assertion swapped.

## Not done
- CPL-011: closing the act-as popover by clicking the same sidebar button again (the popover is modal; Esc / click outside close it).
- CPL-023: the «Что у вас общего» block in «Как видят» stays (V10 contract: the real block with a demo note).
- NTF-003: «Eva и Tom» avatar shows letters because the members of that demo couple have no photos (data, not the component).
- Organiser questions in an application form («Был ли у тебя опыт…») are the organiser's own text and stay as written.

## Needs owner
- CPL-007: in a couple, should a tap on the dock «Я/Мы» open the profile right away (act-as sheet on a second tap / long press), or
  keep the V19 rule «the dock avatar opens «Действовать как»»? V21 keeps V19 and makes the already-chosen card open the profile.
