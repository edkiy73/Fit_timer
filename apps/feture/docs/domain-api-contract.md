# FetUre domain API — F04 (2026-10-10)

This is a restrictive server foundation, not activated cloud sync or a sharing API.

## Transport and identity

`POST /api/domain`, JSON body, max 4096 UTF-8 bytes. Core CORS policy is reused.
Authentication headers (never URL parameters):

- `X-Fit-Email`: normalized Core account lookup, not proof of identity.
- `X-Fit-Device`: device ID from the Core session, max 80 chars.
- `X-Fit-Token`: Core session `syncToken`, max 256 chars.

Server derives `sha256(normalized email).slice(0,32)`, reads Core `a:<hash>` on every request, and compares the token hash against that account's own device entry in constant time. It checks the stored email too. Revoked/rotated tokens fail on the next request. Core currently has device-token rotation/removal rather than an independently expiring FetUre session; expiry/lifecycle improvements belong to A01. Core client logout currently removes the local session, not the server token. **Do not claim server-side token revocation on logout until A01 implements it.**

No `email`, `accountHash`, `ownerHash`, role, age, filter, table or select field is accepted in the JSON payload. The actor is an immutable object registered by the authenticated server path; a structurally identical client/fabricated object cannot enter the repository.

## Commands

| Body | Result | Gate |
|---|---|---|
| `{"action":"profile.get"}` | `{ok:true, profile:null\|{displayName,about,createdAt,updatedAt},requestId}` | Own profile only; no lazy creation/write |
| `{"action":"interests.list","limit":30,"cursor":null}` | Future bounded owner map page `{ok:true,items,nextCursor,requestId}` | Currently **403 verification_required** for every account; trusted age attestation absent |

`profile.get` is an owner-only account/bootstrap read. It does not publish UGC or expose somebody else's profile. The projection omits account hashes, emails, dating toggles and all extra database fields. Missing own profile returns `null`, not a manufactured profile.

The map adapter has a fixed select, owner filter, max 50 rows/page plus one look-ahead, and keyset pagination by `interest_id`. Cursor: `v1.` + canonical base64url of an allowlisted interest ID; never raw PostgREST syntax. It is **not enabled** by client flags, account metadata, an admin key, public visibility or an existing grant. A04 must supply verified, current, account-bound server attestation before this gate can open. A02 replaces the old status/intensity DTO with the canonical schema; no writes or legacy compatibility paths were added. Before activation, retest full pagination against the A02 schema and trusted A04 actors.

## Boundaries and failure modes

- Fixed `feture_profiles` / `feture_interest_states` reads through the existing Core Supabase transport, after authorization. No generic SQL, caller-supplied table or direct browser private access.
- Ownership is checked at the repository boundary too. Every returned row must belong to the authenticated account, even if the transport returned the wrong row. Mismatch yields 503 and no data.
- No sharing route exists. `public`/`granted` does not bypass owner policy. P01 adds scoped grants/expiry/revoke/block semantics; moderator/admin access needs its own case-scoped policy.
- Responses: `no-store`, JSON, `nosniff`, server-generated request ID. GET 405; guest/bad credentials 401; unverified map 403; foreign-owner permission 404; invalid payload/cursor 422; body over limit 413; quota 429 + `Retry-After:60`; missing/unavailable identity/domain/counter backend 503. No raw database exception detail reaches the client.
- Global account quota 120/min applies across IPs/devices. Additional Core IP quota 240/min is fail-closed. A failed account counter returns 503. Counter keys are ephemeral `rl:feture-*`; no duplicated private document store is introduced.
- Operational access events contain only request ID, allowlisted command and outcome. No email/hash/token/IP/URL/body/answer/DB exception. This is deployment logging, **not** the immutable moderator audit trail required by later product domains.

## Runtime and checks

New server modules remain CommonJS JS, as required by the existing Vercel/Core runtime. JSDoc contracts + `contracts.d.ts` are checked strictly with `tsconfig.server.json`; no unsupported TypeScript runtime is introduced. `npm run typecheck` includes client and server checks. The API entry only composes Core store/transport/CORS with the product modules.

`npm --prefix apps/feture run check` includes 12 focused security tests: real Core-format account/device tokens in an isolated memory process; guest/foreign token, owner/role/age spoofing, fabricated actors, two owners, revoked token, foreign transport row, error/log redaction, age gate, body/cursor limits, missing backend and global quota/counter outage. These tests do not use production credentials and do not claim live authenticated private DB access.

## Observed deployment prerequisites

On 2026-10-10, Vercel `feture-mvp` still lists only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, production targets. Values were not decrypted. Missing Core account store, server secret and mail configuration remain blockers; no environment variables or database schema/data were changed in F04.

Read-only live SQL inspection confirmed nine `feture_*` tables with RLS enabled; only three taxonomy tables grant client SELECT, all six private tables grant none to anon/authenticated/PUBLIC. The secret/server key bypasses RLS, so application ownership checks are mandatory. Current documentation: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [changelog](https://supabase.com/changelog.md). Existing Core transport is reused; no new Supabase client dependency.
