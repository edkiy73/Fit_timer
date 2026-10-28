# FetUre design system (kit)

Owner rule, 28.10.2026: every screen is built **only** from this kit and its tokens. No screen draws its own
sheet, dialog, tab bar, list row, chip, notice, button, input, select or switch, and no screen writes its own colour,
font, size, spacing or radius. `npm run check:kit` (part of `npm run check`, so CI) enforces it: per file, the number
of hand-written pieces may only go down (`tools/fe-kit-baseline.json`). After moving a screen onto the kit, run
`node tools/check-fe-kit.mjs --update`.

## Storybook

Every kit component has a story (`src/fe/kit/*.stories.tsx`): description, Controls, all states, code; tokens
under «Основа». Local: `npm run storybook`; published with the app at **/kit/** (https://feture-mvp.vercel.app/kit/).
A new component or variant ships with its story in the same PR.

## Tokens (`base.css` top block + `tokens.css` — ours; the V21 prototype was only the starting point)

- Colour: `--bg --bg2 --surf --raise --ink --mute --faint --line --line2 --accent --accent-soft --accent-ink --ok
  --ok-soft --warn --warn-soft --danger --danger-soft --violet --mint --lilac --scrim --shadow --shadow-s`
- Type: `--font` (body), Geologica headings via `h1/h2/h3`; sizes come from the components, not from screens.
- Radius: `--r-s --r --r-l --r-xl`. Safe areas: `--safe-t --safe-b`. Dock: `--dock`.
- A missing value is added to the kit (a class or a token), never written inline in a screen.

## Components (`import {…} from './kit'`)

| Need | Use |
|---|---|
| Screen header | `Bar` (title, back, actions) / `SubBar` (+ second line) |
| Body | `View`, `Group` (titled section with action and footnote) |
| Buttons | `Btn` (primary / soft / text / danger; `busy` blinks, never spins), `IconBtn` (round, label required) |
| Tabs | `Seg` — the only tab control: counts, dots, scrolls at 5+ |
| Lists | `Row` (icon/avatar, title, sub, value, badge, chevron), `ToggleRow`, `SelectRow` |
| Choice pills | `Chip`, `Chips` |
| One from a list as rows | `RadioList` (rows carry their own frame: never put it in a `Card`; a line under a row's title explains it) |
| Several from a list as rows | `CheckList` (a box per row, a line under the title: «не запрошено», «уже открыто») |
| Text fields | `Field` (label + error) around `Input`, `TextArea`, `SearchInput`, `Select`; files via `FilePick` |
| Overlays | `Sheet` (bottom sheet; `dirty` — unsaved choices: ✕ / scrim / Esc ask «Закрыть без сохранения?»), `Ask` (confirmation), `Layer` (portal for custom overlays inside the kit only) |
| Feedback | `Alert` (ok / err / warn / info in the flow), `useToast` (transient, with «Отменить»), `Empty`, `Skel` |
| People | `Av` |
| Verification shot | `CaptureFrame` (face oval / document frame, hint, the taken shot whole; tokens `--cam-*`) |
| Spacing | `Stack` (gap, row, align, justify), `Spacer` (room between blocks outside a Stack), `Divider` |
| Video (`kit/av.tsx`, «Медиа/Видео и голос») | `VideoPlayer` (poster + play + length, plays in place without download; `fill` + `autoPlay` in a viewer), `VideoBadge` (▶ + length over a poster in grids and tiles); viewer slides take clips (`PhotoTrack` `Slide`); `Uploader` `sendVideo` takes clips (≤ 1 min, ≤ 100 MB, poster cut on the device, no crop) |
| Voice messages | `VoiceRecorder` (mic button: hold, slide left to cancel, up to lock; tap = hands-free with listen-before-send; ≤ 5 min; asks for the microphone only on press), `VoiceBubble` (play / pause, waveform progress and seek, time, «Прослушано» / unheard dot) |

Round 4 variants: `Btn kind="dark"` (on a light veil) and `square` (icon-only, button height); `Row` `body` (a plain
step line), `extra` (content under the title as is), `expanded` (chevron down for a row that opens a section), title
optional; `Chip inactive` (looks normal, not reachable — its group is dimmed); `Alert` `action` (buttons under the
text), `onClick` (the whole notice opens something), `role="alertdialog"` (an inline question); `Text bold` /
`breakAll`; `Empty big` / `top` / `after`; `Skel kind="fill"` (fills a cover) / `"event"`; `CodeInput` `disabled`,
`onComplete`, `onEnter`, `digitLabel` (the app's `.code` look); `RangeDual labels`; `Note as="ul"`.
Token added: `--fs-xl` (24).

## Domain components (`kit/domain.tsx`, Storybook «Домен»)

Product pieces that repeat or carry their own look. Screens use these, never the markup.

| Need | Use |
|---|---|
| Header over a cover / of a chat | `CoverBar` (glass buttons, title shows on scroll), `PersonBar` (‹, avatar + name + line, opens the profile) |
| Event | `EventTile` (`eventCard()`: card / `row` / still preview), `EventHero` (cover, glass labels, title, status), `Rsvp` («Интересно / Иду / Не иду»), `Announcement` |
| Community | `CommunityHead` (cover, picture, name, meta; loading shape), `Discussion` (row with pinned mark and host ⋯), `Veil` (closed content under glass), `StatusCard` (my join request / event application as one block: icon, state, line, «Отозвать» at the end; tones wait / ok / bad) |
| Create | `Swatches` (cover colour plates) |
| Interests | `AnswerScale` (1–10 with «обсудить» / «граница» marks) |
| People | `PersonName` (name on a photo card), `PersonLine` + `RequestCard` + `Answer` (requests and applications), `LikeTile`, `Radar`, `Soon` («Скоро»: a feature not open yet — art, label, title, points, buttons), `Typing` («печатает…» under chat messages) |
| Gallery | `AlbumRow` + `AlbumCard` (cover / mosaic / icon, open, followers lock), `AlbumMeta`, `GalleryGrid` + `GalleryTile` (count, followers, review; selection `selected`, cover `picked`) + `GalleryAdd`, `SelectionBar` (pinned count + actions) |
| Photos and checks | `PhotoSlots` / `PhotoSlot` / `PhotoAdd` (profile photo grid, drag to reorder, `loading`), `PhotoTrack` (viewer strip; `wm` puts the viewer's handle on someone else's private photos), `Watermark`, `Pose` (the gesture to show; the shot itself is `CaptureFrame`) |
| Private layer | `VaultHead` (lock, title, switch), `Quota` (requests left today as segments) |
| Couple | `ActorCards` + `ActorCard` («Действовать как»: pick the profile, open it, a dot when something waits), `ReviewMeta` (who proposed, version), `ReviewPost` (what a joint change publishes), `ReturnNote` (the partner's «на доработку» comment) |
| Staff review | `ReviewCard`, `KeyValues`, `ReviewMedia`, `ReviewPair` |
| Account (`kit/account.tsx`, «Домен/Аккаунт») | `PremiumHero` (crown plate; `onClose` for the paywall sheet), `PremiumFeats` (what Premium gives, `current` marked), `PlanCards` (plans / gift terms, one chosen, corner badge), `Maintenance` (the whole «Технические работы» screen), `Thread` (a support conversation: mine right, support left) |
| Feed (`kit/feed.tsx`, «Домен/Лента») | `RichArea` (text + formatting bar: bold, italic, list, quote, link with an address check; Markdown out), `LikesLine` («Нравится: …»), `ActivityCard` + `ActivityItem` («Подписки» activity, folds), `QuickStart` (create sheet tiles), `ActionLine` (quiet line + one action) |

Loading is a soft blink in place (`Skel`, `busy`), never a spinner. Icons come only from `lucide-react`.

## When the prototype disagrees with itself

Do not copy the inconsistency. Ask the owner which variant becomes the kit's (example: tabs — four looks in V21, the
owner chose one plaque, 27.10.2026).
