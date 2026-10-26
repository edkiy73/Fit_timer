# Merge of V20 #1277 (6456c009) into prototype-v21.html

`git apply --3way` left 31 conflict blocks. I re-ran the merge with `git merge-file --diff3` against the same base/ours/theirs stages, which split them into 37 sub-blocks. Each sub-block was then merged token by token and checked by hand. Lines that #1277 changed outside the conflicts applied cleanly. They are: the couple-chat seed `sender:'eva'` (item 25), `queueJointGrant` without the trusted bypass (owner decision), the jar list ignoring a filter when there is only one kind, the couple icon on the couple-name field (item 24), the photo slot count (item 27), «Нужно решить» putting the acting profile first (item 19), the search chips (item 26), and `giftTargets`/`giftPrice` plus «Получат оба» in the gift sheet. Commit: `5bdd45d6`.

| # | Where | V21 kept | #1277 kept | Result |
|---|---|---|---|---|
| 1 | CSS | the whole V21 CSS section | `.as-line`, `.ph-add.tall`, `.alb20 .alb b`, `.rsvp` wrap (items 22, 23, 27, 28) | both, with a #1277 comment |
| 2 | `cmpExplain` | PRF-011 `${you}` = «Вам/Тебе» | item 20, the same fix | V21 (the same fix, no duplicate `us`) |
| 3 | side column People/Groups | PPL-014 «пара ·» mark | `social().likesIn`, `isBlocked`, «Вам симпатизируют», «Сообщества пары» (items 15, 17) | merged |
| 4 | side column «Мои события» | ME-027 upcoming list, already has «События пары» | the same heading | V21 |
| 5 | age-check alert | SET-002 «Я → Настройки → Проверка возраста» | item 29 «Я → Настройки» | V21 (fuller path); comment names both |
| 6 | `savePost` toast | FEED-042 (`isSaved`, Undo in G04), FEED-019 path | item 29: «Мы → Моё → Сохранённое» for the couple | V21 code plus the couple path |
| 7 | `AUD()` audience lines | FEED-013/CPL-005 `AUD(author)` couple lines, ME-044 count | item 16, the same fix in other words | V21; comment says it equals item 16 |
| 8 | F07 topics foot | the couple topics hint already present (`r.author`) | the same text via `actionAuthor()` | V21 |
| 9 | F07 «Сохранить черновик» toast | FEED-019 toast with «Открыть» → F10 | item 29: «Мы → Моё → …» for the couple | V21 toast, couple/solo path by `r.author` |
| 10 | F10 header | `SC.F10.title(p)` (ME-028), FEED-003/006/041 | couple title | V21 (already couple-aware) |
| 11 | F10 empty state | FEED-007: own couple empty state with «Создать публикацию от пары» | item 14 empty state | V21 (fuller) |
| 12 | events shortcut | — | «События пары» title | merged |
| 13 | E03 attendance visibility | EVT-012/011 `us` texts | item 21 «Другие увидят пару …» | V21 code with the #1277 hint text |
| 14 | RSVP sheet | EVT-039 removed the unreachable sheet | item 22 couple text in that sheet | V21 (the sheet is gone; the event page has couple texts) |
| 15 | E05 application alert | CPL-025 couple text naming the couple | item 21 EN «interests» instead of «map» | V21 couple text plus the EN fix |
| 16 | E10 header | `SC.E10.title()`, EVT-008 drafts per profile | couple title | V21 |
| 17 | Likes tabs | CPL-004/005 `us` («Вам/Ваши») | item 17, the same fix | V21 |
| 18 | Likes empty state | the couple button «Дополнить профиль пары», PPL-014 couple pill | item 17 texts «Фото пары, интересы и публикации … вас» / «Фото, интересы и публикации … тебя» | V21 structure with the #1277 texts |
| 19 | «Интересы» block | ME-016 `emptyRow21`, ME-036 links, legend, X02 | item 28: «Только вы» chip; filter only when there are two kinds | both; the number moves back to the title when the filter is hidden |
| 20 | «Наша карточка в подборке» | already in V21 | item 11 | identical |
| 21 | «Мы → Приватное» | the V21 access list | owner decision: «Ждёт подтверждения» list of pending grants | added; partner name via `pairOther21()` |
| 22 | «Мы → Моё» rows | ME-028/046 couple wording, CPL-001 `pairEntry21` | item 14: drafts as a second line («Черновиков: N») | V21 plus the drafts subline |
| 23 | profile menu | — | owner decision: «Подарить Premium» also for a couple | merged |
| 24 | «Что у вас общего» head | `nameQ()` quoting of couple names | item 20: «Пара X · Y» / «Ты и Y» | #1277 shape with V21 `nameQ` (RU) |
| 25 | request card | NTF-001 summary per addressee, PPL-006, ME-024 «Уже открыто» | item 18, the same fix | V21 |
| 26 | P07 tabs | PRF-010/CPL-027 «Открыто парой / Паре открыли / Запросы пары» | item 12 «Открыто нами / нам / Наши запросы» | V21 (the same defect, fixed first; no owner decision) |
| 27 | P07 hint and title | PRF-009 link button to «Я/Мы → Приватное», CPL-027 «Доступы пары / Паре открыли» | item 13 path «Приватное» | V21 (already the right path and a link) |
| 28 | access summary | ME-025 «Я → Приватное» | owner decision: the trusted «партнёр увидит» bypass line removed | merged; only «сначала подтвердит партнёр» remains |
| 29 | `myComms` | COMM-003 `hostsAsActive` (`commAsCouple`), «Сообщества / Каталог» | item 15, the same filter | V21 |
| 30 | communities shortcut | — | «Сообщества пары» title | merged |
| 31 | C02 | V21's own `us` | couple title, empty state and section names | merged; duplicate `const us` removed |
| 32 | C08 | COMM-008 question and «Где» row | a select row in a card row with an icon | #1277 style for «Кто может вступить» (lock), and also for V21's «Где» (pin) |
| 33 | chat list | CHAT-005 ended row | item 25 «Eva: …» in the couple chat preview | merged |
| 34 | gift sheet terms | SET-013 priced cards | owner decision: price for two, «Цена за двоих», Premium note per partner, «Оба увидят …» | V21 cards with `giftPrice(pl,to)` plus all #1277 couple texts |
| 35 | gift sheet button | — | `giftPrice(...)` | merged |
| 36 | gift pay | SET-013 confirmation step (`giftPay` → `giftPayDo`) | gift to both partners, queued per partner, couple toast | merged; the confirmation also says «Получат оба: …», «за двоих» and pays `giftPrice` |
| 37 | «Моё подтверждение» sheet | — | owner decision: covers the profile and posts; the private part opens only together | merged |

No owner decision overrode a V21 fix here; V21 had no rule that conflicted with them. The changes were adding the pending-grants list, the gift for both partners at the price for two, and removing the trusted-partner bypass text.

## Contract swaps added (`tests/prototype-v21-contract.mjs`)

- The gift term is checked as priced cards (SET-013) instead of a select row. The check still looks for 23,98 € and «Цена за двоих».
- The gift is paid through the confirmation step (`giftPay` → `giftPayDo`). The check also confirms that the confirmation names both partners.
- The empty couple post list expects «У пары пока нет публикаций» (FEED-007). The check first clears the couple's demo posts, which V21 seeds (FEED-006).

## Verification

- `node tests/prototype-v20-contract.mjs` — exit 0.
- `node tests/prototype-v21-contract.mjs` — ends with `PASS V20 rules in V21`.
- `node --check` on the extracted script passes. There are no new duplicate top-level `function`/`const` names.
- `pw/v21/smoke.mjs` against http://localhost:8720/prototype-v21.html — `done, bad= 0`.
- `pw/v21/p0.mjs`:
  - CPL-001 opens Q01.
  - PRF-001: «Я» chats still has Mia: true.
  - FEED-002: «Я» votedBtns=0.
  - FEED-003 in F10: true.
  - FEED-001: Leon true, Noa false.
- `pw/v21/own1277.mjs` (the owner decisions on V21):
  - The gift sheet from «Я» and «Мы» says «Получат оба: Eva и Tom» with 23,98 € and «Цена за двоих». The confirmation names both and shows «Оплатить · 23,98 €». The toast says «оба партнёра … получат Premium». No JS errors.
  - A couple grant shows «сначала подтвердит партнёр» and the toast «отправлен партнёру на подтверждение». «Мы → Приватное» lists «Ждёт подтверждения — Vera · откроется, когда подтвердит Kira». «У кого доступ» stays empty.
