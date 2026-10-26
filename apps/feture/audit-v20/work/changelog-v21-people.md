# V21 — People, other people's profiles, access (section `people`)

Branch `v21/people` (3 commits). All 46 V20 audit findings: 45 fixed, 1 already fixed by the lead's V21 base (PRF-006). Screens: `audit-v20/screens/v21/people/`.

## Blocks belong to the profile that made them
- **A block only affects the profile that made it (PRF-001, P0).** Blocking as «Мы» ends only the couple's likes, match, chat, follows, requests and links with that person. Your personal chat, follow and match stay, and the reverse is also true. The confirmation text names the same profile. «И для пары / И для меня» in «Заблокированные» now also ends the other profile's ties. The partner gets a notification only when the couple blocks someone.
- Unblocking as «Мы» says «Mia снова увидит профиль пары «Alex и Kira»…» (PRF-022). A blocked profile's tab title is «Недоступно», not the person's name (PRF-023).

## Follows as «Мы»
- Follows made as the couple are counted: in followers, in following, and in «Моё» of the couple (PRF-002). Couples show both numbers, followers and following (PRF-029).
- In someone's follower list as «Мы»: «это вы» marks only the acting profile, and your personal profile reads «твой личный профиль». The buttons say «Подписаться от пары / Отписать пару» (PRF-021).
- The follow button on a Discover card redraws like the one on the profile: the check mark, «от пары» and the counter all update (PPL-003).

## Discover (D03/D04/D09)
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

## Shared interests: one number, one word
- The photo label, the circle, the «Есть темы для разговора» block, «Это взаимно» and P05 all say «N общих тем: в X совпадаете, в Y дополняете друг друга» (PPL-005).
- Another couple's name next to another name is quoted, and its verb is plural: «Ты и «Lena и Max»…», «если «Nika и Jonas» ответят…» (PPL-006).
- As «Мы» the comparison speaks for the couple: «Вам ближе давать…», «У вас это табу» (PRF-011).
- P05 with too little data no longer shows a comparison. The header says «Пока одна общая тема · Игрушки» (PRF-027).

## Other people's profiles (P01/P08)
- Photo taps work over the whole photo: left, right and centre. The follower links still work (PRF-004). On phones the header photo is portrait 4:5 and keeps faces in frame. Desktop is unchanged (PRF-005).
- Past the photo the back and ⋯ buttons sit on a solid bar with a mini avatar and the name. P08 lands below it (PRF-007).
- A couple without a photo: the split avatar sits above the name, never under it (PRF-012).
- Liking a couple while your dating is off shows a note with a «Включить знакомства» link (Я → Видимость) instead of a dead button. The dead «Знакомства» toast button that led to the missing D02 is gone (PRF-003).
- The action buttons come right under the description, with the context lines after them. «и ещё 1» doesn't wrap (PRF-020). Seed bios no longer say «Тестовый профиль» (PRF-024).
- Galleries have no repeated pictures. Long album names wrap to two lines, and followers-only albums are marked for visitors too (PRF-028).
- Private parts of seed profiles contain only pictures that are not public (PRF-008).

## «⋯» menu, links
- «Скопировать ссылку» closes the menu (PRF-014). «Указать связь» looks unavailable when the person doesn't accept links, and a tap still explains why (PRF-015).
- Your own link on someone's profile reads «alex_b · ты» («· вы» for the couple) (PRF-025). QA link answers now also reach requests sent as «Мы» (PRF-026).

## Access (P07, grant sheet)
- The P07 footnote reads «Запросы к тебе / к вам и кто может просить доступ — в «Я → Приватное»» and is a link there (PRF-009).
- The tabs «Открыто мной / Мне открыли / Мои запросы» fit 320 px, and «10 из 10» doesn't wrap. The QA entry «ко мне» is now «открыто мной» (PRF-010).
- An expired request has «Запросить снова». Ari and Leon have private parts, so the veils «Прежний доступ закончился» and «Решили не открывать · через N дн.» can be seen (PRF-018).
- Access types are always listed in the order description, interests, photos, video (PRF-016). The veil says «Отменить запрос» (PRF-017).
- The grant sheet: «Kai просит доступ», «Просит: описание, фото», unrequested items are marked «не запрошено», and there is an «Отказать» button (PRF-019).

## QA
- QA «Это взаимно» as a couple no longer matches the couple with its own partner (PRF-030).

## Core changes (for the lead's merge review)
- `drawSheet` (ui.js) has two new optional sheet fields. `backAct` renders a working «back» button in the header, because the sanitised `lead` strips buttons; the old `dfBack`/`fBack` lead arrows were dead in V20 too. `aria` gives a header-less sheet its aria-label.
- `TABDEF` (ui.js): «Люди» is always in the dock (PPL-008).
- The desktop side rail «Тебе симпатизируют» adds «пара · » (PPL-014).
- `cleanScopes` (data.js) returns a fixed order (PRF-016). Seed `PEOPLE`: privText for ari/leon (PRF-018) and six bios (PRF-024).
- `paywall` (Premium sheet): `aria`, ✕ position via CSS, pill text (PPL-011/016).
- QA (`qaV13`/`qaApproveAll`, `QA_RUN.match`, QA_LIST P07 entry).
- Contract `tests/prototype-v21-contract.mjs`: a `deepSwaps` hook patches the V13 contract as it is read, with 2 swaps. The V13 doBlock-from-«Я» rule now blocks as «Мы» (PRF-001). Q01 expects `pairVisOpen` instead of `pairDating` (PPL-009). `ACT.pairDating` still exists and is still tested. Result: `PASS V20 rules in V21`.

## Not done
- PRF-006: nothing to do. The lead's `.seg.scroll` already gives full tab labels.
- Mia's private part now has 2 unique pictures. The seed image pool is small and her gallery uses most of it.

## Needs owner
- None.
