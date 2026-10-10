# Age verification contract — A04.1

## Implemented read boundary

`POST /api/domain` with exactly `{"action":"verification.status"}` requires a live Core device session and the existing quota. No owner, age, role or provider fields are accepted. Response is uncached:

```json
{"ok":true,"status":{"state":"unavailable","verifiedAdult":false,"validUntil":null,"reason":"provider_not_configured"},"requestId":"<uuid>"}
```

This is the only supported status today. There is no start/complete endpoint, attestation storage or positive verification path. This action requires authenticated identity but does not require adult verification; it cannot change the actor or unblock interest reads/writes. Guests receive 401, extra/unknown commands 422, quota exhaustion 429, unavailable identity storage 503. An unavailable provider is a successful status read, not an identity-storage outage.

`/#/verification` is public. Guests see a sign-in link; authenticated users request their own status with current device credentials. No proof is persisted in the browser. The page clears on session changes, aborts old requests and checks credentials before and after a response. Failed requests offer retry; expired sessions lead back to the account. Account and paused-map links expose this screen.

## Provider-independent target for A04 (not implemented)

The next adapter will translate provider results to these domain states. Extending the current DTO and client parser is required when implementing those states.

| State | Meaning | Adult access | Validity |
| --- | --- | --- | --- |
| unverified | No accepted result | false | null |
| pending | Account-bound verification attempt awaiting trusted result | false | null |
| verified | Accepted, current adult attestation | true | server-issued UTC expiry |
| rejected | Attempt completed without acceptable proof | false | null |
| expired | Previously accepted proof is no longer valid | false | null |
| unavailable | Adapter cannot start or resolve verification | false | null |

Transitions: unverified/rejected/expired may start a new pending attempt; pending may become verified or rejected through a verified provider event. Verified becomes expired at its expiry or loses access after revocation. Provider unavailability must not create a positive result or extend an existing proof. Each protected operation evaluates current server proof, expiry and revocation; a displayed status is never authorization.

The future public DTO remains limited to state, verifiedAdult, validUntil and an allowlisted reason. Adult verification and identity verification are separate claims: passing one cannot silently establish the other. DOB, documents, images, biometrics, provider payloads, emails, account hashes and provider references never enter this DTO, UI logs, analytics or the interest queue.

The private attestation must bind account hash, provider issuer, claim/policy version, accepted threshold, issued/expiry timestamps and revocation state. The server creates an expiring, single-use attempt bound to the authenticated account. A client-supplied account, success flag, date of birth or return URL cannot issue a proof. A provider redirect only resumes the UI.

Webhooks require provider-specific signature verification over the raw body, expected issuer/environment and bounded event freshness. Resolve the account only through the stored attempt/reference; reject foreign or expired attempts. Persist an event identifier and terminal transition atomically: repeated events are idempotent; conflicting or stale events cannot overwrite newer state. Redact raw payloads and never store documents/biometrics in FetUre. Define retention and deletion for the minimal attempt/attestation metadata when selecting the provider.

Provider selection, credentials, signature format, policy/threshold, proof lifetime, revocation, webhook ingestion/storage and real-device acceptance belong to the next high-complexity slice. No provider-specific or jurisdictional suitability is asserted by this contract.
