# FetUre V14 — changelog

V14 is a copy of V13 (`public/prototype-v13.html`, now frozen). The concept is "context before action": before acting, you see who acts, who will see the result and what follows. Notes for reviewers: `public/prototype-v14-notes.html`. Contract test: `tests/prototype-v14-contract.mjs`. It runs the whole V13 contract against V14, with only the V13 "author is an avatar" look replaced, and then the V14 checks.

The input was `public/prototype-v13-audit.html`, used as material for analysis rather than as a spec. Every decision was checked against our own browser pass of V13.

## 2026-10-23 — context before action

- **Author in words** (audit I01): `authorPicker(fixed, shown, variant)` renders a labelled pill.
  - The full variant (composer, profile) reads «Опубликовать как / От имени · Я · alex_b» or «Мы · Alex и Kira».
  - The short variant (headers, reply bars, Discover) reads «Я» or «Мы».
  - With no active couple there is still no picker.
  - The final CTA repeats the couple («Опубликовать от пары»).
  - `paintAuthor` keeps the variant, and switching the author keeps the draft, card and scroll.
- **Composer, text first** (I02):
  - Author and audience pills sit above the text, followed by one sentence on the consequence: audience, couple approval, media review.
  - The formatting toolbar appears below the text only while you write.
  - Attachments form one compact strip.
  - Topics are now «Темы публикации», showing 4 plus «Все», as opposed to «Мои интересы».
- **Profile, person before photo** (I03):
  - The hero is 5:4 with cover crop and opens full screen on tap. A couple or self without photos gets a compact plate.
  - The bio sits right under the name.
  - `socialContext()` shows the community they host, communities you share (visible members only, communities you belong to) and the next meetup they host.
  - The compatibility block is now a single row (`compatBlock(id,{compact:1})`).
- **Community → discussion → meetup** (I05, I06, I13):
  - The next meetup shows under the community description.
  - Tabs use natural widths and scroll instead of truncating (`tabStrip`).
  - Each discussion shows its last reply.
  - Catalog and side cards show `commPulse()` («обсуждали 5 ч назад · встреча 26 окт»).
  - Desktop side event titles get 2 lines.
- **Dating filters** (I04):
  - «Где искать», «Кого показывать» and «Возраст» come first.
  - The vocabulary groups are rows with a selection summary, and each opens the existing searchable sub-sheet.
  - The footer shows the active summary and «Показать · N».
  - An empty result names the filter that narrows most (`dfWhyEmpty`).
- **Compatibility in words** (I11):
  - The headline is «Темы для разговора».
  - Each group has a one-line meaning (`CMP_MEANS`) and each row an explanation (`cmpExplain`).
  - A consent note and an explanation of the 1–10 numbers were added. Still no single percentage.
- **Access summary** (T14):
  - `accessSummary()` appears in the grant and change sheets: who, what, until when, what stays closed, no chat or like, revoke and its limits, and couple approval.
  - The grant CTA names the term.
  - The change sheet has «Отозвать полностью», and an empty selection turns into revoke with confirmation.
- **Photo-mark consent** (I08):
  - A mark can only be allowed from `tagReview`, which shows the photo(s), text, audience and consequences.
  - «Против» stays one step.
- **Chat** (I14): expired one-time or timed media collapse to one line.
- **First promise** (I12): the welcome says «Свой круг. Свои границы.», and the community slide comes first.
- **Premium** (I09):
  - «Бесплатно для всех» block.
  - Explicit charge, renewal and after-cancel terms. The business model is unchanged.
- **Fix**: `CMP_GROUPS` and `ROLE_W` were evaluated at load, so EN showed Russian group headings and roles. They are now built per call.

Verified with Chromium:
- 340 states (17 screens × 5 widths × 2 themes × RU/EN), plus long text and hostile input: no JS errors and no page overflow.
- All 600 QA-panel transitions across 3 personas × RU/EN.
- 22 click-through flows.

Not verified: real devices, screen readers, 200% zoom, live multi-client couples, user testing.
