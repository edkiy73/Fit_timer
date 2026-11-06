# Security audit — FetUre (06.11.2026)

The living record of the security audit: what was found, what is decided, what is fixed and how, what is deferred on purpose.
**Every PR that fixes or changes one of these items updates its status here, in the same PR** (see AGENTS.md). Read this before
touching sign-in, sessions, staff access, rate limits, Premium/referral grants, private media, Caddy or the deploy.

Scope: sign-in and sessions, staff and 2FA, authorization of content, private part, Premium and money, spam/DoS, the VPS and the
deploy. Method: five read-only code audits (auth, content authorization, private/money, spam/DoS, infra) plus live probes of
prod from outside, GitHub repository settings, `npm audit`, DNS/mail. Nothing was load-tested on purpose (not to hurt prod).
Not covered: Bunny and Robokassa dashboards, the UI, the Android app (APK), live load tests.

Status words: **open** · **in progress (PR)** · **done (PR, how)** · **release** (deferred on purpose until before launch) ·
**decision** (owner decided to accept).

## Owner decisions (do not re-litigate)

- **Development stage (06.11):** while there are no real people, the development access stays: QA/mod personas on
  `@feture.test`, the test sign-in (`TEST_LOGIN_KEY`, fixed code), the agents' SSH access and keys, the staff 2FA waiver switch,
  the admin key. They are needed for checks. They are removed before launch — see «Before release».
- **Repository stays public for now (06.11)**, owner accepts the risk (code, plans and this audit are readable by anyone). Before
  launch: scrub, make it private, buy GitHub Pro (private repos on the Free plan have no branch protection and only 2000 CI
  minutes a month; the VPS fetches `origin` anonymously over https — it needs a read-only deploy key first, or auto-deploy stops).
- **Branch protection on `main`, soft mode:** PR required, status `check` required, no review needed (solo owner), no force
  push or deletion, admins may bypass (`gh pr merge --admin`, only in an emergency, then tell the owner).

## Before release (deferred on purpose — do these when the main testing is over)

1. Remove `TEST_LOGIN_KEY`, `TEST_LOGIN_STATIC_CODE` and the `@feture.test` test sign-in from prod env; delete the QA/mod personas
   and their staff roles from prod (`docs/moderators.md`).
2. Turn the staff 2FA waiver off (`staff-factor-switch`, migration `20261029220000`) — staff 2FA is mandatory again.
3. Rotate `ADMIN_KEY` and every secret the agents have seen (admin key, Resend, Bunny, Robokassa, jobs secret, DB passwords);
   remove the agents' SSH key from `authorized_keys`.
4. SSH: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, fail2ban.
5. Repository: private, GitHub Pro, a read-only deploy key on the VPS, strip planning/audit documents that should not be public,
   two-factor on the owner's GitHub account, restrict token scopes.
6. Restore test of a database backup (never done), DMARC record for `kinhaze.com`/`mail.kinhaze.com` (DNS is at Bunny; Resend
   already reports SPF/DKIM verified), email support address (see `feture-audit-decisions`).
7. Keep «Premium for new accounts» and the invitation program **off** on prod until items B1 and B2 below are fixed.

## A. Found and to fix (most important first)

**B1 — no bot protection on sign-up (high, in progress — stage 2 PR, part 2).** Done in Core (`packages/core/server`): IPv6 counted by its /64 and a real hash in `ipHash`/`ipKey` (`util.js`); disposable-mailbox blocklist (`disposable-domains.js`, extend with `DISPOSABLE_EMAIL_DOMAINS`), opt-in per product — FetUre turns it on in `api/auth.js`, error `email_not_allowed` shown in the sign-up and email-change screens; a per-hour circuit breaker for all code sends (`AUTH_SEND_GLOBAL_PER_HOUR`, default 3000, warning `auth_send_global_cap_reached` in the log; it counts only mail that would really go out, but a large flood of real mailboxes could trip it and pause sign-in — Turnstile is the real fix). Test: `packages/core/tests/auth-hardening.mjs`. **Turnstile (stage 2 PR, part 4):** `packages/core/server/turnstile.js` verifies a token with Cloudflare before a sign-in code is sent (`createAuthHandler({captcha})`, error `captcha_failed`; off while `TURNSTILE_SECRET_KEY` is unset; reserved `@feture.test` addresses are not asked — development access; a Cloudflare outage lets sign-in through, a «no» never); the app asks through `src/fe/turnstile.ts` (invisible widget, appears only when Cloudflare wants an action; site key from `/api/config` → `captcha.siteKey`, env `TURNSTILE_SITE_KEY`); CSP allows `challenges.cloudflare.com`. Keys are in the server env (`/opt/feture/app.env`) and, for the agents, `~/.config/feture/turnstile.env` — both go into the «rotate before release» list. **Still open: `+` alias collapsing.** Original finding: No CAPTCHA, no disposable-mail filter. Per-IP limits use the first
`X-Forwarded-For` entry as the full IPv6 address, so one /64 is 2^64 «IPs» (`packages/core/server/auth-core.js:454-460`,
`util.js:69`). Effect: thousands of fake accounts, mail cost and domain reputation burn (Resend), farming of anything per-account.
Fix: Cloudflare Turnstile on `send` (token checked on the server), limits by /64, disposable-domain blocklist, global hourly send
cap with a staff alert, collapse `+` aliases per registered domain.

**B2 — free Premium farm (high, done in the stage 2 PR — still keep the switch off until B1 is done).** Fixed: `grantWelcome` now needs onboarding finished AND `feture.age_ok` (a staff-approved selfie/document); it is called again when the age check is approved. Original finding: `grantWelcome` (PR #1608, `server/commands/premium.mjs`) gives N days of Premium
once an account finishes onboarding, with no age check; combined with B1 every fake account is free Premium. Currently harmless
because the switch is off. Fix: after B1, grant only after the age check and a verified e-mail; daily cap on such grants with an alert.

**B3 — cheap DoS (high, in progress — stage 1 PR).** Stage 1 does: (b) Caddy `request_body` 64 KB on `/api/fe`, `/api/auth`, 1 MB elsewhere (uploads unchanged) and `host.mjs` reads at most 64 KB / 1 MB with a 20 s body deadline; (a) a per-address, per-minute counter of *refused* credentials in `api/fe.mjs cachedAuth` (40/min → 429 `rate_limited` without a store lookup; process memory, only refusals count); (c) SSE counts addresses by /64 (`addressKey`); (d) pool 5 → 15, `statement_timeout` 10 s. Still open: the same limit across many addresses (needs Cloudflare in front), SSE accepts any well-formed token, a separate small pool for staff/jobs, Core `ipHash` by /64 (stage 2, B1). Original finding: (a) `/api/fe` does `authenticate` (a store lookup through PostgREST) before any limit, so garbage
tokens hit the DB pool; (b) `host.mjs` buffers and parses up to 4 MB before auth, Caddy allows 5 MB; (c) SSE accepts any token that
matches a regex, 20 000 total slots can be filled (`server/realtime-sse.mjs:44-63`); (d) app pool is 5 (`api/fe.mjs:63`), no
`statement_timeout`; (e) `requestTimeout` 15 min on every path. Fix: per-IP counter before `authenticate`, Caddy `request_body`
32 KB on JSON routes, verify SSE tokens and limit by /64, pool 15–20 plus a small separate pool for staff/jobs,
`statement_timeout` 10 s, short timeouts on non-upload paths. Cloudflare in front later (Caddy `trusted_proxies`).

**B4 — banned person returns clean (high, done in the stage 2 PR).** Fixed in `server/core-guard.mjs` (`carryOnForget`): Core `forget` with scope `all` carries a sanction in force (`carrySanction`, now exported from `account.mjs`) before Core deletes the login; tested in `tests/fe-user-factor-postgres.mjs`. Original finding: Core `forget` (scope `all`, `auth-core.js:205`, `api/auth.js`) bypasses
`handler.mjs`, so the suspension check and `carrySanction` (only in `account.delete`) never run. Re-registering with the same
e-mail gives a new generation and no `sanction_carry`. Fix: refuse `forget` for suspended/restricted accounts, or run
`carrySanction` in the guard in `api/auth.js` before Core deletes.

**B5 — one stolen session = permanent takeover (high, in progress — stage 2 PR, part 3).** Done: «confirm it is you» — a six-digit code mailed to the signed-in address (`server/step-up.mjs`, table `feture.step_up`, commands `account.confirmStart/confirmCheck`; a wrong code is an answer, not an error, so tries are counted; a right one trusts this sign-in 15 min) is required for `account.factorStart` (turning on a factor), `account.delete` and Core's `email_change_send` (guard in `server/core-guard.mjs`); the app opens the code sheet by itself (`src/fe/confirm.tsx`, `askConfirm` in `session.tsx`) and repeats the action; notices by mail when the factor is turned on or off and, from Core, to the OLD address when the e-mail was changed. Skipped when no real mail sender is set up and for reserved `@feture.test` addresses (development access — see «Before release»: this skip goes with the test sign-in). Not screenshot-verified in the 390 px light/dark review (same kit pieces as the e-mail change code step). **Still open:** idle/sliding session expiry (90 days fixed). Original finding: 90-day fixed sessions in `localStorage`; with one, with no fresh
e-mail code: `email_change_send/verify` (no notice to the old address), `account.factorStart/Confirm` (attacker enrols their own
authenticator and locks the owner out), `account.delete`. Fix: fresh e-mail code for these three, notice with a cancel window to the
old address, sliding/idle session expiry (e.g. 30 days idle), notice e-mail on factor change.

**B6 — `main` deploys on every commit (high, done 06.11, #1617).** Branch protection is on (soft mode: PR + `check` required, no force push or deletion, admin bypass kept); `check` reports on documents-only PRs too (verified, 16 s). Original finding: `/opt/feture/update.sh` (cron, every minute) checks out
`origin/main` and rebuilds; migrations apply automatically. Fix: branch protection (soft mode, see decisions); `check` must report
on every PR, so the `pull_request` trigger of `.github/workflows/source-consistency.yml` has no path filter.

**B7 — no CSP / frame-ancestors / Permissions-Policy (high, in progress — stage 1 PR).** First pass of the report-only CSP on the login page (06.11): two reports — the inline `onload` on the Google Fonts `<link>` in `index.html` (an inline event handler) and a string-evaluation probe (most likely zod's JIT, which falls back when it is blocked). Before enforcing: replace the inline handler (self-hosted fonts or a script file), check the signed-in screens (feed, chat, media, staff, payments return) in the console, then switch the header to `Content-Security-Policy`. Stage 1 adds `X-Frame-Options DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Content-Security-Policy-Report-Only` in `deploy/Caddyfile`; enforce the CSP after a clean pass of every screen in the browser console. HSTS `includeSubDomains` not added (other `kinhaze.com` subdomains may not be https). Original finding: `deploy/Caddyfile` headers (lines ~32-38). Matters because the
sign-in token lives in the browser. Fix: add `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`, `Referrer-Policy`, HSTS
with subdomains; CSP in report-only first, then enforce.

**B8 — server hygiene (medium, open).** Disk was at 81 % (about 35 GB Docker build cache) — **done 06.11: `docker builder prune` brought it to 57 %, and `update.sh` (and `deploy/enable-autoupdate.sh`) now prune cache older than 72 h after each deploy**, SSH password
login allowed (→ «Before release» item 4), backups never restored, `zod` below 4.6.7 (**done in the stage 1 PR: 4.6.7**), Dependabot security updates (**turned on in repository settings**).

## B. Medium

- **Refunds/chargebacks never applied** (`server/billing/robokassa.mjs:34-39` only emits `paid`; `pay-events.mjs:44` handles
  `refunded` but nothing sends it). Premium stays until `staff.premiumRevoke`. Fix: a staff «refunded» action or a reconciliation job.
- **(done in the stage 4a PR: a shared device blocks the code and voids the inviter reward — `session_seen` holds the Core session id, one per browser/phone; the inviter is paid a week after the newcomer by `sweepReferrals`, only if the newcomer is still active and unrestricted and the cap allows; migration `20261106910000`. `inviter_days` default left as is: the programme is off until launch.)** **Referral farming** (`server/commands/referral.mjs`): own code only blocks the identical account; no device/session link; the
  inviter reward is not clawed back; the «account ≤ 7 days old» window does not stop bots. Fix: reject on shared device/session
  (`session_seen`), 7-day activity hold before paying the inviter, `inviter_days` 0 until launch. `referral.apply` and
  `settleReferral` race on `max_uses` and the cap (**fixed in the stage 2 PR: the code row is locked**).
- **(done in the stage 2 PR: `{ fresh: true }` on `staff.premiumGrantAll`, `staff.premiumPromoSet`, `staff.promoCreate`, `staff.promoSet`, `staff.referralSettingsSet`; a second owner/delay for grant-to-all still open)** **Mass Premium and promo actions need no fresh 2FA code** (PR #1608): `staff.premiumGrantAll` (up to 20 000 accounts, 400 days),
  `staff.promoCreate/Set`, `staff.referralSettingsSet`, `staff.premiumPromoSet`, owner/lead only, journalled, no second approver.
  Fix: `{ fresh: true }` on all of them; for grant-to-all a second owner or a 10-minute delay with undo.
- **(done in the stage 2 PR: staff promo codes are at least 8 characters, server contract and staff form; a shared failure limit per IP and /64 still open)** **Promo codes can be guessed**: 3–24 chars, 20 tries a day per account (many accounts, see B1). Fix: ≥ 8 random chars, a shared
  limit of failures per IP and /64, alert on bursts.
- **Private part:** the watermark is only a client overlay (`server/commands/access.mjs:205-216`, `server/media/render.mjs`);
  media URLs are bearer links valid 600 s that survive `access.revoke` (`server/media/bunny.mjs:33`, `delivery.mjs`), view-once
  clips live ≥ 300 s, and the `reuse` map hands one URL to every viewer. Fix: burn the viewer nick into a per-viewer file, cut the
  TTL to 30–60 s for private/view-once, no `reuse` there, and say plainly in the documents that revoke is not instant.
- **(done in the stage 4a PR: distance only to someone in Discover, 10 km steps, a place changes at most once an hour)** **Location oracle:** `distanceKm` (5 km steps) from `discover.cards`, plus `people.search/byNick` for hidden profiles and a free
  `location.set` (`server/commands/discover.mjs:154-170, 513`, `people.mjs`) trilaterate a hidden person. Fix: distance only when
  `feture.discoverable(target)`, quantize to 10–25 km, limit location changes.
- **(done in the stage 4a PR: `saved.set` checks visibility, caps 1000 rows and 500/day; migration `20261106900000` gives `event_visible` the community and organizer checks on the saved branch)** **`saved.set` is unvalidated** (`server/commands/social.mjs`, `contracts/social.mjs:26`) and `event_visible` trusts `saved_item`
  for cancelled events (migration `20261104500000_fe_audit_stage6.sql:22-25`): a former member can read a cancelled event of a
  closed community. Address and join link stay gated. Fix: visibility check and a cap in `saved.set`, drop the clause.
- **Scraping:** `people.search` was 10 000/day with a 2-letter prefix. **Partly done in the stage 4a PR: 2000/day.** Still open: ≥ 3 letters, a trust gate for new accounts.
- **(done in the stage 4a PR: daily caps on those writes; rate kind names must be lowercase `[a-z_.]` — the table's check constraint)** **Writes without a daily cap:** `community.invite`, `post.saveDraft`, `post.edit`, `event.update`, `profile.update`, `block.set`,
  `poll.vote`, `album.*`, `private.set*` (only the 600/min account quota). Fix: 60–200/day, 20/day for `community.invite`.
- **Mail:** domain `mail.kinhaze.com` is verified in Resend (SPF/DKIM ok); DMARC not checked (see «Before release» 6).

## C. Low

Wrong-code counter not atomic (`auth-core.js:365,512`; ~20 tries instead of 5) · new-device alert silenced by an empty country
(`signin.mjs noteSignin`) · `email_change_send` leaks «e-mail taken» · `staff.ageCheckDecide`/`staff.restrict` take no fresh code ·
late payment after a `failed` purchase gives no Premium (`pay-events.mjs:16-18`) · Robokassa: compare `OutSum`/`InvId`, constant-time
compare · `pay-return` redirect leaks purchase ids · `premium.giftCheck` shows queued Premium · one lead can set prices/grant 400 days
alone · `profile.followers` open for every active profile · idempotency ledger stores the `community.invite` token in plaintext ·
original video keeps metadata (GPS) · age gate checked only at request time (`access.mjs:295`) · couple partner changes shared private
content without approval (unclear if by design) · SSE channel tokens in the URL · `chat.typing` pings a hider · profile report existence
oracle · weak 32-bit IP hash · slow bodies hold a socket 15 min · report queue can be flooded by bots · DSA form global bucket can be
exhausted (~40 IPs).

## D. Verified fine (do not redo)

Sign-in codes (CSPRNG, hashed, 15 min, single use, 5 tries, daily cap per address, fail-closed limits) · Core session tokens (~160 bit,
hashed, 8 devices) · TOTP (sealed, replay-proof, lockout, hashed recovery codes) · staff roles and fresh-code gates for grants, 2FA
reset, document publish, suspensions, age-check open · `x-test-*` headers do not exist in code · payments (server prices, frozen amount,
atomic fulfil, unique `store_ref`, signatures, no self-gift, journalled grants) · private part before access returns nothing, explicit
media not in public places, blurred preview is a separate file · content authorization SQL (`post_visible`, `event_visible`,
`community_visible`), acting-profile resolution, chats, invites (hashed tokens), exact address/join link only for admitted · strict zod
inputs, bounded arrays, no user strings in SQL · reports never auto-hide · admin/PostgREST/DB not exposed, Storybook not in prod (`/kit/` 404).

## E. Plan (stages)

1. **Stage 1 — safe, fast:** this document; branch protection (soft); Caddy headers and body limits (B7, B3b); per-IP limit before
   `authenticate`, SSE token check and /64 (B3a,c); DB pool, timeouts (B3d); zod and Dependabot; `docker builder prune` (B8).
2. **Stage 2 — sign-in and accounts:** Turnstile, /64, disposable mail (B1); fresh code for e-mail/factor/delete, session expiry (B5);
   `forget` for banned (B4); welcome-Premium conditions (B2); fresh code and long random codes for mass Premium/promo.
3. **Stage 3 — before release:** the list above.
4. **Stage 4 — money and privacy:** refunds, referral rules, per-viewer watermark, short links, distance, saved events, caps.

## Log

- 06.11.2026 — audit done, report written; owner decisions recorded; stage 1 started.
- 06.11.2026 — branch protection on `main` enabled (soft mode); Caddy restart on Caddyfile change added to `update.sh` (#1623).
- 06.11.2026 — stage 2 live (#1626–#1629): forget carries a sanction (B4); fresh code for mass Premium/promo; welcome Premium after the age check (B2); 8+ char promo codes; referral locks; IPv6 /64 + real IP hash, disposable-mail blocklist, global send breaker; «confirm it is you» by mail for a factor, deletion and e-mail change with notices (B5); Cloudflare Turnstile before a sign-in code (keys in `app.env`; site key via `/api/config`). Verified on prod: a disposable address is refused, a send without a token is `captcha_failed`, a `@feture.test` address is not asked, `/api/config` carries the site key, CSP allows Cloudflare. NOT verified: the widget passing for a real person on a phone (an automated browser gets the interactive challenge, and CAPTCHAs are not completed by the agent — the owner checks sign-in on a phone/APK), the confirm-by-mail sheet with a real mailbox. The `privacy` draft (unpublished) got a paragraph about the bot check; `cookies` not changed (Turnstile is not known to set cookies — confirm with the lawyer review list). Left in stage 2: idle/sliding session expiry.
- 06.11.2026 — stage 1 live (#1617, #1618): security headers and body limits in Caddy, refused-credentials limit (verified on prod: 429 after 40 refused tokens in a minute, a 200 KB body gets 413), SSE by /64, pool 15 + `statement_timeout`, zod 4.6.7, Dependabot security updates on, build cache pruned (disk 81 % → 57 %). Found while rolling out: Caddy did not pick up the new Caddyfile (single-file bind mount), restarted by hand; `update.sh` fixed on the VPS and in `deploy/enable-autoupdate.sh`.
