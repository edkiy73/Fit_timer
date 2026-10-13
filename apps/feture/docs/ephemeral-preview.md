# FetUre ephemeral user preview (2026-10-13)

## Intended user journey
At the welcome or account registration screen choose **Empty trial account / Пустой тестовый аккаунт**. No email code or Core account is created. Start at the existing A04 first-steps onboarding, then use the complete 2026 design workspace. On **Я → Настройки → Выйти и очистить тестовый аккаунт**, close the sandbox and return to welcome; the next entry begins empty again. The same exit is exposed in desktop navigation.

## Storage and security invariants
- A single `sessionStorage` string, `feture.design.ephemeral=1`, indicates the *navigation mode*. It contains **no PII or account content**; it is removed on exit.
- Profile fields, map levels, journal, local posts/events, likes, messages and all other preview actions use React state only. Reload discards them. They are not sent to the FetUre API, AppBase Core, PostgreSQL, analytics payloads or file storage.
- No Core access token is fabricated. AuthProvider and all server guards remain unchanged. It is **not** a real login and **does not** unlock age-verified/private features or admin endpoints.
- The sandbox uses the already existing visual workspace, which never issues domain writes. Existing public people/posts/events fixtures remain visible so the app does not appear empty as a community; **the viewer's own** map, profile, chat inbox, notifications, followed groups, posts, events and journal begin empty.
- P03 owner profile and X02 map start empty. Preview-created posts, events, and journal entries appear in their corresponding own lists, until leaving the workspace or reloading. Cross-screen, real-server publication or delivery are not claimed.
- The preview is separate from the real product data layer; a future fully connected sandbox would need a systematically scoped in-memory API adapter covering every domain command. Do not route requests through a bypassing "test" server credential or create shared permanent test accounts.

## QA
Check RU/EN at ~320 / 390 / 768 / 1440px, first entry → A04, create profile, add a jar, author a post, create an event, write a journal entry, inspect empty inbox/notifications and "My" tabs, then exit, re-enter and verify all own counters/data returned to zero. Verify the real sign-in still sends OTP and always requires genuine Core credentials.
