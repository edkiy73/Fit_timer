# FetUre — rules for people and agents

**Scope:** `apps/feture/**`. These rules add to the root `AGENTS.md` and win for FetUre. They are owner decisions;
change them only when the owner says so, and then edit this file in the same PR.

FetUre is an 18+ community app: profiles, interests, posts with photo/video, communities, events, Discover, a private
part opened by access, chats. Pre-launch: no real users yet.

## Where things are

| What | Where |
|---|---|
| The app (all user screens) | `src/fe/*` on route `/n/*`; components only from `src/fe/kit` (`src/fe/kit/README.md`, Storybook at `/kit/`) |
| Staff | `/admin` (AppBase admin + FetUre sections in `src/feture/*-admin.tsx`), `/operator` (personal staff workspace), `/n/staff` |
| Server | `api/fe.mjs` → `server/` (recipe: `server/README.md`), contracts in `contracts/`, SQL in `supabase/migrations/`; design notes `docs/server/` |
| Earlier backend still used by admin sections | `api/domain.js`, `api/admin.js`, `lib/feture/*` |
| Scenarios (e2e) | `e2e/` (`e2e/README.md`), test world: `docs/test-world.md` |
| Android | `android/`, release: `docs/android-release.md` |
| Infrastructure decisions (payments, 18+, moderation, stores, servers, law, security) | `docs/infra/README.md` |
| Moderator test accounts | `docs/moderators.md` |
| V21 prototype (frozen reference for comparison only) | `docs/v21/prototype-v21.html` (+ `CHANGELOG.md`, `PLATFORM-DECISIONS.md`) |
| Open questions to the owner | `docs/QUESTIONS.md` (create when needed) |

Old plans, audits and prototypes V5–V20 were removed on 29.10.2026; git history has them. Do not restore them.

## Интерфейс (owner, 28–29.10.2026)

1. **Only the kit.** Every screen uses only `src/fe/kit` components, its tokens (`kit/base.css` top block +
   `kit/tokens.css`) and the layout grid. A screen never writes its own sheet, dialog, tabs, row, chip, notice,
   button, input, heading, inline style, stylesheet, colour, font, size, spacing or radius. A pattern the kit lacks is
   **added to the kit first** — component (or variant/state) + tokens + Storybook story with its states + a line in
   `kit/README.md` — and only then used. Never a local copy «for now». `npm run check:kit` ratchets hand-written
   pieces per file (`tools/fe-kit-baseline.json`, only goes down; `node tools/check-fe-kit.mjs --update` after cuts).
2. **Одно действие — один компонент.** UI with the same meaning is one shared component; a variant is a **prop**,
   never a copy: composer row (`Composer`, `src/fe/create-entry.tsx`), «Создать» sheet (`CreateSheet`), editor
   (`ComposeScreen`), report (`ReportSheet`), add card (`AddCard`), empty state (`Empty`), link copy (`useCopyLink`,
   `src/fe/share.tsx`), follow (`FollowButton`, `src/fe/follow.tsx`), like, avatar (`Av`/`ActingAv`), media grid,
   viewer, uploader, paging (`LoadMore`), pull-to-refresh, confirm (`Ask`), toasts (`useToast`), button rows
   (`Actions`). Layout grid: `--gut`, `--page-max`, `--block-gap`. Look for the existing one before writing UI;
   `check:kit` fails on known copies outside their home (`ONE` in `tools/check-fe-kit.mjs`).
3. **Review gate.** Every UI change is checked by screenshots at phone 360–390, tablet 768 and desktop 1280+, in light
   and dark, before merge. The PR lists the kit components used and added.
4. **No legacy exceptions.** A screen that breaks these rules is fixed when found.
5. **Copy:** plain human Russian, short. Hints at most two lines and only where needed. No «демо», «тестовые данные»,
   «в разработке» in the UI.
6. **No author picker.** Editors and reply boxes never get a «я / мы» picker. The acting profile changes only via
   «Действовать как»; screens reflect it through the avatar, button text («Ответить от пары») and placeholders.
7. Icons only from Lucide (`lucide-react`). Loading = skeletons or a soft blink in place, never a spinner next to text.
8. When the V21 prototype disagrees with itself, ask the owner which look the kit keeps; don't copy inconsistencies.

## Server (owner, 28.10.2026)

Every command follows `server/README.md`: contract in `contracts/<area>.mjs` → handler in `server/commands/<area>.mjs`
→ test in `tests/fe-<area>-postgres.mjs`, with the shared helpers listed there (never a copy).
`npm run check:server` fails on a contract without a handler, a handler without a contract, an action no test calls
or a helper defined twice (`tools/fe-server-baseline.json` only shrinks). Text input rules:
`docs/input-safety-backend-checklist.md`.

## Product decisions in force

- **Discover starts off** (28.10.2026). New accounts and couples have `discover_mode = 'off'`. Turning Discover on
  without a profile photo asks for one and opens the uploader; the card appears after the photo is approved. Discovery
  stays reciprocal and server-enforced; 18+ and consent rules stay.
- **Personas are hidden** (28.10.2026). Whatever a persona account (`qa-…` login) creates never reaches people who are
  not personas (`feture.qa_hidden()`); personas see each other so scenarios keep working.
- **APK updates are required before launch.** Every APK build is published in-app as a required update
  (`POST /api/admin {action:'feture.update.publish', …, minimumCode = latestCode}`), otherwise phones never see it.
  Before real users, switch to a soft banner except for breaking changes. Signing keys come only from the
  `FETURE_KEYSTORE_*` secrets; agents never create or read keys.
- **Name and @nick** (29.10.2026). Every profile — person and couple — has a unique @nick (latin, the old rules) and an
  optional name («Как тебя называть», any name, «Можно не настоящее»); without a name the nick is shown, a couple
  without one shows «Имя и Имя» of the partners. `profile.name` is what everyone sees (kept by triggers from
  `chosen_name`, `handle` and the partners); writes go to `chosen_name`. Limits on the server: a nick once per 6 months,
  the first change after sign-up (or after a couple forms) free; a name once per 2 weeks, the first fill and one
  correction free; refusals carry `until`. A couple's nick is suggested from both nicks (`anya_max`) and can be changed
  in the setup right after it forms; couples take @mentions like people. Feed, comments, chats, notifications and
  likes show the name only; the grey @nick (kit `PersonName nick` / `Who`) only in the profile header, search,
  @mention suggestions, the pair invite and follow lists.
- Media is reviewed before it is shown: `uploaded → scanning → needs_review → approved / rejected / blocked`.
  Staff roles: owner, lead, moderator, verifier, support, auditor — checked on the server only.

## Privacy and security invariants

- Private by default; `private / granted / public` is enforced on the server. No CSS-only gates.
- User text is hostile: React escaping only (never `innerHTML` / `dangerouslySetInnerHTML`), validate on the server.
- No service-role key or admin key in the bundle. Secrets live in Vercel/GitHub settings; agents never print, store
  or ask for them in chat (the admin key for scripts is read from `~/.config/feture/admin.env`, never shown).
- Hard limits are boundaries, not percentages; never show someone's limits as attraction or leak private data.
- Account switching and deletion never expose one person's data to another.
- FetUre shares the FitT Supabase project (schema `feture`): never touch other products' data.
- Until the owner declares a launch, FetUre test data and schemas may be reset; no compatibility shims for old
  prototype data. After launch: versioned migrations, backups, retention and erasure guarantees.

## Checks and scenarios

- `npm run check` (CI) = kit and server ratchets, catalogue, typecheck, smoke, unit, security, Postgres tests, build.
- Every changed screen gets scripted scenarios (tap → choose → submit → read back via API) in `e2e/scenarios/`, run
  with `e2e/run.mjs` on a local build. Each scenario names a **persona** (`new`, `basic`, `full`, `pair`, …) and runs
  in its own lane (`E2E_LANE`), so agents never share accounts or limits. A missing account state is added to
  `e2e/personas.mjs`; other actors are personas of the same lane (`t.persona(kind)`); seed people are read-only.
  Scenarios clean up after themselves. Never run local scenarios while a prod suite runs (shared rate limits).
- New automated tests are for logic that matters (auth, permissions, private data, deletion, billing, migrations), not
  for pixels.

## Workflow

- The owner can't use a terminal and has authorised all FetUre work: agents create PRs and **merge them themselves**
  after `check` and Vercel CI pass, then verify on prod. Review the diff first. The owner may say «только проверь» or
  hold a PR — honour it.
- Ask the owner only real product/policy/legal/payment choices. Batch questions into **one file
  `docs/QUESTIONS.md`**; delete a question once it is answered (and record the decision here if it is a rule).
- **Keep the repo small.** No per-iteration plans, audits, handoffs or status logs in the repo. A temporary file is
  deleted when its work is done; finished things are not kept around. Decisions go into this file, infra into
  `docs/infra/`.
- One merged chunk after checks rather than a chain of tiny commits (fewer Vercel deploys).
- Never claim something works (payments, moderation, APK, iOS) without checking it.
