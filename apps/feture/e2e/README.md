# FetUre e2e — scenarios with personas

Interaction scenarios for the app: they tap what a person taps and read the result back from the server. They run
against a local build (`vite preview`) with `/api` proxied to production — there is no staging yet — so run files
one at a time (the production rate limit is shared).

## Personas (owner rule, 28.10.2026)

A scenario never uses a shared account. It names a **persona** — a known account state — and the runner signs in as
that persona **of your lane** (`E2E_LANE`, one per agent/area, 1–8 letters), so runs never log each other out or eat
each other's daily limits. `e2e/personas.mjs` builds them through the app's own commands; a second call only adds
what is missing:

| persona | state |
|---|---|
| `new` | signed in, no FetUre account yet — registration screens (a fresh one each call) |
| `basic` | registered, onboarding done, hidden from Discover, no photo, no interests |
| `full` | visible in Discover, approved profile photo, age verified, public interests |
| `pair` | two `full` people in an active couple (`me.partner`, `me.coupleId`) |

Need another state (pending requests, a host with a community, a person who blocked you…)? Add it to
`personas.mjs` with the commands that make it — never edit an account by hand in the database.

## Run

    cd apps/feture && npm run build && npx vite preview --port 4250 --strictPort &
    FE_ADMIN_KEY=… E2E_LANE=feed APP=http://localhost:4250 node e2e/run.mjs e2e/<file>.mjs
    node e2e/personas.mjs <lane> <persona>     # build one and print it
