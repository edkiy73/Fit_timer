# Notification strategy

Status: local notification manager implemented; remote trainer/catalog push and campaign email delivery still require server transports.

## Goal

Notifications should help the user train, react to meaningful changes, and return to the app without becoming spammy.

The system should not create a push for every possible event. Notifications should be grouped by value and controlled by a shared frequency/priority manager.

## Notification priority levels

### 1. Functional notifications

These are directly connected to an action the user expects.

Examples:
- Rest timer finished.
- Trainer assigned or changed a program.
- Trainer action that requires attention.
- Voice command package finished downloading.
- Catalog submission status changed.

These should generally not be blocked by engagement/promo frequency limits.

### 2. Personal useful notifications

These help the user follow their training plan or progress.

Examples:
- A workout is scheduled for today.
- A workout is approaching.
- A workout was missed.
- Today's workout has a new progression step.
- A workout was started but left unfinished.
- Meaningful milestones / achievements.
- Return reminder after inactivity.

These should be subject to anti-spam rules.

### 3. Marketing / promotional notifications

Examples:
- Premium offer.
- Product news.
- Feature promotion.

These always have the lowest priority. They should never compete with or be sent close to a more important training notification.

---

## Event matrix

| Type | Event | Proposed behavior |
| --- | --- | --- |
| Important | Workout scheduled today | Once, preferably near the user's usual training time |
| Important | Workout coming soon | Only if the user actually uses a schedule/reminder flow |
| Important | Workout missed | Do not send immediately; send later in the day / after several hours |
| Return | User has not trained for several days | Escalating intervals, not daily |
| Progression | Load increased today | Useful on the day of the workout: e.g. "Today +1 progression step" |
| Progression | Next progression step is approaching | Do not push; show inside the app |
| Trainer | Trainer assigned/changed a program | Send immediately |
| Trainer | Trainer action requires attention | Send immediately |
| Catalog | Trainer program submitted | Confirm submission in-app and explain where status can be tracked |
| Catalog | Submission approved/rejected | Send notification |
| Catalog | New catalog content | Usually no push; at most a rare digest |
| System | Voice package downloaded | Send notification |
| Timer | Rest finished | Send notification |
| Premium | Subscription promotion | Use a dedicated cautious promo system |

---

## Premium push strategy

A non-Premium user can receive a Premium promotion approximately once every 14 days.

Do not blindly send the same "Buy Premium" push every two weeks.

Instead, treat this as one promotional slot every 14 days and choose the message based on actual user behavior and the feature value most relevant to them.

Examples:
- Regular training -> show the value of automatic adaptation/progression.
- User repeatedly opens AI features -> explain the Premium benefit around AI.
- User actively uses training programs -> promote advanced program features.
- User uses multiple devices -> promote Premium synchronization, if/when that feature exists.
- Long-term free user with no stronger signal -> use a general Premium offer.

Recommended eligibility:
- Do not start promotional pushes immediately after installation.
- Prefer waiting until the user has completed roughly 3-5 workouts and has experienced the core value of the app.
- Premium notifications only apply to users without Premium.
- Opening or acting on a Premium notification should start a cooldown before another similar message.

---

## Global anti-spam rules

Introduce a centralized Notification Manager rather than having each feature independently schedule pushes.

Suggested baseline for engagement/promotional notifications:
- Maximum 1 engagement/promotional push per day.
- Maximum about 3 engagement/promotional pushes per week.
- Premium promotion: maximum once every 14 days.
- If the user opens a notification, avoid sending another similar one for several days.
- If a user repeatedly ignores a notification category, gradually reduce its frequency.
- If the user already opened the app and completed the relevant action today, cancel unnecessary reminder/return pushes.
- A lower-priority notification should be suppressed when a higher-priority notification is already scheduled nearby.

Functional notifications such as rest completion and important trainer actions should be handled separately and not count toward the same marketing/engagement quota.

### Important UX rule

Never place a Premium promotion close to a negative/pressure notification such as "You missed a workout" or "You haven't trained for 5 days".

The sequence "you failed to train" -> "buy Premium" will feel manipulative and should be prevented by the Notification Manager.

---

## Inactivity / return logic

Avoid daily re-engagement reminders.

Possible progression:
- First reminder after about 3 days.
- Next after about 7 days.
- Next after about 14 days.
- Then substantially less frequently.

Exact thresholds can be tuned later from analytics.

Any meaningful app activity should reset or recalculate this sequence.

---

## Additional events worth supporting

### Training milestones
Avoid congratulating every minor action.

Potential milestone examples:
- 5 completed workouts.
- 10 completed workouts.
- 25 completed workouts.
- 50 completed workouts.

### Meaningful progress
Potential future events:
- New working weight.
- Completed program cycle.
- Important progression milestone.

Prefer meaningful outcomes over generic gamification.

### Unfinished workout
If the user started a workout and left:
- One reminder after a sensible delay.
- Example intent: "Continue your workout?"
- Do not repeatedly remind.

### Trainer/catalog lifecycle
For trainer submissions:
1. Submitted.
2. Under review.
3. Approved or rejected.

After submission, the UI should explicitly tell the trainer where the status can be tracked: in the Trainer tab.

---

## Events that should usually stay in-app

Avoid push notifications for low-value maintenance actions such as:
- Fill in your weight.
- Add a progress photo.
- Browse the catalog.
- Try a new feature.
- Next progression step is coming soon.

These are better surfaced as contextual in-app cards/messages. Use push only very rarely if product data later proves a clear benefit.

---

## Notification settings

Keep notification settings grouped by **delivery channel** so the user understands both what can arrive and where it will arrive.

### Push notifications
- **Workouts** — workout schedule, reminders, missed workouts, unfinished workouts.
- **Trainer & programs** — trainer actions and catalog/program status.
- **Achievements & progress** — progression and meaningful milestones.
- **Offers & news** — Premium promotions, product news, marketing.

### Email
Email should stay much narrower than push:
- **News & updates** — major product updates and meaningful new capabilities.
- **Deals & Premium** — occasional promotions, discounts, and subscription offers.

Both email marketing categories should be off by default until the user explicitly opts in. Transactional email such as sign-in codes, receipts, subscription/payment problems, security notices, or other important account messages is not marketing and may be sent independently of these marketing switches.

Critical functional push notifications may still require special treatment depending on platform behavior and permission model.

---

## Email channel

Email should be much rarer than push notifications and should not duplicate routine workout reminders.

Recommended use:
- **Transactional account/service messages** — sign-in codes, important security/account changes, payment receipts, subscription/payment problems. These are separate from marketing preferences.
- **News & updates** — optional email for major product updates and meaningful launches.
- **Deals & Premium** — optional email for occasional discounts, promotions, and Premium offers.
- Do **not** send workout reminders, missed-workout nudges, progression updates, achievements, or routine trainer activity by email. Push/in-app is the better channel for those.

The two marketing email preferences are independent and default to off. Marketing email requires explicit opt-in and an unsubscribe mechanism. Frequency should remain low; an available 14-day Premium push slot is not a reason to send email. Push and email must share campaign cooldowns so the same promotion does not reach a user through both channels at nearly the same time.

---

## Settings synchronization

Notification preferences are **account-level settings**, not profile-level settings.

Requirements:
- Push categories and email preferences should follow the signed-in account across devices.
- Keep a local copy for instant UI/offline behavior, but treat the synchronized account document as the cross-device source of truth.
- Store the settings as one account-level document (for example `notificationPrefs`) alongside other account documents such as trainer/client data.
- Every preference change should update the local cache immediately, bump the account-document revision, and queue account sync.
- On pull/login/new-device restore, apply the newest remote preference document to the local cache and refresh the settings UI.
- Conflict resolution should use the same revision/timestamp rules as other account documents.
- Transactional email delivery rules are server-controlled and must not be disabled by marketing preference sync.
- Email marketing preferences must ultimately be available server-side even when the app is not open, because mailing eligibility cannot depend on one device's local storage.

Note: the current general cross-device account sync is tied to the existing account-sync capability. If free accounts are expected to receive/manage marketing email, the server must persist email preferences independently of Premium-only training-data sync so opt-in/opt-out works for every signed-in account.

---

## Architecture direction

Use one Notification Manager that receives candidate notification events and decides whether to deliver them.

It should consider at least:
- event type;
- priority;
- user notification preferences;
- Premium status;
- last app activity;
- completed workout/activity state;
- last notification time by category;
- total recent notification count;
- ignored/opened notification history;
- conflicting higher-priority events;
- local/user-appropriate delivery time.

Conceptually:

```
event -> eligibility -> priority -> suppression/cooldown -> timing -> push
```

Features should request a notification; they should not independently decide that a push must be sent.

---

## Implementation status

Implemented in the client/native app:
- centralized candidate builder for local notifications;
- category preferences;
- scheduled workout reminders and missed-workout follow-up;
- completed workouts cancel all remaining notifications for that workout on resync;
- unfinished-workout reminder;
- inactivity reminders anchored to the last completed workout (3 / 7 / 14 / 30 days);
- progression information folded into the workout reminder instead of creating another competing push;
- Premium promotional push only for non-Premium users with at least 3 completed workouts, at most every 14 days;
- engagement anti-spam: max one engagement/promo notification per day and about three per week;
- Premium promotions avoid scheduled workout days where possible;
- notification taps can route Premium offers to the Premium screen;
- notification/email preferences synchronize as account-level data, including for free accounts.

Remote push transport is now implemented:
- device push-token registration is tied to the confirmed account device;
- Android uses Firebase Cloud Messaging HTTP v1;
- iOS uses APNs token authentication;
- catalog approval/rejection sends a remote push to the trainer account;
- server-side delivery respects the notification category preference;
- sign-out removes the current device from remote push delivery.

Still to connect:
- trainer assignment/change events that happen on the server;
- server-initiated news/marketing campaigns;
- delivery/open analytics and automatic invalid-token cleanup.

Infrastructure required outside the repository:
- Android: create Firebase for application id `ru.fittimer.app`; add GitHub Secret `GOOGLE_SERVICES_JSON_BASE64`; add Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_SERVICE_ACCOUNT_BASE64`).
- iOS: enable the Push Notifications capability for the App target; add Vercel `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, and `APNS_BUNDLE_ID`. Set `APNS_USE_SANDBOX=1` only for development-device tokens.

Email preference storage is implemented; actual campaign/news email sending should be added separately so server jobs respect `emailNews` / `emailOffers` and shared campaign cooldowns.

---

## Initial scope

For the first complete version, focus on:
1. Functional notifications.
2. Workout reminders / missed workouts.
3. Inactivity return logic.
4. Progression change on workout day.
5. Trainer and catalog status changes.
6. Premium promotional slot every 14 days for eligible non-Premium users.
7. Central anti-spam rules and category settings.

Do not add many more events until there is analytics showing they are needed.

The Notification Manager and frequency rules are more important than the raw number of notification types.


### Admin campaigns

The admin panel includes a **Рассылки** section for server-initiated news and Premium/deal messages.

Rules implemented:
- RU and EN copy are required before sending.
- Admin can choose Push, Email, or both.
- Delivery respects account notification preferences.
- If both channels are selected, Push is attempted first and Email is used only as fallback, avoiding duplicate delivery of the same campaign.
- Premium/deal campaigns have a server-side 14-day per-account cooldown.
- Email is sent only to explicit `emailNews` / `emailOffers` opt-ins.
- Campaign processing is batched (8 accounts/request) so it stays inside serverless execution limits.
- Accounts enter the server campaign index after the next verified login or push-device registration; no database-wide key scan is required.
