# FetUre server kit — how a command is built

Owner rule, 2026-10-28: the server works like the design system on the front — one way to build a command, shared
helpers instead of copies, and a check in CI (`npm run check:server`, inside `npm run check`) that refuses drift.
Read this before adding or changing a command. Design background: `docs/server/S1–S4`, input rules:
`docs/input-safety-backend-checklist.md`.

## One command = contract + handler + test

1. **Contract** in `contracts/<area>.mjs` (`<area>Commands`): `z.strictObject` input (no extra fields, bounded strings,
   ids as `id`, writes carry `opId`), `profile` (needs an acting profile), `write` (the profile must be writable),
   and a `rate` for anything a person could spam or use to probe (`{kind,max,window}`, or a function of the input when
   variants differ — `discover.decide`: a like 500 a day, a pass 5000 a day). Every account also has 120 requests a
   minute in all (`api/fe.mjs` quota), so a screen must not read per item what one list read can carry.
2. **Handler** in `server/commands/<area>.mjs`, exported through the area's `Object.fromEntries(...)` map. It receives
   `(q, {acting, account, input, cfg, signal, channels})` inside the request's transaction.
3. **Test** in `tests/fe-<area>-postgres.mjs` on PGlite as the restricted `feture_api` role: the happy path, the
   refusal paths (not yours, blocked, hidden, limits) and what a stranger must not see.

## Use these, never a copy

| Need | Use |
|---|---|
| Acting profile required | `need(acting)` |
| Refuse | `fail(status, code, extra)` (`errors.mjs`) — codes: `not_found` (also for «exists but not for you»), `forbidden`, `rule_violation` + `rule`, `invalid_input` + `fields`, `conflict`, `rate_limited` |
| May the viewer see it | SQL `feture.post_visible`, `event_visible`, `community_visible`, `blocked`, `restricted` — never re-implement visibility in JS |
| Someone else's profile | `otherProfile` (`commands/access.mjs`) |
| Media in a response | `mediaDto` / `avatarSrc` (`media/assets.mjs`) — never sign URLs by hand |
| Faces in lists | `withFaces` / `faces.mjs` |
| Couple needs the partner | `needsPartner`, `requestApproval`, `registerApprovalKind` (`approvals.mjs`) |
| Notify / push / inbox | `enqueue(q, topic, profileId, payload)` (`outbox.mjs`); account-addressed items set `for` |
| Live update of the other side | `signal(profileId, kind)` from the handler context (sent after commit) |
| Idempotent writes | the handler pipeline stores `opId` results; never add a second ledger |
| Text from people in a contract | `field('<name>')` from `contracts/_text.mjs` (rules in `FIELD`, shared with the app's forms); `text(max)` / `line(max)` only for a one-off. Never `z.string()` for something people type and others see |
| Typed words / keyset pages | `likePattern(q)` for ILIKE, `writeCursor(at, id)` (`search.mjs`) |
| «Популярное» order / who takes a mention | `popularScore(p, viewer)`, `acceptsMention(target, author)` (`sql-rules.mjs`) — SQL pieces, never a second copy of the rule |
| A path that changes a post outside the edit (album, narrowing) | `rebaseRevisions(q, postIds)` (`commands/posts.mjs`) keeps a waiting staff review current |

## Never

- Read identity from the input (email, account, role, age) — it comes from authentication only.
- Return internal ids of other accounts, emails, hashes, raw storage paths, or private fields to non-owners.
- A second helper with the same job in another file (`check:server` fails on duplicate function names across
  `server/commands`).
- A command without a contract, a contract without a handler, or a new command no test calls.
- Schema changes outside `supabase/migrations/<timestamp>_fe_<area>.sql`.
