# FetUre temporary user — persistent per-tab preview (2026-10-13)

## Behavior and scope
The owner needs a **no-code, blank test account** for repeated onboarding, new-content creation and empty-state QA. Start from the welcome page → **Пустой тестовый аккаунт / Empty trial account**, or the auth screen equivalent. No OTP, Core account or verified age state is fabricated.

**After entry**: the account stays active across page reloads, React screen remounts, route changes and routine web UI deployments **within the same browser tab**. Exit via **Я → Настройки → Выйти и очистить тестовый аккаунт**, the account screen or the desktop exit link. Every preview field is cleared synchronously. The next trial login starts as a brand-new user.

**Architecture**: `src/feture/design/sandbox-session.ts` holds a noncredential session marker plus individually named, bounded JSON values in browser `sessionStorage`. `useSandboxState` writes synchronously in event handlers (not delayed to an effect), preventing lost saves during route transitions. It is separate from Core auth, Supabase, and permanent localStorage/IndexedDB user data. Native webviews/browser tab closures may not preserve sessionStorage; reopening a restored tab can restore it. This is ephemeral QA, not a user account backup.

## Shared state
- Editable profile, city/nickname, selected/visible interests and jar values, boundaries, questionnaire answers, form fields/drafts.
- Local authored posts, event previews, journal entries, likes/saves/reactions, follows, community membership, RSVP, draft messages, chat messages, filters, notification state, and temporary section tabs.
- Core identity remains **absent**. No private/age/admin rights. All simulated actions remain client-only. Existing illustrative people/posts/events remain available in the public discovery sections; personal "My" views start empty.
- Route adapter: `sandbox-route.ts` forwards historical live screens like `/profile`, `/journal`, `/community`, `/tests` and `/world` into the same self-contained preview UI instead of accidentally mounting an unrelated authenticated backend screen. Genuine legal/account and privileged admin/operator routes retain their security behavior.
- No real posts/messages/event RSVPs are published and no media is uploaded. Fully server-connected E2E QA still needs real test accounts in a separate environment; this mode intentionally cannot bypass permission enforcement.

## QA acceptance
1. Enter the trial account from welcome; see A04 onboarding and blank public identity, empty personal jars/journal/posts/events/chats/notifications.
2. Enter name/city, add jar & visibility, write a post, preview an event, write a journal entry, send a simulated chat message, like/save/follow/join, change questionnaire answers.
3. Reload every screen, switch dock tabs and legacy routes, verify all relevant values and counters survive in the same tab; real database must remain unchanged.
4. Navigate to account screen, exit/reset, reenter and verify *every* value resets. Confirm normal Core OTP sign-in still requires a valid code and protected endpoints reject the trial marker.
5. Verify UI and reset on RU/EN, mobile 320/390px, fold/tablet 768/1024px and desktop 1440px. Browser manual QA remains separate from passing CI.

## Security and privacy
Temporary input stays on the user's device in sessionStorage to meet refresh durability; it **is stored locally for that tab**, not sent to the server. Do not enter real secrets/sensitive details during QA. No service key, session token or synthetic Core account is created. The sign-out handler removes only namespaced preview keys, not a real user's auth or preferences.
