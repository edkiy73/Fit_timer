# AppBase Remote Push

Remote push is shared infrastructure. Product apps define notification events and destinations; AppBase Core owns registration and delivery mechanics.

## Shared Core responsibilities

Client:
- request/check remote-push permission only after a product-level explicit opt-in;
- register the native FCM/APNs token against the signed-in account device;
- unregister the current device on sign-out or when remote notifications are disabled;
- record notification opens;
- pass the push `data` payload back to the product for routing.

Server:
- authenticated `push_device` registration in `auth-core.js`;
- account-level device token storage;
- Firebase Cloud Messaging HTTP v1 delivery on Android;
- APNs token-auth delivery on iOS;
- account notification preferences;
- invalid-token cleanup;
- aggregate open analytics;
- generic admin campaign delivery.

Shared Admin:
- `packages/ui-react` exposes one Campaigns screen to every React AppBase app;
- preview counts eligible push/email targets before sending;
- RU/EN copy, news/offers kind and optional internal product route are supported;
- delivery continues through the generic Core `campaign_send` server action in small batches.

The Core layer must not contain FitTimer/UnMute route names or business events.

## Product responsibilities

Each app decides:
- which events deserve a server push;
- category/preferences;
- localized title/body;
- route/deep link for a push tap;
- when to explicitly ask the user for notification permission.

## Per-app infrastructure

Android Firebase configuration is package-specific. Do not reuse another app's `google-services.json`.

For each Android app:
1. Register its exact application id in Firebase.
2. Store the downloaded `google-services.json` in a GitHub Secret dedicated to that app.
3. The release workflow materializes it as `android/app/google-services.json`.
4. Configure that app's Vercel project with `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_BASE64`.

For UnMute:
- Android application id: `app.unmute.english`
- GitHub Secret: `UNMUTE_GOOGLE_SERVICES_JSON_BASE64`
- Vercel server variable: `FIREBASE_SERVICE_ACCOUNT_JSON` (inside the UnMute Vercel project)

iOS uses the same Core API. Its Vercel project needs `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, and optionally `APNS_BUNDLE_ID`; otherwise product identity is used as the bundle id.

Secrets must never be committed.

## Current adoption

- FitTimer: native Capacitor bridge still emits its legacy token/action events, but token registration, unregister and open analytics now go through `createRemotePushClient`. A later bridge cleanup may remove those legacy event names without changing the Core/server contract.
- UnMute: uses `createRemotePushClient` directly with Capacitor Push Notifications; local learning reminders remain local, while account/payment/content/campaign events can use server push.
- New AppBase apps: use the same Core client/server contract instead of adding product-specific token plumbing.
