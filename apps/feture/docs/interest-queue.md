# A02.3/A03 — client interest queue (2026-10-11)

The product client now calls `/api/domain` for interest list/set/delete. Core remains
canonical for email/device sessions and settings; it no longer stores the interest map.
This is an implemented transport switch, **not completed live cloud acceptance**:
FetUre server auth/mail configuration (A01) and a trusted adult attestation (A04)
are still required. The existing server gate is unchanged; no client age flag or bypass.

## Persistence and identity

- `interest-store.ts`: a dedicated `feture/interests` IndexedDB database. A single
  read/write transaction serializes guest data, account caches and immutable outboxes
  across tabs. No non-atomic localStorage fallback. Read/write failure is reported;
  the editor remains open rather than claiming a saved record.
- Guest data is separate. Account cache keys are SHA-256 of normalized Core email;
  session fences are SHA-256 of credentials. The store contains no raw session tokens.
  These hashes are local isolation keys, not server proof or caller-supplied ownership.
- `interest-api.ts` captures credentials for each request, puts them in the existing
  `x-fit-*` headers, checks the actual current session before and after responses,
  uses `no-store`, abort/12-second timeout, validates DTOs, and bounds pagination.
  Client requests cannot set owner, source, timestamps or applied revisions.
- Core auth remains authoritative. Expiry/401 seals the rejected session; cached data
  is not shown again for those credentials. New verified credentials can resume that
  same owner's unsent queue. Switching owners clears the visible snapshot immediately
  and rejects callbacks captured by another owner's editor.

## Mutation and conflict rules

Each outbox operation gets a UUID and expected revision when it is enqueued.
Neither changes after a failed response, timeout, reload or retry. Dependent edits
use the preceding operation's expected revision + 1. No timestamp-based merge,
automatic conflict overwrite or permissions widening.

A short IndexedDB lease avoids competing tab workers; after a crashed worker its
lease expires. A duplicate delivery still uses the same UUID and server receipt.
Transient failures back off from 2 seconds to 60 seconds and honor bounded Retry-After.
Age/auth/invalid-request failures are not an automatic retry loop. The outbox remains
on-device, and statuses distinguish local persistence from server confirmation.

Conflict UI compares desire/experience/boundary and visibility. Choosing the account
version removes all pending drafts for that topic. Applying the local version requires
explicit confirmation and creates a **new** operation at the current known revision;
a further remote change can conflict again. No force overwrite.

Deletion is a server tombstone. An old receipt returns the current entry; if it is newer
than the receipt, dependent drafts are blocked for explicit conflict resolution.
A newer tombstone cannot be used as an automatic base to resurrect a deleted topic.
Deliberate recreation after resolving the conflict uses its current revision.

## Guest import and logout

Import is an explicit action and confirmation for the current account. The transaction
queues all guest records and only then clears the guest map. Imported visibility is
private and discovery is off; overlapping server records still undergo revision checks.
Failure aborts the whole transaction, leaving guest data intact.

Logout first records a durable session fence, stops requests and hides the cache.
The fence transaction captures pending count before prompting about discarding drafts;
other tabs cannot enqueue more writes for that fenced session. Cancellation or server
logout failure removes the fence and restores the unsent data. Confirmed logout deletes
only the captured owner's cache with the matching session stamp; another owner's cache
or a newly selected session is not deleted. Late responses cannot recreate the cache.
An already authorized server request can have committed before logout; its late response
is ignored locally. A logout is not a server-domain account deletion.

## Old path removal

`lib/app-sync-schema.js` registers only settings. The settings mirror has a new key and
accepts only that document; the old `sync.mirror` is discarded under the pre-launch policy.
No legacy reader/importer, dual-write, record-clock merge or old map registration remains.
`api/sync.js` whitelists settings on responses too: even a premium Core manifest cannot
return obsolete private documents or profiles through the former endpoint. Stored old
server manifests are not destructively purged together with other products' data.

## Verification and limits

The existing full FetUre check passes: client/server types, catalog/smoke, unit,
domain security, PostgreSQL seed/interest transactions and production build.
One focused IndexedDB queue suite covers explicit private guest import, concurrent tabs,
restart/lost response retry, newer deletion, revision conflict, explicit new operation,
A→logout→B/late response, cancelled/failed logout, rejected session, write failure and
request DTO/credential checks. Existing domain security now checks premium obsolete
manifest isolation. These are local fixtures plus real IndexedDB semantics, not two live
verified accounts or a production age-provider test.

Browser visual/responsive and native APK/IPA checks were not performed in this slice.
No database migration, provider configuration, email delivery or age bypass was introduced.
A02/A03 and live acceptance remain open until A01/A04 and real two-device verification.
Next medium slice: A04.1 provider-independent verification contract and status UX.
