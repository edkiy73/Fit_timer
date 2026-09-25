# AppBase infrastructure adapters — Supabase + OpenRouter

This document defines a migration path, not a claim that either provider must become permanent infrastructure.

## Principle

AppBase owns interfaces and policies. Providers are adapters:

```text
AppBase Core
├─ Server Store interface
│  ├─ current Upstash/Redis adapter
│  └─ Supabase/Postgres adapter
└─ AI Provider interface
   ├─ current direct provider adapters
   └─ OpenRouter adapter
```

Product code must not import Supabase or OpenRouter directly.

## Supabase goal

Use Supabase primarily as a PostgreSQL-backed server store while preserving the existing AppBase sync/document contract.

Do **not** combine the first database migration with:
- Supabase Auth migration;
- client-side direct database access;
- a rewrite of account identity;
- a rewrite of the sync wire protocol;
- removal of Upstash before parity is verified.

### Phase S1 — connection foundation

Implementation status:
- the Supabase account already has an active project named `FitT`;
- the project is currently empty (no public tables/migrations at the time of foundation work);
- `lib/supabase.js` provides server-only env validation, REST connection and non-destructive connection self-test;
- production Upstash remains authoritative; no Supabase reads/writes are used by product endpoints yet;
- supported server secret env names are `SUPABASE_SECRET_KEY` (preferred) and legacy `SUPABASE_SERVICE_ROLE_KEY`.



- create/select the Supabase project;
- keep service credentials server-only;
- add environment validation and a server client adapter;
- add a health check that verifies connectivity without exposing credentials;
- keep production reads/writes on Upstash.

No browser/APK code receives a service-role key.

### Phase S2 — generic store contract

Implementation status:
- `lib/document-store.js` defines a provider-neutral document persistence contract;
- `lib/supabase-document-store.js` implements that contract through server-only PostgREST;
- the contract is document/revision oriented rather than a copy of Redis commands.


Introduce a provider-neutral server persistence interface around the capabilities actually used by AppBase, for example:

```text
get / set / delete
increment
scan/list
batch read
transaction or compare-and-swap where required
```

Do not reproduce Redis commands as the permanent Core API if a higher-level document/revision operation is safer.

The current `lib/store.js` remains the compatibility owner until this contract is proven.

### Phase S3 — PostgreSQL schema

Implementation status:
- migration `20260925073516_create_appbase_documents_shadow.sql` is applied to project `FitT`;
- `public.appbase_documents` stores account hash, profile id, document key, revision, schema version, device id, tombstone state, payload and timestamps;
- RLS is enabled and no anon/authenticated policies exist by design; browser/mobile clients have no direct access;
- the table starts empty and is not authoritative.


Design the schema around the already-separated document contract rather than copying Redis keys one-for-one.

Likely starting concepts:

```text
accounts
profiles
documents
devices / push registrations
entitlements
analytics / diagnostics as needed
```

For generic documents, likely fields include:
- account identity;
- optional profile identity;
- document type/key;
- revision;
- JSONB payload;
- deleted/tombstone state;
- timestamps.

This schema is a proposal until current production access patterns and indexes are measured.

### Phase S4 — shadow migration

Implementation status:
- `SUPABASE_SHADOW_WRITE=1` enables best-effort writes of accepted sync documents only after the authoritative Upstash write;
- `SUPABASE_SHADOW_COMPARE=1` enables read-compare on Premium sync pulls;
- compare results contain only counts and are exposed in health diagnostics without account identifiers or payloads;
- account/profile privacy deletion purges Supabase before deleting authoritative identity/data when Supabase is configured;
- production reads still come exclusively from Upstash.


Use staged migration:

```text
Upstash = authoritative read/write
Supabase = shadow write
        ↓
parity checks / repair
        ↓
Supabase read shadow comparison
        ↓
controlled read cutover
        ↓
Supabase authoritative
        ↓
temporary Upstash fallback
        ↓
retire legacy adapter
```

Requirements:
- idempotent writes;
- revision parity;
- explicit tombstone handling;
- profile/account isolation checks;
- measurable mismatch reporting;
- rollback path.

Do not dual-write indefinitely.

Shadow activation is intentionally environment-gated. Deploying the code does not start dual-write automatically.

### Supabase Auth

Deferred by default.

Existing email OTP/account/session behavior should remain independent from the storage migration. Re-evaluate Supabase Auth only after the database cutover is stable and only if it removes meaningful custom complexity.

### Supabase Storage / Realtime

Optional capabilities, not baseline dependencies:
- Storage only when AppBase needs server-owned media/files;
- Realtime only when a product has a real collaborative/live use case.

Local-only private media must not silently move to Supabase Storage.

## OpenRouter goal

Add OpenRouter as one AI provider adapter behind the existing AI Runtime and action registry.

OpenRouter must not know product actions such as:
- `program.create`;
- `exercise.modify`;
- future Lingua lessons;
- future TaskApp projects.

The action registry chooses the task semantics. The provider receives a normalized generation request.

### Phase O1 — provider adapter

Implementation status:
- `lib/ai-provider-openrouter.js` implements OpenRouter text generation via `/api/v1/chat/completions`;
- `OPENROUTER_API_KEY` is server-only;
- optional `OPENROUTER_APP_URL` and `OPENROUTER_APP_NAME` populate attribution headers;
- text AI routes may choose `openrouter` in Admin;
- image routes remain limited to providers with implemented image adapters;
- the default production route remains unchanged until an administrator explicitly selects OpenRouter.



Add a server-only OpenRouter provider with:
- API key from environment;
- text generation;
- model id;
- timeout;
- generation options;
- normalized usage/error result;
- capability declaration.

Do not expose the OpenRouter key to web/mobile clients.

### Phase O2 — provider routing

Extend the current AI provider configuration so an action can resolve to:

```text
primary provider/model
fallback provider/model(s)
capability requirements
timeout
quota/cost class
```

Keep direct providers available initially.

Recommended initial topology:

```text
AI Runtime
├─ OpenRouter
├─ direct Gemini
└─ future direct providers
```

Do not make OpenRouter a single point of failure before real reliability/cost data exists.

### Phase O3 — validation

Compare providers on:
- protocol/structured-output validity;
- latency;
- error/fallback rate;
- actual cost;
- image/multimodal capability where relevant;
- model availability stability.

Routing should be driven by observed behavior rather than by a single global default.

### Phase O4 — Admin integration

After Admin Core decomposition, expose:
- provider/model configuration;
- fallback chain;
- health/test request;
- usage/cost visibility;
- capability compatibility warnings.

Secrets remain environment/server-side and are never returned to Admin UI.

## Recommended sequence

After Notification/Mobile Core boundaries:

```text
1. Generic native/mobile bridge
2. Supabase connection foundation
3. Generic server-store adapter
4. Supabase shadow writes + parity
5. OpenRouter provider adapter
6. Provider routing/fallback tests
7. Admin Core decomposition
8. Admin controls for storage/AI health
9. Supabase controlled cutover when parity is proven
```

OpenRouter work can proceed while Supabase shadow migration runs because the two adapters are independent.

## Acceptance gates

Supabase is not authoritative until:
- profile/account isolation tests pass;
- revision/tombstone parity is proven;
- production-like shadow comparison shows no unexplained divergence;
- rollback is tested.

OpenRouter is not the sole AI route until:
- existing AI protocol tests pass through it;
- provider fallback is verified;
- cost/latency/error data is available;
- image/text capability differences are handled explicitly.

## What AppBase should eventually contain

Reusable:
- store interface;
- Supabase adapter;
- Redis/legacy adapter while supported;
- AI provider interface;
- OpenRouter adapter;
- direct provider adapters;
- health/config abstractions.

Product-specific:
- FitTimer schemas and prompts;
- Lingua/TaskApp domain tables if any;
- product AI action definitions;
- product-specific retention/business rules.
