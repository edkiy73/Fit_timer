# FetUre server kit — how a command is built

Owner rule, 2026-10-28: the server works like the design system on the front — one way to build a command, shared
helpers instead of copies, and a check in CI (`npm run check:server`, inside `npm run check`) that refuses drift.
Read this before adding or changing a command. Design background: `docs/server/S1–S4`, input rules:
`docs/input-safety-backend-checklist.md`.

## One command = contract + handler + test

1. **Contract** in `contracts/<area>.mjs` (`<area>Commands`): `z.strictObject` input (no extra fields, bounded strings,
   ids as `id`, writes carry `opId`), `profile` (needs an acting profile), `write` (the profile must be writable),
   and a `rate` for anything a person could spam or use to probe (`{kind,max,window}`, or a function of the input when
   variants differ — `discover.decide`: a like 1000 a day, a pass 25000 a day). Every account also has 600 requests a
   minute in all (`api/fe.mjs` quota), so a screen must not read per item what one list read can carry. Limits
   are listed in «Rate limits» below; a new one goes there too.
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

## Rate limits (owner 28.10.2026: «Увеличь рейтлимиты» — normal use never meets one)

Normal use must never see a limit: reads are effectively unlimited, everyday writes have ~5× headroom over a heavy
day, and only what can pester or probe other people (invites, reports, likes, requests, sign-in style checks) stays
moderately limited. The app retries a read refused with 429 twice in the background (2.5 s, then 6 s) and never shows
a rate-limit error for a read. Old → new (28.10.2026):

| Limit | Old | New |
|---|---|---|
| Account quota, all commands (`api/fe.mjs`) | 120 / min | 600 / min |
| Per-IP quota (`api/fe.mjs`) | 240 / min | 1200 / min |
| Reads: `people.search` | 600 / day | 10000 / day |
| `people.byNick` (existence probe) | 300 / day | 1000 / day |
| `discover.count` | 300 / day | 3000 / day |
| `post.likers`, `poll.voters` | 2000 / day | 20000 / day |
| `nick.check` (existence probe) | 30 / 10 min | 100 / 10 min |
| `premium.giftCheck` (existence probe) | 60 / hour | 200 / hour |
| `couple.linkPeek` (token probe) | 30 / day | 60 / day |
| `chat.typing` | 3000 / day | 30000 / day |
| `chat.send` | 2000 / day | 10000 / day |
| `chat.media` | 300 / day | 1500 / day |
| `reaction.set` | 1000 / day | 5000 / day |
| `reply.create` | 300 / day | 1500 / day |
| `post.publish` | 50 / day | 250 / day |
| `follow.set`, `follower.remove` | 200 / day | 1000 / day |
| `discover.decide` pass | 5000 / day | 25000 / day |
| `discover.decide` like | 500 / day | 1000 / day |
| `like.send` | 300 / day | 600 / day |
| `event.draft`, `event.rsvp` | 200 / day | 1000 / day |
| `event.apply` | 30 / day | 150 / day |
| `community.join` | 50 / day | 250 / day |
| `album.create` | 100 / day | 500 / day |
| `gallery.bulk` | 300 / day | 1500 / day |
| `profile.photos` | 100 / day | 500 / day |
| `location.set`, `push.register` | 20 / day | 100 / day |
| `post.disputeExplain` | 20 / day | 100 / day |
| `support.reply` | 30 / day | 150 / day |
| `premium.restore` | 10 / day | 50 / day |
| `link.propose` | 30 / day | 60 / day |
| `couple.invite`, `couple.link`, `couple.linkAccept` | 10 / day | 20 / day |
| `event.submit`, `event.announce` | 10 / day | 20 / day |
| `report.create` | 10 / day | 30 / day |
| private part requests (`LIMITS.requestsPerDay`) | 10 / day | 20 / day |
| `community.create`, `appeal.create`, `place.submit`, `support.create`, `account.export` | 5 / day | 10 / day |
| `verification.ageStart`, `verification.photoStart` | 5 / day | 10 / day |
| `premium.purchase`, `premium.gift` | 20 / day | 40 / day |
| `tag.object` (`DISPUTE_LIMITS`, owner rule) | 30 / day | unchanged |
| DSA notices without an account (`api/fe.mjs` notice) | 5 / hour per IP | unchanged (anonymous, abuse only) |

