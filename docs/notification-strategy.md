# Notification strategy

Status: product notes only, not implemented yet.

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

Do not expose dozens of individual notification toggles.

A simpler settings structure is preferable:

- **Workouts** — workout schedule, reminders, missed workouts, unfinished workouts.
- **Trainer & programs** — trainer actions and catalog/program status.
- **Achievements & progress** — progression and meaningful milestones.
- **Offers & news** — Premium promotions, product news, marketing.

Critical functional notifications may still require special treatment depending on platform behavior and permission model.

---

## Email channel

Email should be much rarer than push notifications and should not duplicate routine workout reminders.

Recommended use:
- **Account/service messages** — sign-in codes, important security/account changes, payment receipts or subscription problems when applicable. These are transactional and separate from marketing preferences.
- **News & offers** — the main optional email category: meaningful product news, launches, promotions, and occasional Premium offers.
- Do **not** send workout reminders, missed-workout nudges, progression updates, achievements, or trainer activity by email in the normal flow. Push/in-app is a better channel for those.

Marketing email should require its own explicit preference/consent and include an unsubscribe mechanism. Frequency should remain low; avoid sending an email just because the 14-day Premium push slot became available. Push and email need a shared campaign cooldown so the same offer does not hit the user through both channels at nearly the same time.

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
