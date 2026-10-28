# FetUre e2e — scenarios with personas

Interaction scenarios for the app: they tap what a person taps and read the result back from the server. They run
against a local build (`vite preview`) with `/api` proxied to production — there is no staging yet — so run files
one at a time (the production rate limit is shared).

## Layout

    e2e/lib.mjs            API access, sign-in (admin test code), the session cache (~/.cache/feture-e2e/sessions.json or E2E_SESSIONS, shared by every worktree and process)
    e2e/personas.mjs       account states, built through app commands
    e2e/run.mjs            runs one scenario file
    e2e/run-all.sh         runs every file in order and prints a summary
    e2e/perf.mjs           load timings on an emulated phone (CPU ×4, fast 4G): cold start, reload, tab switches,
                           a post, a profile — content / settled times, late changes, /api/fe calls with server time
    e2e/fixtures/          photo.jpg, cover.png
    e2e/seed-world.mjs     the owner's «test world» on production (world-*@feture.test, docs/test-world.md) —
                           look-only content like seed people: scenarios never use these accounts as actors
    e2e/world-media.json   its people-free CC0 / public-domain pictures (source page + license)
    e2e/scenarios/helpers.mjs   shared helpers (until, pinned, toastSee, askAccess, uploaderDone, outOf, …)
    e2e/scenarios/<area>/  feed, me, chats (with the inbox), communities (with events), people,
                           account (start, sign-up, onboarding, settings, lists, age document, staff)

## Personas (owner rule, 28.10.2026)

Persona accounts (`qa-…@feture.test`) are marked `feture.account.qa` when created. Everything they make or do —
profiles, posts, discussions, replies, likes, follows, events, communities, activity, notifications — is hidden from
everyone else (the owner's and the test world's lists stay clean; `feture.qa_hidden` inside `feture.blocked`,
20261028240000_fe_qa_hidden.sql). qa viewers still see everything, so a scenario never needs a non-persona to see
persona content.

A scenario never uses a shared account (test1/test2/seed-*). It names a **persona** — a known account state — and
the runner signs in as that persona **of your lane** (`E2E_LANE`, one per agent/area, 1–8 letters), so runs never log
each other out or eat each other's daily limits. Other actors of a scenario (someone who asks, invites, applies,
reports) are personas too: `await t.persona('asker')` returns the persona object of the same lane. Seed people and
content may only be looked at, never used as actors. `e2e/personas.mjs` builds everything through the app's own
commands; a second call only adds what is missing.

| persona | state | used for |
|---|---|---|
| `new` | signed in, no FetUre account yet — **fresh each call** | registration screens |
| `temp` | registered, hidden, nothing else — **fresh each call** | someone whose «no» starts a cooldown (couple invite), staff decisions |
| `owner` | `temp` + a private part open to requests — **fresh each call** | declining an access request (30-day cooldown per pair) |
| `basic` | registered, onboarding done, hidden from Discover, no photo, no interests | empty states; a joiner, a link target, a chat partner |
| `stranger` | like `basic` | short-lived contacts: a match that is ended, a block that is undone, a post author, a joiner |
| `inviter`, `invitee` | like `basic`, free of couples between runs | the couple flow |
| `full` | visible in Discover, approved photo, age verified, public interests, a private text | the main actor of most screens |
| `asker` (`asker2`, `asker3`) | a `full` person | asks others for their private part (20 a day; the next one takes over) |
| `mate` | a `full` person | talks with `chats` (both age verified: timer / once photos), proposes links, follows |
| `chats` | a `full` person with conversations with `mate`, `asker`, `basic` (messages both ways); `.with.<kind>.conversationId` | chat list and conversation |
| `host` | a `full` person owning a published open community (`openId`), a published closed one with a join question (`closedId`), a closed one without a question (`closedNoQId`), a hidden one (`hiddenId`, reached by an invite link), a published open offline event (`eventId`), one with tickets on the organizer’s site (`ticketEventId`), an online event by application (`appEventId`) and a cancelled one (`cancelledEventId`) — approved by STAFF | community owner screens, the inbox with decisions, every way of joining (`communities/joins.mjs`, `event-joins.mjs`, lane `jn`) |
| `pair` | two `full` people (`pa`, `pb`) in an active couple (`partner`, `coupleId`) | couple screens |
| `staff` | the shared qa moderator (`qa-staff@feture.test`) | staff screens and review steps only |

Cooldowns decide which persona a scenario may use repeatedly: a revoked grant, a withdrawn request, a left community
or a cancelled invite can be redone at once; a **declined** access request (30 days) or couple invitation (7 days)
cannot, so those run on a fresh `owner` / `temp`.
Daily limits still apply per persona: `me/pair.mjs` sends 3 couple invitations per run and an account may send 10 a
day, so it runs about three times a day per lane (the next run starts by freeing `inviter` again). The free Discover
undo is one a day; after it the deck scenario checks the Premium page instead.

### Adding a persona

1. Add the kind to `personas.mjs` (`FULL` or `BASIC` set, or a branch in `build`) and build its state only with
   `/api/fe` commands (`api(email, action, input)`), staff steps with `STAFF`. Never edit the database.
2. Keep it idempotent: read the current state first and only add what is missing (see `hostSetup`, `conversation`).
   A state that is used up by a run (cooldowns) is a fresh-each-call kind instead (like `temp`).
3. Add a row to the table above, then `node e2e/personas.mjs <lane> <kind>` to build and print it.

## Writing a scenario

`export default [{ name, persona: 'full', route: '/n/…', run: async t => { … } }]` — `persona: null` opens the app
signed out. `t`: `page`, `go`, `tap`, `fill`, `see`, `notSee`, `wait`, `api(action, input, asEmail?, profile?)`, `me`
(the persona), `persona(kind)`, `admin(action, body)`, `pid`, `boot`, `shot`. A selector that starts with a tag and a
space (`header .btn`) needs `css=`. Clean up what the scenario creates (delete posts, withdraw requests, leave
communities, restore settings) in `finally`, so reruns pass. When IDs of the lane's personas are needed in a route,
resolve them in the scenario (`await t.persona('host')`), not at module load.

Microphone and camera: the runner starts Chromium with fake devices (`--use-fake-device-for-media-stream`, a beep and a
test pattern). A scenario that records voice sets `mic: true` (it runs in a second browser with
`--use-fake-ui-for-media-stream`: headless Chromium ignores a plain permission grant); `mic: 'deny'` makes
`getUserMedia` refuse as when a person says no (`chats/voice.mjs`, lane `av`). Clips are recorded from a canvas in the
page (`sourceClip` in helpers.mjs; `watchVideoUpload` reads what was uploaded). Playwright's Chromium has no H.264 / AAC
encoders, so the uploader makes clips with the recorder fallback (WebM); `E2E_CHANNEL=chrome` runs the installed Google
Chrome, which takes the WebCodecs path (MP4) — run video scenarios both ways (`feed/video.mjs`, `feed/upload.mjs`).

## Run

    cd apps/feture && npm run build && npx vite preview --port 4250 --strictPort &
    FE_ADMIN_KEY=… E2E_LANE=feed APP=http://localhost:4250 node e2e/run.mjs e2e/scenarios/feed/compose.mjs [name-filter]
    FE_ADMIN_KEY=… E2E_LANE=feed APP=http://localhost:4250 e2e/run-all.sh [area]     # every file, then a summary
    node e2e/personas.mjs <lane> <persona>     # build one and print it (a `full` one takes ~3 min the first time)

Server code that is not deployed yet (a new command, a changed rule) runs on a **local API** instead of production:
`e2e/local-api.mjs` serves the real `/api/fe` handler with every command on PGlite (all migrations, the `feture_api`
role), sign-in with a test code, the legal documents, media in memory with the real scan and variants, the job queue
every second and the staff persona's roles. Personas are built there through the same app commands:

    node e2e/local-api.mjs 4290 &
    FE_API=http://localhost:4290 E2E_SESSIONS=/tmp/local-sessions.json FE_ADMIN_KEY=x E2E_LANE=mr APP=http://localhost:4250 \
      node e2e/run.mjs e2e/scenarios/chats/requests.mjs

Its database lives as long as the process (no realtime: screens update on their poll). Use a separate `E2E_SESSIONS`
file, so production sessions are never replaced.

The first run of a lane builds its personas (photo and age checks wait for background jobs: ~15–20 min for all).
`STAFF` is one account for all lanes: a parallel run elsewhere may sign its browser page out (the runner logs a 401
and signs in again).
