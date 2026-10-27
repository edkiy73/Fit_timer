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
| Text fields | `Field` (label + error) around `Input`, `TextArea`, `SearchInput`, `Select`; files via `FilePick` |
| Overlays | `Sheet` (bottom sheet), `Ask` (confirmation), `Layer` (portal for custom overlays inside the kit only) |
| Feedback | `Alert` (ok / err / warn / info in the flow), `useToast` (transient, with «Отменить»), `Empty`, `Skel` |
| People | `Av` |
| Verification shot | `CaptureFrame` (face oval / document frame, hint, the taken shot whole; tokens `--cam-*`) |

Loading is a soft blink in place (`Skel`, `busy`), never a spinner. Icons come only from `lucide-react`.

## When the prototype disagrees with itself

Do not copy the inconsistency. Ask the owner which variant becomes the kit's (example: tabs — four looks in V21, the
owner chose one plaque, 27.10.2026).
