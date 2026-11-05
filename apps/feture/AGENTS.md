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
| Notifications, tasks, push, email — rules (owner, 03.11.2026) | `docs/notifications.md` |

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
9. Всё, что прижато к верху экрана, учитывает --safe-t (проверяет check:safe-top).
10. Расстояние между полями формы одно везде — 16px, его задаёт только общий стиль `.field`. Новых обёрток с собственным отступом не заводим; после правки формы расстояния замеряются в браузере (между соседними полями ровно 16px).

## Server (owner, 28.10.2026)

Every command follows `server/README.md`: contract in `contracts/<area>.mjs` → handler in `server/commands/<area>.mjs`
→ test in `tests/fe-<area>-postgres.mjs`, with the shared helpers listed there (never a copy).
`npm run check:server` fails on a contract without a handler, a handler without a contract, an action no test calls
or a helper defined twice (`tools/fe-server-baseline.json` only shrinks). Text input rules:
`docs/input-safety-backend-checklist.md`.

## Test data only until launch (owner, 05.11.2026)
Production holds **only test accounts** until the public launch. Do not spend effort on keeping old data, old behaviour or
compatibility for couples/profiles that exist now: a migration may reshape or reset them, and a rule may change without
a data-preserving path. This stops being true on the day the owner announces the launch; from then on migrations must
keep real users' data. Until then do not mention «existing couples» as a risk in a plan.

## Legal documents follow the product (owner, 06.11.2026)
The published documents (`DOCUMENT_KEYS` in `contracts/staff.mjs`: terms, privacy, community, adult-content, complaints, age, retention, cookies, copyright) say what the product does. A change that makes one of them untrue or incomplete **updates that document in the same PR** (in parts: add or change only the paragraph that is affected). Ask yourself before you finish:
- **Credits and licences** (a dataset, a picture, an icon set, a font, a library that wants a notice, a map): what the licence asks for goes into «copyright» — source, author, licence and link, and the exact wording the licence requires. A licence that forbids our use (non-commercial, no derivatives, a share-alike we cannot meet): stop and ask the owner.
- **New personal data, or an old one used for a new purpose** (location, photos, documents, selfies, contacts, device data, logs): «privacy» (what, why, who sees it) and «retention» (how long it is kept and when it is deleted).
- **A new outside service that receives our data** (mail, push, storage, CDN, payments, analytics, maps, geocoding, an AI model): «privacy» names it as a recipient, in the same words as the service's own role.
- **Anything kept on the device or in the browser, tracking, analytics:** «cookies».
- **A new place where people publish or write to each other, a new kind of content, a new rule of what may be posted:** «community»; explicit or adult material: «adult-content»; how a report, a removal or an appeal works: «complaints».
- **Age, identity or photo checks:** «age».
- **Money, Premium, a trial, a refund, a change of what is free:** «terms».
- **Something we promise** in a screen text («удаляется через 30 дней», «видят только вы», «мы не храним») must be true and match the documents; if it is not, change the code or the text.
In the PR description name the documents you changed, or write «documents: no change» with the reason. Documents are saved and published by an owner or a lead (`staff.documentSave` → `staff.documentPublish`; the `qa-mod-lead` account can). The lawyer completes them before the launch; until then they carry at least what the licences and the real behaviour require. Sources credited so far: **GeoNames** (cities; CC BY 4.0).

## Product decisions in force

- **Discover starts off** (28.10.2026). New accounts and couples have `discover_mode = 'off'`. Turning Discover on
  without a profile photo asks for one and opens the uploader; the card appears after the photo is approved. Discovery
  stays reciprocal and server-enforced; 18+ and consent rules stay.
- **Checks waiver** (05.11.2026). Nobody reviews their own checks or media, **no exception — the owner included** (no
  `ownerSelf` in checks or the media queue). The owner is instead freed from the manual checks (age, photo, human media
  review); for any other account the owner switches it on and off in the staff area «Команда → Без проверок»
  (`staff.checksWaiver`, journalled). It belongs to the **account**, never to a couple: each partner counts by their own
  account, so a freed partner covers nobody. Always on for everyone, waived or not: the automatic scan (CSAM), reports,
  blocks, measures, and the rule that explicit media never goes to a public place. One place decides it:
  `feture.checks_waived()` / `feture.age_ok()` / `feture.photo_verified()` (migration `20261105600000`) and
  `server/media/scan.mjs`. Premium to oneself and the owner's own second-factor reset stay with the owner (`ownerSelf`).
- **Personas are hidden** (28.10.2026). Whatever a persona account (`qa-…` login) creates never reaches people who are
  not personas (`feture.qa_hidden()`); personas see each other so scenarios keep working.
- **APK updates are required before launch.** Every APK build is published in-app as a required update
  (`minimumCode = latestCode`), otherwise phones never see it. The server does it itself: the jobs tick runs
  `lib/app-update.js` `publishLatestBuild` (GitHub looked at every ≤5 min, newer build only, archive APK must answer
  200, same `saveChannel` path as `feture.update.publish`); `FETURE_AUTO_PUBLISH_APK=0` stops it. No admin button needed.
  Before real users, switch to a soft banner except for breaking changes. Signing keys come only from the
  `FETURE_KEYSTORE_*` secrets; agents never create or read keys.
- **Name and @nick** (29.10.2026). Every profile — person and couple — has a unique @nick (latin, the old rules) and an
  optional name («Как тебя называть», any name, «Можно не настоящее»); without a name the nick is shown, a couple
  without one shows «Имя и Имя» of the partners. `profile.name` is what everyone sees (kept by triggers from
  `chosen_name`, `handle` and the partners); writes go to `chosen_name`. Limits on the server: a nick once per 6 months,
  the first change after sign-up (or after a couple forms) free; a name once per 2 weeks, the first fill and one
  correction free; refusals carry `until`. A couple's nick is suggested from both nicks (`anya_max`) and can be changed
  once for free in the profile editor; couples take @mentions like people. Feed, comments, chats, notifications and
  likes show the name only; the grey @nick (kit `PersonName nick` / `Who`) only in the profile header, search,
  @mention suggestions, the pair invite and follow lists.
- **No couple set-up step** (04.11.2026). Accepting an invitation or a link forms the couple at once with defaults:
  nick from both nicks, no name, nobody's approval needed, anyone may ask for access, Discover off. Both partners then
  see «Пара создана» (what is on, «Перейти в настройки пары», «Готово»); everything changes in the pair settings.
- **«Обо мне» facts are always visible to everyone** (29.10.2026): no per-fact audience; on a person's profile they
  sit under the bio and under the main buttons (Нравится / Подписаться / Написать).
- **«Я» uses the same header as every tab** (29.10.2026): kit `Bar` with `lead` (avatar), `sub` and `onTitle`.
- Media is reviewed before it is shown: `uploaded → scanning → needs_review → approved / rejected / blocked`.
  Staff roles: owner, lead, moderator, verifier, support, auditor — checked on the server only.
- **The owner may do everything, to others and to themselves** (04.11.2026): Premium, own age and photo checks, own
  media review, own roles, own second-factor reset (`ownerSelf` in `server/commands/staff.mjs`). Every action is still
  journaled. Lower roles keep their limits, including never acting on themselves.

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
